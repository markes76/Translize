import React, { useState } from 'react'

interface Props { onNext: () => void; onSkip: () => void }

export default function TavilyStep({ onNext, onSkip }: Props): React.ReactElement {
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  const handleTest = async () => {
    if (!key.trim()) return
    setTesting(true); setError('')
    const result = await window.translize.tavily.testKey(key.trim())
    if (result.ok) {
      await window.translize.tavily.setKey(key.trim())
      await window.translize.config.write({ tavily_enabled: true })
      setConnected(true)
    } else {
      setError(result.error ?? 'Invalid key')
    }
    setTesting(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 40px 40px', maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Web Search (Tavily)</h2>
      <p style={{ color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 8 }}>
        When your knowledge base doesn't have the answer, CallCompanion can search the web.
        We use Tavily, a search engine built for AI apps — fast, structured, and relevant.
      </p>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 24 }}>
        This is optional. You can add it later from Settings.
      </p>

      <div style={{ padding: 20, background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-1)', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 28, flexShrink: 0 }}>🌐</span>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>What web search provides</div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['Real-time answers when local docs and NLM have no match', 'Structured results from across the web', 'AI-generated answer summaries', 'Results tagged with source URLs for verification'].map(item => (
                <li key={item} style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', gap: 6 }}>
                  <span style={{ color: 'var(--positive)', flexShrink: 0 }}>✓</span>{item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {!connected && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Tavily API Key
          </label>
          <input value={key} onChange={e => setKey(e.target.value)} placeholder="tvly-your-api-key" type="password"
            style={{ width: '100%', padding: '12px 16px', background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 14, outline: 'none', marginBottom: 8 }} />
          <a href="#" onClick={e => { e.preventDefault(); window.translize.shell.openUrl('https://app.tavily.com/home') }}
            style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>
            Get a free API key at tavily.com
          </a>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 16, background: 'var(--negative-subtle)', border: '1px solid var(--negative)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--negative)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
        {connected ? (
          <button onClick={onNext} style={{ padding: '12px 0', background: 'var(--positive)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer', fontSize: 15 }}>
            Connected -- Continue
          </button>
        ) : (
          <button onClick={handleTest} disabled={testing || !key.trim()} style={{
            padding: '12px 0', background: key.trim() && !testing ? 'var(--primary)' : 'var(--ink-4)',
            color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600,
            cursor: key.trim() && !testing ? 'pointer' : 'default', fontSize: 15
          }}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        )}
        <button onClick={onSkip} style={{ padding: '12px 0', background: 'transparent', color: 'var(--ink-3)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 14 }}>
          Skip for Now
        </button>
      </div>
    </div>
  )
}
