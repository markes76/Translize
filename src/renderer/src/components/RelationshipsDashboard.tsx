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
}

interface Props { onBack: () => void }

const V = { sp2: '8px', sp3: '12px', sp4: '16px', sp5: '20px', sp6: '24px', sp8: '32px', sp10: '40px', sp12: '48px' }

export default function RelationshipsDashboard({ onBack }: Props): React.ReactElement {
  const [skills, setSkills] = useState<Skill[]>([])
  const [selected, setSelected] = useState<Skill | null>(null)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-1)', paddingTop: 28 }}>
      <header style={{ padding: `${V.sp4} ${V.sp8}`, display: 'flex', alignItems: 'center', gap: V.sp4, borderBottom: '1px solid var(--border-subtle)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}>← Home</button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Relationships</h1>
      </header>

      <main style={{ flex: 1, overflow: 'auto', padding: V.sp8 }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Portfolio stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: V.sp4, marginBottom: V.sp10 }}>
            <StatCard label="Contacts" value={String(skills.length)} />
            <StatCard label="Avg Sentiment" value={avgSentiment > 0 ? `+${avgSentiment.toFixed(1)}` : avgSentiment.toFixed(1)} color={avgSentiment > 0.2 ? 'var(--positive)' : avgSentiment < -0.2 ? 'var(--negative)' : 'var(--warning)'} />
            <StatCard label="Trending Up" value={String(trendingUp.length)} color="var(--positive)" />
            <StatCard label="At Risk" value={String(trendingDown.length)} color="var(--negative)" />
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
          {skills.length === 0 && (
            <div style={{ textAlign: 'center', padding: V.sp12, color: 'var(--ink-3)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontStyle: 'italic', marginBottom: V.sp3 }}>No contacts yet</div>
              <p style={{ fontSize: 'var(--text-sm)' }}>Complete calls with named contacts to build relationship intelligence.</p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: V.sp3 }}>
            {skills.map(s => {
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
                      <span>{s.contact.totalCalls} calls</span>
                      <span>{s.contact.totalTalkTimeMinutes}m total</span>
                      <span>Last: {new Date(s.lastUpdated).toLocaleDateString()}</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-1)', paddingTop: 28 }}>
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

function StatCard({ label, value, color }: { label: string; value: string; color?: string }): React.ReactElement {
  return (
    <div style={{ padding: V.sp5, background: 'var(--surface-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)' }}>
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
