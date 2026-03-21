import React from 'react'

interface Props {
  activeTab: 'home' | 'call' | 'insights' | 'notebooklm'
  sessionName?: string
  isCapturing: boolean
  onNavigate: (tab: string) => void
}

const V = { sp2: '8px', sp3: '12px', sp4: '16px' }

export default function TopNav({ activeTab, sessionName, isCapturing, onNavigate }: Props): React.ReactElement {
  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `0 ${V.sp4}`, height: 44,
      background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-1)',
      flexShrink: 0
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: V.sp2, minWidth: 160 }}>
        <img src={new URL('../assets/translize-logo.png', import.meta.url).href} alt="" style={{ height: 22 }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-0.02em' }}>
          Translize
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: V.sp2 }}>
        {[
          { id: 'home', label: 'Home' },
          { id: 'insights', label: 'Insights' },
          { id: 'notebooklm', label: 'NotebookLM' }
        ].map(tab => (
          <button key={tab.id} onClick={() => onNavigate(tab.id)} style={{
            padding: `6px ${V.sp3}`, background: 'none', border: 'none',
            fontSize: 'var(--text-sm)', fontWeight: activeTab === tab.id ? 700 : 500,
            color: activeTab === tab.id ? 'var(--ink-1)' : 'var(--ink-3)',
            cursor: 'pointer', borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'all 0.15s'
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: V.sp3, minWidth: 160, justifyContent: 'flex-end' }}>
        {isCapturing && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 10px', background: 'var(--positive-subtle)', borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 700, color: 'var(--positive)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)', animation: 'pulse 2s infinite' }} />
            LIVE
          </span>
        )}
        <button onClick={() => onNavigate('settings')} style={{ background: 'none', border: 'none', fontSize: 16, color: 'var(--ink-3)', cursor: 'pointer', padding: 4 }}>
          ⚙
        </button>
      </div>
    </nav>
  )
}
