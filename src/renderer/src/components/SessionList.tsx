import React, { useEffect, useState, useRef, useCallback } from 'react'

interface Session {
  id: string; name?: string; docPaths: string[]; notebookId?: string
  mode: 'local' | 'notebook' | 'both'
  calls: Array<{ date: string; sentimentScore?: number; sentimentLabel?: string; tags?: string[]; contactName?: string; durationMinutes?: number }>
  createdAt: string; updatedAt: string
}

interface Skill {
  skillId: string
  contact: { name: string; company?: string; role?: string; totalCalls: number; totalTalkTimeMinutes: number }
  relationshipSummary: string
  sentimentTrajectory: Array<{ score: number; label: string; date: string }>
  riskFlags: Array<{ flag: string; severity: string }>
}

interface Props {
  onNewCall: (prefillName?: string) => void
  onRelationships: () => void
  onSettings: () => void
  onSelectSession: (session: Session) => void
}

type SortKey = 'date' | 'contact' | 'sentiment' | 'duration'
type SortDir = 'asc' | 'desc'
type Filter = 'all' | 'at-risk' | 'trending-up' | 'recent' | 'unreviewed'

function sentimentColor(score: number | undefined): string {
  if (score == null) return 'var(--ink-5)'
  if (score > 0.2) return 'var(--positive)'
  if (score < -0.2) return 'var(--negative)'
  return 'var(--warning)'
}

function sentimentLabel(score: number | undefined): string {
  if (score == null) return 'No data'
  if (score > 0.2) return 'Positive'
  if (score < -0.2) return 'At risk'
  return 'Neutral'
}

function formatDate(iso: string): string {
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (diff === 1) return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: diff > 365 ? 'numeric' : undefined })
}

