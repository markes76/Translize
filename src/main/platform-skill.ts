import fs from 'fs'
import path from 'path'
import { app, ipcMain } from 'electron'

interface PlatformSkill {
  searchQuality: {
    savedCount: number
    dismissedCount: number
    topSources: Record<string, number>
    deprioritizedTopics: string[]
  }
  sentimentCalibration: {
    overrides: Array<{ original: number; corrected: number; context: string; date: string }>
  }
  summaryPreferences: {
    commonEdits: string[]
    prioritizedSections: string[]
  }
  entityCorrections: {
    falsePositives: string[]
    missedEntities: string[]
  }
  totalCalls: number
  lastUpdated: string
}

const DEFAULT_SKILL: PlatformSkill = {
  searchQuality: { savedCount: 0, dismissedCount: 0, topSources: {}, deprioritizedTopics: [] },
  sentimentCalibration: { overrides: [] },
  summaryPreferences: { commonEdits: [], prioritizedSections: [] },
  entityCorrections: { falsePositives: [], missedEntities: [] },
  totalCalls: 0,
  lastUpdated: new Date().toISOString()
}

function skillPath(): string {
  return path.join(app.getPath('userData'), 'platform-skill.json')
}

function loadSkill(): PlatformSkill {
  try {
    const file = skillPath()
    if (fs.existsSync(file)) return { ...DEFAULT_SKILL, ...JSON.parse(fs.readFileSync(file, 'utf-8')) }
  } catch {}
  return { ...DEFAULT_SKILL }
}

function saveSkill(skill: PlatformSkill): void {
  skill.lastUpdated = new Date().toISOString()
  fs.writeFileSync(skillPath(), JSON.stringify(skill, null, 2))
}

export function setupPlatformSkillIpc(): void {
  ipcMain.handle('platform-skill:get', () => loadSkill())

  ipcMain.handle('platform-skill:record-save', (_e, source: string) => {
    const skill = loadSkill()
    skill.searchQuality.savedCount++
    skill.searchQuality.topSources[source] = (skill.searchQuality.topSources[source] ?? 0) + 1
    saveSkill(skill)
  })

  ipcMain.handle('platform-skill:record-dismiss', (_e, source: string, topic?: string) => {
    const skill = loadSkill()
    skill.searchQuality.dismissedCount++
    if (topic && !skill.searchQuality.deprioritizedTopics.includes(topic)) {
      skill.searchQuality.deprioritizedTopics.push(topic)
    }
    saveSkill(skill)
  })

  ipcMain.handle('platform-skill:record-sentiment-override', (_e, original: number, corrected: number, context: string) => {
    const skill = loadSkill()
    skill.sentimentCalibration.overrides.push({ original, corrected, context, date: new Date().toISOString() })
    if (skill.sentimentCalibration.overrides.length > 50) skill.sentimentCalibration.overrides = skill.sentimentCalibration.overrides.slice(-50)
    saveSkill(skill)
  })

  ipcMain.handle('platform-skill:record-summary-edit', (_e, editDescription: string) => {
    const skill = loadSkill()
    if (!skill.summaryPreferences.commonEdits.includes(editDescription)) {
      skill.summaryPreferences.commonEdits.push(editDescription)
      if (skill.summaryPreferences.commonEdits.length > 20) skill.summaryPreferences.commonEdits = skill.summaryPreferences.commonEdits.slice(-20)
    }
    saveSkill(skill)
  })

  ipcMain.handle('platform-skill:record-entity-correction', (_e, type: 'false-positive' | 'missed', entity: string) => {
    const skill = loadSkill()
    if (type === 'false-positive' && !skill.entityCorrections.falsePositives.includes(entity)) {
      skill.entityCorrections.falsePositives.push(entity)
    } else if (type === 'missed' && !skill.entityCorrections.missedEntities.includes(entity)) {
      skill.entityCorrections.missedEntities.push(entity)
    }
    saveSkill(skill)
  })

  ipcMain.handle('platform-skill:increment-calls', () => {
    const skill = loadSkill()
    skill.totalCalls++
    saveSkill(skill)
  })
}
