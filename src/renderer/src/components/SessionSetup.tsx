import React, { useState, useEffect, useRef } from 'react'

interface Props {
  prefill?: { name?: string; docPaths?: string[]; notebookId?: string; mode?: 'local' | 'notebook' | 'both' }
  onStart: (session: { id: string; name?: string; docPaths: string[]; mode: string; notebookId?: string }) => void
  onBack: () => void
}

type Mode = 'local' | 'notebook' | 'both'
type NlmState = 'unknown' | 'not-connected' | 'setting-up' | 'connected'
interface Notebook { id: string; title: string; source_count: number; updated_at: string }

const MODES: { value: Mode; label: string; desc: string; icon: string }[] = [
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

  useEffect(() => { checkNlm(); return () => { removeRef.current?.() } }, [])
  useEffect(() => { if (needsNlm && nlmState === 'connected' && notebooks.length === 0) fetchNbs() }, [needsNlm, nlmState])

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
    header: { padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid var(--border-1)', background: 'var(--surface-raised)' },
    backBtn: { background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600 as const, cursor: 'pointer' as const },
    title: { fontSize: 18, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-0.02em' },
    content: { flex: 1, overflow: 'auto' as const, padding: '32px' },
    inner: { maxWidth: 560, margin: '0 auto' },
    label: { display: 'block' as const, fontSize: 11, fontWeight: 700 as const, color: 'var(--ink-3)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10 },
    input: { width: '100%', padding: '12px 16px', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 14, outline: 'none' },
    section: { marginBottom: 32 },
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={onBack} style={S.backBtn}>← Back</button>
        <span style={S.title}>New Call</span>
      </div>
      <div style={S.content}>
        <div style={S.inner}>
          {/* Name */}
          <div style={S.section}>
            <label style={S.label}>Session Name (optional)</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Corp" style={S.input} />
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
                  borderRadius: 'var(--radius)', cursor: 'pointer', textAlign: 'center' as const, transition: 'all 0.15s'
                }}>
                  <div style={{
                    fontSize: m.icon ? 22 : 12,
                    marginBottom: 8,
                    minHeight: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--ink-3)',
                    fontWeight: m.value === 'local' ? 500 : undefined
                  }}>{m.icon || null}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-1)', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.4 }}>{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* NLM Gate */}
          {needsNlm && nlmState !== 'connected' && (
            <div style={{ ...S.section, padding: 24, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius)' }}>
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
            color: canStart ? 'white' : 'var(--ink-3)', border: 'none', borderRadius: 'var(--radius)',
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
