// OpenAI Realtime API — Dual-Channel WebSocket transcription service
//
// Architecture: TWO separate Realtime API sessions, both always active
//   Session 1 (mic):    in-room audio → unified spk-N slots
//   Session 2 (system): remote audio  → unified spk-N slots (same pool)
//
// Speaker identification uses neural voice embeddings (sherpa-onnx) running in the main
// process. Each channel accumulates audio buffers per OpenAI item_id. When a segment
// finalizes, those buffers are forwarded to the main process for embedding extraction
// and cosine-similarity matching.
//
// Audio format: Int16 PCM, 24kHz, mono.

export type TranscriptSegment = {
  id: string
  speaker: 'mic' | 'sys'            // which physical channel
  speakerSlot?: string              // 'spk-1'..'spk-30' unified across both channels
  speakerName?: string
  speakerColor?: string
  text: string
  isFinal: boolean
  timestamp: number
  language?: string
}

export type TranscriptCallback = (segment: TranscriptSegment) => void
export type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', detail?: string) => void
// Called when a segment finalizes with the raw audio buffers captured during that item.
// The receiver (hook) calls the main-process speaker diarizer and updates the segment slot.
export type AudioReadyCallback = (segId: string, channel: 'mic' | 'sys', buffers: ArrayBuffer[]) => void

const REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview'
const MAX_RETRIES = 5
const BASE_RETRY_MS = 1000

function base64FromInt16(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 65536
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)))
  }
  return btoa(binary)
}

