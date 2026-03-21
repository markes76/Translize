import React, { useEffect, useState } from 'react'

interface Props { onBack: () => void }

const V = { sp2: '8px', sp3: '12px', sp4: '16px', sp5: '20px', sp6: '24px', sp8: '32px', sp10: '40px' }

export default function Settings({ onBack }: Props): React.ReactElement {
  const [openaiKey, setOpenaiKey] = useState('')
  const [openaiOk, setOpenaiOk] = useState(false)
  const [tavilyKey, setTavilyKey] = useState('')
  const [tavilyOk, setTavilyOk] = useState(false)
  const [tavilyTesting, setTavilyTesting] = useState(false)
  const [tavilyEnabled, setTavilyEnabled] = useState(true)
  const [nlmStatus, setNlmStatus] = useState<{ authenticated: boolean; installed: boolean }>({ authenticated: false, installed: false })
  const [config, setConfig] = useState<Record<string, unknown>>({})

  useEffect(() => {
    window.translize.keychain.get('openai-api-key').then(k => { if (k) { setOpenaiKey('••••••••' + k.slice(-4)); setOpenaiOk(true) } })
    window.translize.tavily.status().then(s => { setTavilyOk(s.configured); if (s.configured) setTavilyKey('••••••••') })
    window.translize.notebooklm.status().then((s: any) => setNlmStatus(s))
    window.translize.config.read().then(c => { setConfig(c); setTavilyEnabled(c.tavily_enabled !== false) })
  }, [])

  const handleTavilyTest = async () => {
    if (!tavilyKey || tavilyKey.startsWith('••')) return
    setTavilyTesting(true)
    const result = await window.translize.tavily.testKey(tavilyKey)
    if (result.ok) { await window.translize.tavily.setKey(tavilyKey); setTavilyOk(true); setTavilyKey('••••••••') }
    else alert(`Tavily test failed: ${result.error}`)
    setTavilyTesting(false)
  }

  const handleTavilyRemove = async () => {
    await window.translize.tavily.removeKey()
    setTavilyOk(false); setTavilyKey('')
  }

  const toggleTavily = async (on: boolean) => {
    setTavilyEnabled(on)
    await window.translize.config.write({ tavily_enabled: on })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-1)', paddingTop: 28 }}>
      <header style={{ padding: `${V.sp4} ${V.sp8}`, display: 'flex', alignItems: 'center', gap: V.sp4, borderBottom: '1px solid var(--border-subtle)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}>← Back</button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Settings</h1>
      </header>

      <main style={{ flex: 1, overflow: 'auto', padding: V.sp8 }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>

          {/* OpenAI */}
          <IntegrationCard title="OpenAI" desc="Transcription, analysis, and AI features" status={openaiOk ? 'connected' : 'disconnected'} icon="🤖">
            <div style={{ display: 'flex', alignItems: 'center', gap: V.sp3 }}>
              <input value={openaiKey} readOnly style={inputStyle} placeholder="Not configured" />
              <StatusDot ok={openaiOk} />
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginTop: V.sp2 }}>
              Change your API key in the onboarding flow (Reset App in session list).
            </p>
          </IntegrationCard>

          {/* Tavily */}
          <IntegrationCard title="Tavily Web Search" desc="AI-optimized web search for real-time answers" status={tavilyOk ? 'connected' : 'not configured'} icon="🌐">
            <div style={{ display: 'flex', alignItems: 'center', gap: V.sp3, marginBottom: V.sp3 }}>
              <input
                value={tavilyKey} onChange={e => setTavilyKey(e.target.value)}
                placeholder="tvly-your-api-key" type={tavilyKey.startsWith('••') ? 'text' : 'password'}
                style={inputStyle}
              />
              <StatusDot ok={tavilyOk} />
            </div>
            <div style={{ display: 'flex', gap: V.sp2, flexWrap: 'wrap' }}>
              {!tavilyOk && (
                <SmallBtn label={tavilyTesting ? 'Testing...' : 'Test & Save'} color="var(--primary)" onClick={handleTavilyTest} disabled={tavilyTesting || !tavilyKey || tavilyKey.startsWith('••')} />
              )}
              {tavilyOk && <SmallBtn label="Remove Key" color="var(--negative)" onClick={handleTavilyRemove} />}
              <SmallBtn label={tavilyEnabled ? 'Enabled' : 'Disabled'} color={tavilyEnabled ? 'var(--positive)' : 'var(--ink-3)'} onClick={() => toggleTavily(!tavilyEnabled)} />
            </div>
            <a href="#" onClick={e => { e.preventDefault(); window.translize.shell.openUrl('https://tavily.com') }}
              style={{ display: 'block', marginTop: V.sp3, fontSize: 'var(--text-xs)', color: 'var(--primary)', fontWeight: 500 }}>
              Get a free Tavily API key at tavily.com
            </a>
          </IntegrationCard>

          {/* NotebookLM */}
          <IntegrationCard title="Google NotebookLM" desc="Sync call summaries, deep research, cross-call knowledge" status={nlmStatus.authenticated ? 'connected' : 'not connected'} icon="📓">
            <div style={{ display: 'flex', alignItems: 'center', gap: V.sp3, marginBottom: V.sp3 }}>
              <span style={{ fontSize: 'var(--text-sm)', color: nlmStatus.authenticated ? 'var(--positive)' : 'var(--ink-3)' }}>
                {nlmStatus.authenticated ? 'Authenticated' : nlmStatus.installed ? 'Installed but not authenticated' : 'Not installed'}
              </span>
              <StatusDot ok={nlmStatus.authenticated} />
            </div>
            {!nlmStatus.authenticated && (
              <SmallBtn label="Connect NotebookLM" color="var(--purple)" onClick={async () => {
                if (!nlmStatus.installed) await window.translize.notebooklm.setup()
                await window.translize.notebooklm.login()
                const s = await window.translize.notebooklm.status() as any
                setNlmStatus(s)
              }} />
            )}
          </IntegrationCard>

          {/* Coming Soon */}
          <IntegrationCard title="CRM Integration" desc="Sync contacts and call data to your CRM" status="coming soon" icon="📊">
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)', fontStyle: 'italic' }}>Coming in a future update.</p>
          </IntegrationCard>

          <IntegrationCard title="Firebase" desc="Cloud storage and real-time sync" status="coming soon" icon="🔥">
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)', fontStyle: 'italic' }}>Coming in a future update.</p>
          </IntegrationCard>

        </div>
      </main>
    </div>
  )
}

function IntegrationCard({ title, desc, status, icon, children }: {
  title: string; desc: string; status: string; icon: string; children: React.ReactNode
}): React.ReactElement {
  const statusColor = status === 'connected' ? 'var(--positive)' : status === 'coming soon' ? 'var(--ink-4)' : 'var(--warning)'
  return (
    <div style={{ marginBottom: V.sp6, padding: V.sp6, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: V.sp4, marginBottom: V.sp4 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: V.sp3 }}>
            <span style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>{title}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{status}</span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginTop: 2 }}>{desc}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean }): React.ReactElement {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? 'var(--positive)' : 'var(--ink-4)', flexShrink: 0 }} />
}

function SmallBtn({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled?: boolean }): React.ReactElement {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: `${V.sp2} ${V.sp4}`, background: `${color}15`, color, border: `1px solid ${color}33`,
      borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1
    }}>
      {label}
    </button>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', outline: 'none'
}
