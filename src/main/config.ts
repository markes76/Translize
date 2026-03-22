import fs from 'fs'
import path from 'path'
import { app } from 'electron'

function configFile(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

interface AppConfig {
  onboarding_complete: boolean
  theme?: 'system' | 'light' | 'dark'
  context_threshold?: number
  context_interval_seconds?: number
  retention_days?: number
  notebooklm_enabled?: boolean
  recordings_enabled?: boolean
  recordings_retention_days?: number
}

const DEFAULTS: AppConfig = {
  onboarding_complete: false,
  theme: 'system',
  context_threshold: 0.75,
  context_interval_seconds: 10,
  retention_days: 90,
  notebooklm_enabled: false
}

export function readConfig(): AppConfig {
  try {
    const file = configFile()
    if (!fs.existsSync(file)) return { ...DEFAULTS }
    const raw = fs.readFileSync(file, 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeConfig(updates: Partial<AppConfig>): AppConfig {
  const file = configFile()
  const current = readConfig()
  const next = { ...current, ...updates }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next, null, 2))
  return next
}