function rmsEnergy(buffer: ArrayBuffer): number {
  const samples = new Int16Array(buffer)
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

const SILENCE_THRESHOLD = 200

// Max audio buffers to keep per VAD turn (80 × 100ms = 8s max per utterance)
const MAX_AUDIO_BUFFERS_PER_TURN = 80

let idCounter = 0
function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idCounter++}`
}

// A single-channel Realtime API session with neural speaker diarization
class RealtimeChannel {
  private ws: WebSocket | null = null
  private retryCount = 0
  private retryTimeout: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private pendingSegments = new Map<string, TranscriptSegment>()
  private channel: 'mic' | 'sys'
  private slotPrefix: string        // 'mic' for in-room, 'rem' for remote
  private languages: string[]
  private onTranscript: TranscriptCallback
  private onStatus: StatusCallback
  private onAudioReady: AudioReadyCallback

  // VAD-turn-based audio accumulation for speaker embedding.
  // currentTurnBuffers: audio collected during the CURRENT VAD speech turn (speech_started → speech_stopped).
  // completedTurnBuffers: frozen snapshot of the last completed turn, used when item completes.
  private currentTurnBuffers: ArrayBuffer[] = []
  private completedTurnBuffers: ArrayBuffer[] = []
  // Maps item_id → the turn buffer snapshot captured when that item first appeared
  private itemTurnSnapshot = new Map<string, ArrayBuffer[]>()

  constructor(channel: 'mic' | 'sys', onTranscript: TranscriptCallback, onStatus: StatusCallback, onAudioReady: AudioReadyCallback, languages: string[] = []) {
    this.channel = channel
    this.slotPrefix = channel === 'mic' ? 'mic' : 'rem'
    this.onTranscript = onTranscript
    this.onStatus = onStatus
    this.onAudioReady = onAudioReady
    this.languages = languages
  }

  connect(): void {
    this.stopped = false
    this.openWebSocket()
  }

  private openWebSocket(): void {
    this.onStatus('connecting', `${this.channel} channel`)
    this.ws = new WebSocket(REALTIME_URL)

    this.ws.onopen = () => {
      this.retryCount = 0
      this.onStatus('connected', `${this.channel} channel`)
      this.sendSessionConfig()
    }

    this.ws.onmessage = (e: MessageEvent) => {
      try { this.handleEvent(JSON.parse(e.data as string)) } catch {}
    }

    this.ws.onerror = () => this.onStatus('error', `${this.channel} WebSocket error`)

    this.ws.onclose = () => {
      if (!this.stopped) this.scheduleReconnect()
      else this.onStatus('disconnected', `${this.channel} channel`)
    }
  }

  private sendSessionConfig(): void {
    const transcriptionConfig: Record<string, unknown> = { model: 'whisper-1' }
    if (this.languages.length === 1 && this.languages[0] !== 'auto') {
      transcriptionConfig.language = this.languages[0]
    }

    this.send({
      type: 'session.update',
      session: {
        modalities: ['text'],
        input_audio_format: 'pcm16',
        input_audio_transcription: transcriptionConfig,
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        }
      }
    })
  }

  appendAudio(buffer: ArrayBuffer): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    // Gate silent system-audio chunks to reduce noise
    if (this.channel === 'sys' && rmsEnergy(buffer) < SILENCE_THRESHOLD) return
    this.send({ type: 'input_audio_buffer.append', audio: base64FromInt16(buffer) })
    // Accumulate audio for the current VAD turn
    this.currentTurnBuffers.push(buffer.slice(0))
    if (this.currentTurnBuffers.length > MAX_AUDIO_BUFFERS_PER_TURN) {
      this.currentTurnBuffers.shift()
    }
  }

  private handleEvent(event: Record<string, unknown>): void {
    const type = event.type as string

    if (type === 'error') {
      console.error(`[Realtime:${this.channel}]`, event.error)
    }


    switch (type) {
      case 'input_audio_buffer.speech_started': {
        // New VAD turn beginning — reset current turn accumulator
        this.currentTurnBuffers = []
        break
      }
      case 'input_audio_buffer.speech_stopped': {
        // VAD turn complete — freeze this turn's audio as the completed snapshot
        // Deep-copy the buffers so subsequent turns don't overwrite them
        this.completedTurnBuffers = this.currentTurnBuffers.map(b => b.slice(0))
        break
      }
      case 'conversation.item.input_audio_transcription.delta': {
        const itemId = event.item_id as string
        const delta = event.delta as string
        if (!delta) break
        let seg = this.pendingSegments.get(itemId)
        if (!seg) {
          // Placeholder slot — will be updated when diarizer responds
          const speakerSlot = `${this.slotPrefix}-pending`
          seg = { id: nextId(this.channel), speaker: this.channel, speakerSlot, text: '', isFinal: false, timestamp: Date.now() }
          this.pendingSegments.set(itemId, seg)
          // Snapshot the completed turn audio when this item first appears.
          // completedTurnBuffers contains audio from the VAD turn that produced this transcript.
          const snapshot = this.completedTurnBuffers.length > 0
            ? this.completedTurnBuffers.map(b => b.slice(0))
            : this.currentTurnBuffers.map(b => b.slice(0))
          this.itemTurnSnapshot.set(itemId, snapshot)
        }
        seg.text += delta
        this.onTranscript({ ...seg })
        break
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const itemId = event.item_id as string
        const transcript = event.transcript as string
        let seg = this.pendingSegments.get(itemId)
        if (!seg) {
          const speakerSlot = `${this.slotPrefix}-pending`
          seg = { id: nextId(this.channel), speaker: this.channel, speakerSlot, text: '', isFinal: false, timestamp: Date.now() }
        }
        seg.text = transcript ?? seg.text
        seg.isFinal = true
        this.onTranscript({ ...seg })
        this.pendingSegments.delete(itemId)

        // Use the turn snapshot for this item, fall back to current turn
        const audioBuffers = this.itemTurnSnapshot.get(itemId)
          ?? this.completedTurnBuffers.map(b => b.slice(0))
        this.itemTurnSnapshot.delete(itemId)
        this.onAudioReady(seg.id, this.channel, audioBuffers)
        break
      }
      case 'error': {
        const err = event.error as Record<string, unknown> | undefined
        this.onStatus('error', (err?.message as string) ?? 'Realtime API error')
        break
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= MAX_RETRIES) { this.onStatus('error', `${this.channel}: max retries`); return }
    const delay = BASE_RETRY_MS * Math.pow(2, this.retryCount)
    this.retryCount++
    this.onStatus('connecting', `${this.channel}: reconnecting ${this.retryCount}/${MAX_RETRIES}`)
    this.retryTimeout = setTimeout(() => this.openWebSocket(), delay)
  }

  private send(obj: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  disconnect(): void {
    this.stopped = true
    if (this.retryTimeout) { clearTimeout(this.retryTimeout); this.retryTimeout = null }
    if (this.ws) { this.ws.close(); this.ws = null }
    this.pendingSegments.clear()
    this.itemTurnSnapshot.clear()
    this.currentTurnBuffers = []
    this.completedTurnBuffers = []
  }
}

// Dual-channel service — mic (in-room) + sys (remote), both always active
export class RealtimeTranscriptionService {
  private micChannel: RealtimeChannel | null = null
  private sysChannel: RealtimeChannel | null = null
  private onTranscript: TranscriptCallback
  private onStatus: StatusCallback
  private onAudioReady: AudioReadyCallback
  private languages: string[]
  private micConnected = false
  private sysConnected = false

  constructor(onTranscript: TranscriptCallback, onStatus: StatusCallback, onAudioReady: AudioReadyCallback, languages: string[] = []) {
    this.onTranscript = onTranscript
    this.onStatus = onStatus
    this.onAudioReady = onAudioReady
    this.languages = languages
  }

  connect(): void {
    this.micConnected = false
    this.sysConnected = false

    this.micChannel = new RealtimeChannel('mic', this.onTranscript, (status) => {
      if (status === 'connected') this.micConnected = true
      this.updateOverallStatus()
    }, this.onAudioReady, this.languages)

    this.sysChannel = new RealtimeChannel('sys', this.onTranscript, (status) => {
      if (status === 'connected') this.sysConnected = true
      this.updateOverallStatus()
    }, this.onAudioReady, this.languages)

    this.onStatus('connecting', 'Opening dual channels...')
    this.micChannel.connect()
    this.sysChannel.connect()
  }

  private updateOverallStatus(): void {
    if (this.micConnected && this.sysConnected) {
      this.onStatus('connected', 'Dual channels active')
    } else if (this.micConnected || this.sysConnected) {
      this.onStatus('connecting', `${this.micConnected ? 'Mic' : 'System'} connected, waiting for other...`)
    }
  }

  appendAudio(buffer: ArrayBuffer, channel: 'mic' | 'sys'): void {
    if (channel === 'mic') {
      this.micChannel?.appendAudio(buffer)
    } else {
      this.sysChannel?.appendAudio(buffer)
    }
  }

  disconnect(): void {
    this.micChannel?.disconnect()
    this.sysChannel?.disconnect()
    this.micChannel = null
    this.sysChannel = null
  }
}
