import React, { useEffect, useState, useCallback } from 'react'

interface Props { onBack: () => void }

type SettingsSection = 'general' | 'audio' | 'keys' | 'knowledge' | 'appearance' | 'advanced'

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'G' },
  { id: 'audio', label: 'Audio & Transcription', icon: 'A' },
  { id: 'keys', label: 'API Keys & Integrations', icon: 'K' },
  { id: 'knowledge', label: 'Knowledge Base', icon: 'KB' },
  { id: 'appearance', label: 'Appearance', icon: 'T' },
  { id: 'advanced', label: 'Advanced', icon: 'X' }
]

export default function Settings({ onBack }: Props): React.ReactElement {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [hoveredSection, setHoveredSection] = useState<string | null>(null)

  // API Key state
  const [openaiKey, setOpenaiKey] = useState('')
  const [openaiOk, setOpenaiOk] = useState(false)
  const [openaiEditing, setOpenaiEditing] = useState(false)
  const [openaiNewKey, setOpenaiNewKey] = useState('')
  const [openaiTesting, setOpenaiTesting] = useState(false)
  const [tavilyKey, setTavilyKey] = useState('')
  const [tavilyOk, setTavilyOk] = useState(false)
  const [tavilyTesting, setTavilyTesting] = useState(false)
  const [tavilyEnabled, setTavilyEnabled] = useState(true)
  const [nlmStatus, setNlmStatus] = useState<{ authenticated: boolean; installed: boolean }>({ authenticated: false, installed: false })
  const [geminiKey, setGeminiKey] = useState('')
  const [geminiOk, setGeminiOk] = useState(false)
  const [geminiTesting, setGeminiTesting] = useState(false)
  const [audioBuffering, setAudioBuffering] = useState(false)
  const [config, setConfig] = useState<Record<string, unknown>>({})

  // Appearance state
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')

  // General settings state
  const [languages, setLanguages] = useState<string[]>([])

  useEffect(() => {
    window.translize.keychain.get('openai-api-key').then(k => { if (k) { setOpenaiKey('••••••••' + k.slice(-4)); setOpenaiOk(true) } })
    window.translize.tavily.status().then(s => { setTavilyOk(s.configured); if (s.configured) setTavilyKey('••••••••') })
    window.translize.notebooklm.status().then((s: any) => setNlmStatus(s))
    window.translize.gemini.status().then(s => { setGeminiOk(s.configured); setAudioBuffering(s.audioBufferingEnabled); if (s.configured) setGeminiKey('••••••••') })
    window.translize.config.read().then(c => {
      setConfig(c)
      setTavilyEnabled(c.tavily_enabled !== false)
      if (Array.isArray(c.languages)) setLanguages(c.languages as string[])
    })
    window.translize.app.getTheme().then(t => setTheme(t))
  }, [])

  const handleThemeChange = useCallback(async (t: 'light' | 'dark' | 'system') => {
    setTheme(t)
    await window.translize.app.setTheme(t)
    // Apply data-theme to <html> so CSS overrides kick in immediately
    if (t === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', t)
    }
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

  const toggleLanguage = async (code: string) => {
    let updated: string[]
    if (code === 'auto') {
      updated = []
    } else {
      updated = languages.includes(code) ? languages.filter(l => l !== code) : [...languages.filter(l => l !== 'auto'), code]
    }
    setLanguages(updated)
    await window.translize.config.write({ languages: updated })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: 'var(--surface-1)' }}>
      {/* Header */}
      <header style={{ padding: 'var(--sp-4) var(--sp-8)', display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', borderBottom: '1px solid var(--border-subtle)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}>← Back</button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Settings</h1>
      </header>

      {/* Two-column layout: sidebar nav + content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Section sidebar */}
        <nav style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border-subtle)', padding: 'var(--sp-4) 0', overflow: 'auto', background: 'var(--surface-1)' }}>
          {SECTIONS.map(sec => {
            const isActive = activeSection === sec.id
            const isHovered = hoveredSection === sec.id
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                onMouseEnter={() => setHoveredSection(sec.id)}
                onMouseLeave={() => setHoveredSection(null)}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                  padding: 'var(--sp-3) var(--sp-5)',
                  background: isActive ? 'var(--primary-subtle)' : isHovered ? 'var(--surface-2)' : 'none',
                  border: 'none', borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                  color: isActive ? 'var(--primary)' : 'var(--ink-2)',
                  fontSize: 'var(--text-sm)', fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)'
                }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                  background: isActive ? 'var(--primary)' : 'var(--surface-3)',
                  color: isActive ? 'white' : 'var(--ink-3)'
                }}>
                  {sec.icon}
                </span>
                {sec.label}
              </button>
            )
          })}
        </nav>

        {/* Content area */}
        <main style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-8)' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            {activeSection === 'general' && (
              <SettingsPanel title="General" desc="Default settings for all sessions">
                {/* Default languages */}
                <SettingRow label="Default Languages" desc="Pre-select languages for new call sessions. Auto-detect works for most cases.">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
                    {[
                      { code: 'auto', label: 'Auto-detect' },
                      { code: 'en', label: 'English' }, { code: 'he', label: 'Hebrew' },
                      { code: 'es', label: 'Spanish' }, { code: 'fr', label: 'French' },
                      { code: 'de', label: 'German' }, { code: 'ar', label: 'Arabic' }
                    ].map(l => {
                      const sel = languages.includes(l.code) || (languages.length === 0 && l.code === 'auto')
                      return (
                        <button key={l.code} onClick={() => toggleLanguage(l.code)} style={{
                          padding: '5px 12px', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
                          background: sel ? 'var(--primary-subtle)' : 'var(--surface-2)',
                          border: `1px solid ${sel ? 'var(--primary)' : 'var(--border-1)'}`,
                          color: sel ? 'var(--primary)' : 'var(--ink-2)'
                        }}>{l.label}{sel && l.code !== 'auto' ? ' ✓' : ''}</button>
                      )
                    })}
                  </div>
                </SettingRow>

                {/* Default context mode info */}
                <SettingRow label="Default Context Mode" desc="The context mode is selected per-session in the call setup screen.">
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)', fontStyle: 'italic' }}>
                    Configured per session (Local, NotebookLM, or Both)
                  </div>
                </SettingRow>
              </SettingsPanel>
            )}

            {activeSection === 'audio' && (
              <SettingsPanel title="Audio & Transcription" desc="Audio capture and transcription settings">
                {/* Audio buffering */}
                <SettingRow label="Audio Buffering" desc="Temporarily store call audio for deep voice sentiment analysis with Gemini. Audio files are auto-deleted after 30 minutes.">
                  <ToggleSwitch enabled={audioBuffering} onChange={async (v) => { setAudioBuffering(v); await window.translize.gemini.toggleAudioBuffering(v) }} />
                </SettingRow>

                {/* Transcription info */}
                <SettingRow label="Transcription Engine" desc="Real-time transcription via OpenAI Whisper through the Realtime API. Dual-channel architecture separates your voice from system audio for accurate speaker attribution.">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                    <StatusDot ok={openaiOk} />
                    <span style={{ fontSize: 'var(--text-sm)', color: openaiOk ? 'var(--positive)' : 'var(--ink-3)' }}>
                      {openaiOk ? 'OpenAI Whisper connected' : 'Requires OpenAI API key'}
                    </span>
                  </div>
                </SettingRow>

                {/* Silence threshold info */}
                <SettingRow label="Silence Detection" desc="Voice activity detection runs server-side with a 500ms silence threshold. System audio below a minimum energy level is automatically filtered.">
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)' }}>
                    VAD threshold: 0.5 | Silence: 500ms | Prefix padding: 300ms
                  </div>
                </SettingRow>
              </SettingsPanel>
            )}

            {activeSection === 'keys' && (
              <SettingsPanel title="API Keys & Integrations" desc="Manage your service connections and API keys">
                {/* OpenAI */}
                <IntegrationCard title="OpenAI" desc="Transcription, analysis, summarization, and all AI features. Required." status={openaiOk ? 'connected' : 'disconnected'} icon="AI" required>
                  {!openaiEditing ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
                        <input value={openaiKey} readOnly style={inputStyle} placeholder="Not configured" />
                        <StatusDot ok={openaiOk} />
                      </div>
                      <SmallBtn label={openaiOk ? 'Change Key' : 'Add API Key'} color="var(--primary)" onClick={() => setOpenaiEditing(true)} />
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
                        <input value={openaiNewKey} onChange={e => setOpenaiNewKey(e.target.value)} placeholder="sk-your-openai-api-key" type="password" style={inputStyle} />
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                        <SmallBtn label={openaiTesting ? 'Testing...' : 'Test & Save'} color="var(--primary)" onClick={async () => {
                          if (!openaiNewKey.trim()) return
                          setOpenaiTesting(true)
                          try {
                            const resp = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${openaiNewKey.trim()}` } })
                            if (resp.ok) {
                              await window.translize.keychain.set('openai-api-key', openaiNewKey.trim())
                              setOpenaiKey('••••••••' + openaiNewKey.trim().slice(-4))
                              setOpenaiOk(true)
                              setOpenaiEditing(false)
                              setOpenaiNewKey('')
                            } else { alert('Invalid API key') }
                          } catch (e) { alert(`Error: ${(e as Error).message}`) }
                          setOpenaiTesting(false)
                        }} disabled={openaiTesting || !openaiNewKey.trim()} />
                        <SmallBtn label="Cancel" color="var(--ink-3)" onClick={() => { setOpenaiEditing(false); setOpenaiNewKey('') }} />
                      </div>
                    </>
                  )}
                </IntegrationCard>

                {/* Tavily */}
                <IntegrationCard title="Tavily Web Search" desc="AI-optimized web search for real-time answers during calls" status={tavilyOk ? 'connected' : 'not configured'} icon="WEB">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
                    <input
                      value={tavilyKey} onChange={e => setTavilyKey(e.target.value)}
                      placeholder="tvly-your-api-key" type={tavilyKey.startsWith('••') ? 'text' : 'password'}
                      style={inputStyle}
                    />
                    <StatusDot ok={tavilyOk} />
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                    {!tavilyOk && (
                      <SmallBtn label={tavilyTesting ? 'Testing...' : 'Test & Save'} color="var(--primary)" onClick={handleTavilyTest} disabled={tavilyTesting || !tavilyKey || tavilyKey.startsWith('••')} />
                    )}
                    {tavilyOk && <SmallBtn label="Remove Key" color="var(--negative)" onClick={handleTavilyRemove} />}
                    <SmallBtn label={tavilyEnabled ? 'Enabled' : 'Disabled'} color={tavilyEnabled ? 'var(--positive)' : 'var(--ink-3)'} onClick={() => toggleTavily(!tavilyEnabled)} />
                  </div>
                  <a href="#" onClick={e => { e.preventDefault(); window.translize.shell.openUrl('https://tavily.com') }}
                    style={{ display: 'block', marginTop: 'var(--sp-3)', fontSize: 'var(--text-xs)', color: 'var(--primary)', fontWeight: 500 }}>
                    Get a free Tavily API key at tavily.com
                  </a>
                </IntegrationCard>

                {/* NotebookLM */}
                <IntegrationCard title="Google NotebookLM" desc="Sync call summaries, deep research, cross-call knowledge synthesis" status={nlmStatus.authenticated ? 'connected' : 'not connected'} icon="NLM">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: nlmStatus.authenticated ? 'var(--positive)' : 'var(--ink-3)' }}>
                      {nlmStatus.authenticated ? 'Authenticated' : nlmStatus.installed ? 'Installed but not authenticated' : 'Not installed'}
                    </span>
                    <StatusDot ok={nlmStatus.authenticated} />
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                    <SmallBtn label={nlmStatus.authenticated ? 'Re-authenticate' : 'Connect NotebookLM'} color="var(--purple)" onClick={async () => {
                      if (!nlmStatus.installed) await window.translize.notebooklm.setup()
                      await window.translize.notebooklm.login()
                      const s = await window.translize.notebooklm.status() as any
                      setNlmStatus(s)
                    }} />
                    {nlmStatus.authenticated && (
                      <SmallBtn label="Disconnect" color="var(--negative)" onClick={async () => {
                        await window.translize.notebooklm.stop()
                        await window.translize.config.write({ notebooklm_enabled: false })
                        setNlmStatus({ authenticated: false, installed: nlmStatus.installed })
                      }} />
                    )}
                  </div>
                </IntegrationCard>

                {/* Gemini */}
                <IntegrationCard title="Google Gemini" desc="Deep voice sentiment analysis -- detects tone, sarcasm, and vocal dynamics from audio" status={geminiOk ? 'connected' : 'not configured'} icon="GEM">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
                    <input value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="Your Gemini API key" type={geminiKey.startsWith('••') ? 'text' : 'password'} style={inputStyle} />
                    <StatusDot ok={geminiOk} />
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                    {!geminiOk && (
                      <SmallBtn label={geminiTesting ? 'Testing...' : 'Test & Save'} color="var(--primary)" onClick={async () => {
                        if (!geminiKey.trim() || geminiKey.startsWith('••')) return
                        setGeminiTesting(true)
                        const r = await window.translize.gemini.testKey(geminiKey.trim())
                        if (r.ok) { await window.translize.gemini.setKey(geminiKey.trim()); setGeminiOk(true); setGeminiKey('••••••••') }
                        else alert(`Gemini test failed: ${r.error}`)
                        setGeminiTesting(false)
                      }} disabled={geminiTesting || !geminiKey.trim() || geminiKey.startsWith('••')} />
                    )}
                    {geminiOk && <SmallBtn label="Remove Key" color="var(--negative)" onClick={async () => { await window.translize.gemini.removeKey(); setGeminiOk(false); setGeminiKey('') }} />}
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', marginTop: 'var(--sp-3)' }}>Gemini is used exclusively for deep sentiment analysis with voice. All other features use OpenAI.</p>
                </IntegrationCard>

                {/* Coming Soon */}
                <IntegrationCard title="CRM Integration" desc="Sync contacts and call data to your CRM" status="coming soon" icon="CRM">
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)', fontStyle: 'italic' }}>Coming in a future update.</p>
                </IntegrationCard>

                <IntegrationCard title="Firebase" desc="Cloud storage and real-time sync" status="coming soon" icon="DB">
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)', fontStyle: 'italic' }}>Coming in a future update.</p>
                </IntegrationCard>
              </SettingsPanel>
            )}

            {activeSection === 'knowledge' && (
              <SettingsPanel title="Knowledge Base" desc="Document indexing and context retrieval settings">
                <SettingRow label="Supported Formats" desc="Upload documents to provide context during calls. Supported formats include PDF, DOCX, TXT, and Markdown.">
                  <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                    {['PDF', 'DOCX', 'TXT', 'Markdown'].map(fmt => (
                      <span key={fmt} style={{ padding: '4px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)' }}>{fmt}</span>
                    ))}
                  </div>
                </SettingRow>

                <SettingRow label="Vector Search" desc="Documents are chunked and indexed using ChromaDB for semantic search. Questions detected during calls are automatically searched against your knowledge base.">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                    <StatusDot ok={true} />
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--positive)' }}>ChromaDB active</span>
                  </div>
                </SettingRow>

                <SettingRow label="NotebookLM Sync" desc="When NotebookLM is connected, call summaries and Q&A pairs can be synced for cross-call knowledge synthesis.">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                    <StatusDot ok={nlmStatus.authenticated} />
                    <span style={{ fontSize: 'var(--text-sm)', color: nlmStatus.authenticated ? 'var(--positive)' : 'var(--ink-3)' }}>
                      {nlmStatus.authenticated ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                </SettingRow>
              </SettingsPanel>
            )}

            {activeSection === 'appearance' && (
              <SettingsPanel title="Appearance" desc="Visual preferences">
                <SettingRow label="Color Theme" desc="Choose light, dark, or follow your macOS system preference. This setting is independent of your system appearance.">
                  <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    {(['light', 'system', 'dark'] as const).map(t => {
                      const isActive = theme === t
                      const previews: Record<string, { bg: string; text: string; border: string }> = {
                        light:  { bg: '#faf9f7', text: '#1a1816', border: '#e4e0db' },
                        system: { bg: 'linear-gradient(135deg, #faf9f7 50%, #121110 50%)', text: 'var(--ink-1)', border: 'var(--border-1)' },
                        dark:   { bg: '#121110', text: '#f0ece6', border: '#2e2b27' }
                      }
                      const p = previews[t]
                      return (
                        <button
                          key={t}
                          onClick={() => handleThemeChange(t)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-2)',
                            padding: 'var(--sp-3)', background: 'none', border: `2px solid ${isActive ? 'var(--primary)' : 'var(--border-1)'}`,
                            borderRadius: 'var(--radius-md)', cursor: 'pointer', minWidth: 80,
                            transition: 'border-color var(--transition-fast)'
                          }}
                        >
                          <div style={{
                            width: 56, height: 36, borderRadius: 'var(--radius-sm)',
                            background: p.bg, border: `1px solid ${p.border}`,
                            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <div style={{ width: 32, height: 4, borderRadius: 2, background: p.text, opacity: 0.4 }} />
                          </div>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--primary)' : 'var(--ink-2)', textTransform: 'capitalize' }}>
                            {t}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </SettingRow>

                <SettingRow label="Typography" desc="Using Plus Jakarta Sans for body text and Fraunces for display headings.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--ink-1)' }}>Plus Jakarta Sans — Body text</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', color: 'var(--ink-1)', fontStyle: 'italic' }}>Fraunces — Display headings</span>
                  </div>
                </SettingRow>
              </SettingsPanel>
            )}

            {activeSection === 'advanced' && (
              <SettingsPanel title="Advanced" desc="System and data management">
                <SettingRow label="Data Storage" desc="All data is stored locally on your machine in the Electron user data directory. No data is sent to external servers except API calls to OpenAI, Gemini, Tavily, and NotebookLM.">
                  <button onClick={() => window.translize.app.openDataFolder()} style={{
                    padding: 'var(--sp-2) var(--sp-4)', background: 'var(--surface-2)', border: '1px solid var(--border-1)',
                    borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer'
                  }}>
                    Open in Finder
                  </button>
                </SettingRow>

                <SettingRow label="Reset Application" desc="Delete all sessions, contacts, skills, and settings. This cannot be undone.">
                  <ResetButton />
                </SettingRow>

                <SettingRow label="Version" desc="Current application version and build information.">
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)', fontFamily: 'monospace' }}>v0.1.0</span>
                </SettingRow>
              </SettingsPanel>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// -- Section Components --

function SettingsPanel({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="page-enter">
      <div style={{ marginBottom: 'var(--sp-8)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink-1)', marginBottom: 'var(--sp-2)' }}>{title}</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)' }}>{desc}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        {children}
      </div>
    </div>
  )
}

function SettingRow({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ padding: 'var(--sp-5) var(--sp-6)', background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ marginBottom: 'var(--sp-3)' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink-1)', marginBottom: 'var(--sp-1)' }}>{label}</div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', lineHeight: 1.5 }}>{desc}</p>
      </div>
      {children}
    </div>
  )
}

function IntegrationCard({ title, desc, status, icon, required, children }: {
  title: string; desc: string; status: string; icon: string; required?: boolean; children: React.ReactNode
}): React.ReactElement {
  const statusColor = status === 'connected' ? 'var(--positive)' : status === 'coming soon' ? 'var(--ink-4)' : 'var(--warning)'
  return (
    <div style={{ marginBottom: 'var(--sp-4)', padding: 'var(--sp-6)', background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', letterSpacing: '0.02em' }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <span style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>{title}</span>
            {required && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--negative)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Required</span>}
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.06em',
              padding: '2px 8px', borderRadius: 'var(--radius-full)',
              background: status === 'connected' ? 'var(--positive-subtle)' : status === 'coming soon' ? 'var(--surface-2)' : 'var(--warning-subtle)'
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor }} />
              {status}
            </span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.5 }}>{desc}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean }): React.ReactElement {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? 'var(--positive)' : 'var(--ink-4)', flexShrink: 0, transition: 'background var(--transition-fast)' }} />
}

function SmallBtn({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled?: boolean }): React.ReactElement {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: 'var(--sp-2) var(--sp-4)', background: `${color}15`, color, border: `1px solid ${color}33`,
      borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1
    }}>
      {label}
    </button>
  )
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return (
    <button onClick={() => onChange(!enabled)} style={{
      width: 44, height: 24, borderRadius: 12, padding: 2, border: 'none', cursor: 'pointer',
      background: enabled ? 'var(--positive)' : 'var(--ink-5)', transition: 'background var(--transition-fast)'
    }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: 'var(--shadow-sm)', transform: enabled ? 'translateX(20px)' : 'translateX(0)', transition: 'transform var(--transition-fast)' }} />
    </button>
  )
}

function ResetButton(): React.ReactElement {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--negative)', fontWeight: 600 }}>This will delete everything. Are you sure?</span>
        <button onClick={() => window.translize.app.reset()} style={{
          padding: 'var(--sp-2) var(--sp-4)', background: 'var(--negative)', color: 'white', border: 'none',
          borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer'
        }}>
          Reset Everything
        </button>
        <button onClick={() => setConfirming(false)} style={{
          padding: 'var(--sp-2) var(--sp-4)', background: 'var(--surface-2)', color: 'var(--ink-2)', border: '1px solid var(--border-1)',
          borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer'
        }}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => setConfirming(true)} style={{
      padding: 'var(--sp-2) var(--sp-4)', background: 'var(--negative-subtle)', color: 'var(--negative)', border: '1px solid var(--negative)',
      borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer'
    }}>
      Reset Application
    </button>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', outline: 'none'
}
