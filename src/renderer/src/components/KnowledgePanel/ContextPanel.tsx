import React, { useEffect, useRef, useState } from 'react'
import type { TranscriptSegment } from '../../services/openai-realtime'

export type DataProvenance = 'local' | 'synced' | 'pending' | 'failed' | 'web' | 'nlm'

export interface QACard {
  id: string
  question: string
  answer: string | null
  source: string
  provenance: DataProvenance
  fromNlm: boolean
  timestamp: number
  status: 'answered' | 'unanswered' | 'searching' | 'saved'
}

const PROVENANCE_BADGE: Record<DataProvenance, { label: string; bg: string; color: string; dot: string }> = {
  local: { label: 'Local', bg: 'var(--positive-subtle)', color: 'var(--positive)', dot: 'var(--positive)' },
  synced: { label: 'Synced', bg: 'var(--primary-subtle)', color: 'var(--primary)', dot: 'var(--primary)' },
  pending: { label: 'Pending', bg: 'var(--warning-subtle)', color: 'var(--warning)', dot: 'var(--warning)' },
  failed: { label: 'Failed', bg: 'var(--negative-subtle)', color: 'var(--negative)', dot: 'var(--negative)' },
  web: { label: 'Web', bg: 'var(--surface-3)', color: 'var(--ink-2)', dot: 'var(--ink-3)' },
  nlm: { label: 'NotebookLM', bg: 'var(--purple-subtle)', color: 'var(--purple)', dot: 'var(--purple)' }
}

interface Props {
  sessionId: string | null
  notebookId?: string
  segments: TranscriptSegment[]
  isCapturing: boolean
  onActivityLog: (msg: string, type: string) => void
}

