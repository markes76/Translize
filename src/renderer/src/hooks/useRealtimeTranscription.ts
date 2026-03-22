import { useState, useRef, useCallback, useEffect } from 'react'
import { RealtimeTranscriptionService, TranscriptSegment, AudioReadyCallback } from '../services/openai-realtime'

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected'

export interface Speaker {
  id: string
  name: string
  color: string
  isUser: boolean
  source: 'mic' | 'sys'    // 'mic' = in-room, 'sys' = remote
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
  startSession: (sessionId: string) => Promise<void>
  stopSession: () => Promise<{ filePath: string; durationMs: number } | null>
  renameSpeaker: (id: string, name: string) => void
  addSpeaker: (name: string) => void
  markAsMe: (id: string) => void
  unmarkMe: (id: string) => void
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

// Parse slot number from 'spk-1', 'spk-2', etc.
function slotIndex(slot: string): number {
  const m = slot.match(/(\d+)$/)
  return m ? parseInt(m[1], 10) - 1 : 0
}

// Default display names — simple sequential numbering, no channel framing
function defaultSlotName(slot: string): string {
  const n = slotIndex(slot) + 1
  return `Speaker ${n}`
}

function slotColorIndex(slot: string): number {
  return slotIndex(slot) % DEFAULT_COLORS.length
}

export function useRealtimeTranscription(): TranscriptionState & TranscriptionActions {
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [statusDetail, setStatusDetail] = useState('')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
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

  // Slot name registry: { 'spk-1': 'Sarah', 'spk-2': 'John' }
  const slotNamesRef = useRef<Record<string, string>>({})
  // Track which slots already have pending detection to avoid duplicate API calls
  const detectionInFlightRef = useRef<Set<string>>(new Set())

  const handleTranscriptSegment = useCallback((seg: TranscriptSegment) => {
    // Pending slot during diarization — don't apply name/color yet
    if (seg.speakerSlot && !seg.speakerSlot.endsWith('-pending')) {
      const knownName = slotNamesRef.current[seg.speakerSlot]
      const colorIdx = slotColorIndex(seg.speakerSlot)
      seg.speakerName = knownName ?? defaultSlotName(seg.speakerSlot)
      seg.speakerColor = DEFAULT_COLORS[colorIdx]
    }

    setSegments(prev => {
      const idx = prev.findIndex(s => s.id === seg.id)
      if (idx === -1) return [...prev, seg]
      const next = [...prev]
      next[idx] = seg
      return next
    })
  }, [])

  // Called by RealtimeChannel when a segment finalizes with its raw audio
  // Sends audio to the main-process neural diarizer, then updates the segment slot
  const handleAudioReady: AudioReadyCallback = useCallback(async (segId, channel, buffers) => {
    try {
      const slot = await window.translize.speaker.identify(buffers, channel)
      const colorIdx = slotColorIndex(slot)
      const knownName = slotNamesRef.current[slot]
      const speakerName = knownName ?? defaultSlotName(slot)
      const speakerColor = DEFAULT_COLORS[colorIdx]

      setSegments(prev => prev.map(s => {
        if (s.id !== segId) return s
        return { ...s, speakerSlot: slot, speakerName, speakerColor }
      }))
    } catch {
      // Diarizer unavailable — leave segment as-is, no state update
    }
  }, [])

  // Fires on every finalized segment — detects if speaker named themselves
  const detectSegmentSpeaker = useCallback(async (seg: TranscriptSegment, allSegments: TranscriptSegment[]) => {
    if (!seg.speakerSlot || !seg.isFinal) return
    // Skip while neural diarizer is still assigning the slot
    if (seg.speakerSlot.endsWith('-pending')) return
    if (slotNamesRef.current[seg.speakerSlot]) return
    if (detectionInFlightRef.current.has(seg.speakerSlot)) return

    detectionInFlightRef.current.add(seg.speakerSlot)

    const recentFinal = allSegments
      .filter(s => s.speakerSlot && s.isFinal && s.id !== seg.id)
      .slice(-DETECTION_CONTEXT_WINDOW)
      .map(s => `${s.speakerName ?? s.speakerSlot}: "${s.text}"`)

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
        slotNamesRef.current[slot] = name
        const colorIdx = slotColorIndex(slot)

        setSpeakers(prev => {
          if (prev.some(s => s.name === name)) return prev
          const existing = prev.find(s => s.id === slot)
          if (existing) return prev.map(s => s.id === slot ? { ...s, name } : s)
          return prev
        })

        setSegments(prev => prev.map(s => {
          if (s.speakerSlot === slot) {
            return { ...s, speakerName: name, speakerColor: DEFAULT_COLORS[colorIdx] }
          }
          return s
        }))

        // Also update speaker entry name
        setSpeakers(prev => prev.map(s => s.id === slot ? { ...s, name } : s))
      }
    } catch { /* detection failure is silent */ } finally {
      detectionInFlightRef.current.delete(seg.speakerSlot)
    }
  }, [])

  // When a new final segment arrives with a resolved slot, trigger name detection
  useEffect(() => {
    const lastFinal = [...segments].reverse().find(s => s.isFinal && s.speakerSlot && !s.speakerSlot.endsWith('-pending'))
    if (lastFinal) detectSegmentSpeaker(lastFinal, segments)
  }, [segments, detectSegmentSpeaker])

  // Ensure every slot seen in segments has a speaker entry (skip pending slots)
  useEffect(() => {
    if (!isCapturing) return
    const knownSlots = new Set(speakers.map(s => s.id))
    const newSlots: Speaker[] = []
    for (const seg of segments) {
      if (!seg.speakerSlot || seg.speakerSlot.endsWith('-pending') || knownSlots.has(seg.speakerSlot)) continue
      knownSlots.add(seg.speakerSlot)
      const colorIdx = slotColorIndex(seg.speakerSlot)
      const source: 'mic' | 'sys' = seg.speaker === 'mic' ? 'mic' : 'sys'
      newSlots.push({
        id: seg.speakerSlot,
        name: slotNamesRef.current[seg.speakerSlot] ?? defaultSlotName(seg.speakerSlot),
        color: DEFAULT_COLORS[colorIdx],
        isUser: false,
        source
      })
    }
    if (newSlots.length > 0) setSpeakers(prev => [...prev, ...newSlots])
  }, [segments, speakers, isCapturing])

  const renameSpeaker = useCallback((id: string, name: string) => {
    slotNamesRef.current[id] = name
    setSpeakers(prev => prev.map(s => s.id === id ? { ...s, name } : s))
    // Rename all segments in this slot
    setSegments(prev => prev.map(s => {
      if (s.speakerSlot !== id) return s
      return { ...s, speakerName: name }
    }))
  }, [])

  const markAsMe = useCallback((id: string) => {
    setSpeakers(prev => prev.map(s => ({ ...s, isUser: s.id === id })))
  }, [])

  const unmarkMe = useCallback((id: string) => {
    setSpeakers(prev => prev.map(s => s.id === id ? { ...s, isUser: false } : s))
  }, [])

  const addSpeaker = useCallback((name: string) => {
    const colorIdx = speakers.length % DEFAULT_COLORS.length
    setSpeakers(prev => [...prev, {
      id: `manual-${Date.now()}`,
      name,
      color: DEFAULT_COLORS[colorIdx],
      isUser: false,
      source: 'mic'
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
          if (pos >= MIC_CHUNK_FRAMES) {
            const chunk = acc.buffer.slice(0)
            service.appendAudio(chunk, 'mic')
            window.translize.recording.micChunk(chunk)
            setMicChunkCount(p => p + 1)
            acc = new Int16Array(MIC_CHUNK_FRAMES)
            pos = 0
          }
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

  const startSession = useCallback(async (sessionId: string) => {
    setSysChunkCount(0); setMicChunkCount(0); setAudioError(''); setCallDuration(0)
    setSpeakers([])
    setSegments([])
    slotNamesRef.current = {}
    detectionInFlightRef.current = new Set()

    const audioResult = await window.translize.audio.start()
    if (audioResult.error) { setStatus('error'); setStatusDetail(audioResult.error); return }
    setIsCapturing(true)

    window.translize.recording.start(sessionId).catch(() => {})
    timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000)

    let languages: string[] = []
    try {
      const config = await window.translize.config.read() as Record<string, unknown>
      if (Array.isArray(config.languages)) languages = config.languages as string[]
    } catch {}

    // Reset neural diarizer state for new call
    window.translize.speaker.resetSession().catch(() => {})

    const service = new RealtimeTranscriptionService(
      handleTranscriptSegment,
      (s, detail) => { setStatus(s === 'connecting' ? 'connecting' : s === 'connected' ? 'connected' : s === 'disconnected' ? 'disconnected' : 'error'); setStatusDetail(detail ?? '') },
      handleAudioReady,
      languages
    )
    serviceRef.current = service; service.connect()
    startMicCapture(service)

    const removeChunk = window.translize.audio.onChunk((buffer: ArrayBuffer) => { service.appendAudio(buffer, 'sys'); setSysChunkCount(p => p + 1) })
    const removeStopped = window.translize.audio.onStopped(() => {
      // System audio capture stopped (e.g. permission denied) — do NOT set isCapturing=false
      // because mic + WebSocket transcription may still be active. isCapturing is only
      // set to false by the explicit stopSession() call.
    })
    const removePermDenied = window.translize.audio.onPermissionDenied(() => {
      // Screen Recording permission denied — system audio unavailable but mic still works.
      // Don't kill the session — mic transcription continues.
    })
    const removeError = window.translize.audio.onError((msg: string) => setAudioError(msg))
    removeListenersRef.current = [removeChunk, removeStopped, removePermDenied, removeError]
  }, [handleTranscriptSegment, startMicCapture])

  const stopSession = useCallback(async () => {
    await window.translize.audio.stop(); setIsCapturing(false); stopMicCapture()
    serviceRef.current?.disconnect(); serviceRef.current = null
    removeListenersRef.current.forEach(fn => fn()); removeListenersRef.current = []
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setStatus('idle'); setStatusDetail('')
    try {
      return await window.translize.recording.stop()
    } catch {
      return null
    }
  }, [stopMicCapture])

  useEffect(() => {
    return () => {
      serviceRef.current?.disconnect(); removeListenersRef.current.forEach(fn => fn()); stopMicCapture(); window.translize.audio.stop()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [stopMicCapture])

  return { status, statusDetail, segments, speakers, isCapturing, sysChunkCount, micChunkCount, audioError, callDuration, startSession, stopSession, renameSpeaker, addSpeaker, markAsMe, unmarkMe }
}
