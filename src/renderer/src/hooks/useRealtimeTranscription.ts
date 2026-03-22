import { useState, useRef, useCallback, useEffect } from 'react'
import { RealtimeTranscriptionService, TranscriptSegment } from '../services/openai-realtime'

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected'

export interface Speaker {
  id: string
  name: string
  color: string
  isUser: boolean
}

export interface TranscriptionState {
  status: SessionStatus
  statusDetail: string
  segments: TranscriptSegment[]
  speakers: Speaker[]
  isCapturing: boolean
  sysChunkCount: number
  micChunkCount: number
  audioError: string
  callDuration: number
}

export interface TranscriptionActions {
  startSession: () => Promise<void>
  stopSession: () => Promise<void>
  renameSpeaker: (id: string, name: string) => void
  addSpeaker: (name: string) => void
}

const MIC_SAMPLE_RATE = 24000
const MIC_CHUNK_FRAMES = 2400

export const DEFAULT_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed',
  '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5',
  '#be185d', '#0d9488', '#ca8a04', '#9333ea', '#e11d48'
]

// How many recent segments to include as context when detecting a speaker name
const DETECTION_CONTEXT_WINDOW = 4

function slotIndex(slot: string): number {
  const n = parseInt(slot.replace('them-', ''), 10)
  return isNaN(n) ? 0 : n - 1
}

