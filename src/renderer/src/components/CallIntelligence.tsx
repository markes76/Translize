import React, { useEffect, useRef, useState } from 'react'
import type { TranscriptSegment } from '../services/openai-realtime'
import type { Speaker } from '../hooks/useRealtimeTranscription'

interface Props {
  sessionName?: string
  contactName?: string
  isCapturing: boolean
  callDuration: number
  sentimentScore: number
  sentimentLabel: string
  segments: TranscriptSegment[]
  speakers: Speaker[]
  onAddSpeaker: (name: string) => void
  onRenameSpeaker: (id: string, name: string) => void
  onMarkAsMe: (id: string) => void
  onUnmarkMe: (id: string) => void
}

const V = { sp2: '8px', sp3: '12px', sp4: '16px', sp5: '20px', sp6: '24px' }

function fmtDur(s: number): string { return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}` }

export default function CallIntelligence({ sessionName, contactName, isCapturing, callDuration, sentimentScore, sentimentLabel, segments, speakers, onAddSpeaker, onRenameSpeaker, onMarkAsMe, onUnmarkMe }: Props): React.ReactElement {
  const [keyPoints, setKeyPoints] = useState<string[]>([])
  const [competitors, setCompetitors] = useState<string[]>([])
  const [actionItems, setActionItems] = useState<string[]>([])
  const lastExtractRef = useRef(0)
  const [addingName, setAddingName] = useState('')

  // Extract key points, competitors, action items every 30s
  useEffect(() => {
    if (!isCapturing || segments.length < 3) return
    const now = Date.now()
    if (now - lastExtractRef.current < 30000) return
    lastExtractRef.current = now

    const recentText = segments.slice(-15).filter(s => s.isFinal).map(s => s.text).join(' ')
    if (recentText.length < 50) return

    ;(async () => {
      try {
        const apiKey = await window.translize.keychain.get('openai-api-key')
        if (!apiKey) return
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini', temperature: 0.1, max_tokens: 200,
            messages: [
              { role: 'system', content: 'Extract from this call transcript: 1) key discussion points (max 3), 2) any competitor/company mentions, 3) any action items or commitments. Return JSON: {"keyPoints":["..."],"competitors":["..."],"actionItems":["..."]}' },
              { role: 'user', content: recentText }
            ],
            response_format: { type: 'json_object' }
          })
        })
        if (resp.ok) {
          const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
          const parsed = JSON.parse(data.choices[0]?.message?.content ?? '{}')
          if (parsed.keyPoints?.length) setKeyPoints(p => [...new Set([...parsed.keyPoints, ...p])].slice(0, 5))
          if (parsed.competitors?.length) setCompetitors(p => [...new Set([...parsed.competitors, ...p])])
          if (parsed.actionItems?.length) setActionItems(p => [...new Set([...parsed.actionItems, ...p])].slice(0, 5))
        }
      } catch {}
    })()
  }, [isCapturing, segments])

  const sentColor = sentimentScore > 0.2 ? 'var(--positive)' : sentimentScore < -0.2 ? 'var(--negative)' : 'var(--warning)'

  return (
    <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-1)', background: 'var(--surface-raised)', overflow: 'auto' }}>
      {/* Call header */}
      <div style={{ padding: V.sp5, borderBottom: '1px solid var(--border-1)' }}>
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--ink-1)', marginBottom: 4 }}>
          {sessionName ?? 'Active Call'}
        </div>
        {contactName && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-2)', marginBottom: V.sp2 }}>{contactName}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: V.sp2, fontSize: 'var(--text-xs)' }}>
          {isCapturing && <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--positive)', fontWeight: 700 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)' }} /> Live
          </span>}
          <span style={{ color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{fmtDur(callDuration)}</span>
        </div>
      </div>

      {/* Sentiment */}
      <SidebarSection title="Sentiment">
        <div style={{ display: 'flex', alignItems: 'center', gap: V.sp3 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: sentColor }} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: sentColor }}>{sentimentLabel || 'Neutral'}</span>
        </div>
      </SidebarSection>

      {/* Speakers */}
      <SidebarSection title={`Speakers (${speakers.length})`}>
        {speakers.length === 0 && (
          <div style={{ fontSize: 10, color: 'var(--ink-4)', fontStyle: 'italic' }}>Waiting for voices...</div>
        )}
        {speakers.map(sp => (
          <div key={sp.id} style={{ padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: sp.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: sp.color, flex: 1 }}>{sp.name}</span>
              {/* Source badge */}
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                background: sp.source === 'mic' ? 'var(--primary-subtle)' : 'var(--surface-2)',
                color: sp.source === 'mic' ? 'var(--primary)' : 'var(--ink-3)'
              }}>
                {sp.source === 'mic' ? 'MIC' : 'NET'}
              </span>
            </div>
            {/* Me / Not-me row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, paddingLeft: 13 }}>
              {sp.isUser ? (
                <>
                  <span style={{ fontSize: 9, color: 'var(--positive)', fontWeight: 700 }}>✓ That's me</span>
                  <button onClick={() => onUnmarkMe(sp.id)} style={{
                    marginLeft: 4, padding: '1px 6px', background: 'none', border: '1px solid var(--border-1)',
                    borderRadius: 3, fontSize: 9, color: 'var(--ink-3)', cursor: 'pointer'
                  }}>Not me</button>
                </>
              ) : (
                <button onClick={() => onMarkAsMe(sp.id)} style={{
                  padding: '1px 8px', background: 'var(--primary-subtle)', border: '1px solid var(--primary)',
                  borderRadius: 3, fontSize: 9, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer'
                }}>That's me</button>
              )}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4, marginTop: V.sp2 }}>
          <input value={addingName} onChange={e => setAddingName(e.target.value)} placeholder="Add participant..."
            onKeyDown={e => { if (e.key === 'Enter' && addingName.trim()) { onAddSpeaker(addingName.trim()); setAddingName('') } }}
            style={{ flex: 1, padding: '4px 8px', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', fontSize: 10, color: 'var(--ink-1)', outline: 'none' }} />
        </div>
      </SidebarSection>

      {/* Key Points */}
      {keyPoints.length > 0 && (
        <SidebarSection title="Key Points">
          {keyPoints.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--ink-1)', lineHeight: 1.5, marginBottom: 4 }}>
              <span style={{ color: 'var(--ink-4)', flexShrink: 0 }}>·</span>{p}
            </div>
          ))}
        </SidebarSection>
      )}

      {/* Competitors */}
      {competitors.length > 0 && (
        <SidebarSection title="Competitor Mentions">
          {competitors.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--ink-1)', marginBottom: 2 }}>
              <span style={{ color: 'var(--warning)' }}>!</span> {c}
            </div>
          ))}
        </SidebarSection>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <SidebarSection title="Action Items">
          {actionItems.map((a, i) => (
            <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-1)', lineHeight: 1.5, marginBottom: 4, paddingLeft: V.sp3, borderLeft: '2px solid var(--primary)' }}>
              {a}
            </div>
          ))}
        </SidebarSection>
      )}
    </div>
  )
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ padding: `${V.sp4} ${V.sp5}`, borderBottom: '1px solid var(--border-1)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: V.sp3 }}>{title}</div>
      {children}
    </div>
  )
}
