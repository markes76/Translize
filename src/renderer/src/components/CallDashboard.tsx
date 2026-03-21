import React, { useState } from 'react'
import type { Speaker } from '../hooks/useRealtimeTranscription'

interface ActivityItem { id: number; message: string; type: string; timestamp: number }

interface Props {
  speakers: Speaker[]
  callDuration: number
  segmentCount: number
  sysChunkCount: number
  micChunkCount: number
  docCount: number
  notebookId?: string
  activity: ActivityItem[]
  onRenameSpeaker: (id: string, name: string) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const TYPE_COLORS: Record<string, string> = { info: 'var(--ink-3)', search: 'var(--primary)', nlm: 'var(--purple)', success: 'var(--positive)', error: 'var(--negative)' }
const TYPE_ICONS: Record<string, string> = { info: 'ℹ', search: '⌕', nlm: '◈', success: '✓', error: '✗' }

export default function CallDashboard({ speakers, callDuration, segmentCount, sysChunkCount, micChunkCount, docCount, notebookId, activity, onRenameSpeaker }: Props): React.ReactElement {
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  return (
    <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-1)', background: 'var(--surface-1)', overflow: 'hidden' }}>
      {/* Speakers */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-1)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Speakers ({speakers.length})
        </div>
        <AddSpeakerInput onAdd={(name) => onRenameSpeaker(`manual-${Date.now()}`, name)} />
        {speakers.map(sp => (
          <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: sp.color, flexShrink: 0 }} />
            {editingSpeaker === sp.id ? (
              <input
                value={editName} onChange={e => setEditName(e.target.value)}
                onBlur={() => { if (editName.trim()) onRenameSpeaker(sp.id, editName.trim()); setEditingSpeaker(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { if (editName.trim()) onRenameSpeaker(sp.id, editName.trim()); setEditingSpeaker(null) } }}
                autoFocus
                style={{ flex: 1, padding: '2px 6px', background: 'var(--surface-2)', border: '1px solid var(--primary)', borderRadius: 4, fontSize: 12, color: 'var(--ink-1)', outline: 'none' }}
              />
            ) : (
              <span
                onClick={() => { if (!sp.isUser) { setEditingSpeaker(sp.id); setEditName(sp.name) } }}
                style={{ fontSize: 12, fontWeight: 600, color: sp.color, cursor: sp.isUser ? 'default' : 'pointer' }}
                title={sp.isUser ? '' : 'Click to rename'}
              >
                {sp.name}
              </span>
            )}
            {sp.isUser && <span style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 500 }}>(you)</span>}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-1)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Session
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Stat label="Duration" value={formatDuration(callDuration)} />
          <Stat label="Segments" value={String(segmentCount)} />
          <BarMeter label="SYS" value={sysChunkCount} />
          <BarMeter label="MIC" value={micChunkCount} />
        </div>
      </div>

      {/* Sources */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-1)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Sources
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: docCount > 0 ? 'var(--positive)' : 'var(--ink-3)' }} />
          <span style={{ color: 'var(--ink-2)' }}>{docCount > 0 ? `${docCount} local doc${docCount !== 1 ? 's' : ''}` : 'No local docs'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: notebookId ? 'var(--purple)' : 'var(--ink-3)' }} />
          <span style={{ color: notebookId ? 'var(--purple)' : 'var(--ink-2)' }}>{notebookId ? 'NotebookLM linked' : 'NLM not linked'}</span>
        </div>
      </div>

      {/* Activity Feed */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        <div style={{ padding: '4px 16px', fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Activity
        </div>
        {activity.length === 0 && <div style={{ padding: '4px 16px', fontSize: 10, color: 'var(--ink-3)' }}>Waiting...</div>}
        {activity.map(a => (
          <div key={a.id} style={{ padding: '2px 16px', fontFamily: 'monospace', fontSize: 10, color: TYPE_COLORS[a.type] ?? 'var(--ink-3)', display: 'flex', gap: 4, lineHeight: 1.5 }}>
            <span style={{ flexShrink: 0, width: 10, textAlign: 'center' }}>{TYPE_ICONS[a.type] ?? '·'}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</span>
            <span style={{ flexShrink: 0, color: 'var(--ink-3)', fontSize: 9 }}>
              {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={{ padding: '8px 10px', background: 'var(--surface-raised)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-1)' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-1)' }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

function AddSpeakerInput({ onAdd }: { onAdd: (name: string) => void }): React.ReactElement {
  const [name, setName] = useState('')
  const [show, setShow] = useState(false)
  if (!show) return (
    <button onClick={() => setShow(true)} style={{ width: '100%', padding: '4px 8px', marginBottom: 6, background: 'none', border: '1px dashed var(--border-1)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>
      + Add participant
    </button>
  )
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name..." autoFocus
        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onAdd(name.trim()); setName(''); setShow(false) } }}
        style={{ flex: 1, padding: '4px 8px', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--ink-1)', outline: 'none' }} />
      <button onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(''); setShow(false) } }}
        style={{ padding: '4px 8px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>+</button>
    </div>
  )
}

function BarMeter({ label, value }: { label: string; value: number }): React.ReactElement {
  const capped = Math.min(value, 1000)
  const barWidth = Math.max(4, (capped / 1000) * 60)
  return (
    <div style={{ padding: '8px 10px', background: 'var(--surface-raised)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
          <div style={{ width: barWidth, height: '100%', borderRadius: 3, background: 'var(--primary)', transition: 'width 0.3s' }} />
        </div>
      </div>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}
