import React, { useState } from 'react'
import WelcomeStep from './WelcomeStep'
import ApiKeyStep from './ApiKeyStep'
import MicPermissionStep from './MicPermissionStep'
import AudioPermissionStep from './AudioPermissionStep'
import LanguageStep from './LanguageStep'
import NotebookStep from './NotebookStep'
import AudioTestStep from './AudioTestStep'

interface Props {
  onComplete: () => void
}

const STEPS = ['Welcome', 'OpenAI', 'Microphone', 'System Audio', 'Languages', 'NotebookLM', 'Audio Test']
const TOTAL = STEPS.length

export default function OnboardingFlow({ onComplete }: Props): React.ReactElement {
  const [step, setStep] = useState(0)

  const next = (): void => {
    if (step < TOTAL - 1) setStep(step + 1)
    else onComplete()
  }

  const skip = (): void => next()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: 'var(--bg)', padding: '28px 0 0'
    }}>
      {step > 0 && (
        <div style={{ padding: '0 40px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Step {step} of {TOTAL - 1}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{STEPS[step]}</span>
          </div>
          <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
            <div style={{
              height: '100%', borderRadius: 2, background: 'var(--accent)',
              width: `${(step / (TOTAL - 1)) * 100}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {step === 0 && <WelcomeStep onNext={next} />}
        {step === 1 && <ApiKeyStep onNext={next} />}
        {step === 2 && <MicPermissionStep onNext={next} />}
        {step === 3 && <AudioPermissionStep onNext={next} />}
        {step === 4 && <LanguageStep onNext={next} />}
        {step === 5 && <NotebookStep onNext={next} onSkip={skip} />}
        {step === 6 && <AudioTestStep onComplete={onComplete} />}
      </div>
    </div>
  )
}