export default function ContextPanel({ sessionId, notebookId, segments, isCapturing, onActivityLog }: Props): React.ReactElement {
  const [cards, setCards] = useState<QACard[]>([])
  const [status, setStatus] = useState({ documentCount: 0, chunkCount: 0, indexing: false })
  const docCountRef = useRef(0) // ref so interval closure always sees latest value
  const lastProcessedIdx = useRef(0)
  const cacheRef = useRef<Set<string>>(new Set())
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nlmBusyRef = useRef(false)

  const log = (msg: string, type: string = 'info') => onActivityLog(msg, type)

  const addCard = (c: QACard) => setCards(p => [c, ...p])
  const updateCard = (id: string, updates: Partial<QACard>) => setCards(p => p.map(c => c.id === id ? { ...c, ...updates } : c))

  useEffect(() => {
    if (!sessionId) return
    window.translize.knowledge.status(sessionId).then(s => {
      setStatus(s)
      docCountRef.current = s.documentCount
      if (s.documentCount > 0) log(`${s.documentCount} doc${s.documentCount !== 1 ? 's' : ''} indexed`, 'success')
    })
    if (notebookId) log('NotebookLM linked', 'nlm')
  }, [sessionId, notebookId])

  useEffect(() => {
    if (!isCapturing || !sessionId) { if (ivRef.current) clearInterval(ivRef.current); return }

    const run = async () => {
      // Only process segments we haven't seen yet
      const newSegments = segments.filter(s => s.isFinal).slice(lastProcessedIdx.current)
      if (newSegments.length === 0) return
      const rawText = newSegments.map(s => s.text).join(' ').trim()
      if (!rawText || rawText.length < 10) return
      // Mark these segments as processed
      lastProcessedIdx.current = segments.filter(s => s.isFinal).length

      let question: string | null = null
      try { question = await window.translize.knowledge.detectQuestion(rawText) } catch {}
      if (!question) return
      if (cacheRef.current.has(question)) return
      cacheRef.current.add(question)

      const cardId = `qa-${Date.now()}`
      addCard({ id: cardId, question, answer: null, source: '', provenance: 'local', fromNlm: false, timestamp: Date.now(), status: 'searching' })
      log(`Question: "${question}"`, 'info')

      // Search local docs — use ref to avoid stale closure
      let foundLocal = false
      if (docCountRef.current > 0) {
        log('Searching local docs...', 'search')
        try {
          const r = await window.translize.knowledge.ask(sessionId, question)
          if (r) {
            foundLocal = true
            log(`Local answer found`, 'success')
            updateCard(cardId, { answer: r.answer, source: r.source, provenance: 'local', fromNlm: false, status: 'answered' })
          }
        } catch {}
      }

      // Also query NLM (async, doesn't block)
      if (notebookId && !nlmBusyRef.current) {
        nlmBusyRef.current = true
        log('Querying NotebookLM...', 'nlm')
        ;(async () => {
          try {
            const nr = await window.translize.notebooklm.ask(notebookId, question!) as any
            const ans = nr?.value?.answer ?? nr?.answer ?? null
            const bad = !ans || nr?.error || ans.includes('do not contain') || ans.includes('I\'m sorry')
            if (!bad) {
              const condensed = ans.split('\n').filter((l: string) => l.trim() && !l.startsWith('#') && !l.startsWith('*') && !l.startsWith('Would')).slice(0, 4).join(' ').replace(/\*\*/g, '').replace(/\[[\d,\s]+\]/g, '').trim()
              log('NotebookLM answered!', 'success')
              if (foundLocal) {
                addCard({ id: `nlm-${Date.now()}`, question: question!, answer: condensed.length > 500 ? condensed.slice(0, 500) + '...' : condensed, source: 'NotebookLM', provenance: 'nlm', fromNlm: true, timestamp: Date.now(), status: 'answered' })
              } else {
                updateCard(cardId, { answer: condensed.length > 500 ? condensed.slice(0, 500) + '...' : condensed, source: 'NotebookLM', provenance: 'nlm', fromNlm: true, status: 'answered' })
              }
            } else if (!foundLocal) {
              log('No answer found', 'info')
              updateCard(cardId, { status: 'unanswered' })
            }
          } catch {
            if (!foundLocal) updateCard(cardId, { status: 'unanswered' })
            log('NLM search failed', 'error')
          } finally { nlmBusyRef.current = false }
        })()
      } else if (!foundLocal && !notebookId) {
        updateCard(cardId, { status: 'unanswered' })
      }
    }

    ivRef.current = setInterval(run, 6000)
    setTimeout(run, 1500)
    return () => { if (ivRef.current) clearInterval(ivRef.current) }
  }, [isCapturing, sessionId, segments, notebookId])

  const handleSearchWeb = async (card: QACard) => {
    if (!notebookId) return
    updateCard(card.id, { status: 'searching' })
    log(`Web search: "${card.question}"`, 'nlm')
    try {
      const nr = await window.translize.notebooklm.ask(notebookId, `Search the web and answer: ${card.question}`) as any
      const ans = nr?.value?.answer ?? nr?.answer ?? null
      if (ans && !ans.includes('do not contain')) {
        const condensed = ans.split('\n').filter((l: string) => l.trim() && !l.startsWith('#')).slice(0, 4).join(' ').replace(/\*\*/g, '').replace(/\[[\d,\s]+\]/g, '').trim()
        updateCard(card.id, { answer: condensed, source: 'NotebookLM (web)', provenance: 'web', fromNlm: true, status: 'answered' })
        log('Web answer found!', 'success')
      } else {
        updateCard(card.id, { status: 'unanswered' })
        log('No web answer found', 'info')
      }
    } catch { updateCard(card.id, { status: 'unanswered' }); log('Web search failed', 'error') }
  }

  const handleSaveToKb = async (card: QACard) => {
    if (!card.answer || !sessionId) return
    log('Saving to knowledge base...', 'search')
    try {
      await window.translize.knowledge.loadDoc(sessionId, '')
      updateCard(card.id, { provenance: notebookId ? 'pending' : 'local', status: 'saved' })
      log('Saved to local knowledge base', 'success')
      if (notebookId) {
        try {
          await window.translize.notebooklm.addNote(notebookId, card.question, `Q: ${card.question}\n\nA: ${card.answer}`)
          updateCard(card.id, { provenance: 'synced' })
          log('Synced to NotebookLM', 'success')
        } catch {
          updateCard(card.id, { provenance: 'failed' })
          log('NLM sync failed', 'error')
        }
      }
    } catch { log('Save failed', 'error') }
  }

  const handleAddToNlm = async (card: QACard) => {
    if (!notebookId || !card.answer) return
    log('Adding to NotebookLM...', 'nlm')
    try {
      await window.translize.notebooklm.addNote(notebookId, card.question, `Q: ${card.question}\n\nA: ${card.answer}`)
      updateCard(card.id, { provenance: 'synced' })
      log('Added to NotebookLM', 'success')
    } catch { log('Failed to add to NLM', 'error') }
  }

  const handleFollowUp = async (card: QACard) => {
    await window.translize.followup.add(card.question)
    log(`Marked for follow-up: "${card.question}"`, 'success')
  }

  const handleDismiss = (id: string) => setCards(p => p.filter(c => c.id !== id))

  return (
    <div style={{ flex: 3, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 1; box-shadow: 0 0 0 0 var(--positive); } 50% { opacity: 0.6; box-shadow: 0 0 0 4px transparent; } }`}</style>
      {/* Header */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-raised)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-1)' }}>Live Context</span>
          {isCapturing && (
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: 'var(--positive)',
              animation: 'pulse-dot 1.5s ease-in-out infinite',
              boxShadow: '0 0 0 0 var(--positive)'
            }} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
          {status.documentCount > 0 && <span style={{ padding: '2px 8px', background: 'var(--primary-subtle)', color: 'var(--primary)', borderRadius: 10, fontWeight: 600, fontSize: 10 }}>{status.documentCount} docs</span>}
          {notebookId && <span style={{ padding: '2px 8px', background: 'var(--purple-subtle)', color: 'var(--purple)', borderRadius: 10, fontWeight: 600, fontSize: 10 }}>NLM</span>}
        </div>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {cards.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            {isCapturing && (
              <div style={{ fontSize: 13, letterSpacing: '0.25em', color: 'var(--ink-4)', marginBottom: 16, fontWeight: 600 }}>...</div>
            )}
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 8 }}>{isCapturing ? 'Listening for questions...' : 'Ready for your call'}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
              {isCapturing ? 'When someone asks a question, the answer from your documents or NotebookLM will appear here as a card.' : 'Start a call and ask questions. Answers from your documents and NotebookLM will appear here in real-time.'}
            </div>
          </div>
        )}

        {cards.map((card, i) => {
          const isLatest = i === 0
          const isNlm = card.fromNlm
          const borderColor = card.status === 'unanswered' ? 'var(--warning)' : isNlm ? 'var(--purple)' : 'var(--primary)'
          const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

          return (
            <div key={card.id} style={{ marginBottom: 24 }}>
              {/* Timestamp divider between Q&A groups */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border-1)' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                  {time}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-1)' }} />
              </div>

              <div style={{
                padding: '20px 24px',
                background: isLatest ? (isNlm ? 'var(--purple-subtle)' : card.status === 'unanswered' ? 'var(--warning-subtle)' : 'var(--primary-subtle)') : 'var(--surface-raised)',
                border: `2px solid ${isLatest ? borderColor + '44' : 'var(--border-1)'}`,
                borderLeft: `4px solid ${borderColor}`,
                borderRadius: 'var(--radius-md)', boxShadow: isLatest ? 'var(--shadow-md)' : 'var(--shadow-xs)',
                transition: 'all 0.3s'
              }}>
              {/* Question */}
              <div style={{ fontSize: 13, fontWeight: 700, color: borderColor, marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8, paddingBottom: 10, borderBottom: `1px solid ${borderColor}22` }}>
                <span style={{ flexShrink: 0, marginTop: 1 }}>Q:</span>
                <span>{card.question}</span>
              </div>

              {/* Answer or Status */}
              {card.status === 'searching' && (
                <div style={{ fontSize: 14, color: 'var(--ink-3)', fontStyle: 'italic', marginBottom: 14 }}>Searching...</div>
              )}
              {card.status === 'unanswered' && (
                <div style={{ fontSize: 14, color: 'var(--warning)', fontWeight: 500, marginBottom: 14 }}>No answer found in your documents or NotebookLM</div>
              )}
              {card.answer && (
                <div style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.55, color: 'var(--ink-1)', marginBottom: 16 }}>{card.answer}</div>
              )}

              {/* Source + Provenance Badges */}
              {card.answer && (
                <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Provenance badge */}
                  {(() => {
                    const prov = PROVENANCE_BADGE[card.provenance] ?? PROVENANCE_BADGE.local
                    return (
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 700,
                        background: prov.bg, color: prov.color, textTransform: 'uppercase', letterSpacing: '0.04em'
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: prov.dot }} />
                        {prov.label}
                      </span>
                    )
                  })()}
                  {/* Source name */}
                  <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{card.source}</span>
                  <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 10 }}>
                    {new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {notebookId && (
                  <ActionBtn label="Search Web" color="var(--purple)" bg="var(--purple-subtle)" onClick={() => handleSearchWeb(card)} />
                )}
                {card.answer && (card.provenance === 'web' || card.provenance === 'nlm') && card.status !== 'saved' && (
                  <ActionBtn label="Save to KB" color="var(--positive)" bg="var(--positive-subtle)" onClick={() => handleSaveToKb(card)} />
                )}
                {notebookId && card.answer && card.provenance === 'local' && (
                  <ActionBtn label="Sync to NLM" color="var(--purple)" bg="var(--purple-subtle)" onClick={() => handleAddToNlm(card)} />
                )}
                {card.answer && (
                  <ActionBtn label="Pin" color="var(--ink-2)" bg="var(--surface-3)" onClick={() => console.log('Pinned card:', card.id)} />
                )}
                {card.status === 'unanswered' && (
                  <ActionBtn label="Follow-up" color="var(--warning)" bg="var(--warning-subtle)" onClick={() => handleFollowUp(card)} />
                )}
                <ActionBtn label="Dismiss" color="var(--ink-3)" bg="var(--surface-2)" onClick={() => handleDismiss(card.id)} />
              </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* NotebookLM section */}
      {notebookId && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-1)', background: 'var(--surface-1)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>NotebookLM Insights</div>
          <button onClick={() => window.translize.shell.openUrl('https://notebooklm.google.com')} style={{
            width: '100%', padding: '8px 12px', background: 'var(--purple-subtle)', color: 'var(--purple)',
            border: '1px solid var(--purple)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)',
            fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.15s'
          }}>
            Open NotebookLM
          </button>
        </div>
      )}

      {/* Ask a Question input -- always visible at bottom */}
      <AskInput sessionId={sessionId} notebookId={notebookId}
        onAddCard={(card) => { addCard(card); log(`Searching: "${card.question}"`, 'search') }}
        onUpdateCard={(id, updates) => { updateCard(id, updates); if (updates.status === 'answered') log('Answer found', 'success') }}
        onLog={log} />
    </div>
  )
}

function AskInput({ sessionId, notebookId, onAddCard, onUpdateCard, onLog }: {
  sessionId: string | null; notebookId?: string
  onAddCard: (card: QACard) => void; onUpdateCard: (id: string, updates: Partial<QACard>) => void
  onLog: (msg: string, type: string) => void
}): React.ReactElement {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  const handleSubmit = async () => {
    if (!query.trim() || searching) return
    const q = query.trim()
    setQuery(''); setSearching(true)
    onLog(`Searching all sources: "${q}"`, 'search')

    const cardId = `ask-${Date.now()}`
    onAddCard({ id: cardId, question: q, answer: null, source: '', provenance: 'local', fromNlm: false, timestamp: Date.now(), status: 'searching' })

    const results: Array<{ source: string; provenance: DataProvenance; answer: string }> = []
    const searches = []

    if (sessionId) {
      searches.push(window.translize.knowledge.ask(sessionId, q).then(r => {
        if (r) { results.push({ source: r.source, provenance: 'local', answer: r.answer }); onLog('Found in local docs', 'success') }
      }).catch(() => {}))
    }
    if (notebookId) {
      searches.push(window.translize.notebooklm.ask(notebookId, q).then((nr: any) => {
        const ans = nr?.value?.answer ?? nr?.answer ?? null
        if (ans && !ans.includes('do not contain') && !ans.includes("I'm sorry")) {
          const condensed = ans.split('\n').filter((l: string) => l.trim() && !l.startsWith('#')).slice(0, 3).join(' ').replace(/\*\*/g, '').replace(/\[[\d,\s]+\]/g, '').trim()
          results.push({ source: 'NotebookLM', provenance: 'nlm', answer: condensed.slice(0, 500) }); onLog('Found in NotebookLM', 'success')
        }
      }).catch(() => {}))
    }
    searches.push(window.translize.tavily.search(q).then(r => {
      if (!r.error && r.results.length > 0) {
        results.push({ source: 'Web (Tavily)', provenance: 'web', answer: (r.answer ?? r.results[0].content).slice(0, 500) }); onLog('Found on the web', 'success')
      }
    }).catch(() => {}))

    await Promise.allSettled(searches)

    if (results.length === 0) {
      onUpdateCard(cardId, { status: 'unanswered' })
      onLog('No results from any source', 'info')
    } else {
      try {
        const apiKey = await window.translize.keychain.get('openai-api-key')
        if (apiKey) {
          const sourceSummary = results.map(r => `[${r.source}]: ${r.answer}`).join('\n\n')
          const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 300,
              messages: [{ role: 'system', content: 'Synthesize a clear, direct answer from these sources. Be concise (2-4 sentences). Mention which sources were most helpful.' }, { role: 'user', content: `Question: ${q}\n\nSources:\n${sourceSummary}` }]
            })
          })
          if (resp.ok) {
            const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
            const synthesized = data.choices[0]?.message?.content?.trim()
            if (synthesized) {
              const sourceNames = results.map(r => r.source).join(' + ')
              onUpdateCard(cardId, { answer: synthesized, source: sourceNames, provenance: results.some(r => r.provenance === 'nlm') ? 'synced' : results.some(r => r.provenance === 'web') ? 'web' : 'local', fromNlm: results.some(r => r.provenance === 'nlm'), status: 'answered' })
              setSearching(false); return
            }
          }
        }
      } catch {}
      const best = results[0]
      onUpdateCard(cardId, { answer: best.answer, source: best.source, provenance: best.provenance, fromNlm: best.provenance === 'nlm', status: 'answered' })
    }
    setSearching(false)
  }

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-1)', background: 'var(--surface-raised)', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
          placeholder={searching ? 'Searching all sources...' : 'Ask a question...'}
          disabled={searching}
          style={{
            flex: 1, padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border-1)',
            borderRadius: 'var(--radius-md)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)',
            outline: 'none', opacity: searching ? 0.6 : 1
          }}
        />
        <button onClick={handleSubmit} disabled={searching || !query.trim()} style={{
          padding: '10px 16px', background: query.trim() && !searching ? 'var(--primary)' : 'var(--surface-3)',
          color: query.trim() && !searching ? 'white' : 'var(--ink-4)',
          border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
          fontWeight: 600, cursor: query.trim() && !searching ? 'pointer' : 'default', flexShrink: 0
        }}>
          {searching ? '...' : 'Ask'}
        </button>
      </div>
    </div>
  )
}

function ActionBtn({ label, color, bg, onClick }: { label: string; color: string; bg: string; onClick: () => void }): React.ReactElement {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', background: bg, color, border: `1px solid ${color}22`,
      borderRadius: 'var(--radius-xs)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
      transition: 'all 0.15s'
    }}>
      {label}
    </button>
  )
}
