import React, { useEffect, useRef, useState } from 'react'
import type { TranscriptSegment } from '../../services/openai-realtime'

interface Props {
  segments: TranscriptSegment[]
  isCapturing: boolean
  onRenameSpeaker?: (speakerSlot: string, name: string) => void
}

const LANG_LABELS: Record<string, string> = {
  en: 'EN', he: 'HE', es: 'ES', fr: 'FR', de: 'DE', ar: 'AR', pt: 'PT', zh: 'ZH', ja: 'JA', ko: 'KO', ru: 'RU', it: 'IT'
}

export default function Transcript({ segments, isCapturing, onRenameSpeaker }: Props): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [translating, setTranslating] = useState<Set<string>>(new Set())
  // Track which speaker slot is being renamed: slotId → draft string
  const [renamingSlot, setRenamingSlot] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (autoScroll && bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' }) }, [segments, autoScroll])

  useEffect(() => {
    if (renamingSlot && renameInputRef.current) renameInputRef.current.focus()
  }, [renamingSlot])

  const commitRename = (slot: string, name: string) => {
    const trimmed = name.trim()
    if (trimmed && onRenameSpeaker) onRenameSpeaker(slot, trimmed)
    setRenamingSlot(null)
    setRenameDraft('')
  }

  const handleTranslate = async (seg: TranscriptSegment) => {
    if (translations[seg.id] || translating.has(seg.id)) return
    setTranslating(p => new Set(p).add(seg.id))
    try {
      const apiKey = await window.translize.keychain.get('openai-api-key')
      if (!apiKey) return
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini', temperature: 0.1, max_tokens: 500,
          messages: [
            { role: 'system', content: 'Translate the following text to English. Return ONLY the translation, nothing else.' },
            { role: 'user', content: seg.text }
          ]
        })
      })
      if (resp.ok) {
        const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
        const translated = data.choices[0]?.message?.content?.trim()
        if (translated) setTranslations(p => ({ ...p, [seg.id]: translated }))
      }
    } catch {} finally {
      setTranslating(p => { const n = new Set(p); n.delete(seg.id); return n })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-1)', borderRight: '1px solid var(--border-1)' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Transcript</span>
        <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{segments.length}</span>
      </div>

      <div ref={containerRef} onScroll={() => { const el = containerRef.current; if (el) setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40) }}
        style={{ flex: 1, overflow: 'auto', padding: '6px 12px' }}>
        {segments.length === 0 && (
          <div style={{ padding: '40px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 11 }}>
            {isCapturing ? 'Waiting for speech...' : 'Start listening'}
          </div>
        )}
        {segments.map(seg => {
          const langTag = seg.language ? LANG_LABELS[seg.language] ?? seg.language.toUpperCase().slice(0, 2) : null
          const translated = translations[seg.id]
          const isTranslating = translating.has(seg.id)
          const displayName = seg.speakerName ?? (seg.speaker === 'you' ? 'You' : 'Them')
          const speakerColor = seg.speakerColor ?? (seg.speaker === 'you' ? 'var(--primary)' : 'var(--positive)')
          // Only 'them' slots with a speakerSlot can be renamed
          const renamableSlot = seg.speaker === 'them' && seg.speakerSlot ? seg.speakerSlot : null
          const isRenaming = renamableSlot !== null && renamingSlot === renamableSlot

          return (
            <div key={seg.id} style={{ padding: '5px 0', borderBottom: '1px solid var(--border-subtle)', opacity: seg.isFinal ? 1 : 0.5 }}>
              {/* Speaker label + language tag */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    value={renameDraft}
                    onChange={e => setRenameDraft(e.target.value)}
                    onBlur={() => commitRename(renamableSlot!, renameDraft)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename(renamableSlot!, renameDraft)
                      if (e.key === 'Escape') { setRenamingSlot(null); setRenameDraft('') }
                    }}
                    style={{
                      fontSize: 10, fontWeight: 700, color: speakerColor,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      background: 'var(--surface-2)', border: '1px solid var(--border-1)',
                      borderRadius: 3, padding: '1px 4px', outline: 'none', width: 100
                    }}
                  />
                ) : (
                  <span
                    onClick={() => {
                      if (renamableSlot && onRenameSpeaker) {
                        setRenamingSlot(renamableSlot)
                        setRenameDraft(displayName)
                      }
                    }}
                    title={renamableSlot ? 'Click to rename' : undefined}
                    style={{
                      fontSize: 10, fontWeight: 700, color: speakerColor,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      cursor: renamableSlot ? 'pointer' : 'default'
                    }}
                  >
                    {displayName}
                    {renamableSlot && <span style={{ marginLeft: 3, opacity: 0.4, fontSize: 9 }}>✎</span>}
                  </span>
                )}

                {langTag && (
                  <span style={{
                    fontSize: 8, fontWeight: 700, color: 'var(--ink-3)',
                    padding: '1px 4px', background: 'var(--surface-2)', borderRadius: 3
                  }}>
                    {langTag}
                  </span>
                )}
                <span style={{ fontSize: 9, color: 'var(--ink-3)', marginLeft: 'auto' }}>
                  {new Date(seg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              {/* Text */}
              <div style={{ fontSize: 12, color: 'var(--ink-1)', lineHeight: 1.5 }}>{seg.text}</div>

              {/* Translation */}
              {translated && (
                <div style={{ fontSize: 11, color: 'var(--primary)', fontStyle: 'italic', marginTop: 2, paddingLeft: 8, borderLeft: '2px solid var(--primary-subtle)' }}>
                  {translated}
                </div>
              )}

              {/* Translate button */}
              {seg.isFinal && !translated && seg.language && seg.language !== 'en' && (
                <button onClick={() => handleTranslate(seg)} disabled={isTranslating}
                  style={{ marginTop: 2, padding: '1px 6px', background: 'none', border: 'none', color: 'var(--primary)', fontSize: 9, fontWeight: 600, cursor: 'pointer', opacity: 0.6 }}>
                  {isTranslating ? '...' : 'Translate'}
                </button>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {!autoScroll && (
        <button onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
          style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', padding: '4px 12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--shadow-md)' }}>
          ↓
        </button>
      )}
    </div>
  )
}
