import React, { useState, useEffect, useRef } from 'react'
import { useRealtimeTranscription } from '../hooks/useRealtimeTranscription'
import Transcript from './SessionView/Transcript'
import ContextPanel from './KnowledgePanel/ContextPanel'
import CallDashboard from './CallDashboard'
import type { TranscriptSegment } from '../services/openai-realtime'
import type { SessionStatus } from '../hooks/useRealtimeTranscription'
import { checkLiveSentiment } from '../services/sentiment-engine'

interface Props {
  sessionId: string; sessionName?: string; notebookId?: string; mode: string
  onEndCall: (segments: TranscriptSegment[]) => void; onBack: () => void
}

interface ActivityItem { id: number; message: string; type: string; timestamp: number }

const STATUS_CFG: Record<SessionStatus, { dot: string; label: string; color: string }> = {
  idle: { dot: 'var(--ink-3)', label: 'Ready', color: 'var(--ink-3)' },
  connecting: { dot: '#f59e0b', label: 'Connecting', color: '#f59e0b' },
  connected: { dot: 'var(--positive)', label: 'Live', color: 'var(--positive)' },
  disconnected: { dot: 'var(--ink-3)', label: 'Disconnected', color: 'var(--ink-3)' },
  error: { dot: 'var(--negative)', label: 'Error', color: 'var(--negative)' }
}

let actId = 0

export default function MainApp({ sessionId, sessionName, notebookId, mode, onEndCall, onBack }: Props): React.ReactElement {
  const {
    status, statusDetail, segments, speakers, isCapturing,
    sysChunkCount, micChunkCount, audioError, callDuration,
    startSession, stopSession, renameSpeaker
  } = useRealtimeTranscription()

  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [docCount, setDocCount] = useState(0)
  const [liveSentiment, setLiveSentiment] = useState<{ score: number; label: string }>({ score: 0, label: 'neutral' })
  const sentimentIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const useNlm = mode === 'notebook' || mode === 'both'
  const cfg = STATUS_CFG[status]
  const isActive = isCapturing || status === 'connecting' || status === 'connected'

  useEffect(() => {
    window.translize.knowledge.status(sessionId).then(s => setDocCount(s.documentCount))
  }, [sessionId])

  // Live sentiment polling (every 30s during active call)
  useEffect(() => {
    if (!isCapturing) {
      if (sentimentIntervalRef.current) clearInterval(sentimentIntervalRef.current)
      return
    }
    const poll = async () => {
      const recent = segments.slice(-10).filter(s => s.isFinal).map(s => `[${s.speakerName ?? s.speaker}] ${s.text}`).join('\n')
      if (recent.length < 30) return
      try {
        const key = await window.translize.keychain.get('openai-api-key')
        if (key) {
          const result = await checkLiveSentiment(recent, key)
          setLiveSentiment(result)
        }
      } catch {}
    }
    sentimentIntervalRef.current = setInterval(poll, 30000)
    return () => { if (sentimentIntervalRef.current) clearInterval(sentimentIntervalRef.current) }
  }, [isCapturing, segments])

  const addActivity = (msg: string, type: string) => {
    setActivity(p => [{ id: actId++, message: msg, type, timestamp: Date.now() }, ...p].slice(0, 30))
  }

  const handleStop = async () => { await stopSession(); onEndCall(segments) }

  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-1)', paddingTop: 28 }}>
      {/* Top Bar -- compact, integrated controls */}
      <div style={{
        position: 'relative',
        padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid var(--border-1)', background: 'var(--surface-raised)', flexShrink: 0
      }}>
        {/* Sentiment color bar */}
        {isActive && (
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: 3,
            background: liveSentiment.score > 0.2 ? 'var(--positive)' : liveSentiment.score < -0.2 ? 'var(--negative)' : '#f59e0b',
            transition: 'background 0.5s'
          }} />
        )}
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-1)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sessionName ?? 'Active Call'}
        </span>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, boxShadow: status === 'connected' ? `0 0 0 3px ${cfg.dot}33` : 'none' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cfg.label}</span>
        </div>

        {isActive && (
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtDur(callDuration)}
          </span>
        )}

        {statusDetail && status !== 'connected' && (
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>— {statusDetail}</span>
        )}

        <div style={{ flex: 1 }} />

        {/* Live sentiment label */}
        {isActive && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: liveSentiment.score > 0.2 ? 'var(--positive)' : liveSentiment.score < -0.2 ? 'var(--negative)' : 'var(--ink-3)'
          }}>
            {liveSentiment.label === 'positive' ? 'Positive' : liveSentiment.label === 'negative' ? 'Tense' : 'Neutral'}
          </span>
        )}

        {useNlm && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'var(--purple-subtle)', borderRadius: 12, fontSize: 10, fontWeight: 700, color: 'var(--purple)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--purple)' }} />NLM
          </span>
        )}

        {/* Start/Stop */}
        <button onClick={isActive ? handleStop : startSession} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 18px',
          background: isActive ? 'var(--negative)' : 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
          color: 'white', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 600,
          boxShadow: 'var(--shadow)', cursor: 'pointer'
        }}>
          <span style={{ width: 6, height: 6, borderRadius: isActive ? 1 : '50%', background: 'white' }} />
          {isActive ? 'Stop' : 'Start'}
        </button>
      </div>

      {/* Error bar */}
      {audioError && (
        <div style={{ padding: '6px 20px', background: 'var(--negative-subtle)', borderBottom: '1px solid var(--negative)', fontSize: 11, color: 'var(--negative)' }}>
          {audioError}
        </div>
      )}

      {/* 3-Column Layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Compact Transcript */}
        <div style={{ flex: 2, minWidth: 0, position: 'relative' }}>
          <Transcript segments={segments} isCapturing={isCapturing} />
        </div>

        {/* Center: Q&A Hero */}
        <ContextPanel
          sessionId={sessionId}
          notebookId={useNlm ? notebookId : undefined}
          segments={segments}
          isCapturing={isCapturing}
          onActivityLog={addActivity}
        />

        {/* Right: Dashboard */}
        <CallDashboard
          speakers={speakers}
          callDuration={callDuration}
          segmentCount={segments.length}
          sysChunkCount={sysChunkCount}
          micChunkCount={micChunkCount}
          docCount={docCount}
          notebookId={useNlm ? notebookId : undefined}
          activity={activity}
          onRenameSpeaker={renameSpeaker}
        />
      </div>
    </div>
  )
}
