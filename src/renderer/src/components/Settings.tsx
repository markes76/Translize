import React, { useEffect, useState, useCallback } from 'react'

interface Props { onBack: () => void }

type SettingsSection = 'general' | 'audio' | 'keys' | 'knowledge' | 'contacts' | 'appearance' | 'advanced'

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'G' },
  { id: 'audio', label: 'Audio & Transcription', icon: 'A' },
  { id: 'keys', label: 'API Keys & Integrations', icon: 'K' },
  { id: 'knowledge', label: 'Knowledge Base', icon: 'KB' },
  { id: 'contacts', label: 'Contacts', icon: '👤' },
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
  const [recordingsEnabled, setRecordingsEnabled] = useState(true)
  const [recordingsRetention, setRecordingsRetention] = useState(30)
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
      setRecordingsEnabled(c.recordings_enabled !== false)
      if (typeof c.recordings_retention_days === 'number') setRecordingsRetention(c.recordings_retention_days)
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--surface-1)' }}>
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

                {/* Voice recordings */}
                <SettingRow label="Save Voice Recordings" desc="Record calls as WAV files (16kHz mono, ~3.5MB/30min). Recordings are saved to your session folder and playable from the call summary.">
                  <ToggleSwitch enabled={recordingsEnabled} onChange={async (v) => { setRecordingsEnabled(v); await window.translize.config.write({ recordings_enabled: v }) }} />
                </SettingRow>
                {recordingsEnabled && (
                  <SettingRow label="Auto-delete Recordings After" desc="Automatically delete voice recording files after the selected number of days to manage disk space.">
                    <select
                      value={recordingsRetention}
                      onChange={async (e) => { const v = Number(e.target.value); setRecordingsRetention(v); await window.translize.config.write({ recordings_retention_days: v }) }}
                      style={{ padding: '4px 8px', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}
                    >
                      <option value={7}>7 days</option>
                      <option value={30}>30 days</option>
                      <option value={90}>90 days</option>
                      <option value={0}>Never</option>
                    </select>
                  </SettingRow>
                )}

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

            {activeSection === 'contacts' && (
              <ContactsSettingsPanel />
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

// ── Contacts Settings Panel ────────────────────────────────────────────────

interface ContactEntry {
  id: string
  name: string
  firstName?: string
  lastName?: string
  company?: string
  jobTitle?: string
  email?: string
  email2?: string
  phone?: string
  phone2?: string
  address?: string
  city?: string
  state?: string
  country?: string
  website?: string
  birthday?: string
  notes?: string
  source: string
}

interface SettingsImportSource {
  id: string; label: string; icon: string; fileType: string; steps: string[]
}

const SETTINGS_IMPORT_SOURCES: SettingsImportSource[] = [
  {
    id: 'google-contacts',
    label: 'Google Contacts',
    icon: '👤',
    fileType: 'vCard (.vcf) or CSV',
    steps: [
      'Open contacts.google.com in your browser',
      'Click the menu icon (☰) → "Export"',
      'Choose "Google CSV" or "vCard" format',
      'Click "Export" — a file will download',
      'Click "Choose File" below and select that file'
    ]
  },
  {
    id: 'google-sheets',
    label: 'Google Sheets',
    icon: '📊',
    fileType: 'CSV',
    steps: [
      'Open your contact spreadsheet in Google Sheets',
      'Make sure you have columns: Name, Company (or Organization), Email',
      'Click File → Download → "Comma Separated Values (.csv)"',
      'Click "Choose File" below and select the downloaded file'
    ]
  },
  {
    id: 'microsoft',
    label: 'Microsoft / Outlook',
    icon: '📧',
    fileType: 'CSV',
    steps: [
      'Open Outlook → File → Open & Export → Import/Export',
      'Choose "Export to a file" → "Comma Separated Values"',
      'Select "Contacts" folder → choose save location → Finish',
      'Alternatively: go to people.live.com → Manage → Export contacts',
      'Click "Choose File" below and select the exported CSV'
    ]
  }
]

const SOURCE_LABELS: Record<string, string> = {
  'google-contacts': 'Google Contacts',
  'google-sheets': 'Google Sheets',
  'microsoft': 'Microsoft / Outlook',
  'manual': 'Manual'
}

function filterContacts(contacts: ContactEntry[], query: string): ContactEntry[] {
  if (!query.trim()) return contacts
  const tokens = query.toLowerCase().trim().split(/\s+/)
  return contacts.filter(c => {
    const fields = [c.name, c.company, c.jobTitle, c.email, c.city, c.country, c.state].filter(Boolean).map(f => f!.toLowerCase())
    return tokens.every(t => fields.some(f => f.includes(t)))
  })
}

function ContactsSettingsPanel(): React.ReactElement {
  const [contacts, setContacts] = useState<ContactEntry[]>([])
  const [search, setSearch] = useState('')
  const [clearing, setClearing] = useState<string | null>(null)
  const [expandedSource, setExpandedSource] = useState<string | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<Record<string, string>>({})
  const [selectedContact, setSelectedContact] = useState<ContactEntry | null>(null)

  const load = async () => {
    try { setContacts(await window.translize.contact.list()) } catch {}
  }

  useEffect(() => { load() }, [])

  // Close card on Escape
  useEffect(() => {
    if (!selectedContact) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedContact(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedContact])

  const clearSource = async (source: string) => {
    setClearing(source)
    await window.translize.contact.clearSource(source)
    await load()
    setClearing(null)
  }

  const handleImport = async (sourceId: string) => {
    setImporting(sourceId)
    setImportStatus(prev => ({ ...prev, [sourceId]: 'Choosing file...' }))
    try {
      const result = await window.translize.contact.pickAndImport(sourceId)
      if (result.canceled) {
        setImportStatus(prev => ({ ...prev, [sourceId]: '' }))
      } else {
        setImportStatus(prev => ({ ...prev, [sourceId]: `✓ ${result.count} new contacts imported (${result.total} total)` }))
        await load()
      }
    } catch (e) {
      setImportStatus(prev => ({ ...prev, [sourceId]: `Error: ${(e as Error).message}` }))
    }
    setImporting(null)
  }

  // Group imported contacts by source
  const filtered = filterContacts(contacts, search)
  const bySource = filtered.reduce<Record<string, ContactEntry[]>>((acc, c) => {
    if (!acc[c.source]) acc[c.source] = []
    acc[c.source].push(c)
    return acc
  }, {})

  return (
    <div style={{ padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)', position: 'relative' }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink-1)', marginBottom: 4 }}>Contacts</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)' }}>
          {contacts.length > 0 ? `${contacts.length} contacts imported total. Click any contact to view details.` : 'No contacts imported yet.'}
        </div>
      </div>

      {/* Import section */}
      <div>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Import Contacts
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {SETTINGS_IMPORT_SOURCES.map(src => (
            <button
              key={src.id}
              onClick={() => setExpandedSource(expandedSource === src.id ? null : src.id)}
              style={{
                flex: 1, padding: '10px 8px',
                background: expandedSource === src.id ? 'var(--primary-subtle)' : 'var(--surface-2)',
                border: `1px solid ${expandedSource === src.id ? 'var(--primary)' : 'var(--border-1)'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                fontSize: 'var(--text-xs)', fontWeight: 600,
                color: expandedSource === src.id ? 'var(--primary)' : 'var(--ink-2)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
              }}
            >
              <span style={{ fontSize: 18 }}>{src.icon}</span>
              <span>{src.label}</span>
            </button>
          ))}
        </div>

        {/* Expanded instructions */}
        {expandedSource && (() => {
          const src = SETTINGS_IMPORT_SOURCES.find(s => s.id === expandedSource)!
          const status = importStatus[src.id]
          return (
            <div style={{
              padding: '16px', background: 'var(--surface-2)',
              border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)'
            }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink-1)', marginBottom: 10 }}>
                How to export from {src.label}
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
                {src.steps.map((step, i) => (
                  <li key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-2)', lineHeight: 1.5 }}>{step}</li>
                ))}
              </ol>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => handleImport(src.id)}
                  disabled={importing === src.id}
                  style={{
                    padding: '8px 18px',
                    background: importing === src.id ? 'var(--ink-3)' : 'var(--primary)',
                    color: 'white', border: 'none', borderRadius: 'var(--radius-xs)',
                    fontSize: 'var(--text-sm)', fontWeight: 600,
                    cursor: importing === src.id ? 'default' : 'pointer'
                  }}
                >
                  {importing === src.id ? 'Importing...' : `Choose ${src.fileType} File`}
                </button>
                {status && (
                  <span style={{
                    fontSize: 'var(--text-xs)',
                    color: status.startsWith('✓') ? 'var(--positive)' : status.startsWith('Error') ? 'var(--negative)' : 'var(--ink-3)'
                  }}>
                    {status}
                  </span>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Imported contacts list grouped by source */}
      {contacts.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Imported Contacts
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)' }}>
              {search ? `${filtered.length} of ${contacts.length}` : contacts.length}
            </span>
          </div>
          {/* Search bar */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--ink-4)', pointerEvents: 'none' }}>🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, company, email, city…"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 12px 8px 32px',
                background: 'var(--surface-2)', border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)',
                fontSize: 'var(--text-sm)', outline: 'none'
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', fontSize: 14, padding: 2 }}>✕</button>
            )}
          </div>
          {Object.keys(bySource).length === 0 && search && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>
              No contacts match "{search}"
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(bySource).map(([source, list]) => (
              <div key={source} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink-1)' }}>
                      {SOURCE_LABELS[source] ?? source}
                    </span>
                    <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)', color: 'var(--ink-3)' }}>{list.length} contacts</span>
                  </div>
                  <button
                    onClick={() => clearSource(source)}
                    disabled={clearing === source}
                    style={{ padding: '4px 10px', background: 'var(--negative-subtle)', border: '1px solid var(--negative)', borderRadius: 'var(--radius-xs)', color: 'var(--negative)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {clearing === source ? 'Removing...' : 'Remove All'}
                  </button>
                </div>
                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                  {list.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedContact(c)}
                      style={{
                        width: '100%', padding: '10px 16px',
                        borderBottom: '1px solid var(--border-subtle)',
                        background: 'transparent', border: 'none',
                        borderBottomColor: 'var(--border-subtle)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'background var(--transition-fast)'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-1)', fontWeight: 600 }}>{c.name}</span>
                          {c.jobTitle && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)' }}>{c.jobTitle}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          {c.company && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)' }}>{c.company}</span>}
                          {c.email && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)' }}>{c.email}</span>}
                          {c.city && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)' }}>📍 {[c.city, c.country].filter(Boolean).join(', ')}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--ink-4)', marginLeft: 8, flexShrink: 0 }}>›</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact detail card modal */}
      {selectedContact && (
        <ContactCard contact={selectedContact} onClose={() => setSelectedContact(null)} />
      )}
    </div>
  )
}

function ContactCard({ contact: c, onClose }: { contact: ContactEntry; onClose: () => void }): React.ReactElement {
  const initials = (c.firstName?.[0] ?? c.name[0] ?? '?').toUpperCase() + (c.lastName?.[0] ?? c.name.split(' ')[1]?.[0] ?? '').toUpperCase()

  const Field = ({ label, value }: { label: string; value?: string }) => {
    if (!value) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-1)' }}>{value}</span>
      </div>
    )
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )

  const locationParts = [c.address, c.city, c.state, c.country].filter(Boolean).join(', ')
  const sourceLabel = SOURCE_LABELS[c.source] ?? c.source

  const hasWork = c.company || c.jobTitle
  const hasContact = c.email || c.email2 || c.phone || c.phone2 || c.website
  const hasLocation = locationParts
  const hasMore = c.birthday || c.notes

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 100, backdropFilter: 'blur(2px)'
        }}
      />
      {/* Card */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 480, maxWidth: 'calc(100vw - 48px)',
        maxHeight: 'calc(100vh - 96px)',
        background: 'var(--surface-1)', border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)',
        zIndex: 101, overflow: 'hidden',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Avatar + name header */}
        <div style={{
          padding: '24px 24px 20px',
          background: 'var(--surface-2)',
          borderBottom: '1px solid var(--border-1)',
          display: 'flex', alignItems: 'center', gap: 16
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700, color: 'white', flexShrink: 0
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink-1)' }}>{c.name}</div>
            {c.jobTitle && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)', marginTop: 2 }}>{c.jobTitle}</div>}
            {c.company && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)' }}>{c.company}</div>}
            <div style={{ marginTop: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: 'var(--ink-3)',
                background: 'var(--surface-3)', padding: '2px 8px',
                borderRadius: 'var(--radius-full)', letterSpacing: '0.04em'
              }}>
                {sourceLabel}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--surface-3)', border: 'none',
              fontSize: 14, color: 'var(--ink-3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: '20px 24px', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {hasContact && (
            <Section title="Contact">
              <Field label="Email" value={c.email} />
              <Field label="Email 2" value={c.email2} />
              <Field label="Phone" value={c.phone} />
              <Field label="Phone 2" value={c.phone2} />
              <Field label="Website" value={c.website} />
            </Section>
          )}
          {hasWork && (
            <Section title="Work">
              <Field label="Company" value={c.company} />
              <Field label="Job Title" value={c.jobTitle} />
            </Section>
          )}
          {hasLocation && (
            <Section title="Location">
              <Field label="Address" value={c.address} />
              <Field label="City" value={c.city} />
              <Field label="State / Region" value={c.state} />
              <Field label="Country" value={c.country} />
            </Section>
          )}
          {hasMore && (
            <Section title="More">
              <Field label="Birthday" value={c.birthday} />
              <Field label="Notes" value={c.notes} />
            </Section>
          )}
          {!hasContact && !hasWork && !hasLocation && !hasMore && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-4)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
              No additional details available for this contact.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