function formatDuration(mins: number | undefined): string {
  if (!mins) return '—'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

const MODE_LABEL: Record<string, string> = { local: 'Local', notebook: 'NLM', both: 'Local + NLM' }
const V = { sp1: '4px', sp2: '8px', sp3: '12px', sp4: '16px', sp5: '20px', sp6: '24px', sp8: '32px', sp10: '40px', sp12: '48px', sp16: '64px' }

export default function SessionList({ onNewCall, onRelationships, onSettings, onSelectSession }: Props): React.ReactElement {
  const [sessions, setSessions] = useState<Session[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [nlmOk, setNlmOk] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null) // null = All Conversations
  const [activeFilter, setActiveFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [detailSession, setDetailSession] = useState<Session | null>(null)
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  useEffect(() => {
    window.translize.session.list().then((l: unknown) => setSessions(l as Session[]))
    window.translize.notebooklm.status().then((s: any) => setNlmOk(!!s.authenticated)).catch(() => {})
    window.translize.skill.list().then((l: unknown) => setSkills(l as Skill[]))
  }, [])

  const refresh = useCallback(async () => {
    const [s, sk] = await Promise.all([window.translize.session.list(), window.translize.skill.list()])
    setSessions(s as Session[]); setSkills(sk as Skill[])
  }, [])

  const saveSessionName = async (session: Session, name: string) => {
    const trimmed = name.trim()
    await window.translize.session.update(session.id, { name: trimmed || undefined })
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, name: trimmed || undefined } : s))
    setDetailSession(prev => prev?.id === session.id ? { ...prev, name: trimmed || undefined } : prev)
    setEditingName(false)
  }

  const del = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Delete this conversation?')) return
    await window.translize.session.delete(id)
    setSessions(p => p.filter(s => s.id !== id))
    if (detailSession?.id === id) setDetailSession(null)
  }

  // Build account tree from sessions
  const accountMap: Record<string, Session[]> = {}
  const unassigned: Session[] = []
  sessions.forEach(s => {
    const contact = s.name || s.calls.find(c => c.contactName)?.contactName
    if (contact) {
      if (!accountMap[contact]) accountMap[contact] = []
      accountMap[contact].push(s)
    } else {
      unassigned.push(s)
    }
  })

  // Sorted account list by recency
  const accountNames = Object.keys(accountMap).sort((a, b) => {
    const latestA = Math.max(...accountMap[a].map(s => new Date(s.updatedAt).getTime()))
    const latestB = Math.max(...accountMap[b].map(s => new Date(s.updatedAt).getTime()))
    return latestB - latestA
  })

  // Filter sessions for main table
  const atRiskContacts = new Set(
    skills.filter(sk => {
      const traj = sk.sentimentTrajectory
      if (traj.length < 2) return false
      return traj[traj.length - 1].score < traj[traj.length - 2].score - 0.15
    }).map(sk => sk.contact.name.toLowerCase())
  )

  const filteredSessions = sessions.filter(s => {
    const contact = s.name || s.calls.find(c => c.contactName)?.contactName || ''
    if (selectedAccount && contact.toLowerCase() !== selectedAccount.toLowerCase()) return false
    if (search && !contact.toLowerCase().includes(search.toLowerCase()) && !(s.name ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (activeFilter === 'at-risk') return atRiskContacts.has(contact.toLowerCase())
    if (activeFilter === 'trending-up') {
      const sk = skills.find(k => k.contact.name.toLowerCase().includes(contact.toLowerCase().split(' ')[0]))
      if (!sk || sk.sentimentTrajectory.length < 2) return false
      const traj = sk.sentimentTrajectory
      return traj[traj.length - 1].score > traj[traj.length - 2].score + 0.1
    }
    if (activeFilter === 'recent') return (Date.now() - new Date(s.updatedAt).getTime()) < 7 * 86400000
    if (activeFilter === 'unreviewed') return s.calls.length === 0
    return true
  })

  const sortedSessions = [...filteredSessions].sort((a, b) => {
    let av: number, bv: number
    if (sortKey === 'date') { av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime() }
    else if (sortKey === 'contact') {
      const an = (a.name || a.calls[0]?.contactName || '').toLowerCase()
      const bn = (b.name || b.calls[0]?.contactName || '').toLowerCase()
      return sortDir === 'asc' ? an.localeCompare(bn) : bn.localeCompare(an)
    }
    else if (sortKey === 'sentiment') {
      av = a.calls.slice(-1)[0]?.sentimentScore ?? -999
      bv = b.calls.slice(-1)[0]?.sentimentScore ?? -999
    }
    else { av = a.calls.slice(-1)[0]?.durationMinutes ?? 0; bv = b.calls.slice(-1)[0]?.durationMinutes ?? 0 }
    return sortDir === 'asc' ? av - bv : bv - av
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => sortKey !== k ? <span style={{ opacity: 0.3 }}>↕</span> : sortDir === 'desc' ? <span>↓</span> : <span>↑</span>

  const detailSkill = detailSession
    ? skills.find(sk => {
        const contact = detailSession.name || detailSession.calls[0]?.contactName || ''
        return sk.contact.name.toLowerCase().includes(contact.toLowerCase().split(' ')[0])
      })
    : null

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, background: 'var(--surface-1)' }}>

      {/* ── LEFT SIDEBAR ── */}
      <aside style={{
        width: 228, flexShrink: 0, borderRight: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column', background: 'var(--surface-1)', overflow: 'hidden'
      }}>
        {/* New Call CTA */}
        <div style={{ padding: `${V.sp4} ${V.sp4} ${V.sp3}` }}>
          <button onClick={() => onNewCall(selectedAccount ?? undefined)} style={{
            width: '100%', padding: `${V.sp3} ${V.sp4}`,
            background: 'var(--primary)', color: 'white', border: 'none',
            borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 700,
            boxShadow: 'var(--shadow-sm)', cursor: 'pointer', textAlign: 'center'
          }}>
            + New Conversation
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: `0 ${V.sp3} ${V.sp3}` }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              width: '100%', padding: '7px 10px', background: 'var(--surface-2)',
              border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)',
              color: 'var(--ink-1)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Nav + filters */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: `0 ${V.sp2}` }}>
          <SideLabel>Views</SideLabel>
          {([
            ['all', 'All Conversations'],
            ['recent', 'Recent (7 days)'],
            ['at-risk', 'At Risk'],
            ['trending-up', 'Trending Up'],
            ['unreviewed', 'No Calls Yet'],
          ] as [Filter, string][]).map(([key, label]) => (
            <SideItem
              key={key}
              active={activeFilter === key && !selectedAccount}
              onClick={() => { setActiveFilter(key); setSelectedAccount(null) }}
            >
              {label}
              {key === 'at-risk' && atRiskContacts.size > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: 'var(--negative)', background: 'var(--negative-subtle)', padding: '1px 5px', borderRadius: 'var(--radius-full)' }}>
                  {atRiskContacts.size}
                </span>
              )}
            </SideItem>
          ))}

          <SideLabel style={{ marginTop: V.sp4 }}>Accounts</SideLabel>
          {accountNames.map(name => {
            const isSelected = selectedAccount === name
            const accountSessions = accountMap[name]
            const latestSentiment = accountSessions
              .flatMap(s => s.calls)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.sentimentScore
            const skill = skills.find(sk => sk.contact.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
            const hasRisk = skill ? atRiskContacts.has(skill.contact.name.toLowerCase()) : false

            return (
              <SideItem
                key={name}
                active={isSelected}
                onClick={() => { setSelectedAccount(name); setActiveFilter('all') }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: sentimentColor(latestSentiment) }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                {hasRisk && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--negative)', background: 'var(--negative-subtle)', padding: '1px 4px', borderRadius: 'var(--radius-full)', flexShrink: 0 }}>RISK</span>}
                <span style={{ fontSize: 10, color: 'var(--ink-4)', flexShrink: 0 }}>{accountSessions.length}</span>
              </SideItem>
            )
          })}

          {unassigned.length > 0 && (
            <SideItem
              active={selectedAccount === '__unassigned__'}
              onClick={() => { setSelectedAccount('__unassigned__'); setActiveFilter('all') }}
            >
              <span style={{ flex: 1, color: 'var(--ink-3)', fontStyle: 'italic' }}>Unassigned</span>
              <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>{unassigned.length}</span>
            </SideItem>
          )}
        </nav>

        {/* Bottom status */}
        <div style={{ padding: `${V.sp3} ${V.sp4}`, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: V.sp2 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: nlmOk ? 'var(--positive)' : 'var(--ink-5)' }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: nlmOk ? 'var(--positive)' : 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {nlmOk ? 'NLM Connected' : 'NLM Offline'}
          </span>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Toolbar */}
        <div style={{
          padding: `${V.sp3} ${V.sp6}`, borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: V.sp3, flexShrink: 0,
          background: 'var(--surface-1)'
        }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink-1)', flex: 1, marginRight: V.sp4 }}>
            {selectedAccount === '__unassigned__' ? 'Unassigned'
              : selectedAccount ?? (activeFilter === 'all' ? 'All Conversations'
              : activeFilter === 'at-risk' ? 'At Risk'
              : activeFilter === 'trending-up' ? 'Trending Up'
              : activeFilter === 'recent' ? 'Recent'
              : 'No Calls Yet')}
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 400, color: 'var(--ink-4)', marginLeft: V.sp3, fontFamily: 'var(--font-body)' }}>
              {sortedSessions.length} conversation{sortedSessions.length !== 1 ? 's' : ''}
            </span>
          </h2>
          {selectedAccount && selectedAccount !== '__unassigned__' && (
            <button onClick={() => onNewCall(selectedAccount)} style={{
              padding: `${V.sp2} ${V.sp4}`, background: 'var(--primary-subtle)', color: 'var(--primary)',
              border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer'
            }}>
              + Call with {selectedAccount.split(' ')[0]}
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sortedSessions.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: V.sp4 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--ink-4)', fontStyle: 'italic' }}>
                No conversations yet
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)' }}>
                {search ? `No results for "${search}"` : 'Start a new conversation to get going.'}
              </p>
              <button onClick={() => onNewCall()} style={{
                padding: `${V.sp3} ${V.sp6}`, background: 'var(--primary)', color: 'white',
                border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer'
              }}>+ New Conversation</button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-1)' }}>
                  <Th width={16} />
                  <Th onClick={() => toggleSort('contact')} sortable>
                    Contact <SortIcon k="contact" />
                  </Th>
                  <Th onClick={() => toggleSort('date')} sortable>
                    Date <SortIcon k="date" />
                  </Th>
                  <Th>Context</Th>
                  <Th onClick={() => toggleSort('duration')} sortable>
                    Duration <SortIcon k="duration" />
                  </Th>
                  <Th onClick={() => toggleSort('sentiment')} sortable>
                    Sentiment <SortIcon k="sentiment" />
                  </Th>
                  <Th>Tags</Th>
                  <Th width={40} />
                </tr>
              </thead>
              <tbody>
                {sortedSessions.map(s => {
                  const contact = s.name || s.calls[0]?.contactName || ''
                  const lastCall = s.calls[s.calls.length - 1]
                  const sentiment = lastCall?.sentimentScore
                  const isSelected = detailSession?.id === s.id
                  const skill = skills.find(sk => contact && sk.contact.name.toLowerCase().includes(contact.toLowerCase().split(' ')[0]))
                  const company = skill?.contact.company

                  return (
                    <TableRow
                      key={s.id}
                      selected={isSelected}
                      onClick={() => { setDetailSession(isSelected ? null : s); setEditingName(false) }}
                    >
                      <td style={{ padding: `${V.sp3} ${V.sp3} ${V.sp3} ${V.sp4}` }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'block', background: sentimentColor(sentiment) }} />
                      </td>
                      <td style={{ padding: `${V.sp3} ${V.sp4}` }}>
                        <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--ink-1)', whiteSpace: 'nowrap' }}>
                          {contact || <span style={{ color: 'var(--ink-4)', fontWeight: 400, fontStyle: 'italic' }}>Unnamed</span>}
                        </div>
                        {company && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginTop: 1 }}>{company}</div>}
                      </td>
                      <td style={{ padding: `${V.sp3} ${V.sp4}`, fontSize: 'var(--text-xs)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                        {formatDate(s.createdAt)}
                      </td>
                      <td style={{ padding: `${V.sp3} ${V.sp4}` }}>
                        <span style={{
                          padding: `1px 7px`, borderRadius: 'var(--radius-full)',
                          fontSize: 10, fontWeight: 700,
                          background: s.mode === 'notebook' ? 'var(--purple-subtle)' : s.mode === 'both' ? 'var(--primary-subtle)' : 'var(--surface-3)',
                          color: s.mode === 'notebook' ? 'var(--purple)' : s.mode === 'both' ? 'var(--primary)' : 'var(--ink-3)'
                        }}>
                          {MODE_LABEL[s.mode]}
                        </span>
                        {s.docPaths.length > 0 && (
                          <span style={{ marginLeft: V.sp2, fontSize: 10, color: 'var(--ink-4)' }}>{s.docPaths.length} doc{s.docPaths.length !== 1 ? 's' : ''}</span>
                        )}
                      </td>
                      <td style={{ padding: `${V.sp3} ${V.sp4}`, fontSize: 'var(--text-xs)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                        {formatDuration(lastCall?.durationMinutes)}
                      </td>
                      <td style={{ padding: `${V.sp3} ${V.sp4}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: V.sp2 }}>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: sentimentColor(sentiment) }}>
                            {sentimentLabel(sentiment)}
                          </span>
                          {sentiment != null && (
                            <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>
                              {sentiment > 0 ? '+' : ''}{sentiment.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: `${V.sp3} ${V.sp4}` }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(lastCall?.tags ?? []).map(t => (
                            <span key={t} style={{ padding: '1px 6px', borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 600, background: 'var(--amber-subtle)', color: 'var(--amber)' }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: `${V.sp3} ${V.sp3} ${V.sp3} 0`, textAlign: 'right' }}>
                        <button
                          onClick={e => del(e, s.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', fontSize: 16, padding: '0 6px', opacity: 0.5, lineHeight: 1 }}
                          title="Delete"
                        >×</button>
                      </td>
                    </TableRow>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── RIGHT DETAIL PANEL ── */}
      {detailSession && (
        <aside style={{
          width: 320, flexShrink: 0, borderLeft: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column', background: 'var(--surface-raised)',
          overflowY: 'auto'
        }}>
          <div style={{ padding: V.sp5, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: 0, marginRight: V.sp3 }}>
              {editingName ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onBlur={() => saveSessionName(detailSession, nameDraft)}
                  onKeyDown={e => { if (e.key === 'Enter') saveSessionName(detailSession, nameDraft); if (e.key === 'Escape') setEditingName(false) }}
                  placeholder="Enter contact name..."
                  style={{ width: '100%', padding: '4px 8px', background: 'var(--surface-2)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                />
              ) : (
                <div
                  onClick={() => { setNameDraft(detailSession.name || ''); setEditingName(true) }}
                  style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 700, color: detailSession.name ? 'var(--ink-1)' : 'var(--ink-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: V.sp2 }}
                  title="Click to edit contact name"
                >
                  {detailSession.name || detailSession.calls[0]?.contactName || <span style={{ fontStyle: 'italic', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>Add contact name…</span>}
                  <span style={{ fontSize: 10, color: 'var(--ink-4)', opacity: 0.7 }}>✎</span>
                </div>
              )}
              {detailSkill?.contact.company && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginTop: 2 }}>{detailSkill.contact.company}</div>
              )}
            </div>
            <button onClick={() => { setDetailSession(null); setEditingName(false) }} style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
          </div>

          <div style={{ padding: V.sp5, display: 'flex', flexDirection: 'column', gap: V.sp5 }}>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: V.sp3 }}>
              <MiniStat label="Calls" value={String(detailSession.calls.length)} />
              <MiniStat label="Duration" value={formatDuration(detailSession.calls.reduce((a, c) => a + (c.durationMinutes ?? 0), 0))} />
              <MiniStat label="Created" value={formatDate(detailSession.createdAt)} />
              <MiniStat label="Context" value={MODE_LABEL[detailSession.mode]} />
            </div>

            {/* Sentiment */}
            {detailSession.calls.length > 0 && (() => {
              const lastSentiment = detailSession.calls[detailSession.calls.length - 1]?.sentimentScore
              return (
                <div style={{ padding: V.sp4, background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-1)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: V.sp2 }}>Sentiment</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: V.sp2 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: sentimentColor(lastSentiment) }} />
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: sentimentColor(lastSentiment) }}>
                      {sentimentLabel(lastSentiment)}
                    </span>
                    {lastSentiment != null && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)' }}>({lastSentiment > 0 ? '+' : ''}{lastSentiment.toFixed(2)})</span>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Relationship summary */}
            {detailSkill?.relationshipSummary && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: V.sp2 }}>Relationship Summary</div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-2)', lineHeight: 1.6 }}>{detailSkill.relationshipSummary}</p>
              </div>
            )}

            {/* Risk flags */}
            {detailSkill && detailSkill.riskFlags.length > 0 && (
              <div style={{ padding: V.sp3, background: 'var(--negative-subtle)', border: '1px solid var(--negative)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--negative)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: V.sp2 }}>Risk Flags</div>
                {detailSkill.riskFlags.map((f, i) => (
                  <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--negative)', marginBottom: 2 }}>• {f.flag}</div>
                ))}
              </div>
            )}

            {/* Call history */}
            {detailSession.calls.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: V.sp2 }}>Call History</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: V.sp2 }}>
                  {detailSession.calls.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: V.sp3, padding: `${V.sp2} ${V.sp3}`, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: sentimentColor(c.sentimentScore) }} />
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-2)', flex: 1 }}>{formatDate(c.date)}</span>
                      <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>{formatDuration(c.durationMinutes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: V.sp2, paddingTop: V.sp2 }}>
              <button onClick={() => onSelectSession(detailSession)} style={{
                padding: `${V.sp3} ${V.sp4}`, background: 'var(--primary)', color: 'white',
                border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                fontWeight: 700, cursor: 'pointer', textAlign: 'center'
              }}>
                Open Conversation
              </button>
              <button onClick={() => {
                const contact = detailSession.name || detailSession.calls[0]?.contactName
                onNewCall(contact)
              }} style={{
                padding: `${V.sp3} ${V.sp4}`, background: 'var(--primary-subtle)', color: 'var(--primary)',
                border: '1px solid var(--primary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                fontWeight: 600, cursor: 'pointer', textAlign: 'center'
              }}>
                + New Call
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}

// ── Sub-components ──

function SideLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: `${V.sp2} ${V.sp3} ${V.sp1}`, ...style }}>
      {children}
    </div>
  )
}

function SideItem({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }): React.ReactElement {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: V.sp2,
        padding: `${V.sp2} ${V.sp3}`, border: 'none', cursor: 'pointer', textAlign: 'left',
        borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: active ? 700 : 500,
        background: active ? 'var(--primary-subtle)' : hov ? 'var(--surface-2)' : 'transparent',
        color: active ? 'var(--primary)' : 'var(--ink-2)',
        transition: 'background var(--transition-fast), color var(--transition-fast)'
      }}
    >
      {children}
    </button>
  )
}

function Th({ children, onClick, sortable, width }: { children?: React.ReactNode; onClick?: () => void; sortable?: boolean; width?: number }): React.ReactElement {
  return (
    <th
      onClick={onClick}
      style={{
        padding: `${V.sp2} ${V.sp4}`, textAlign: 'left',
        fontSize: 10, fontWeight: 700, color: 'var(--ink-3)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        cursor: sortable ? 'pointer' : 'default',
        userSelect: 'none', whiteSpace: 'nowrap',
        width: width ?? 'auto'
      }}
    >
      {children}
    </th>
  )
}

function TableRow({ children, selected, onClick }: { children: React.ReactNode; selected: boolean; onClick: () => void }): React.ReactElement {
  const [hov, setHov] = useState(false)
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
        background: selected ? 'var(--primary-subtle)' : hov ? 'var(--surface-2)' : 'transparent',
        transition: 'background var(--transition-fast)'
      }}
    >
      {children}
    </tr>
  )
}

function MiniStat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={{ padding: `${V.sp3} ${V.sp3}`, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-1)' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink-1)' }}>{value}</div>
    </div>
  )
}
