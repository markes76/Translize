import React from 'react'
import logo from '../../assets/translize-logo.png'

interface Props {
  onNext: () => void
}

export default function WelcomeStep({ onNext }: Props): React.ReactElement {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      flex: 1, padding: 60, textAlign: 'center', gap: 24
    }}>
      <img src={logo} alt="Translize" style={{ width: 96, height: 96, objectFit: 'contain' }} />

      <div style={{ maxWidth: 480 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
          Welcome to Translize
        </h1>
        <p style={{ fontSize: 16, color: 'var(--ink-3)', lineHeight: 1.6 }}>
          Your real-time call companion. Context when you need it,
          notes you never have to take.
        </p>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8,
        width: '100%', maxWidth: 400
      }}>
        {[
          { icon: '⚡', text: 'Live transcription with < 2s latency' },
          { icon: '🧠', text: 'Surfaces relevant past context during calls' },
          { icon: '📓', text: 'Auto-syncs summaries to Google NotebookLM' },
          { icon: '🔒', text: 'All data stays on your Mac — no cloud storage' }
        ].map(({ icon, text }) => (
          <div key={text} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            background: 'var(--surface-2)', borderRadius: 'var(--radius-md)',
            textAlign: 'left'
          }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        style={{
          marginTop: 8, padding: '14px 40px',
          background: 'var(--primary)', color: 'white',
          border: 'none', borderRadius: 'var(--radius-md)',
          fontSize: 16, fontWeight: 600, cursor: 'pointer',
          transition: 'background 0.15s'
        }}
        onMouseOver={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
        onMouseOut={e => (e.currentTarget.style.background = 'var(--primary)')}
      >
        Get Started →
      </button>
    </div>
  )
}
