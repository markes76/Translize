import React, { useState, useEffect, useRef } from 'react'

// Multi-field tokenized search: every word in query must match at least one field
function filterContacts(contacts: Contact[], query: string): Contact[] {
  const tokens = query.toLowerCase().trim().split(/\s+/)
  return contacts.filter(c => {
    const fields = [c.name, c.company, c.jobTitle, c.email, c.city, c.country].filter(Boolean).map(f => f!.toLowerCase())
    return tokens.every(t => fields.some(f => f.includes(t)))
  })
}

interface Contact {
  id: string
  name: string
  company?: string
  jobTitle?: string
  email?: string
  city?: string
  country?: string
  source: string
}

interface ImportSource {
  id: string
  label: string
  icon: string
  fileType: string
  steps: string[]
}

const IMPORT_SOURCES: ImportSource[] = [
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

interface Props {
  prefill?: { name?: string; docPaths?: string[]; notebookId?: string; mode?: 'local' | 'notebook' | 'both' | 'facetime' }
  onStart: (session: { id: string; name?: string; docPaths: string[]; mode: string; notebookId?: string }) => void
  onBack: () => void
}

type Mode = 'local' | 'notebook' | 'both' | 'facetime'
type NlmState = 'unknown' | 'not-connected' | 'setting-up' | 'connected'
interface Notebook { id: string; title: string; source_count: number; updated_at: string }

const MODES: { value: Mode; label: string; desc: string; icon: string }[] = [
  { value: 'facetime', label: 'In-Person', desc: 'Face-to-face — up to 15 voices', icon: '🫂' },
  { value: 'local', label: 'Local Only', desc: 'Fast search from your documents', icon: '—' },
  { value: 'both', label: 'Local + NLM', desc: 'Local speed + NotebookLM insights', icon: '' },
  { value: 'notebook', label: 'NotebookLM', desc: 'All context from NotebookLM', icon: '📓' }
]

export default function SessionSetup({ prefill, onStart, onBack }: Props): React.ReactElement {
  const [name, setName] = useState(prefill?.name ?? '')
  const [docPaths, setDocPaths] = useState<string[]>(prefill?.docPaths ?? [])
  const [mode, setMode] = useState<Mode>(prefill?.mode ?? 'local')
  const [callTopic, setCallTopic] = useState('')
  const [callLanguages, setCallLanguages] = useState<string[]>([])
  const [indexing, setIndexing] = useState(false)
  const [indexStatus, setIndexStatus] = useState('')
  const [nlmState, setNlmState] = useState<NlmState>('unknown')
  const [nlmProgress, setNlmProgress] = useState('')
  const [nlmError, setNlmError] = useState('')
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [selectedNb, setSelectedNb] = useState<string>(prefill?.notebookId ?? '')
  const [loadingNbs, setLoadingNbs] = useState(false)
  const [newNbName, setNewNbName] = useState('')
  const [creatingNb, setCreatingNb] = useState(false)
  const removeRef = useRef<(() => void) | null>(null)
  const needsNlm = mode === 'notebook' || mode === 'both'

  // Contact autocomplete
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<Contact[]>([])
  const nameInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Import panel
  const [expandedSource, setExpandedSource] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState<string | null>(null)

  useEffect(() => { checkNlm(); loadContacts(); return () => { removeRef.current?.() } }, [])
  useEffect(() => { if (needsNlm && nlmState === 'connected' && notebooks.length === 0) fetchNbs() }, [needsNlm, nlmState])

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          nameInputRef.current && !nameInputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadContacts = async () => {
    try {
      const list = await window.translize.contact.list()
      setContacts(list)
    } catch {}
  }

  const handleNameChange = (val: string) => {
    setName(val)
    if (!val.trim()) { setShowSuggestions(false); return }
    const matches = filterContacts(contacts, val).slice(0, 8)
    setSuggestions(matches)
    setShowSuggestions(matches.length > 0)
  }

  const selectContact = (c: Contact) => {
    setName(c.company ? `${c.name} — ${c.company}` : c.name)
    setShowSuggestions(false)
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
        await loadContacts()
      }
    } catch (e) {
      setImportStatus(prev => ({ ...prev, [sourceId]: `Error: ${(e as Error).message}` }))
    }
    setImporting(null)
  }

  const checkNlm = async () => {
    try {
      const s = await window.translize.notebooklm.status() as any
      setNlmState(s.authenticated ? 'connected' : 'not-connected')
      if (s.authenticated) await window.translize.config.write({ notebooklm_enabled: true })
    } catch { setNlmState('not-connected') }
  }

  const fetchNbs = async () => {
    setLoadingNbs(true)
    try {
      const r = await window.translize.notebooklm.listNotebooks()
      if (Array.isArray(r)) { setNotebooks(r as Notebook[]); if (!selectedNb) { const f = (r as Notebook[]).find(n => n.title && n.title !== 'Untitled notebook'); if (f) setSelectedNb(f.id) } }
    } catch {}
    setLoadingNbs(false)
  }

  const connectNlm = async () => {
    setNlmState('setting-up'); setNlmError('')
    const rm = window.translize.notebooklm.onSetupProgress(setNlmProgress); removeRef.current = rm
    try {
      const s = await window.translize.notebooklm.status() as any
      if (!s.installed) { const r = await window.translize.notebooklm.setup() as any; if (!r.ok) { setNlmState('not-connected'); setNlmError(r.error ?? 'Failed'); rm(); return } }
      if (!s.authenticated) { const r = await window.translize.notebooklm.login() as any; if (!r.ok) { setNlmState('not-connected'); setNlmError(r.error ?? 'Failed'); rm(); return } }
      await window.translize.config.write({ notebooklm_enabled: true }); setNlmState('connected')
    } catch (e) { setNlmState('not-connected'); setNlmError((e as Error).message) }
    rm(); setNlmProgress('')
  }

  const canStart = !indexing && (!needsNlm || (nlmState === 'connected' && selectedNb !== ''))

  const handleStart = async () => {
    setIndexing(true); setIndexStatus('Creating session...')
    const session = await window.translize.session.create({ name: name.trim() || undefined, docPaths, notebookId: needsNlm ? selectedNb : undefined, mode }) as any
    for (let i = 0; i < docPaths.length; i++) { setIndexStatus(`Indexing ${i + 1}/${docPaths.length}...`); await window.translize.knowledge.loadDoc(session.id, docPaths[i]) }
    if (mode !== 'local' && selectedNb) { for (let i = 0; i < docPaths.length; i++) { setIndexStatus(`Uploading to NLM ${i + 1}/${docPaths.length}...`); try { await window.translize.notebooklm.uploadSource(selectedNb, docPaths[i]) } catch {} } }
    setIndexing(false); onStart(session)
  }

  const S = {
    page: { display: 'flex' as const, flexDirection: 'column' as const, flex: 1, background: 'var(--surface-1)' },
    header: { padding: 'var(--sp-4) var(--sp-8)', display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', borderBottom: '1px solid var(--border-1)', background: 'var(--surface-raised)' },
    backBtn: { background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--text-sm)', fontWeight: 600 as const, cursor: 'pointer' as const },
    title: { fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-0.02em' },
    content: { flex: 1, overflow: 'auto' as const, padding: 'var(--sp-8)' },
    inner: { maxWidth: 560, margin: '0 auto' },
    label: { display: 'block' as const, fontSize: 'var(--text-xs)', fontWeight: 700 as const, color: 'var(--ink-3)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 'var(--sp-3)' },
    input: { width: '100%', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', outline: 'none' },
    section: { marginBottom: 'var(--sp-8)' },
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={onBack} style={S.backBtn}>← Back</button>
        <span style={S.title}>New Call</span>
      </div>
      <div style={S.content}>
        <div style={S.inner}>

          {/* Contact Name with autocomplete */}
          <div style={{ ...S.section, position: 'relative' }}>
            <label style={S.label}>Contact or Company Name (optional)</label>
            <input
              ref={nameInputRef}
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
              placeholder="e.g. Jane Smith, Acme Corp"
              style={S.input}
            />
            {showSuggestions && (
              <div ref={suggestionsRef} style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--surface-raised)', border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
                maxHeight: 220, overflow: 'auto', marginTop: 2
              }}>
                {suggestions.map(c => (
                  <div key={c.id} onMouseDown={() => selectContact(c)} style={{
                    padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-subtle)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>{c.name}</div>
                      {(c.company || c.jobTitle) && (
                        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                          {[c.jobTitle, c.company].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {(c.email || c.city) && (
                        <div style={{ fontSize: 10, color: 'var(--ink-4)' }}>
                          {[c.email, c.city && c.country ? `${c.city}, ${c.country}` : c.city].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--ink-4)', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 8 }}>
                      {c.source === 'google-contacts' ? 'Google' : c.source === 'google-sheets' ? 'Sheets' : c.source === 'microsoft' ? 'Outlook' : c.source}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Import contacts section */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6, fontWeight: 600 }}>
                {contacts.length > 0 ? `${contacts.length} contacts imported` : 'Import contacts from:'}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {IMPORT_SOURCES.map(src => (
                  <button
                    key={src.id}
                    onClick={() => setExpandedSource(expandedSource === src.id ? null : src.id)}
                    style={{
                      flex: 1, padding: '6px 8px',
                      background: expandedSource === src.id ? 'var(--primary-subtle)' : 'var(--surface-2)',
                      border: `1px solid ${expandedSource === src.id ? 'var(--primary)' : 'var(--border-1)'}`,
                      borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600, color: expandedSource === src.id ? 'var(--primary)' : 'var(--ink-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                    }}
                  >
                    <span>{src.icon}</span>
                    <span style={{ whiteSpace: 'nowrap' as const }}>{src.label}</span>
                  </button>
                ))}
              </div>

              {/* Expanded import instructions */}
              {expandedSource && (() => {
                const src = IMPORT_SOURCES.find(s => s.id === expandedSource)!
                const status = importStatus[src.id]
                return (
                  <div style={{
                    marginTop: 8, padding: '14px 16px',
                    background: 'var(--surface-2)', border: '1px solid var(--border-1)',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-1)', marginBottom: 10 }}>
                      How to export from {src.label}
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
                      {src.steps.map((step, i) => (
                        <li key={i} style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{step}</li>
                      ))}
                    </ol>
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        onClick={() => handleImport(src.id)}
                        disabled={importing === src.id}
                        style={{
                          padding: '8px 16px',
                          background: importing === src.id ? 'var(--ink-3)' : 'var(--primary)',
                          color: 'white', border: 'none', borderRadius: 'var(--radius-xs)',
                          fontSize: 12, fontWeight: 600, cursor: importing === src.id ? 'default' : 'pointer'
                        }}
                      >
                        {importing === src.id ? 'Importing...' : `Choose ${src.fileType} File`}
                      </button>
                      {status && (
                        <span style={{
                          fontSize: 11,
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
          </div>

          {/* Documents */}
          <div style={S.section}>
            <label style={S.label}>Documents</label>
            <button onClick={async () => { const p = await window.translize.session.pickDocuments(); if (p.length) setDocPaths(prev => [...new Set([...prev, ...p])]) }}
              style={{ width: '100%', padding: '14px', background: 'var(--surface-raised)', border: '2px dashed var(--border-1)', borderRadius: 'var(--radius-sm)', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
              + Add PDF, DOCX, TXT, or Markdown
            </button>
            {docPaths.map(p => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', marginBottom: 6, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-xs)', fontSize: 13 }}>
                <span style={{ color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.split('/').pop()}</span>
                <button onClick={() => setDocPaths(prev => prev.filter(x => x !== p))} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>×</button>
              </div>
            ))}
          </div>

          {/* Call Topic */}
          <div style={S.section}>
            <label style={S.label}>What's this call about? (optional)</label>
            <input value={callTopic} onChange={e => setCallTopic(e.target.value)}
              placeholder="e.g. Renewal discussion for enterprise contract"
              style={S.input} />
          </div>

          {/* Per-call Languages */}
          <div style={S.section}>
            <label style={S.label}>Expected Languages</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { code: 'auto', label: 'Auto-detect' },
                { code: 'en', label: 'English' }, { code: 'he', label: 'Hebrew' },
                { code: 'es', label: 'Spanish' }, { code: 'fr', label: 'French' },
                { code: 'de', label: 'German' }, { code: 'ar', label: 'Arabic' }
              ].map(l => {
                const sel = callLanguages.includes(l.code) || (callLanguages.length === 0 && l.code === 'auto')
                return (
                  <button key={l.code} onClick={() => {
                    if (l.code === 'auto') setCallLanguages([])
                    else setCallLanguages(p => p.includes(l.code) ? p.filter(x => x !== l.code) : [...p.filter(x => x !== 'auto'), l.code])
                  }} style={{
                    padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: sel ? 'var(--primary-subtle)' : 'var(--surface-raised)',
                    border: `1px solid ${sel ? 'var(--primary)' : 'var(--border-1)'}`,
                    color: sel ? 'var(--primary)' : 'var(--ink-2)', transition: 'all 0.15s'
                  }}>{l.label}{sel && l.code !== 'auto' ? ' ✓' : ''}</button>
                )
              })}
            </div>
          </div>

          {/* Mode */}
          <div style={S.section}>
            <label style={S.label}>Context Mode</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {MODES.map(m => (
                <button key={m.value} onClick={() => setMode(m.value)} style={{
                  flex: 1, padding: '20px 12px', background: mode === m.value ? 'var(--primary-subtle)' : 'var(--surface-raised)',
                  border: `2px solid ${mode === m.value ? 'var(--primary)' : 'var(--border-1)'}`,
                  borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'center' as const, transition: 'all 0.15s'
                }}>
                  <div style={{ fontSize: m.icon ? 22 : 12, marginBottom: 8, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontWeight: m.value === 'local' ? 500 : undefined }}>{m.icon || null}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-1)', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.4 }}>{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* NLM Gate */}
          {needsNlm && nlmState !== 'connected' && (
            <div style={{ ...S.section, padding: 24, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Connect NotebookLM</div>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 16 }}>Sign in to access your notebooks.</p>
              {nlmProgress && <div style={{ padding: '8px 12px', background: 'var(--primary-subtle)', borderRadius: 'var(--radius-xs)', fontSize: 12, color: 'var(--primary)', marginBottom: 10 }}>{nlmProgress}</div>}
              {nlmError && <div style={{ padding: '8px 12px', background: 'var(--negative-subtle)', borderRadius: 'var(--radius-xs)', fontSize: 12, color: 'var(--negative)', marginBottom: 10 }}>{nlmError}</div>}
              <button onClick={connectNlm} disabled={nlmState === 'setting-up'} style={{
                width: '100%', padding: '12px', background: nlmState === 'setting-up' ? 'var(--ink-3)' : 'var(--primary)',
                color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600
              }}>{nlmState === 'setting-up' ? 'Connecting...' : 'Connect NotebookLM'}</button>
            </div>
          )}

          {/* Notebook Picker */}
          {needsNlm && nlmState === 'connected' && (
            <div style={S.section}>
              <label style={S.label}>Select Notebook</label>
              {loadingNbs ? <div style={{ padding: 20, textAlign: 'center' as const, color: 'var(--ink-3)' }}>Loading...</div> : (
                <>
                  <div style={{ maxHeight: 240, overflow: 'auto', marginBottom: 10 }}>
                    {notebooks.map(nb => (
                      <div key={nb.id} onClick={() => setSelectedNb(nb.id)} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 16px', marginBottom: 6, cursor: 'pointer',
                        background: nb.id === selectedNb ? 'var(--primary-subtle)' : 'var(--surface-raised)',
                        border: `2px solid ${nb.id === selectedNb ? 'var(--primary)' : 'var(--border-1)'}`,
                        borderRadius: 'var(--radius-sm)', transition: 'all 0.15s'
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>{nb.title || 'Untitled'}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{nb.source_count} sources · {new Date(nb.updated_at).toLocaleDateString()}</div>
                        </div>
                        {nb.id === selectedNb && <span style={{ color: 'var(--primary)', fontWeight: 700 }}>✓</span>}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={newNbName} onChange={e => setNewNbName(e.target.value)} placeholder="New notebook name..."
                      onKeyDown={e => { if (e.key === 'Enter' && newNbName.trim()) { setCreatingNb(true); window.translize.notebooklm.createNotebook(newNbName.trim()).then(() => { fetchNbs(); setNewNbName(''); setCreatingNb(false) }) } }}
                      style={{ ...S.input, flex: 1, padding: '10px 12px', fontSize: 13 }} />
                    <button onClick={() => { if (!newNbName.trim()) return; setCreatingNb(true); window.translize.notebooklm.createNotebook(newNbName.trim()).then(() => { fetchNbs(); setNewNbName(''); setCreatingNb(false) }) }}
                      disabled={!newNbName.trim() || creatingNb}
                      style={{ padding: '10px 16px', background: newNbName.trim() ? 'var(--primary)' : 'var(--surface-2)', color: newNbName.trim() ? 'white' : 'var(--ink-3)', border: 'none', borderRadius: 'var(--radius-xs)', fontSize: 12, fontWeight: 600 }}>
                      {creatingNb ? '...' : '+ Create'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Start */}
          <button onClick={handleStart} disabled={!canStart} style={{
            width: '100%', padding: '16px 24px',
            background: canStart ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)' : 'var(--surface-2)',
            color: canStart ? 'white' : 'var(--ink-3)', border: 'none', borderRadius: 'var(--radius-md)',
            fontSize: 15, fontWeight: 600, cursor: canStart ? 'pointer' : 'default',
            boxShadow: canStart ? '0 4px 14px rgba(37, 99, 235, 0.35)' : 'none', transition: 'all 0.2s'
          }}>
            {indexing ? indexStatus : needsNlm && nlmState !== 'connected' ? 'Connect NotebookLM First' : needsNlm && !selectedNb ? 'Select a Notebook' : 'Start Call'}
          </button>
        </div>
      </div>
    </div>
  )
}
