import React, { useState } from 'react'

interface Props {
  onNext: () => void
}

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'he', label: 'Hebrew', flag: '🇮🇱' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'ar', label: 'Arabic', flag: '🇸🇦' },
  { code: 'pt', label: 'Portuguese', flag: '🇧🇷' },
  { code: 'zh', label: 'Mandarin', flag: '🇨🇳' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', label: 'Korean', flag: '🇰🇷' },
  { code: 'ru', label: 'Russian', flag: '🇷🇺' },
  { code: 'it', label: 'Italian', flag: '🇮🇹' }
]

export default function LanguageStep({ onNext }: Props): React.ReactElement {
  const [selected, setSelected] = useState<Set<string>>(new Set(['en']))
  const [mixedMode, setMixedMode] = useState(false)

  const toggle = (code: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const handleContinue = async () => {
    await window.translize.config.write({
      languages: Array.from(selected),
      mixed_language_mode: mixedMode
    })
    onNext()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 40px 40px', maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>What languages do you speak?</h2>
      <p style={{ color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 24 }}>
        Select the languages used in your calls. This improves transcription accuracy.
        You can change this per call later.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {LANGUAGES.map(lang => {
          const isSelected = selected.has(lang.code)
          return (
            <button key={lang.code} onClick={() => toggle(lang.code)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 20,
              background: isSelected ? 'var(--primary-subtle)' : 'var(--surface-raised)',
              border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border-1)'}`,
              color: isSelected ? 'var(--primary)' : 'var(--ink-1)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s'
            }}>
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
              {isSelected && <span style={{ fontSize: 11 }}>✓</span>}
            </button>
          )
        })}
      </div>

      {/* Mixed language toggle */}
      <div
        onClick={() => setMixedMode(!mixedMode)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
          background: mixedMode ? 'var(--primary-subtle)' : 'var(--surface-raised)',
          border: `1px solid ${mixedMode ? 'var(--primary)' : 'var(--border-1)'}`,
          borderRadius: 'var(--radius-md)', cursor: 'pointer', marginBottom: 32
        }}
      >
        <div style={{
          width: 36, height: 20, borderRadius: 10, padding: 2,
          background: mixedMode ? 'var(--primary)' : 'var(--border-1)', transition: 'background 0.2s',
          display: 'flex', alignItems: isSelected ? 'center' : 'center'
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%', background: 'white',
            transform: mixedMode ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
          }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>
            Mixed-language conversations
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 2 }}>
            Enable if speakers switch between languages mid-conversation
          </div>
        </div>
      </div>

      <button onClick={handleContinue} style={{
        width: '100%', padding: '14px 20px', marginTop: 'auto',
        background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
        color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
        fontSize: 15, fontWeight: 600, cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
      }}>
        Continue
      </button>
    </div>
  )
}

function isSelected(): boolean { return false }
