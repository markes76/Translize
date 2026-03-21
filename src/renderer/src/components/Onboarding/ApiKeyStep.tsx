import React, { useState } from 'react'

interface Props {
  onNext: () => void
}

type TestState = 'idle' | 'testing' | 'success' | 'error'

export default function ApiKeyStep({ onNext }: Props): React.ReactElement {
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testState, setTestState] = useState<TestState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const testConnection = async (): Promise<void> => {
    const trimmed = key.trim()
    if (!trimmed.startsWith('sk-')) {
      setTestState('error')
      setErrorMessage('API keys start with "sk-". Double-check your key.')
      return
    }

    setTestState('testing')
    setErrorMessage('')

    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${trimmed}` }
      })

      if (res.ok) {
        await window.translize.keychain.set('openai-api-key', trimmed)
        setTestState('success')
      } else if (res.status === 401) {
        setTestState('error')
        setErrorMessage('Invalid API key. Check that you copied it correctly.')
      } else {
        setTestState('error')
        setErrorMessage(`OpenAI returned ${res.status}. Try again.`)
      }
    } catch {
      setTestState('error')
      setErrorMessage("Can't reach OpenAI right now. Check your internet connection.")
    }
  }

  const handlePaste = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      setKey(text.trim())
    } catch {
      // Clipboard read failed, let user type
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 40px 40px', maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Connect to OpenAI</h2>
      <p style={{ color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 32 }}>
        Translize uses OpenAI to transcribe your calls in real time. Your key is stored
        securely in your Mac's Keychain and sent only to OpenAI — never anywhere else.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={key}
            onChange={e => { setKey(e.target.value); setTestState('idle') }}
            placeholder="sk-..."
            style={{
              width: '100%', padding: '10px 40px 10px 12px',
              border: `1px solid ${testState === 'error' ? 'var(--negative)' : testState === 'success' ? 'var(--positive)' : 'var(--border-1)'}`,
              borderRadius: 'var(--radius-md)', background: 'var(--surface-2)',
              color: 'var(--ink-1)', fontSize: 14, outline: 'none'
            }}
            onKeyDown={e => e.key === 'Enter' && testConnection()}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--ink-3)',
              fontSize: 16, cursor: 'pointer', padding: 2
            }}
            aria-label={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? '🙈' : '👁'}
          </button>
        </div>
        <button
          onClick={handlePaste}
          style={{
            padding: '10px 14px', border: '1px solid var(--border-1)',
            borderRadius: 'var(--radius-md)', background: 'var(--surface-2)',
            color: 'var(--ink-1)', cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          Paste
        </button>
      </div>

      {/* Status messages */}
      {testState === 'error' && (
        <p style={{ color: 'var(--negative)', fontSize: 13, marginBottom: 12 }}>
          ✗ {errorMessage}
        </p>
      )}
      {testState === 'success' && (
        <p style={{ color: 'var(--positive)', fontSize: 13, marginBottom: 12 }}>
          ✓ Connected successfully. Key saved to Keychain.
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button
          onClick={testConnection}
          disabled={!key.trim() || testState === 'testing'}
          style={{
            flex: 1, padding: '11px 0',
            background: testState === 'success' ? 'var(--positive)' : 'var(--primary)',
            color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
            fontWeight: 500, cursor: !key.trim() || testState === 'testing' ? 'not-allowed' : 'pointer',
            opacity: !key.trim() || testState === 'testing' ? 0.6 : 1
          }}
        >
          {testState === 'testing' ? 'Testing…' : testState === 'success' ? '✓ Connected' : 'Test Connection'}
        </button>
      </div>

      <button
        onClick={() => window.translize.shell.openUrl('https://platform.openai.com/api-keys')}
        style={{
          background: 'none', border: 'none', color: 'var(--primary)',
          cursor: 'pointer', fontSize: 13, textAlign: 'left', marginBottom: 'auto'
        }}
      >
        Don't have an API key? Here's how to get one →
      </button>

      <button
        onClick={onNext}
        disabled={testState !== 'success'}
        style={{
          marginTop: 32, padding: '12px 0',
          background: 'var(--primary)', color: 'white',
          border: 'none', borderRadius: 'var(--radius-md)',
          fontWeight: 600, cursor: testState !== 'success' ? 'not-allowed' : 'pointer',
          opacity: testState !== 'success' ? 0.4 : 1, fontSize: 15
        }}
      >
        Continue →
      </button>
    </div>
  )
}