export function useRealtimeTranscription(): TranscriptionState & TranscriptionActions {
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [statusDetail, setStatusDetail] = useState('')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([{ id: 'you', name: 'You', color: DEFAULT_COLORS[0], isUser: true }])
  const [isCapturing, setIsCapturing] = useState(false)
  const [sysChunkCount, setSysChunkCount] = useState(0)
  const [micChunkCount, setMicChunkCount] = useState(0)
  const [audioError, setAudioError] = useState('')
  const [callDuration, setCallDuration] = useState(0)

  const serviceRef = useRef<RealtimeTranscriptionService | null>(null)
  const removeListenersRef = useRef<Array<() => void>>([])
  const micStreamRef = useRef<MediaStream | null>(null)
  const micContextRef = useRef<AudioContext | null>(null)
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Slot name registry: { 'them-1': 'Sarah', 'them-3': 'John' }
  // Kept in a ref so detection callbacks can read the latest value without stale closure issues
  const slotNamesRef = useRef<Record<string, string>>({})
  // Track which slots already have pending detection to avoid duplicate API calls
  const detectionInFlightRef = useRef<Set<string>>(new Set())

  const handleTranscriptSegment = useCallback((seg: TranscriptSegment) => {
    if (seg.speaker === 'you') {
      seg.speakerName = 'You'
      seg.speakerColor = DEFAULT_COLORS[0]
    } else if (seg.speakerSlot) {
      // Apply known name for this slot immediately if we already identified them
      const knownName = slotNamesRef.current[seg.speakerSlot]
      if (knownName) {
        seg.speakerName = knownName
        seg.speakerColor = DEFAULT_COLORS[slotIndex(seg.speakerSlot) % DEFAULT_COLORS.length]
      } else {
        // Fallback label until name is detected
        const n = slotIndex(seg.speakerSlot) + 1
        seg.speakerName = `Speaker ${n}`
        seg.speakerColor = DEFAULT_COLORS[slotIndex(seg.speakerSlot) % DEFAULT_COLORS.length]
      }
    }

    setSegments(prev => {
      const idx = prev.findIndex(s => s.id === seg.id)
      if (idx === -1) return [...prev, seg]
      const next = [...prev]
      next[idx] = seg
      return next
    })
  }, [])

  // Fires on every finalized 'them' segment — detects if speaker named themselves
  const detectSegmentSpeaker = useCallback(async (seg: TranscriptSegment, allSegments: TranscriptSegment[]) => {
    if (!seg.speakerSlot || !seg.isFinal) return
    // Skip if name already known for this slot
    if (slotNamesRef.current[seg.speakerSlot]) return
    // Skip if a detection is already in flight for this slot
    if (detectionInFlightRef.current.has(seg.speakerSlot)) return

    detectionInFlightRef.current.add(seg.speakerSlot)

    // Build a small context window of recent final 'them' segments
    const recentFinal = allSegments
      .filter(s => s.speaker === 'them' && s.isFinal && s.id !== seg.id)
      .slice(-DETECTION_CONTEXT_WINDOW)
      .map(s => `${s.speakerName ?? s.speakerSlot ?? 'them'}: "${s.text}"`)

    try {
      const result = await window.translize.speaker.detectSegment(
        seg.text,
        seg.speakerSlot,
        recentFinal,
        { ...slotNamesRef.current }
      )

      if (result?.name && result.slot) {
        const slot = result.slot
        const name = result.name.trim()

        // Register the name in the slot registry
        slotNamesRef.current[slot] = name

        // Add to speakers list if not already present
        const colorIdx = slotIndex(slot) % DEFAULT_COLORS.length
        setSpeakers(prev => {
          if (prev.some(s => s.name === name)) return prev
          return [...prev, {
            id: slot,
            name,
            color: DEFAULT_COLORS[colorIdx],
            isUser: false
          }]
        })

        // Retroactively update all segments from this slot
        setSegments(prev => prev.map(s => {
          if (s.speakerSlot === slot) {
            return { ...s, speakerName: name, speakerColor: DEFAULT_COLORS[colorIdx] }
          }
          return s
        }))
      }
    } catch { /* detection failure is silent */ } finally {
      detectionInFlightRef.current.delete(seg.speakerSlot)
    }
  }, [])

  // When a new segment arrives and is final, trigger per-segment detection
  useEffect(() => {
    const lastFinalThem = [...segments].reverse().find(s => s.speaker === 'them' && s.isFinal && s.speakerSlot)
    if (lastFinalThem) {
      detectSegmentSpeaker(lastFinalThem, segments)
    }
  }, [segments, detectSegmentSpeaker])

  // Ensure speaker slots with no detected name have an entry in the speakers list
  useEffect(() => {
    if (!isCapturing) return
    const knownSlots = new Set(speakers.map(s => s.id))
    const unmappedSlots = new Set<string>()
    for (const seg of segments) {
      if (seg.speakerSlot && !knownSlots.has(seg.speakerSlot)) {
        unmappedSlots.add(seg.speakerSlot)
      }
    }
    if (unmappedSlots.size === 0) return

    setSpeakers(prev => {
      const next = [...prev]
      for (const slot of unmappedSlots) {
        if (next.some(s => s.id === slot)) continue
        const n = slotIndex(slot) + 1
        const colorIdx = slotIndex(slot) % DEFAULT_COLORS.length
        next.push({ id: slot, name: `Speaker ${n}`, color: DEFAULT_COLORS[colorIdx], isUser: false })
      }
      return next
    })
  }, [segments, speakers, isCapturing])

  const renameSpeaker = useCallback((id: string, name: string) => {
    // Update the slot name registry if this is a slot ID
    if (id.startsWith('them-')) {
      slotNamesRef.current[id] = name
    }
    setSpeakers(prev => prev.map(s => s.id === id ? { ...s, name } : s))
    setSegments(prev => prev.map(s => {
      const matchBySlot = s.speakerSlot === id
      const matchByOldName = s.speakerName === speakers.find(sp => sp.id === id)?.name
      if (matchBySlot || matchByOldName) {
        return { ...s, speakerName: name }
      }
      return s
    }))
  }, [speakers])

  const addSpeaker = useCallback((name: string) => {
    const colorIdx = speakers.length % DEFAULT_COLORS.length
    setSpeakers(prev => [...prev, {
      id: `manual-${Date.now()}`,
      name,
      color: DEFAULT_COLORS[colorIdx],
      isUser: false
    }])
  }, [speakers])

  const startMicCapture = useCallback(async (service: RealtimeTranscriptionService) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: MIC_SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      micStreamRef.current = stream
      const ctx = new AudioContext({ sampleRate: MIC_SAMPLE_RATE })
      micContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      micProcessorRef.current = processor
      let acc = new Int16Array(MIC_CHUNK_FRAMES), pos = 0
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        const input = e.inputBuffer.getChannelData(0)
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]))
          acc[pos++] = s < 0 ? s * 0x8000 : s * 0x7FFF
          if (pos >= MIC_CHUNK_FRAMES) { service.appendAudio(acc.buffer.slice(0), 'you'); setMicChunkCount(p => p + 1); acc = new Int16Array(MIC_CHUNK_FRAMES); pos = 0 }
        }
      }
      source.connect(processor); processor.connect(ctx.destination)
    } catch (err) { setAudioError(`Mic: ${(err as Error).message}`) }
  }, [])

  const stopMicCapture = useCallback(() => {
    micProcessorRef.current?.disconnect(); micProcessorRef.current = null
    micContextRef.current?.close(); micContextRef.current = null
    micStreamRef.current?.getTracks().forEach(t => t.stop()); micStreamRef.current = null
  }, [])

  const startSession = useCallback(async () => {
    setSysChunkCount(0); setMicChunkCount(0); setAudioError(''); setCallDuration(0)
    setSpeakers([{ id: 'you', name: 'You', color: DEFAULT_COLORS[0], isUser: true }])
    setSegments([])
    // Reset diarization state for the new call
    slotNamesRef.current = {}
    detectionInFlightRef.current = new Set()

    const audioResult = await window.translize.audio.start()
    if (audioResult.error) { setStatus('error'); setStatusDetail(audioResult.error); return }
    setIsCapturing(true)

    timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000)

    let languages: string[] = []
    try {
      const config = await window.translize.config.read() as Record<string, unknown>
      if (Array.isArray(config.languages)) languages = config.languages as string[]
    } catch {}

    const service = new RealtimeTranscriptionService(
      handleTranscriptSegment,
      (s, detail) => { setStatus(s === 'connecting' ? 'connecting' : s === 'connected' ? 'connected' : s === 'disconnected' ? 'disconnected' : 'error'); setStatusDetail(detail ?? '') },
      languages
    )
    serviceRef.current = service; service.connect()
    startMicCapture(service)

    const removeChunk = window.translize.audio.onChunk((buffer: ArrayBuffer) => { service.appendAudio(buffer, 'them'); setSysChunkCount(p => p + 1) })
    const removeStopped = window.translize.audio.onStopped(() => setIsCapturing(false))
    const removePermDenied = window.translize.audio.onPermissionDenied(() => { setStatus('error'); setStatusDetail('Screen Recording permission denied.'); setIsCapturing(false) })
    const removeError = window.translize.audio.onError((msg: string) => setAudioError(msg))
    removeListenersRef.current = [removeChunk, removeStopped, removePermDenied, removeError]
  }, [handleTranscriptSegment, startMicCapture])

  const stopSession = useCallback(async () => {
    await window.translize.audio.stop(); setIsCapturing(false); stopMicCapture()
    serviceRef.current?.disconnect(); serviceRef.current = null
    removeListenersRef.current.forEach(fn => fn()); removeListenersRef.current = []
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setStatus('idle'); setStatusDetail('')
  }, [stopMicCapture])

  useEffect(() => {
    return () => {
      serviceRef.current?.disconnect(); removeListenersRef.current.forEach(fn => fn()); stopMicCapture(); window.translize.audio.stop()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [stopMicCapture])

  return { status, statusDetail, segments, speakers, isCapturing, sysChunkCount, micChunkCount, audioError, callDuration, startSession, stopSession, renameSpeaker, addSpeaker }
}
