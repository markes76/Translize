import React from 'react'
import type { SessionStatus } from '../../hooks/useRealtimeTranscription'

interface Props {
  status: SessionStatus; statusDetail: string; isCapturing: boolean; segmentCount: number
  sysChunkCount: number; micChunkCount: number; audioError: string
  onStart: () => void; onStop: () => void
}

const STATUS_CFG: Record<SessionStatus, { dot: string; label: string; color: string }> = {
  idle: { dot: 'var(--ink-3)', label: 'Ready', color: 'var(--ink-3)' },
  connecting: { dot: 'var(--warning)', label: 'Connecting', color: 'var(--warning)' },
  connected: { dot: 'var(--positive)', label: 'Live', color: 'var(--positive)' },
  disconnected: { dot: 'var(--ink-3)', label: 'Disconnected', color: 'var(--ink-3)' },
  error: { dot: 'var(--negative)', label: 'Error', color: 'var(--negative)' }
}

export default function AudioControls({ status, statusDetail, isCapturing, segmentCount, sysChunkCount, micChunkCount, audioError, onStart, onStop }: Props): React.ReactElement {
  const isActive = isCapturing || status === 'connecting' || status === 'connected'
  const cfg = STATUS_CFG[status]
  const badge = (label: string, val: number | string) => (
    <span style={{ padding: '3px 10px', background: 'var(--surface-2)', borderRadius: 20, fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
      {label} {val || '—'}
    </span>
  )

  return (
    <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border-1)', background: 'var(--surface-raised)', display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 12 }}>
      <button onClick={isActive ? onStop : onStart} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px',
        background: isActive ? 'var(--negative)' : 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
        color: 'white', border: 'none', borderRadius: 24, fontSize: 13, fontWeight: 600,
        boxShadow: 'var(--shadow-sm)', cursor: 'pointer', transition: 'all var(--transition-fast)'
      }}>
        <span style={{ width: 8, height: 8, borderRadius: isActive ? 2 : '50%', background: 'white' }} />
        {isActive ? 'Stop' : 'Start Listening'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, boxShadow: status === 'connected' ? `0 0 0 3px ${cfg.dot}33` : 'none' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>{cfg.label}</span>
        {statusDetail && status !== 'connected' && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>— {statusDetail}</span>}
      </div>

      {isActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          {badge('SYS', sysChunkCount)}
          {badge('MIC', micChunkCount)}
          {segmentCount > 0 && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{segmentCount} seg</span>}
        </div>
      )}

      {audioError && (
        <div style={{ width: '100%', padding: '6px 12px', background: 'var(--negative-subtle)', border: '1px solid var(--negative)', borderRadius: 'var(--radius-xs)', fontSize: 11, color: 'var(--negative)', marginTop: 4 }}>
          {audioError}
        </div>
      )}
    </div>
  )
}
