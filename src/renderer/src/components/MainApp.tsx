import React, { useState, useEffect, useRef } from 'react'
import { useRealtimeTranscription } from '../hooks/useRealtimeTranscription'
import TopNav from './TopNav'
import CallIntelligence from './CallIntelligence'
import Transcript from './SessionView/Transcript'
import ContextPanel from './KnowledgePanel/ContextPanel'
import type { TranscriptSegment } from '../services/openai-realtime'
import type { SessionStatus } from '../hooks/useRealtimeTranscription'
import { checkLiveSentiment } from '../services/sentiment-engine'

interface Props {
  sessionId: string; sessionName?: string; notebookId?: string; mode: string
  onEndCall: (segments: TranscriptSegment[]) => void; onBack: () => void
  onNavigate: (destination: string) => void
}

interface ActivityItem { id: number; message: string; type: string; timestamp: number }

let actId = 0

export default function MainApp({ sessionId, sessionName, notebookId, mode, onEndCall, onBack, onNavigate }: Props): React.ReactElement {
  const {
    status, statusDetail, segments, speakers, isCapturing,
    sysChunkCount, micChunkCount, audioError, callDuration,
    startSession, stopSession, renameSpeaker, addSpeaker
  } = useRealtimeTranscription()

  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [docCount, setDocCount] = useState(0)
  const [liveSentiment, setLiveSentiment] = useState<{ score: number; label: string }>({ score: 0, label: 'neutral' })
  const sentimentIvRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [contactName, setContactName] = useState(sessionName ?? '')
  const [editingContact, setEditingContact] = useState(false)
  const [contactDraft, setContactDraft] = useState('')
  const useNlm = mode === 'notebook' || mode === 'both'
  const isActive = isCapturing || status === 'connecting' || status === 'connected'

  useEffect(() => {
    window.translize.knowledge.status(sessionId).then(s => setDocCount(s.documentCount))
  }, [sessionId])

  useEffect(() => {
    if (!isCapturing) { if (sentimentIvRef.current) clearInterval(sentimentIvRef.current); return }
    const poll = async () => {
      const recent = segments.slice(-10).filter(s => s.isFinal).map(s => `[${s.speakerName ?? s.speaker}] ${s.text}`).join('\n')
      if (recent.length < 30) return
      try {
        const key = await window.translize.keychain.get('openai-api-key')
        if (key) setLiveSentiment(await checkLiveSentiment(recent, key))
      } catch {}
    }
    sentimentIvRef.current = setInterval(poll, 30000)
    return () => { if (sentimentIvRef.current) clearInterval(sentimentIvRef.current) }
  }, [isCapturing, segments])

  const addActivity = (msg: string, type: string) => setActivity(p => [{ id: actId++, message: msg, type, timestamp: Date.now() }, ...p].slice(0, 30))

  const handleStop = async () => { await stopSession(); onEndCall(segments) }

  const saveContact = async (name: string) => {
    const trimmed = name.trim()
    setContactName(trimmed)
    setEditingContact(false)
    await window.translize.session.update(sessionId, { name: trimmed || undefined })
  }

  const statusColor = status === 'connected' ? 'var(--positive)' : status === 'error' ? 'var(--negative)' : 'var(--warning)'
  const statusLabel = status === 'idle' ? 'Ready' : status === 'connecting' ? 'Connecting' : status === 'connected' ? 'Live' : status === 'error' ? 'Error' : 'Offline'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--surface-1)' }}>
      {/* Sentiment color bar */}
      {isActive && (
        <div style={{ height: 3, width: '100%', flexShrink: 0, background: liveSentiment.score > 0.2 ? 'var(--positive)' : liveSentiment.score < -0.2 ? 'var(--negative)' : 'var(--warning)', transition: 'background 1s' }} />
      )}

      {/* Controls bar */}
      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border-1)', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={isActive ? handleStop : startSession} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 18px',
          background: isActive ? 'var(--negative)' : 'var(--primary)',
          color: 'white', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--shadow-sm)'
        }}>
          <span style={{ width: 6, height: 6, borderRadius: isActive ? 1 : '50%', background: 'white' }} />
          {isActive ? 'Stop' : 'Start'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{statusLabel}</span>
        </div>
        {statusDetail && status !== 'connected' && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)' }}>— {statusDetail}</span>}

        {/* Contact name — editable inline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {editingContact ? (
            <input
              autoFocus
              value={contactDraft}
              onChange={e => setContactDraft(e.target.value)}
              onBlur={() => saveContact(contactDraft)}
              onKeyDown={e => { if (e.key === 'Enter') saveContact(contactDraft); if (e.key === 'Escape') setEditingContact(false) }}
              placeholder="Contact name..."
              style={{ padding: '3px 8px', background: 'var(--surface-2)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 'var(--text-xs)', outline: 'none', width: 160 }}
            />
          ) : contactName ? (
            <button onClick={() => { setContactDraft(contactName); setEditingContact(true) }} style={{ padding: '3px 10px', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-full)', color: 'var(--ink-2)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
              {contactName} ✎
            </button>
          ) : (
            <button onClick={() => { setContactDraft(''); setEditingContact(true) }} style={{ padding: '3px 10px', background: 'transparent', border: '1px dashed var(--border-1)', borderRadius: 'var(--radius-full)', color: 'var(--ink-4)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
              + Add contact name
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />
        {isActive && (
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ padding: '2px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 700, color: 'var(--ink-3)' }}>SYS {sysChunkCount || '—'}</span>
            <span style={{ padding: '2px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 700, color: 'var(--ink-3)' }}>MIC {micChunkCount || '—'}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)' }}>{segments.length} seg</span>
          </div>
        )}
      </div>

      {audioError && (
        <div style={{ padding: '4px 20px', background: 'var(--negative-subtle)', borderBottom: '1px solid var(--negative)', fontSize: 'var(--text-xs)', color: 'var(--negative)', flexShrink: 0 }}>{audioError}</div>
      )}

      {/* Main 3-panel layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Call Intelligence */}
        <CallIntelligence
          sessionName={sessionName}
          isCapturing={isCapturing}
          callDuration={callDuration}
          sentimentScore={liveSentiment.score}
          sentimentLabel={liveSentiment.label === 'positive' ? 'Positive' : liveSentiment.label === 'negative' ? 'Tense' : 'Neutral'}
          segments={segments}
          speakers={speakers}
          onAddSpeaker={addSpeaker}
          onRenameSpeaker={renameSpeaker}
        />

        {/* Center: Transcript */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Transcript segments={segments} isCapturing={isCapturing} />
        </div>

        {/* Right: Knowledge + Context */}
        <div style={{ flex: 3, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid var(--border-1)' }}>
          <ContextPanel
            sessionId={sessionId}
            notebookId={useNlm ? notebookId : undefined}
            segments={segments}
            isCapturing={isCapturing}
            onActivityLog={addActivity}
          />
        </div>
      </div>
    </div>
  )
}
