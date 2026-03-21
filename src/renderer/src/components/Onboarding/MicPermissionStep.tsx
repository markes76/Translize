import React, { useState, useEffect } from 'react'

interface Props {
  onNext: () => void
}

type Status = 'checking' | 'not-determined' | 'granted' | 'denied'

export default function MicPermissionStep({ onNext }: Props): React.ReactElement {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    window.translize.permissions.micStatus().then((s) => {
      setStatus(s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'not-determined')
    })
  }, [])

  const requestPermission = async (): Promise<void> => {
    const granted = await window.translize.permissions.micRequest()
    setStatus(granted ? 'granted' : 'denied')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 40px 40px', maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Allow Microphone Access</h2>
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 32 }}>
        To hear your side of the conversation, Translize needs access to your microphone.
        This is a standard macOS permission.
      </p>

      <div style={{
        padding: 20, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
        marginBottom: 24, border: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 32 }}>🎤</span>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>Microphone</div>
            <div style={{ fontSize: 13, color: status === 'granted' ? 'var(--success)' : status === 'denied' ? 'var(--error)' : 'var(--text-muted)' }}>
              {status === 'checking' && 'Checking…'}
              {status === 'not-determined' && 'Permission not yet requested'}
              {status === 'granted' && '✓ Access granted'}
              {status === 'denied' && '✗ Access denied'}
            </div>
          </div>
        </div>
      </div>

      {status === 'denied' && (
        <div style={{
          padding: 16, background: '#fef3c7', borderRadius: 'var(--radius)',
          marginBottom: 24, border: '1px solid #fbbf24'
        }}>
          <p style={{ fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
            You denied microphone access. You can still capture the other person's audio via system
            audio. If you change your mind, go to{' '}
            <strong>System Settings → Privacy &amp; Security → Microphone</strong>.
          </p>
          <button
            onClick={() => window.translize.shell.openPrivacySettings('Privacy_Microphone')}
            style={{
              marginTop: 8, padding: '6px 12px', fontSize: 12,
              background: '#92400e', color: '#fff', border: 'none',
              borderRadius: 'var(--radius)', cursor: 'pointer'
            }}
          >
            Open System Settings
          </button>
        </div>
      )}

      {(status === 'not-determined' || status === 'checking') && (
        <button
          onClick={requestPermission}
          disabled={status === 'checking'}
          style={{
            padding: '12px 0', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius)',
            fontWeight: 500, cursor: 'pointer', marginBottom: 12
          }}
        >
          Grant Microphone Access
        </button>
      )}

      <button
        onClick={onNext}
        style={{
          marginTop: 'auto', padding: '12px 0',
          background: status === 'granted' ? 'var(--accent)' : 'var(--bg-secondary)',
          color: status === 'granted' ? '#fff' : 'var(--text)',
          border: `1px solid ${status === 'granted' ? 'transparent' : 'var(--border)'}`,
          borderRadius: 'var(--radius)', fontWeight: 600, cursor: 'pointer', fontSize: 15
        }}
      >
        {status === 'granted' ? 'Continue →' : 'Skip for Now →'}
      </button>
    </div>
  )
}
