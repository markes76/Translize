import React, { useState, useEffect, useRef } from 'react'

interface Props {
  onComplete: () => void
}

export default function AudioTestStep({ onComplete }: Props): React.ReactElement {
  const [micLevel, setMicLevel] = useState(0)
  const [systemLevel, setSystemLevel] = useState(0)
  const [micDetected, setMicDetected] = useState(false)
  const [systemDetected, setSystemDetected] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState('')

  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const removeChunkListenerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    startTest()
    return () => {
      stopTest()
    }
  }, [])

  const startTest = async (): Promise<void> => {
    setError('')

    // Mic level via Web Audio API
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioCtxRef.current = new AudioContext()
      const source = audioCtxRef.current.createMediaStreamSource(stream)
      analyserRef.current = audioCtxRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      source.connect(analyserRef.current)

      const data = new Uint8Array(analyserRef.current.frequencyBinCount)
      const tick = (): void => {
        analyserRef.current!.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        const level = Math.min(100, (avg / 128) * 100)
        setMicLevel(level)
        if (level > 5) setMicDetected(true)
        animFrameRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // Mic permission denied — that's ok, we continue
    }

    // System audio level via Swift subprocess
    const result = await window.translize.audio.start()
    if (result.error) {
      if (!result.error.includes('binary not found')) {
        setError(result.error)
      }
      return
    }
    setCapturing(true)

    removeChunkListenerRef.current = window.translize.audio.onChunk((buffer) => {
      const samples = new Int16Array(buffer)
      let sum = 0
      for (let i = 0; i < samples.length; i++) {
        sum += Math.abs(samples[i])
      }
      const avg = sum / samples.length
      const level = Math.min(100, (avg / 32768) * 100 * 10)
      setSystemLevel(level)
      if (level > 2) setSystemDetected(true)
    })
  }

  const stopTest = (): void => {
    cancelAnimationFrame(animFrameRef.current)
    audioCtxRef.current?.close()
    removeChunkListenerRef.current?.()
    if (capturing) {
      window.translize.audio.stop()
      setCapturing(false)
    }
  }

  const LevelMeter = ({ level, label, detected, icon }: {
    level: number; label: string; detected: boolean; icon: string
  }): React.ReactElement => (
    <div style={{
      padding: 20, background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)',
      border: `1px solid ${detected ? 'var(--positive)' : 'var(--border-1)'}`,
      transition: 'border-color 0.3s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 12, color: detected ? 'var(--positive)' : 'var(--ink-3)' }}>
            {detected ? '✓ Signal detected' : 'Waiting for audio…'}
          </div>
        </div>
      </div>
      <div style={{ height: 8, background: 'var(--border-1)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4,
          background: detected ? 'var(--positive)' : 'var(--primary)',
          width: `${level}%`,
          transition: 'width 0.05s linear'
        }} />
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 40px 40px', maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Let's Make Sure Everything Works</h2>
      <p style={{ color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 32 }}>
        Play some audio on your Mac and speak into your microphone. You should see both
        level meters move.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
        <LevelMeter level={micLevel} label="Microphone" detected={micDetected} icon="🎤" />
        <LevelMeter level={systemLevel} label="System Audio" detected={systemDetected} icon="🔊" />
      </div>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--negative)', marginBottom: 16 }}>{error}</p>
      )}

      {micDetected && systemDetected && (
        <div style={{
          padding: 14, background: 'rgba(22, 163, 74, 0.08)',
          border: '1px solid rgba(22, 163, 74, 0.3)', borderRadius: 'var(--radius-md)',
          textAlign: 'center', marginBottom: 24, fontSize: 14
        }}>
          🎉 You're all set! Both audio sources detected.
        </div>
      )}

      <button
        onClick={() => { stopTest(); onComplete() }}
        style={{
          marginTop: 'auto', padding: '12px 0',
          background: 'var(--primary)', color: '#fff',
          border: 'none', borderRadius: 'var(--radius-md)',
          fontWeight: 600, cursor: 'pointer', fontSize: 15
        }}
      >
        Start Using Translize →
      </button>
    </div>
  )
}
