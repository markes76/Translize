import React, { useState, useEffect } from 'react'

interface Props {
  onNext: () => void
}

type Status = 'checking' | 'not-determined' | 'granted' | 'denied'

export default function AudioPermissionStep({ onNext }: Props): React.ReactElement {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async (): Promise<void> => {
    const s = await window.translize.permissions.screenStatus()
    setStatus(s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'not-determined')
  }

  const requestPermission = async (): Promise<void> => {
    // Spawning AudioCapture binary triggers the permission dialog
    const result = await window.translize.audio.checkPermission()
    if (result.status === 'unavailable') {
      // Binary not built yet in dev — skip gracefully
      onNext()
      return
    }
    // Re-check after a moment — macOS updates permission state asynchronously
    setTimeout(checkStatus, 1000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 40px 40px', maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Allow System Audio Capture</h2>
      <p style={{ color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 16 }}>
        To hear the other person on your calls, Translize captures system audio using
        Apple's ScreenCaptureKit.
      </p>

      {/* Important callout — users get nervous about Screen Recording */}
      <div style={{
        padding: 14, background: 'rgba(37, 99, 235, 0.08)',
        borderRadius: 'var(--radius-md)', border: '1px solid rgba(37, 99, 235, 0.2)',
        marginBottom: 24
      }}>
        <p style={{ fontSize: 13, lineHeight: 1.5 }}>
          <strong>🔒 Privacy note:</strong> Despite being called "Screen Recording," this permission
          only captures <strong>audio</strong> — not your screen. Translize never records video
          or takes screenshots.
        </p>
      </div>

      <div style={{
        padding: 20, background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)',
        marginBottom: 24, border: '1px solid var(--border-1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 32 }}>🔊</span>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>System Audio (via ScreenCaptureKit)</div>
            <div style={{ fontSize: 13, color: status === 'granted' ? 'var(--positive)' : status === 'denied' ? 'var(--negative)' : 'var(--ink-3)' }}>
              {status === 'checking' && 'Checking…'}
              {status === 'not-determined' && 'Permission not yet granted'}
              {status === 'granted' && '✓ Access granted'}
              {status === 'denied' && '✗ Access denied in System Settings'}
            </div>
          </div>
        </div>
      </div>

      {status === 'denied' && (
        <div style={{
          padding: 16, background: '#fef3c7', borderRadius: 'var(--radius-md)',
          marginBottom: 24, border: '1px solid #fbbf24'
        }}>
          <p style={{ fontSize: 13, color: '#92400e', lineHeight: 1.5, marginBottom: 10 }}>
            To enable system audio capture, go to{' '}
            <strong>System Settings → Privacy &amp; Security → Screen Recording</strong>{' '}
            and enable Translize.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.translize.shell.openPrivacySettings('Privacy_ScreenCapture')}
              style={{
                padding: '6px 12px', fontSize: 12,
                background: '#92400e', color: '#fff', border: 'none',
                borderRadius: 'var(--radius-md)', cursor: 'pointer'
              }}
            >
              Open System Settings
            </button>
            <button
              onClick={checkStatus}
              style={{
                padding: '6px 12px', fontSize: 12,
                background: 'transparent', color: '#92400e',
                border: '1px solid #fbbf24', borderRadius: 'var(--radius-md)', cursor: 'pointer'
              }}
            >
              Check Again
            </button>
          </div>
        </div>
      )}

      {(status === 'not-determined' || status === 'checking') && (
        <button
          onClick={requestPermission}
          disabled={status === 'checking'}
          style={{
            padding: '12px 0', background: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-md)',
            fontWeight: 500, cursor: 'pointer', marginBottom: 12
          }}
        >
          Grant Access
        </button>
      )}

      {status !== 'granted' && (
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>
          Without system audio, Translize can only transcribe what your microphone picks up.
          For best results during calls, we recommend enabling this.
        </p>
      )}

      <button
        onClick={onNext}
        style={{
          marginTop: 'auto', padding: '12px 0',
          background: status === 'granted' ? 'var(--primary)' : 'var(--surface-2)',
          color: status === 'granted' ? '#fff' : 'var(--ink-1)',
          border: `1px solid ${status === 'granted' ? 'transparent' : 'var(--border-1)'}`,
          borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', fontSize: 15
        }}
      >
        {status === 'granted' ? 'Continue →' : 'Continue Without System Audio →'}
      </button>
    </div>
  )
}
