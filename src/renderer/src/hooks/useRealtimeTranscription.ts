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

const DEFAULT_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed',
  '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5',
  '#be185d', '#0d9488', '#ca8a04', '#9333ea', '#e11d48'
]

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
  const speakerDetectionRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextSpeakerNum = useRef(1)

  const handleTranscriptSegment = useCallback((seg: TranscriptSegment) => {
    if (seg.speaker === 'you') {
      seg.speakerName = 'You'
      seg.speakerColor = DEFAULT_COLORS[0]
    }
    setSegments(prev => {
      const idx = prev.findIndex(s => s.id === seg.id)
      if (idx === -1) return [...prev, seg]
      const next = [...prev]
      next[idx] = seg
      return next
    })
  }, [])

  const renameSpeaker = useCallback((id: string, name: string) => {
    setSpeakers(prev => prev.map(s => s.id === id ? { ...s, name } : s))
    setSegments(prev => prev.map(s => {
      if (s.speakerName === speakers.find(sp => sp.id === id)?.name) {
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

  // Speaker detection: runs every ~15 seconds on recent "them" segments
  useEffect(() => {
    if (!isCapturing) {
      if (speakerDetectionRef.current) clearInterval(speakerDetectionRef.current)
      return
    }

    const detectSpeakers = async () => {
      const recentThemSegments = segments.filter(s => s.speaker === 'them' && s.isFinal && !s.speakerName).slice(-5)
      if (recentThemSegments.length === 0) return

      const transcript = recentThemSegments.map(s => s.text).join('\n')
      const existingNames = speakers.filter(s => !s.isUser).map(s => s.name)

      try {
        const result = await window.translize.speaker.detect(transcript, existingNames)
        if (result?.speakers?.length > 0) {
          for (const detected of result.speakers) {
            if (detected.name && !existingNames.includes(detected.name)) {
              const colorIdx = speakers.length % DEFAULT_COLORS.length
              const newSpeaker: Speaker = {
                id: `speaker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: detected.name,
                color: DEFAULT_COLORS[colorIdx],
                isUser: false
              }
              setSpeakers(prev => [...prev, newSpeaker])

              // Assign this name to recent unnamed segments
              setSegments(prev => prev.map(s => {
                if (s.speaker === 'them' && !s.speakerName && s.text.toLowerCase().includes(detected.name.toLowerCase().split(' ')[0])) {
                  return { ...s, speakerName: detected.name, speakerColor: newSpeaker.color }
                }
                return s
              }))
            }
          }
        }
      } catch { /* detection failed silently */ }

      // Assign "Speaker N" to any remaining unnamed segments
      setSegments(prev => prev.map(s => {
        if (s.speaker === 'them' && s.isFinal && !s.speakerName) {
          const spName = `Speaker ${nextSpeakerNum.current}`
          const colorIdx = nextSpeakerNum.current % DEFAULT_COLORS.length
          if (!speakers.some(sp => sp.name === spName)) {
            setSpeakers(p => {
              if (p.some(sp => sp.name === spName)) return p
              return [...p, { id: `auto-${nextSpeakerNum.current}`, name: spName, color: DEFAULT_COLORS[colorIdx], isUser: false }]
            })
          }
          return { ...s, speakerName: spName, speakerColor: DEFAULT_COLORS[colorIdx] }
        }
        return s
      }))
    }

    speakerDetectionRef.current = setInterval(detectSpeakers, 15000)
    return () => { if (speakerDetectionRef.current) clearInterval(speakerDetectionRef.current) }
  }, [isCapturing, segments, speakers])

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
    nextSpeakerNum.current = 1

    const audioResult = await window.translize.audio.start()
    if (audioResult.error) { setStatus('error'); setStatusDetail(audioResult.error); return }
    setIsCapturing(true)

    timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000)

    // Load language preferences from config
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
