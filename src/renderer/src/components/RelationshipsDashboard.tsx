import React, { useEffect, useState } from 'react'

interface Skill {
  skillId: string
  contact: { name: string; company?: string; role?: string; firstInteraction: string; totalCalls: number; totalTalkTimeMinutes: number }
  relationshipSummary: string
  communicationPatterns: { theirStyle: string; whatWorks: string; whatToAvoid: string }
  sentimentTrajectory: Array<{ date: string; score: number; label: string; note: string }>
  keyTopics: Array<{ topic: string; status: string; lastMentioned: string }>
  openActionItems: Array<{ item: string; owner: string; created: string }>
  riskFlags: Array<{ flag: string; severity: string; date: string }>
  lastUpdated: string
  callLog: Array<{ date: string; durationMinutes: number; overallSentiment: number; summary: string }>
  _fromContacts?: boolean
  _contactEmail?: string
  _contactPhone?: string
}

interface Props { onBack: () => void }

const V = { sp2: '8px', sp3: '12px', sp4: '16px', sp5: '20px', sp6: '24px', sp8: '32px', sp10: '40px', sp12: '48px' }

export default function RelationshipsDashboard({ onBack }: Props): React.ReactElement {
  const [skills, setSkills] = useState<Skill[]>([])
  const [selected, setSelected] = useState<Skill | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'at-risk' | 'trending-up' | 'recent'>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [addMode, setAddMode] = useState<'form' | 'nlp' | 'csv'>('form')

  useEffect(() => {
    window.translize.skill.list().then((list: unknown) => setSkills(list as Skill[]))
  }, [])

  const avgSentiment = skills.length > 0
    ? skills.reduce((sum, s) => sum + (s.sentimentTrajectory.length > 0 ? s.sentimentTrajectory[s.sentimentTrajectory.length - 1].score : 0), 0) / skills.length
    : 0

  const trendingDown = skills.filter(s => {
    const t = s.sentimentTrajectory
    if (t.length < 3) return false
    return t[t.length - 1].score < t[t.length - 3].score - 0.2
  })

  const trendingUp = skills.filter(s => {
    const t = s.sentimentTrajectory
    if (t.length < 3) return false
    return t[t.length - 1].score > t[t.length - 3].score + 0.2
  })

  if (selected) return <ContactDeepDive skill={selected} onBack={() => setSelected(null)} />

  const handleSaveContact = async (contact: { name: string; company?: string; role?: string; notes?: string }) => {
    const skill: Record<string, unknown> = {
      skillId: `skill-${contact.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      contact: { name: contact.name, company: contact.company, role: contact.role, firstInteraction: new Date().toISOString(), totalCalls: 0, totalTalkTimeMinutes: 0 },
      relationshipSummary: contact.notes ?? '',
      communicationPatterns: { theirStyle: '', whatWorks: '', whatToAvoid: '' },
      sentimentTrajectory: [], keyTopics: [], openActionItems: [], resolvedActionItems: [],
      riskFlags: [], languagesUsed: ['English'], lastUpdated: new Date().toISOString(), callLog: []
    }
    await window.translize.skill.save(skill)
    const updated = await window.translize.skill.list() as Skill[]
    setSkills(updated)
    setShowAddModal(false)
  }

  const handleNlpParse = async (text: string) => {
    try {
      const apiKey = await window.translize.keychain.get('openai-api-key')
      if (!apiKey) return
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini', temperature: 0.1, max_tokens: 300,
          messages: [
            { role: 'system', content: 'Parse this description into a contact. Return JSON: {"name": "...", "company": "...", "role": "...", "notes": "..."}. Only include fields mentioned.' },
            { role: 'user', content: text }
          ],
          response_format: { type: 'json_object' }
        })
      })
      if (resp.ok) {
        const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
        const parsed = JSON.parse(data.choices[0]?.message?.content ?? '{}')
        if (parsed.name) await handleSaveContact(parsed)
      }
    } catch {}
  }

  const handleCsvImport = async (csvText: string): Promise<{ imported: number; skipped: number; error?: string }> => {
    try {
      const Papa = await import('papaparse')
      const result = Papa.default.parse(csvText, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() })
      const rows = result.data as Record<string, string>[]
      let imported = 0; let skipped = 0
      for (const row of rows) {
        // Accept any column that fuzzy-matches the field name
        const find = (keys: string[]) => {
          for (const k of keys) {
            const match = Object.keys(row).find(h => h === k || h.includes(k))
            if (match && row[match]?.trim()) return row[match].trim()
          }
          return undefined
        }
        const name = find(['name', 'full name', 'fullname', 'contact', 'first name'])
        if (!name) { skipped++; continue }
        await handleSaveContact({
          name,
          company: find(['company', 'organization', 'org', 'employer', 'account']),
          role: find(['role', 'title', 'job title', 'position', 'job']),
          notes: find(['notes', 'note', 'description', 'desc', 'comments', 'comment', 'bio'])
        })
        imported++
      }
      if (imported === 0) return { imported: 0, skipped, error: 'No rows had a recognizable name column.' }
      return { imported, skipped }
    } catch (e) {
      return { imported: 0, skipped: 0, error: (e as Error).message }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--surface-1)', position: 'relative' }}>

      {/* Add Contact Modal */}
      {showAddModal && (
        <AddContactModal mode={addMode} onModeChange={setAddMode} onSave={handleSaveContact} onNlpParse={handleNlpParse} onCsvImport={handleCsvImport} onClose={() => setShowAddModal(false)} onImportDone={() => { setShowAddModal(false); window.translize.skill.list().then((list: unknown) => setSkills(list as Skill[])) }} />
      )}

      <header style={{ padding: `${V.sp4} ${V.sp8}`, display: 'flex', alignItems: 'center', gap: V.sp4, borderBottom: '1px solid var(--border-subtle)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}>← Home</button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, flex: 1 }}>Relationships</h1>
        <button onClick={() => { setAddMode('form'); setShowAddModal(true) }} style={{
          padding: `${V.sp2} ${V.sp5}`, background: 'var(--primary)', color: 'white', border: 'none',
          borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)'
        }}>+ Add Contact</button>
      </header>

      <main style={{ flex: 1, overflow: 'auto', padding: V.sp8 }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Portfolio stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: V.sp4, marginBottom: V.sp10 }}>
            <StatCard label="Contacts" value={String(skills.length)} />
            <StatCard label="Avg Sentiment" value={avgSentiment > 0 ? `+${avgSentiment.toFixed(1)}` : avgSentiment.toFixed(1)} color={avgSentiment > 0.2 ? 'var(--positive)' : avgSentiment < -0.2 ? 'var(--negative)' : 'var(--warning)'} bg={avgSentiment > 0.2 ? 'var(--positive-subtle)' : avgSentiment < -0.2 ? 'var(--negative-subtle)' : undefined} />
            <StatCard label="Trending Up" value={String(trendingUp.length)} color="var(--positive)" bg="var(--positive-subtle)" />
            <StatCard label="At Risk" value={String(trendingDown.length)} color="var(--negative)" bg="var(--negative-subtle)" />
          </div>

          {/* Risk alerts */}
          {trendingDown.length > 0 && (
            <div style={{ marginBottom: V.sp8, padding: V.sp5, background: 'var(--negative-subtle)', border: '1px solid var(--negative)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--negative)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--negative)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: V.sp3 }}>Attention Needed</div>
              {trendingDown.map(s => (
                <div key={s.skillId} style={{ fontSize: 'var(--text-sm)', color: 'var(--negative)', marginBottom: V.sp2, cursor: 'pointer' }} onClick={() => setSelected(s)}>
                  <strong>{s.contact.name}</strong>{s.contact.company ? ` (${s.contact.company})` : ''} — sentiment declining over last {s.sentimentTrajectory.length} calls
                </div>
              ))}
            </div>
          )}

          {/* Contact list */}
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: V.sp4 }}>All Contacts</div>

          {/* Search */}
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search contacts..."
            style={{
              width: '100%', padding: '8px 12px', marginBottom: V.sp3,
              background: 'var(--surface-2)', border: '1px solid var(--border-1)',
              borderRadius: 'var(--radius-md)', color: 'var(--ink-1)',
              fontSize: 'var(--text-sm)', outline: 'none', boxSizing: 'border-box'
            }}
          />

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: V.sp2, marginBottom: V.sp4 }}>
            {([['all', 'All'], ['at-risk', 'At Risk'], ['trending-up', 'Trending Up'], ['recent', 'Recent']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setActiveFilter(key)} style={{
                padding: '4px 12px', fontSize: 'var(--text-xs)', fontWeight: 600,
                background: activeFilter === key ? 'var(--primary)' : 'var(--surface-2)',
                color: activeFilter === key ? 'white' : 'var(--ink-2)',
                border: '1px solid ' + (activeFilter === key ? 'var(--primary)' : 'var(--border-1)'),
                borderRadius: 'var(--radius-full)', cursor: 'pointer', transition: 'all 0.15s'
              }}>{label}</button>
            ))}
          </div>

          {skills.length === 0 && (
            <div style={{ textAlign: 'center', padding: V.sp12, color: 'var(--ink-3)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontStyle: 'italic', marginBottom: V.sp3 }}>No contacts yet</div>
              <p style={{ fontSize: 'var(--text-sm)', marginBottom: V.sp4 }}>Complete calls with named contacts to build relationship intelligence.</p>
              <div style={{ display: 'flex', gap: V.sp3, justifyContent: 'center' }}>
                <button onClick={() => { setAddMode('form'); setShowAddModal(true) }} style={{ padding: '8px 18px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}>Add Contact</button>
                <button onClick={() => { setAddMode('csv'); setShowAddModal(true) }} style={{ padding: '8px 18px', background: 'var(--surface-2)', color: 'var(--ink-1)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}>Import CSV</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: V.sp3 }}>
            {skills.filter(s => {
              if (searchQuery && !s.contact.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
              if (activeFilter === 'at-risk') return trendingDown.includes(s)
              if (activeFilter === 'trending-up') return trendingUp.includes(s)
              if (activeFilter === 'recent') {
                const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
                return new Date(s.lastUpdated).getTime() > weekAgo
              }
              return true
            }).map(s => {
              const lastSentiment = s.sentimentTrajectory.length > 0 ? s.sentimentTrajectory[s.sentimentTrajectory.length - 1] : null
              const hasRisk = s.riskFlags.length > 0
              return (
                <div key={s.skillId} onClick={() => setSelected(s)} style={{
                  display: 'flex', alignItems: 'center', gap: V.sp4,
                  padding: `${V.sp5} ${V.sp6}`, background: 'var(--surface-raised)',
                  border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}>
                  {/* Sentiment dot */}
                  <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: lastSentiment ? (lastSentiment.score > 0.2 ? 'var(--positive)' : lastSentiment.score < -0.2 ? 'var(--negative)' : 'var(--warning)') : 'var(--ink-5)' }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: V.sp2 }}>
                      <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--ink-1)' }}>{s.contact.name}</span>
                      {s.contact.company && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)' }}>{s.contact.company}</span>}
                      {hasRisk && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--negative)', background: 'var(--negative-subtle)', padding: '1px 6px', borderRadius: 'var(--radius-full)' }}>RISK</span>}
                    </div>
                    <div style={{ display: 'flex', gap: V.sp4, fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginTop: V.sp2 }}>
                      {s._fromContacts ? (
                        <>
                          {s._contactEmail && <span>{s._contactEmail}</span>}
                          {s.contact.role && <span>{s.contact.role}</span>}
                          <span style={{ color: 'var(--ink-5)' }}>No calls yet</span>
                        </>
                      ) : (
                        <>
                          <span>{s.contact.totalCalls} calls</span>
                          <span>{s.contact.totalTalkTimeMinutes}m total</span>
                          {s.lastUpdated && <span>Last: {new Date(s.lastUpdated).toLocaleDateString()}</span>}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mini sentiment trajectory */}
                  {s.sentimentTrajectory.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
                      {s.sentimentTrajectory.slice(-8).map((pt, i) => (
                        <div key={i} style={{
                          width: 4, borderRadius: 2,
                          height: `${Math.max(4, Math.abs(pt.score) * 20)}px`,
                          background: pt.score > 0.2 ? 'var(--positive)' : pt.score < -0.2 ? 'var(--negative)' : 'var(--warning)',
                          opacity: 0.4 + (i / s.sentimentTrajectory.slice(-8).length) * 0.6
                        }} />
                      ))}
                    </div>
                  )}

                  <button onClick={async (e) => { e.stopPropagation(); if (confirm(`Delete contact ${s.contact.name}?`)) { await window.translize.skill.delete(s.skillId); setSkills(p => p.filter(x => x.skillId !== s.skillId)) } }}
                    style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', fontSize: 14, padding: V.sp2, borderRadius: 'var(--radius-sm)', opacity: 0.5 }}
                    title="Delete contact"
                    onMouseEnter={e => { (e.target as HTMLElement).style.opacity = '1'; (e.target as HTMLElement).style.color = 'var(--negative)' }}
                    onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '0.5'; (e.target as HTMLElement).style.color = 'var(--ink-4)' }}>
                    ×
                  </button>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-4)' }}>→</span>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}

function ContactDeepDive({ skill, onBack }: { skill: Skill; onBack: () => void }): React.ReactElement {
  const lastSentiment = skill.sentimentTrajectory.length > 0 ? skill.sentimentTrajectory[skill.sentimentTrajectory.length - 1] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--surface-1)' }}>
      <header style={{ padding: `${V.sp4} ${V.sp8}`, display: 'flex', alignItems: 'center', gap: V.sp4, borderBottom: '1px solid var(--border-subtle)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}>← All Contacts</button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>{skill.contact.name}</h1>
        {skill.contact.company && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)' }}>{skill.contact.company}</span>}
      </header>

      <main style={{ flex: 1, overflow: 'auto', padding: V.sp8 }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {/* Relationship summary */}
          <div style={{ marginBottom: V.sp10 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: V.sp3 }}>Relationship Summary</div>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontStyle: 'italic', lineHeight: 1.5, color: 'var(--ink-1)' }}>
              {skill.relationshipSummary || 'No summary yet.'}
            </p>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: V.sp4, marginBottom: V.sp8 }}>
            <StatCard label="Total Calls" value={String(skill.contact.totalCalls)} />
            <StatCard label="Talk Time" value={`${skill.contact.totalTalkTimeMinutes}m`} />
            <StatCard label="First Call" value={new Date(skill.contact.firstInteraction).toLocaleDateString([], { month: 'short', year: 'numeric' })} />
            <StatCard label="Last Sentiment" value={lastSentiment ? `${lastSentiment.score > 0 ? '+' : ''}${lastSentiment.score.toFixed(1)}` : 'N/A'}
              color={lastSentiment ? (lastSentiment.score > 0.2 ? 'var(--positive)' : lastSentiment.score < -0.2 ? 'var(--negative)' : 'var(--warning)') : undefined} />
          </div>

          {/* Sentiment trajectory */}
          {skill.sentimentTrajectory.length > 0 && (
            <div style={{ marginBottom: V.sp8, padding: V.sp6, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: V.sp4 }}>Sentiment Over Time</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: V.sp3, height: 80, padding: `0 ${V.sp2}` }}>
                {skill.sentimentTrajectory.map((pt, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: V.sp2 }}>
                    <div style={{
                      width: '100%', maxWidth: 32, borderRadius: 'var(--radius-sm)',
                      height: `${Math.max(8, (pt.score + 1) * 35)}px`,
                      background: pt.score > 0.2 ? 'var(--positive)' : pt.score < -0.2 ? 'var(--negative)' : 'var(--warning)',
                      transition: 'height 0.3s'
                    }} />
                    <span style={{ fontSize: 9, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>
                      {new Date(pt.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: V.sp4, marginBottom: V.sp8 }}>
            {/* Communication patterns */}
            <div style={{ padding: V.sp6, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: V.sp4 }}>Communication Style</div>
              {skill.communicationPatterns.theirStyle && <Field label="Their style" value={skill.communicationPatterns.theirStyle} />}
              {skill.communicationPatterns.whatWorks && <Field label="What works" value={skill.communicationPatterns.whatWorks} color="var(--positive)" />}
              {skill.communicationPatterns.whatToAvoid && <Field label="What to avoid" value={skill.communicationPatterns.whatToAvoid} color="var(--negative)" />}
            </div>

            {/* Open action items */}
            <div style={{ padding: V.sp6, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: V.sp4 }}>Open Action Items</div>
              {skill.openActionItems.length === 0 && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)', fontStyle: 'italic' }}>No open items</p>}
              {skill.openActionItems.map((ai, i) => (
                <div key={i} style={{ padding: `${V.sp3} ${V.sp4}`, background: 'var(--surface-2)', borderLeft: '3px solid var(--primary)', borderRadius: 'var(--radius-sm)', marginBottom: V.sp2, fontSize: 'var(--text-sm)' }}>
                  <div style={{ fontWeight: 600 }}>{ai.item}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginTop: 2 }}>{ai.owner} · {new Date(ai.created).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Key topics */}
          {skill.keyTopics.length > 0 && (
            <div style={{ marginBottom: V.sp8, padding: V.sp6, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: V.sp4 }}>Key Topics</div>
              <div style={{ display: 'flex', gap: V.sp2, flexWrap: 'wrap' }}>
                {skill.keyTopics.map((t, i) => (
                  <span key={i} style={{ padding: `${V.sp2} ${V.sp3}`, borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600, background: 'var(--primary-subtle)', color: 'var(--primary)' }}>
                    {t.topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Call history */}
          {skill.callLog.length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: V.sp4 }}>Call History</div>
              {skill.callLog.map((c, i) => (
                <div key={i} style={{ padding: `${V.sp4} ${V.sp5}`, marginBottom: V.sp3, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'flex-start', gap: V.sp4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: c.overallSentiment > 0.2 ? 'var(--positive)' : c.overallSentiment < -0.2 ? 'var(--negative)' : 'var(--warning)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: V.sp2 }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink-1)' }}>
                        {new Date(c.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)' }}>{c.durationMinutes}m</span>
                    </div>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-2)', lineHeight: 1.5 }}>{c.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function StatCard({ label, value, color, bg }: { label: string; value: string; color?: string; bg?: string }): React.ReactElement {
  return (
    <div style={{ padding: V.sp5, background: bg ?? 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: color ?? 'var(--ink-1)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: V.sp2 }}>{label}</div>
    </div>
  )
}

function Field({ label, value, color }: { label: string; value: string; color?: string }): React.ReactElement {
  return (
    <div style={{ marginBottom: V.sp4 }}>
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: color ?? 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: V.sp2 }}>{label}</div>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-1)', lineHeight: 1.5 }}>{value}</p>
    </div>
  )
}

function AddContactModal({ mode, onModeChange, onSave, onNlpParse, onCsvImport, onClose, onImportDone }: {
  mode: 'form' | 'nlp' | 'csv'; onModeChange: (m: 'form' | 'nlp' | 'csv') => void
  onSave: (c: { name: string; company?: string; role?: string; notes?: string }) => void
  onNlpParse: (text: string) => void
  onCsvImport: (csv: string) => Promise<{ imported: number; skipped: number; error?: string }>
  onClose: () => void; onImportDone: () => void
}): React.ReactElement {
  const [name, setName] = useState(''); const [company, setCompany] = useState(''); const [role, setRole] = useState(''); const [notes, setNotes] = useState('')
  const [nlpText, setNlpText] = useState(''); const [csvText, setCsvText] = useState('')
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState<{ imported: number; skipped: number; error?: string } | null>(null)

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: 520, maxHeight: '80vh', overflow: 'auto', background: 'var(--surface-raised)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)', padding: V.sp8 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: V.sp6 }}>Add Contact</h2>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: V.sp2, marginBottom: V.sp6 }}>
          {[{ k: 'form' as const, l: 'Manual' }, { k: 'nlp' as const, l: 'Natural Language' }, { k: 'csv' as const, l: 'CSV Import' }].map(t => (
            <button key={t.k} onClick={() => onModeChange(t.k)} style={{
              padding: `${V.sp2} ${V.sp4}`, borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
              background: mode === t.k ? 'var(--primary-subtle)' : 'var(--surface-2)',
              border: `1px solid ${mode === t.k ? 'var(--primary)' : 'var(--border-1)'}`,
              color: mode === t.k ? 'var(--primary)' : 'var(--ink-2)'
            }}>{t.l}</button>
          ))}
        </div>

        {mode === 'form' && (
          <>
            <FormField label="Name *" value={name} onChange={setName} placeholder="Sarah Chen" />
            <FormField label="Company" value={company} onChange={setCompany} placeholder="Acme Corp" />
            <FormField label="Role" value={role} onChange={setRole} placeholder="VP of Engineering" />
            <div style={{ marginBottom: V.sp4 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: V.sp2 }}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any context about this person..." rows={3}
                style={{ width: '100%', padding: V.sp3, background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', resize: 'vertical', outline: 'none' }} />
            </div>
            <button onClick={() => { if (name.trim()) onSave({ name: name.trim(), company: company.trim() || undefined, role: role.trim() || undefined, notes: notes.trim() || undefined }) }}
              disabled={!name.trim()} style={{ width: '100%', padding: V.sp4, background: name.trim() ? 'var(--primary)' : 'var(--surface-3)', color: name.trim() ? 'white' : 'var(--ink-4)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: name.trim() ? 'pointer' : 'default' }}>
              Save Contact
            </button>
          </>
        )}

        {mode === 'nlp' && (
          <>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-2)', marginBottom: V.sp4, lineHeight: 1.6 }}>
              Describe the contact in natural language. AI will parse it into structured data.
            </p>
            <textarea value={nlpText} onChange={e => setNlpText(e.target.value)} rows={5}
              placeholder='e.g. "Sarah Chen is the VP of Engineering at Acme Corp. She is data-driven and prefers specific timelines. We have been discussing their APAC rollout."'
              style={{ width: '100%', padding: V.sp4, background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', lineHeight: 1.6, resize: 'vertical', outline: 'none', marginBottom: V.sp4 }} />
            <button onClick={() => { if (nlpText.trim()) onNlpParse(nlpText.trim()) }}
              disabled={!nlpText.trim()} style={{ width: '100%', padding: V.sp4, background: nlpText.trim() ? 'var(--primary)' : 'var(--surface-3)', color: nlpText.trim() ? 'white' : 'var(--ink-4)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: nlpText.trim() ? 'pointer' : 'default' }}>
              Parse & Save
            </button>
          </>
        )}

        {mode === 'csv' && (
          <>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-2)', marginBottom: V.sp3, lineHeight: 1.6 }}>
              Upload a CSV file or paste CSV text. Any columns matching <strong>name, company, role, notes</strong> (or similar) will be imported. Extra or missing columns are ignored.
            </p>

            {/* File picker */}
            <label style={{ display: 'flex', alignItems: 'center', gap: V.sp3, padding: V.sp3, background: 'var(--surface-2)', border: '1px dashed var(--border-2)', borderRadius: 'var(--radius-md)', cursor: 'pointer', marginBottom: V.sp3, fontSize: 'var(--text-sm)', color: 'var(--ink-2)', fontWeight: 500 }}>
              <span style={{ fontSize: 18 }}>📂</span>
              Choose CSV file
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => { if (ev.target?.result) setCsvText(ev.target.result as string) }
                reader.readAsText(file)
                e.target.value = ''
              }} />
            </label>

            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', textAlign: 'center', marginBottom: V.sp3 }}>or paste below</div>

            <textarea value={csvText} onChange={e => { setCsvText(e.target.value); setCsvResult(null) }} rows={6}
              placeholder={'name,company,role,notes\nSarah Chen,Acme Corp,VP Engineering,Key decision maker\nJohn Smith,Beta Inc,CTO,Technical contact'}
              style={{ width: '100%', padding: V.sp4, background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', fontFamily: 'monospace', lineHeight: 1.5, resize: 'vertical', outline: 'none', marginBottom: V.sp3 }} />

            {/* Result feedback */}
            {csvResult && (
              <div style={{ padding: V.sp3, borderRadius: 'var(--radius-sm)', marginBottom: V.sp3, fontSize: 'var(--text-sm)', fontWeight: 500,
                background: csvResult.error ? 'var(--negative-subtle)' : 'var(--positive-subtle)',
                color: csvResult.error ? 'var(--negative)' : 'var(--positive)',
                border: `1px solid ${csvResult.error ? 'var(--negative)' : 'var(--positive)'}` }}>
                {csvResult.error
                  ? `Import failed: ${csvResult.error}`
                  : `Imported ${csvResult.imported} contact${csvResult.imported !== 1 ? 's' : ''}${csvResult.skipped > 0 ? ` (${csvResult.skipped} row${csvResult.skipped !== 1 ? 's' : ''} skipped — no name found)` : ''}`}
              </div>
            )}

            <button
              onClick={async () => {
                if (!csvText.trim() || csvImporting) return
                setCsvImporting(true); setCsvResult(null)
                const result = await onCsvImport(csvText.trim())
                setCsvImporting(false)
                setCsvResult(result)
                if (!result.error && result.imported > 0) {
                  setTimeout(() => onImportDone(), 1200)
                }
              }}
              disabled={!csvText.trim() || csvImporting}
              style={{ width: '100%', padding: V.sp4, background: csvText.trim() && !csvImporting ? 'var(--primary)' : 'var(--surface-3)', color: csvText.trim() && !csvImporting ? 'white' : 'var(--ink-4)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: csvText.trim() && !csvImporting ? 'pointer' : 'default' }}>
              {csvImporting ? 'Importing...' : 'Import Contacts'}
            </button>
          </>
        )}

        <button onClick={onClose} style={{ width: '100%', marginTop: V.sp3, padding: V.sp3, background: 'transparent', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function FormField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }): React.ReactElement {
  return (
    <div style={{ marginBottom: V.sp4 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: V.sp2 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: V.sp3, background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-1)', fontSize: 'var(--text-sm)', outline: 'none' }} />
    </div>
  )
}
