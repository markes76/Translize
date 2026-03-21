import React, { useState, useEffect, useRef } from 'react'

interface Props {
  onNext: () => void
  onSkip: () => void
}

type Phase = 'idle' | 'installing' | 'logging-in' | 'done' | 'error'

export default function NotebookStep({ onNext, onSkip }: Props): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const removeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    // Check if already set up
    window.translize.notebooklm.status().then(s => {
      if (s.installed && s.authenticated) {
        setPhase('done')
      }
    })
    return () => { removeRef.current?.() }
  }, [])

  const handleConnect = async () => {
    setError('')

    // Step 1: Install if needed
    const status = await window.translize.notebooklm.status()
    if (!status.installed) {
      setPhase('installing')
      const removeProgress = window.translize.notebooklm.onSetupProgress(setProgress)
      removeRef.current = removeProgress

      const setupResult = await window.translize.notebooklm.setup() as { ok: boolean; error?: string }
      removeProgress()
      removeRef.current = null

      if (!setupResult.ok) {
        setPhase('error')
        setError(setupResult.error ?? 'Installation failed. Make sure Python 3 is installed.')
        return
      }
    }

    // Step 2: Login -- this opens the user's real browser
    setPhase('logging-in')
    setProgress('Your browser will open for Google sign-in. Complete the login there.')

    const loginResult = await window.translize.notebooklm.login() as { ok: boolean; error?: string }

    if (loginResult.ok) {
      await window.translize.config.write({ notebooklm_enabled: true })
      setPhase('done')
      setProgress('')
    } else {
      setPhase('error')
      setError(loginResult.error ?? 'Login failed. You can try again or skip for now.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 40px 40px', maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Connect to Google NotebookLM</h2>
      <p style={{ color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 24 }}>
        Link your Google account to sync call summaries, get web research, and build cross-call knowledge with NotebookLM.
      </p>

      <div style={{
        padding: 18, background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-1)', marginBottom: 24
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 28, flexShrink: 0 }}>📓</span>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>What NotebookLM provides</div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[
                'Auto web research for unanswered questions',
                'Structured summaries, action items, annotations',
                'Audio overviews, infographics, and rich outputs',
                'Cross-call knowledge that grows over time'
              ].map(item => (
                <li key={item} style={{ fontSize: 13, color: 'var(--ink-3)', display: 'flex', gap: 6 }}>
                  <span style={{ color: 'var(--positive)', flexShrink: 0 }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--ink-1)' }}>How it works:</strong> Clicking "Connect" will install the NotebookLM
        CLI tool (first time only, ~1 min), then open your browser for Google sign-in. Once signed in, your
        session is saved and refreshed automatically.
      </div>

      {/* Progress / status messages */}
      {(phase === 'installing' || phase === 'logging-in') && (
        <div style={{
          padding: '12px 16px', marginBottom: 16,
          background: 'var(--primary-subtle)', border: '1px solid var(--primary)',
          borderRadius: 'var(--radius-md)', fontSize: 13
        }}>
          <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: 4 }}>
            {phase === 'installing' ? 'Installing...' : 'Waiting for Google sign-in...'}
          </div>
          {progress && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{progress}</div>}
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 16,
          background: 'var(--negative-subtle)', border: '1px solid var(--negative)',
          borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--negative)', lineHeight: 1.5
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
        {phase === 'done' ? (
          <button
            onClick={onNext}
            style={{
              padding: '12px 0', background: 'var(--positive)', color: 'white',
              border: 'none', borderRadius: 'var(--radius-md)',
              fontWeight: 600, cursor: 'pointer', fontSize: 15
            }}
          >
            Connected -- Continue
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={phase === 'installing' || phase === 'logging-in'}
            style={{
              padding: '12px 0',
              background: (phase === 'installing' || phase === 'logging-in') ? 'var(--ink-3)' : 'var(--primary)',
              color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              cursor: (phase === 'installing' || phase === 'logging-in') ? 'default' : 'pointer',
              fontSize: 15
            }}
          >
            {phase === 'installing' ? 'Installing...' :
             phase === 'logging-in' ? 'Waiting for sign-in...' :
             'Connect NotebookLM'}
          </button>
        )}
        <button
          onClick={() => {
            window.translize.config.write({ notebooklm_enabled: false })
            onSkip()
          }}
          disabled={phase === 'installing' || phase === 'logging-in'}
          style={{
            padding: '12px 0', background: 'transparent',
            color: 'var(--ink-3)', border: '1px solid var(--border-1)',
            borderRadius: 'var(--radius-md)',
            cursor: (phase === 'installing' || phase === 'logging-in') ? 'default' : 'pointer',
            fontSize: 14,
            opacity: (phase === 'installing' || phase === 'logging-in') ? 0.5 : 1
          }}
        >
          Skip for Now
        </button>
      </div>
    </div>
  )
}
