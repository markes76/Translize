import fs from 'fs'
import path from 'path'
import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import crypto from 'crypto'

export interface CallRecord {
  date: string
  durationMinutes?: number
  transcriptFile?: string
  summaryFile?: string
  sentimentScore?: number
  sentimentLabel?: string
  sentimentFile?: string
  tags?: string[]
  privateNotes?: string
  contactName?: string
  segmentCount?: number
  skillId?: string
}

export interface Session {
  id: string
  name?: string
  docPaths: string[]
  notebookId?: string
  mode: 'local' | 'notebook' | 'both'
  calls: CallRecord[]
  createdAt: string
  updatedAt: string
}

function sessionsFile(): string {
  return path.join(app.getPath('userData'), 'sessions.json')
}

function sessionDir(id: string): string {
  return path.join(app.getPath('userData'), 'sessions', id)
}

function readSessions(): Session[] {
  try {
    const file = sessionsFile()
    if (!fs.existsSync(file)) return []
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return []
  }
}

function writeSessions(sessions: Session[]): void {
  const file = sessionsFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(sessions, null, 2))
}

export function createSession(data: {
  name?: string
  docPaths?: string[]
  notebookId?: string
  mode?: 'local' | 'notebook' | 'both'
}): Session {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const session: Session = {
    id,
    name: data.name,
    docPaths: data.docPaths ?? [],
    notebookId: data.notebookId,
    mode: data.mode ?? 'local',
    calls: [],
    createdAt: now,
    updatedAt: now
  }
  fs.mkdirSync(sessionDir(id), { recursive: true })
  const sessions = readSessions()
  sessions.unshift(session)
  writeSessions(sessions)
  return session
}

export function listSessions(): Session[] {
  return readSessions()
}

export function getSession(id: string): Session | null {
  return readSessions().find(s => s.id === id) ?? null
}

export function updateSession(id: string, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): Session | null {
  const sessions = readSessions()
  const idx = sessions.findIndex(s => s.id === id)
  if (idx === -1) return null
  sessions[idx] = { ...sessions[idx], ...updates, updatedAt: new Date().toISOString() }
  writeSessions(sessions)
  return sessions[idx]
}

export function addCallToSession(id: string, call: CallRecord): Session | null {
  const sessions = readSessions()
  const idx = sessions.findIndex(s => s.id === id)
  if (idx === -1) return null
  sessions[idx].calls.push(call)
  sessions[idx].updatedAt = new Date().toISOString()
  writeSessions(sessions)
  return sessions[idx]
}

export function deleteSession(id: string): boolean {
  const sessions = readSessions()
  const idx = sessions.findIndex(s => s.id === id)
  if (idx === -1) return false
  sessions.splice(idx, 1)
  writeSessions(sessions)
  const dir = sessionDir(id)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return true
}

export function getSessionDir(id: string): string {
  const dir = sessionDir(id)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function setupSessionIpc(): void {
  ipcMain.handle('session:create', (_e, data) => createSession(data))
  ipcMain.handle('session:list', () => listSessions())
  ipcMain.handle('session:get', (_e, id: string) => getSession(id))
  ipcMain.handle('session:update', (_e, id: string, updates) => updateSession(id, updates))
  ipcMain.handle('session:delete', (_e, id: string) => deleteSession(id))
  ipcMain.handle('session:add-call', (_e, id: string, call: CallRecord) => addCallToSession(id, call))

  ipcMain.handle('session:update-call', (_e, sessionId: string, callIndex: number, updates: Partial<CallRecord>) => {
    const sessions = readSessions()
    const idx = sessions.findIndex(s => s.id === sessionId)
    if (idx === -1 || callIndex < 0 || callIndex >= sessions[idx].calls.length) return null
    sessions[idx].calls[callIndex] = { ...sessions[idx].calls[callIndex], ...updates }
    sessions[idx].updatedAt = new Date().toISOString()
    writeSessions(sessions)
    return sessions[idx]
  })

  ipcMain.handle('session:save-sentiment', (_e, sessionId: string, sentimentData: Record<string, unknown>) => {
    const dir = sessionDir(sessionId)
    fs.mkdirSync(dir, { recursive: true })
    const filename = `sentiment-${Date.now()}.json`
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(sentimentData, null, 2))
    return { ok: true, filename }
  })

  ipcMain.handle('session:load-sentiment', (_e, sessionId: string, filename: string) => {
    const file = path.join(sessionDir(sessionId), filename)
    if (!fs.existsSync(file)) return null
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return null }
  })

  // Conversation Skills storage
  ipcMain.handle('skill:save', (_e, skill: Record<string, unknown>) => {
    const skillsDir = path.join(app.getPath('userData'), 'skills')
    fs.mkdirSync(skillsDir, { recursive: true })
    const skillId = (skill.skillId as string) ?? `skill-${Date.now()}`
    const file = path.join(skillsDir, `${skillId}.json`)
    fs.writeFileSync(file, JSON.stringify(skill, null, 2))
    return { ok: true, skillId }
  })

  ipcMain.handle('skill:load', (_e, skillId: string) => {
    const file = path.join(app.getPath('userData'), 'skills', `${skillId}.json`)
    if (!fs.existsSync(file)) return null
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return null }
  })

  ipcMain.handle('skill:list', () => {
    const skillsDir = path.join(app.getPath('userData'), 'skills')
    if (!fs.existsSync(skillsDir)) return []
    try {
      return fs.readdirSync(skillsDir).filter(f => f.endsWith('.json')).map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(skillsDir, f), 'utf-8')) } catch { return null }
      }).filter(Boolean)
    } catch { return [] }
  })

  ipcMain.handle('skill:find', (_e, contactName: string) => {
    const skillsDir = path.join(app.getPath('userData'), 'skills')
    if (!fs.existsSync(skillsDir)) return null
    const lower = contactName.toLowerCase().trim()
    try {
      const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.json'))
      for (const f of files) {
        const skill = JSON.parse(fs.readFileSync(path.join(skillsDir, f), 'utf-8'))
        const name = (skill.contact?.name ?? '').toLowerCase()
        const company = (skill.contact?.company ?? '').toLowerCase()
        if (name.includes(lower) || lower.includes(name.split(' ')[0]) || company.includes(lower)) return skill
      }
    } catch {}
    return null
  })

  ipcMain.handle('session:pick-documents', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return []
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Documents',
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'txt', 'md', 'markdown'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths
  })
}
