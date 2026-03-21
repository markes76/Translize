import React, { useEffect, useState } from 'react'

interface Session {
  id: string; name?: string; docPaths: string[]; notebookId?: string
  mode: 'local' | 'notebook' | 'both'
  calls: Array<{ date: string; sentimentScore?: number; sentimentLabel?: string; tags?: string[]; contactName?: string; durationMinutes?: number }>
  createdAt: string; updatedAt: string
}

interface Props { onNewCall: () => void; onRelationships: () => void; onSettings: () => void; onSelectSession: (session: Session) => void }

function formatFullDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function dateGroup(iso: string): string {
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return 'This Week'
  return 'Earlier'
}

const MODE_LABEL: Record<string, string> = { local: 'Local', notebook: 'NLM', both: 'Local + NLM' }

export default function SessionList({ onNewCall, onRelationships, onSettings, onSelectSession }: Props): React.ReactElement {
  const [sessions, setSessions] = useState<Session[]>([])
  const [nlmOk, setNlmOk] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped')
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set())
  const [skills, setSkills] = useState<Array<{ skillId: string; contact: { name: string; company?: string }; relationshipSummary: string; sentimentTrajectory: Array<{ score: number }> }>>([])

  useEffect(() => {
    window.translize.session.list().then((l: unknown) => setSessions(l as Session[]))
    window.translize.notebooklm.status().then((s: any) => setNlmOk(!!s.authenticated)).catch(() => {})
    window.translize.skill.list().then((l: unknown) => setSkills(l as any[]))
  }, [])

  const del = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Delete this session?')) return
    await window.translize.session.delete(id)
    setSessions(p => p.filter(s => s.id !== id))
  }

  const toggleContact = (key: string) => {
    setExpandedContacts(p => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

  // Group by contact (for grouped view)
  const contactGroups: Record<string, { sessions: Session[]; skill?: typeof skills[0] }> = {}
  const ungrouped: Session[] = []
  sessions.forEach(s => {
    const contactName = s.name || s.calls.find(c => c.contactName)?.contactName
    if (contactName) {
      const key = contactName
      if (!contactGroups[key]) {
        const skill = skills.find(sk => sk.contact.name.toLowerCase().includes(contactName.toLowerCase().split(' ')[0]))
        contactGroups[key] = { sessions: [], skill }
      }
      contactGroups[key].sessions.push(s)
    } else {
      ungrouped.push(s)
    }
  })

  // Flat view groups
  const dateGroups: Record<string, Session[]> = {}
  sessions.forEach(s => {
    const g = dateGroup(s.createdAt)
    if (!dateGroups[g]) dateGroups[g] = []
    dateGroups[g].push(s)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-1)', paddingTop: 28 }}>
      {/* Header */}
      <header style={{ padding: `${V.sp6} ${V.sp8}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid var(--border-subtle)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={new URL('../assets/translize-logo.png', import.meta.url).href} alt="Translize" style={{ height: 36, width: 'auto' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-0.03em' }}>
            Translize
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: V.sp4 }}>
          <button onClick={onRelationships} style={{
            padding: `${V.sp2} ${V.sp4}`, background: 'var(--surface-2)', border: '1px solid var(--border-1)',
            borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600,
            color: 'var(--ink-2)', cursor: 'pointer'
          }}>
            Relationships
          </button>
          <button onClick={onSettings} style={{
            padding: `${V.sp2} ${V.sp3}`, background: 'var(--surface-2)', border: '1px solid var(--border-1)',
            borderRadius: 'var(--radius-full)', fontSize: 14, color: 'var(--ink-3)', cursor: 'pointer', lineHeight: 1
          }}>
            ⚙
          </button>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: nlmOk ? 'var(--positive)' : 'var(--ink-4)' }} />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: nlmOk ? 'var(--positive)' : 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {nlmOk ? 'NLM' : 'Offline'}
          </span>
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflow: 'auto', padding: `${V.sp8} ${V.sp8}` }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {/* CTA + View Toggle */}
          <div style={{ display: 'flex', gap: V.sp3, marginBottom: V.sp8 }}>
            <button onClick={onNewCall} style={{
              flex: 1, padding: `${V.sp4} ${V.sp6}`,
              background: 'var(--primary)', color: 'white',
              border: 'none', borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)', fontWeight: 700,
              boxShadow: 'var(--shadow-md)', cursor: 'pointer'
            }}>
              + New Call
            </button>
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-1)', overflow: 'hidden' }}>
              <button onClick={() => setViewMode('grouped')} style={{
                padding: `${V.sp2} ${V.sp4}`, border: 'none', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
                background: viewMode === 'grouped' ? 'var(--primary-subtle)' : 'transparent',
                color: viewMode === 'grouped' ? 'var(--primary)' : 'var(--ink-3)'
              }}>Grouped</button>
              <button onClick={() => setViewMode('flat')} style={{
                padding: `${V.sp2} ${V.sp4}`, border: 'none', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
                background: viewMode === 'flat' ? 'var(--primary-subtle)' : 'transparent',
                color: viewMode === 'flat' ? 'var(--primary)' : 'var(--ink-3)'
              }}>All Calls</button>
            </div>
          </div>

          {/* Grouped View */}
          {viewMode === 'grouped' && (
            <>
              {Object.entries(contactGroups).map(([contactName, group]) => {
                const isExpanded = expandedContacts.has(contactName)
                const lastSentiment = group.skill?.sentimentTrajectory?.slice(-1)[0]?.score
                const summary = group.skill?.relationshipSummary?.slice(0, 80)
                const company = group.skill?.contact?.company

                return (
                  <div key={contactName} style={{ marginBottom: V.sp4 }}>
                    {/* Contact folder header */}
                    <button onClick={() => toggleContact(contactName)} style={{
                      width: '100%', textAlign: 'left', padding: `${V.sp4} ${V.sp5}`,
                      background: 'var(--surface-raised)', border: '1px solid var(--border-1)',
                      borderRadius: isExpanded ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: V.sp3
                    }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: lastSentiment != null ? (lastSentiment > 0.2 ? 'var(--positive)' : lastSentiment < -0.2 ? 'var(--negative)' : 'var(--warning)') : 'var(--ink-5)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: V.sp2 }}>
                          <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--ink-1)' }}>{contactName}</span>
                          {company && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)' }}>{company}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: V.sp3, fontSize: 'var(--text-xs)', color: 'var(--ink-4)', marginTop: 2 }}>
                          <span>{group.sessions.length} call{group.sessions.length !== 1 ? 's' : ''}</span>
                          {summary && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}...</span>}
                        </div>
                      </div>
                    </button>
                    {/* Expanded: show sessions */}
                    {isExpanded && (
                      <div style={{ borderLeft: '1px solid var(--border-1)', borderRight: '1px solid var(--border-1)', borderBottom: '1px solid var(--border-1)', borderRadius: '0 0 var(--radius-md) var(--radius-md)', padding: V.sp3 }}>
                        {group.sessions.map(s => (
                          <Card key={s.id} s={s} h={hovered === s.id} onH={v => setHovered(v ? s.id : null)} onClick={() => onSelectSession(s)} onDel={e => del(e, s.id)} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {ungrouped.length > 0 && (
                <Section title="Ungrouped">
                  {ungrouped.map(s => <Card key={s.id} s={s} h={hovered === s.id} onH={v => setHovered(v ? s.id : null)} onClick={() => onSelectSession(s)} onDel={e => del(e, s.id)} />)}
                </Section>
              )}
            </>
          )}

          {/* Flat View */}
          {viewMode === 'flat' && (
            <>
              {Object.entries(dateGroups).map(([group, items]) => (
                <Section key={group} title={group}>
                  {items.map(s => <Card key={s.id} s={s} h={hovered === s.id} onH={v => setHovered(v ? s.id : null)} onClick={() => onSelectSession(s)} onDel={e => del(e, s.id)} />)}
                </Section>
              ))}
            </>
          )}

          {/* Empty */}
          {sessions.length === 0 && (
            <div style={{ textAlign: 'center', padding: `${V.sp16} ${V.sp8}` }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--ink-4)', fontWeight: 400, fontStyle: 'italic', marginBottom: V.sp4 }}>
                No sessions yet
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
                Start your first call to begin building your knowledge base.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ padding: `${V.sp3} ${V.sp8}`, borderTop: `1px solid var(--border-subtle)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', fontWeight: 500 }}>
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </span>
        {showReset ? (
          <div style={{ display: 'flex', gap: V.sp2 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--negative)', fontWeight: 600, marginRight: V.sp2 }}>Reset everything?</span>
            <button onClick={() => window.translize.app.reset()} style={{ ...pillBtn, background: 'var(--negative)', color: 'white' }}>Confirm</button>
            <button onClick={() => setShowReset(false)} style={{ ...pillBtn, background: 'var(--surface-3)', color: 'var(--ink-2)' }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowReset(true)} style={{ background: 'none', border: 'none', fontSize: 'var(--text-xs)', color: 'var(--ink-4)', cursor: 'pointer' }}>
            Reset App
          </button>
        )}
      </footer>
    </div>
  )
}

// -- Sub-components --

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section style={{ marginBottom: V.sp10 }}>
      <h2 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: V.sp4, paddingLeft: V.sp1 }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: V.sp3 }}>
        {children}
      </div>
    </section>
  )
}

