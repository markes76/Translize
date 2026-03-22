import React, { useEffect, useState, useCallback } from 'react'
import OnboardingFlow from './components/Onboarding/OnboardingFlow'
import TopNav from './components/TopNav'
import SessionList from './components/SessionList'
import SessionSetup from './components/SessionSetup'
import MainApp from './components/MainApp'
import PostCallSummary from './components/PostCallSummary'
import RelationshipsDashboard from './components/RelationshipsDashboard'
import Settings from './components/Settings'
import type { TranscriptSegment } from './services/openai-realtime'

type AppState = 'loading' | 'unsupported-os' | 'onboarding' | 'home' | 'setup' | 'call' | 'summary' | 'relationships' | 'settings'

interface ActiveSession {
  id: string
  name?: string
  docPaths: string[]
  mode: string
  notebookId?: string
}

function getUrlParams(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

export default function App(): React.ReactElement {
  const [state, setState] = useState<AppState>('loading')
  const [osRelease, setOsRelease] = useState('')
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [prefill, setPrefill] = useState<Record<string, unknown> | undefined>()
  const [completedSegments, setCompletedSegments] = useState<TranscriptSegment[]>([])
  const [completedAudioFile, setCompletedAudioFile] = useState<string | null>(null)

  useEffect(() => {
    const params = getUrlParams()
    if (params.get('macos_unsupported')) {
      setOsRelease(params.get('release') ?? '')
      setState('unsupported-os')
      return
    }

    window.translize.config.read().then((config) => {
      if (config.onboarding_complete) {
        setState('home')
      } else {
        setState('onboarding')
      }
    })
  }, [])

  const handleCallEnd = useCallback((segments: TranscriptSegment[], audioFile: string | null) => {
    setCompletedSegments(segments)
    setCompletedAudioFile(audioFile)
    setState('summary')
  }, [])

  if (state === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--radius-md)',
          background: 'var(--primary-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            border: '2px solid var(--primary)', borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite'
          }} />
        </div>
        <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>Loading Translize...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (state === 'unsupported-os') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', padding: 40, textAlign: 'center', gap: 16
      }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>macOS 12.3 or Later Required</h1>
        <p style={{ color: 'var(--ink-3)', maxWidth: 420 }}>
          Translize uses Apple's ScreenCaptureKit for system audio capture, which requires
          macOS 13.0 (Ventura) or later.
          {osRelease && ` You're running Darwin ${osRelease}.`}
        </p>
        <button
          onClick={() => window.translize.shell.openUrl('https://support.apple.com/en-us/111900')}
          style={{
            marginTop: 8, padding: '10px 20px', background: 'var(--primary)', color: 'white',
            border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 500, cursor: 'pointer'
          }}
        >
          Update macOS
        </button>
      </div>
    )
  }

  if (state === 'onboarding') {
    return (
      <OnboardingFlow
        onComplete={() => {
          window.translize.config.write({ onboarding_complete: true })
          setState('home')
        }}
      />
    )
  }

  // Global navigation handler
  const handleNav = (tab: string) => {
    if (tab === 'home') { setActiveSession(null); setState('home') }
    else if (tab === 'insights') setState('relationships')
    else if (tab === 'notebooklm') window.translize.shell.openUrl('https://notebooklm.google.com')
    else if (tab === 'settings') setState('settings')
  }

  const activeTab: 'home' | 'call' | 'insights' | 'notebooklm' | 'settings' = state === 'home' || state === 'setup' ? 'home' : state === 'relationships' ? 'insights' : state === 'settings' ? 'settings' : 'call'

  // Wrap all app screens with global TopNav
  const renderContent = () => {
    if (state === 'relationships') return <RelationshipsDashboard onBack={() => setState('home')} />
    if (state === 'settings') return <Settings onBack={() => setState('home')} />

    if (state === 'home') {
      return (
        <SessionList
          onNewCall={(prefillName?: string) => { setPrefill(prefillName ? { name: prefillName } : undefined); setState('setup') }}
          onRelationships={() => setState('relationships')}
          onSettings={() => setState('settings')}
          onSelectSession={(session) => { setPrefill({ name: session.name, docPaths: session.docPaths, notebookId: session.notebookId, mode: session.mode }); setState('setup') }}
        />
      )
    }

    if (state === 'setup') {
      return <SessionSetup prefill={prefill as any} onBack={() => setState('home')} onStart={(session) => { setActiveSession(session); setState('call') }} />
    }

    if (state === 'summary' && activeSession) {
      return (
        <PostCallSummary segments={completedSegments} sessionId={activeSession.id} sessionName={activeSession.name} notebookId={activeSession.notebookId} mode={activeSession.mode} audioFile={completedAudioFile}
          onBack={() => { setActiveSession(null); setState('home') }}
          onNewCall={() => { setActiveSession(null); setPrefill(undefined); setState('setup') }} />
      )
    }

    if (state === 'call' && activeSession) {
      return (
        <MainApp sessionId={activeSession.id} sessionName={activeSession.name} notebookId={activeSession.notebookId} mode={activeSession.mode}
          onEndCall={handleCallEnd} onBack={() => { setActiveSession(null); setState('home') }}
          onNavigate={handleNav} />
      )
    }

    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)' }}>Loading...</div></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-1)', paddingTop: 28 }}>
      <TopNav activeTab={activeTab} isCapturing={state === 'call' && !!activeSession} onNavigate={handleNav} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {renderContent()}
      </div>
    </div>
  )
}
