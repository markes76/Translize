import React, { useEffect, useRef, useState } from 'react'
import type { TranscriptSegment } from '../services/openai-realtime'
import { generateSummary, CallSummary } from '../services/summarizer'
import { analyzeSentiment, SentimentAnalysis } from '../services/sentiment-engine'
import { generateOrUpdateSkill } from '../services/skill-manager'

interface Props { segments: TranscriptSegment[]; sessionId: string; sessionName?: string; notebookId?: string; mode: string; onBack: () => void; onNewCall: () => void }

const V = { sp1: '4px', sp2: '8px', sp3: '12px', sp4: '16px', sp5: '20px', sp6: '24px', sp8: '32px', sp10: '40px', sp12: '48px', sp16: '64px' }

export default function PostCallSummary({ segments, sessionId, sessionName, notebookId, mode, onBack, onNewCall }: Props): React.ReactElement {
  const [contactName, setContactName] = useState(sessionName ?? '')
  const [editingContact, setEditingContact] = useState(false)
  const [contactDraft, setContactDraft] = useState('')
  const [allContacts, setAllContacts] = useState<Array<{ id: string; name: string; company?: string; jobTitle?: string; email?: string; city?: string; country?: string }>>([])
  const [contactSuggestions, setContactSuggestions] = useState<typeof allContacts>([])
  const contactInputRef = useRef<HTMLInputElement>(null)
  const contactDropRef = useRef<HTMLDivElement>(null)
  const [summary, setSummary] = useState<CallSummary | null>(null)
  const [sentiment, setSentiment] = useState<SentimentAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle'|'syncing'|'synced'|'error'>('idle')
  const [syncMsg, setSyncMsg] = useState('')
  const [showTx, setShowTx] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [notes, setNotes] = useState('')
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [showFR, setShowFR] = useState(false)
  const [editedSegs, setEditedSegs] = useState(segments)

  const useNlm = (mode === 'notebook' || mode === 'both') && !!notebookId

  useEffect(() => { setEditedSegs(segments) }, [segments])

  useEffect(() => {
    if (!segments.length) { setLoading(false); setError('No segments.'); return }
    ;(async () => {
      try {
        const key = await window.translize.keychain.get('openai-api-key')
        if (!key) { setError('API key not found'); setLoading(false); return }
        const [sum, sent] = await Promise.all([generateSummary(segments, key), analyzeSentiment(segments, key).catch(() => null)])
        setSummary(sum); if (sent) setSentiment(sent)

        // Auto-save sentiment
        if (sent) {
          try {
            const { filename } = await window.translize.session.saveSentiment(sessionId, sent as any)
            console.log('[PostCall] Sentiment saved:', filename)
          } catch {}
        }

        // Auto-generate/update skill
        try {
          const contactName = sum.participants?.find((p: string) => p !== 'You') ?? ''
          if (contactName) {
            const existingSkill = await window.translize.skill.find(contactName) as any
            const skill = await generateOrUpdateSkill(existingSkill, contactName, segments, sum, sent, key)
            await window.translize.skill.save(skill as any)
            console.log('[PostCall] Skill saved:', skill.skillId)
          }
        } catch (e) { console.error('[PostCall] Skill generation failed:', e) }
      } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
    })()
  }, [segments])

  // Load contacts for search
  useEffect(() => {
    window.translize.contact.list().then(list => setAllContacts(list as typeof allContacts)).catch(() => {})
  }, [])

  // Close suggestions on outside click
  useEffect(() => {
    if (!editingContact) return
    const handler = (e: MouseEvent) => {
      if (!contactInputRef.current?.contains(e.target as Node) && !contactDropRef.current?.contains(e.target as Node)) {
        setContactSuggestions([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editingContact])

  const handleContactDraftChange = (val: string) => {
    setContactDraft(val)
    if (!val.trim()) { setContactSuggestions([]); return }
    const tokens = val.toLowerCase().trim().split(/\s+/)
    const matches = allContacts.filter(c => {
      const fields = [c.name, c.company, c.jobTitle, c.email, c.city, c.country].filter(Boolean).map(f => f!.toLowerCase())
      return tokens.every(t => fields.some(f => f.includes(t)))
    }).slice(0, 8)
    setContactSuggestions(matches)
  }

  const saveContact = async (name: string) => {
    const trimmed = name.trim()
    setContactName(trimmed)
    setEditingContact(false)
    setContactSuggestions([])
    await window.translize.session.update(sessionId, { name: trimmed || undefined })
  }

  const handleSave = async () => {
    if (!summary) return
    const call: Record<string, unknown> = {
      date: summary.dateTime, durationMinutes: summary.durationMinutes,
      summaryFile: `summary-${Date.now()}.json`, segmentCount: segments.length,
      sentimentScore: sentiment?.overallScore, sentimentLabel: sentiment?.overallLabel,
      tags, privateNotes: notes
    }
    await window.translize.session.addCall(sessionId, call)
    setSaved(true)
  }

  const sync = async () => {
    if (!summary || !notebookId) return; setSyncStatus('syncing'); setSyncMsg('Uploading...')
    try {
      const text = [`Call Summary — ${new Date(summary.dateTime).toLocaleString()} (${summary.durationMinutes}m)`, '', summary.overview, '', 'Key Topics:', ...summary.keyTopics.map(t => `- ${t}`), '', 'Action Items:', ...summary.actionItems.map(a => `- ${a.item}${a.owner ? ` (${a.owner})` : ''}`), '', '--- Transcript ---', '', ...editedSegs.map(s => `[${s.speakerName ?? s.speaker}] ${s.text}`)].join('\n')
      const r = await window.translize.notebooklm.addNote(notebookId, `Call — ${new Date(summary.dateTime).toLocaleDateString()}`, text) as any
      setSyncStatus(r.error ? 'error' : 'synced'); setSyncMsg(r.error ?? 'Synced!')
    } catch (e) { setSyncStatus('error'); setSyncMsg((e as Error).message) }
  }

  useEffect(() => { if (summary && useNlm && syncStatus === 'idle') sync() }, [summary])

  const addTag = (t: string) => { if (t.trim() && !tags.includes(t.trim())) setTags(p => [...p, t.trim()]); setTagInput('') }

  const quickTags = ['Follow-up', 'Decision made', 'Escalation', 'At risk', 'Positive']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--surface-1)' }}>
      {/* Header */}
      <header style={{ padding: `${V.sp3} ${V.sp8}`, borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: V.sp4 }}>
            <button onClick={onBack} style={linkBtn}>← Sessions</button>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink-1)' }}>Call Summary</h1>
          </div>
          <button onClick={onNewCall} style={{ padding: `${V.sp2} ${V.sp5}`, background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}>
            New Call
          </button>
        </div>
        {/* Contact name — editable */}
        <div style={{ marginTop: V.sp2, display: 'flex', alignItems: 'center', gap: V.sp2 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', fontWeight: 600 }}>Contact:</span>
          {editingContact ? (
            <div style={{ position: 'relative' }}>
              <input
                ref={contactInputRef}
                autoFocus
                value={contactDraft}
                onChange={e => handleContactDraftChange(e.target.value)}
                onBlur={() => { if (contactSuggestions.length === 0) saveContact(contactDraft) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveContact(contactDraft)
                  if (e.key === 'Escape') { setEditingContact(false); setContactSuggestions([]) }
                }}
                placeholder="Search or type contact name..."
                style={{ padding: '2px 8px', background: 'var(--surface-2)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', fontWeight: 600, outline: 'none', width: 240 }}
              />
              {contactSuggestions.length > 0 && (
                <div ref={contactDropRef} style={{
                  position: 'absolute', top: '100%', left: 0, width: 300,
                  background: 'var(--surface-raised)', border: '1px solid var(--border-1)',
                  borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
                  zIndex: 50, marginTop: 2
                }}>
                  {contactSuggestions.map(c => (
                    <div
                      key={c.id}
                      onMouseDown={() => saveContact(c.company ? `${c.name} — ${c.company}` : c.name)}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-subtle)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>{c.name}</div>
                      {(c.jobTitle || c.company) && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{[c.jobTitle, c.company].filter(Boolean).join(' · ')}</div>}
                      {(c.email || c.city) && <div style={{ fontSize: 10, color: 'var(--ink-4)' }}>{[c.email, c.city].filter(Boolean).join(' · ')}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => { setContactDraft(contactName); setEditingContact(true) }}
              style={{ padding: '2px 10px', background: contactName ? 'var(--surface-2)' : 'transparent', border: contactName ? '1px solid var(--border-1)' : '1px dashed var(--border-1)', borderRadius: 'var(--radius-full)', color: contactName ? 'var(--ink-2)' : 'var(--ink-4)', fontSize: 'var(--text-xs)', fontWeight: contactName ? 600 : 400, cursor: 'pointer' }}
            >
              {contactName ? `${contactName} ✎` : '+ Add contact name'}
            </button>
          )}
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto', padding: V.sp8 }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* NLM sync */}
          {useNlm && (
            <div style={{ display: 'flex', alignItems: 'center', gap: V.sp3, padding: `${V.sp4} ${V.sp5}`, marginBottom: V.sp8, borderRadius: 'var(--radius-md)', background: syncStatus === 'synced' ? 'var(--positive-subtle)' : syncStatus === 'error' ? 'var(--negative-subtle)' : 'var(--purple-subtle)', border: `1px solid ${syncStatus === 'synced' ? 'var(--positive)' : syncStatus === 'error' ? 'var(--negative)' : 'var(--purple)'}22` }}>
              <span style={{ fontSize: 16 }}>📓</span>
              <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 600, color: syncStatus === 'synced' ? 'var(--positive)' : syncStatus === 'error' ? 'var(--negative)' : 'var(--purple)' }}>
                {syncStatus === 'idle' ? 'Ready to sync' : syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'synced' ? 'Synced to NotebookLM' : syncMsg}
              </span>
              {(syncStatus === 'idle' || syncStatus === 'error') && (
                <button onClick={sync} style={{ padding: `${V.sp2} ${V.sp4}`, background: 'var(--purple)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
                  {syncStatus === 'error' ? 'Retry' : 'Sync'}
                </button>
              )}
            </div>
          )}

          {loading && <div style={{ textAlign: 'center', padding: V.sp16, color: 'var(--ink-3)', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>Generating summary...</div>}
          {error && !loading && <div style={{ padding: V.sp5, background: 'var(--negative-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--negative)', fontSize: 'var(--text-sm)' }}>{error}</div>}

          {summary && (
            <>
              {/* Hero: date + sentiment */}
              <div style={{ marginBottom: V.sp10 }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: V.sp3 }}>
                  {new Date(summary.dateTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  <span style={{ margin: '0 8px', color: 'var(--ink-5)' }}>·</span>
                  {new Date(summary.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  <span style={{ margin: '0 8px', color: 'var(--ink-5)' }}>·</span>
                  {summary.durationMinutes}m
                  <span style={{ margin: '0 8px', color: 'var(--ink-5)' }}>·</span>
                  {segments.length} segments
                </div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.4, color: 'var(--ink-1)' }}>
                  {summary.overview}
                </p>
              </div>

              {/* Sentiment bar */}
              {sentiment && (
                <div style={{ marginBottom: V.sp10, padding: V.sp6, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: V.sp4 }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Sentiment</span>
                    <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: sentiment.overallScore > 0.2 ? 'var(--positive)' : sentiment.overallScore < -0.2 ? 'var(--negative)' : 'var(--warning)' }}>
                      {sentiment.overallScore > 0 ? '+' : ''}{sentiment.overallScore.toFixed(1)} {sentiment.overallLabel}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, marginBottom: V.sp4, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, height: '100%', borderRadius: 3, left: '50%', width: `${Math.abs(sentiment.overallScore) * 50}%`, transform: sentiment.overallScore < 0 ? 'translateX(-100%)' : 'none', background: sentiment.overallScore > 0.2 ? 'var(--positive)' : sentiment.overallScore < -0.2 ? 'var(--negative)' : 'var(--warning)' }} />
                  </div>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>{sentiment.overallSummary}</p>

                  {sentiment.perSpeaker.length > 0 && (
                    <div style={{ display: 'flex', gap: V.sp3, marginTop: V.sp5, flexWrap: 'wrap' }}>
                      {sentiment.perSpeaker.map((sp, i) => (
                        <div key={i} style={{ flex: 1, minWidth: 180, padding: V.sp4, background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: V.sp2 }}>{sp.speaker}</div>
                          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: sp.score > 0.2 ? 'var(--positive)' : sp.score < -0.2 ? 'var(--negative)' : 'var(--warning)' }}>
                            {sp.score > 0 ? '+' : ''}{sp.score.toFixed(1)}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginTop: V.sp1 }}>{sp.dominantEmotions?.join(', ')}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {sentiment.relationshipSignals.riskFlags.length > 0 && (
                    <div style={{ marginTop: V.sp5, padding: V.sp4, background: 'var(--negative-subtle)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--negative)' }}>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--negative)', textTransform: 'uppercase', marginBottom: V.sp2 }}>Risk Flags</div>
                      {sentiment.relationshipSignals.riskFlags.map((f, i) => <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--negative)' }}>• {f}</div>)}
                    </div>
                  )}
                </div>
              )}

              {/* Summary grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: V.sp4, marginBottom: V.sp10 }}>
                {summary.keyTopics.length > 0 && <SumCard title="Key Topics">{summary.keyTopics.map((t, i) => <Bullet key={i} color="var(--primary)">{t}</Bullet>)}</SumCard>}
                {summary.actionItems.length > 0 && <SumCard title="Action Items">{summary.actionItems.map((a, i) => <div key={i} style={{ padding: `${V.sp3} ${V.sp4}`, background: 'var(--surface-2)', borderLeft: '3px solid var(--primary)', borderRadius: 'var(--radius-sm)', marginBottom: V.sp2, fontSize: 'var(--text-sm)' }}><strong>{a.item}</strong>{a.owner && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginLeft: V.sp2 }}>({a.owner})</span>}</div>)}</SumCard>}
                {summary.decisions.length > 0 && <SumCard title="Decisions">{summary.decisions.map((d, i) => <Bullet key={i} color="var(--warning)">{d}</Bullet>)}</SumCard>}
                {summary.followUps.length > 0 && <SumCard title="Follow-ups">{summary.followUps.map((f, i) => <Bullet key={i} color="var(--positive)">{f}</Bullet>)}</SumCard>}
              </div>

              {/* Tags + Notes */}
              <div style={{ marginBottom: V.sp10, padding: V.sp6, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: V.sp4 }}>Your Notes & Tags</div>

                {/* Quick tags */}
                <div style={{ display: 'flex', gap: V.sp2, flexWrap: 'wrap', marginBottom: V.sp3 }}>
                  {quickTags.map(t => (
                    <button key={t} onClick={() => addTag(t)} style={{
                      padding: `${V.sp2} ${V.sp3}`, borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                      background: tags.includes(t) ? 'var(--amber-subtle)' : 'var(--surface-3)',
                      border: `1px solid ${tags.includes(t) ? 'var(--amber)' : 'var(--border-1)'}`,
                      color: tags.includes(t) ? 'var(--amber)' : 'var(--ink-3)'
                    }}>
                      {t} {tags.includes(t) ? '✓' : ''}
                    </button>
                  ))}
                </div>

                {/* Custom tag input */}
                <div style={{ display: 'flex', gap: V.sp2, marginBottom: V.sp4 }}>
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTag(tagInput) }}
                    placeholder="Add custom tag..."
                    style={{ flex: 1, padding: `${V.sp2} ${V.sp3}`, background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', outline: 'none' }} />
                </div>

                {/* Applied tags */}
                {tags.length > 0 && (
                  <div style={{ display: 'flex', gap: V.sp2, flexWrap: 'wrap', marginBottom: V.sp4 }}>
                    {tags.map(t => (
                      <span key={t} style={{ padding: `2px ${V.sp3}`, borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600, background: 'var(--amber-subtle)', color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: V.sp2 }}>
                        {t}
                        <button onClick={() => setTags(p => p.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Private notes */}
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add your private notes about this call..."
                  rows={4}
                  style={{ width: '100%', padding: V.sp4, background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', lineHeight: 1.6, resize: 'vertical', outline: 'none' }} />
              </div>

              {/* Save */}
              <div style={{ display: 'flex', gap: V.sp3, marginBottom: V.sp10 }}>
                <button onClick={handleSave} disabled={saved} style={{
                  padding: `${V.sp3} ${V.sp6}`, borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: saved ? 'var(--positive)' : 'var(--primary)', color: 'white', boxShadow: 'var(--shadow-sm)'
                }}>
                  {saved ? '✓ Saved' : 'Save Summary'}
                </button>
              </div>

              {/* Transcript */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: V.sp6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: V.sp4 }}>
                  <button onClick={() => setShowTx(!showTx)} style={{ ...linkBtn, fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {showTx ? '▼' : '▶'} Transcript ({editedSegs.length})
                  </button>
                  {showTx && <button onClick={() => setShowFR(!showFR)} style={linkBtn}>{showFR ? 'Hide' : 'Find & Replace'}</button>}
                </div>
                {showTx && showFR && (
                  <div style={{ display: 'flex', gap: V.sp2, marginBottom: V.sp3 }}>
                    <input value={findText} onChange={e => setFindText(e.target.value)} placeholder="Find..." style={frInput} />
                    <input value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder="Replace..." style={frInput} />
                    <button onClick={() => {
                      if (!findText.trim()) return; const rx = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
                      setEditedSegs(p => p.map(s => ({ ...s, text: s.text.replace(rx, replaceText) })))
                    }} style={{ padding: `${V.sp2} ${V.sp4}`, background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Replace All
                    </button>
                  </div>
                )}
                {showTx && (
                  <div style={{ maxHeight: 300, overflow: 'auto', padding: V.sp4, background: 'var(--surface-raised)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-1)', fontSize: 'var(--text-xs)', lineHeight: 1.7 }}>
                    {editedSegs.map(s => (
                      <div key={s.id} style={{ marginBottom: V.sp2 }}>
                        <strong style={{ color: s.speaker === 'you' ? 'var(--primary)' : 'var(--positive)' }}>{s.speakerName ?? (s.speaker === 'you' ? 'You' : 'Them')}:</strong>{' '}
                        <span style={{ color: 'var(--ink-2)' }}>{s.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function SumCard({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ padding: V.sp6, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: V.sp4 }}>{title}</div>
      {children}
    </div>
  )
}

function Bullet({ children, color }: { children: React.ReactNode; color: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 7, flexShrink: 0 }} />
      <span style={{ color: 'var(--ink-1)' }}>{children}</span>
    </div>
  )
}

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }
const frInput: React.CSSProperties = { flex: 1, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--ink-1)', outline: 'none' }