function Card({ s, h, onH, onClick, onDel }: {
  s: Session; h: boolean; onH: (v: boolean) => void; onClick: () => void; onDel: (e: React.MouseEvent) => void
}): React.ReactElement {
  const label = s.name ?? (s.calls[0]?.contactName ? `Call with ${s.calls[0].contactName}` : `Call — ${formatFullDate(s.createdAt)}`)
  const lastCall = s.calls[s.calls.length - 1]
  const sentiment = lastCall?.sentimentScore
  const tags = lastCall?.tags ?? []

  return (
    <div onClick={onClick} onMouseEnter={() => onH(true)} onMouseLeave={() => onH(false)} style={{
      display: 'flex', alignItems: 'center', gap: V.sp4,
      padding: `${V.sp5} ${V.sp6}`, minHeight: 80,
      background: h ? 'var(--surface-2)' : 'var(--surface-raised)',
      border: `1px solid ${h ? 'var(--border-2)' : 'var(--border-1)'}`,
      borderRadius: 'var(--radius-md)', cursor: 'pointer',
      boxShadow: h ? 'var(--shadow-md)' : 'var(--shadow-xs)',
      transition: 'all 0.2s ease'
    }}>
      {/* Sentiment dot */}
      <div style={{
        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
        background: sentiment != null
          ? (sentiment > 0.2 ? 'var(--positive)' : sentiment < -0.2 ? 'var(--negative)' : 'var(--warning)')
          : 'var(--ink-5)'
      }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: V.sp1 }}>
          <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', flexShrink: 0, marginLeft: V.sp3 }}>
            {formatFullDate(s.createdAt)}
          </span>
        </div>

        {/* Metadata row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: V.sp2, flexWrap: 'wrap' }}>
          <span style={{
            padding: `1px ${V.sp2}`, borderRadius: 'var(--radius-full)',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
            background: s.mode === 'notebook' ? 'var(--purple-subtle)' : s.mode === 'both' ? 'var(--primary-subtle)' : 'var(--surface-3)',
            color: s.mode === 'notebook' ? 'var(--purple)' : s.mode === 'both' ? 'var(--primary)' : 'var(--ink-3)'
          }}>
            {MODE_LABEL[s.mode]}
          </span>
          {s.docPaths.length > 0 && <MetaChip>{s.docPaths.length} doc{s.docPaths.length !== 1 ? 's' : ''}</MetaChip>}
          {s.calls.length > 0 && <MetaChip>{s.calls.length} call{s.calls.length !== 1 ? 's' : ''}</MetaChip>}
          {lastCall?.durationMinutes && <MetaChip>{lastCall.durationMinutes}m</MetaChip>}
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)' }}>{formatTime(s.updatedAt)}</span>

          {/* Tags */}
          {tags.map(t => (
            <span key={t} style={{ padding: `1px ${V.sp2}`, borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 600, background: 'var(--amber-subtle)', color: 'var(--amber)' }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Delete */}
      <button type="button" title="Delete session" aria-label="Delete session" onClick={onDel} style={{
        opacity: h ? 1 : 0, transition: 'opacity 0.15s', background: 'none', border: 'none',
        padding: V.sp2, color: 'var(--ink-4)', cursor: 'pointer', fontSize: 14, borderRadius: 'var(--radius-sm)'
      }}>
        ×
      </button>
    </div>
  )
}

function MetaChip({ children }: { children: React.ReactNode }): React.ReactElement {
  return <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', fontWeight: 500 }}>{children}</span>
}

// Spacing shortcuts
const V = { sp1: '4px', sp2: '8px', sp3: '12px', sp4: '16px', sp5: '20px', sp6: '24px', sp8: '32px', sp10: '40px', sp12: '48px', sp16: '64px' }

const pillBtn: React.CSSProperties = {
  padding: '4px 12px', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer'
}
