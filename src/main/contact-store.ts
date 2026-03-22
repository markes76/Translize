import { app, ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export interface Contact {
  id: string
  name: string
  company?: string
  email?: string
  phone?: string
  source: string  // 'google-contacts' | 'google-sheets' | 'microsoft' | 'manual'
}

function contactsFile(): string {
  return path.join(app.getPath('userData'), 'contacts.json')
}

function loadContacts(): Contact[] {
  try {
    const raw = fs.readFileSync(contactsFile(), 'utf-8')
    return JSON.parse(raw) as Contact[]
  } catch {
    return []
  }
}

function saveContacts(contacts: Contact[]): void {
  fs.writeFileSync(contactsFile(), JSON.stringify(contacts, null, 2), 'utf-8')
}

function contactId(name: string, email?: string): string {
  return crypto.createHash('md5').update(`${name.toLowerCase()}|${(email ?? '').toLowerCase()}`).digest('hex').slice(0, 12)
}

// ── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSVRow(line: string): string[] {
  const cols: string[] = []
  let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      cols.push(cur.trim()); cur = ''
    } else {
      cur += ch
    }
  }
  cols.push(cur.trim())
  return cols
}

// Column name aliases for each field
const NAME_COLS   = ['name', 'full name', 'display name', 'contact name', 'first name + last name', 'given name']
const COMPANY_COLS = ['company', 'organization', 'organisation', 'account name', 'employer', 'company name']
const EMAIL_COLS  = ['email', 'email address', 'e-mail', 'e-mail address', 'primary email', 'work email']
const PHONE_COLS  = ['phone', 'phone number', 'mobile', 'mobile phone', 'work phone', 'primary phone']

function findCol(headers: string[], aliases: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const alias of aliases) {
    const idx = lower.findIndex(h => h === alias || h.startsWith(alias))
    if (idx !== -1) return idx
  }
  return -1
}

// Handle Outlook "First Name" + "Last Name" split columns
function buildName(row: string[], headers: string[]): string {
  const lower = headers.map(h => h.toLowerCase().trim())
  const firstIdx = lower.indexOf('first name')
  const lastIdx = lower.indexOf('last name')
  if (firstIdx !== -1 || lastIdx !== -1) {
    const first = firstIdx !== -1 ? (row[firstIdx] ?? '').trim() : ''
    const last = lastIdx !== -1 ? (row[lastIdx] ?? '').trim() : ''
    const combined = `${first} ${last}`.trim()
    if (combined) return combined
  }
  const nameIdx = findCol(headers, NAME_COLS)
  return nameIdx !== -1 ? (row[nameIdx] ?? '').trim() : ''
}

export function importCSV(csvText: string, source: string): Contact[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = parseCSVRow(lines[0])
  const companyIdx = findCol(headers, COMPANY_COLS)
  const emailIdx   = findCol(headers, EMAIL_COLS)
  const phoneIdx   = findCol(headers, PHONE_COLS)

  const imported: Contact[] = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i])
    const name = buildName(row, headers)
    if (!name) continue
    const company = companyIdx !== -1 ? (row[companyIdx] ?? '').trim() || undefined : undefined
    const email   = emailIdx   !== -1 ? (row[emailIdx]   ?? '').trim() || undefined : undefined
    const phone   = phoneIdx   !== -1 ? (row[phoneIdx]   ?? '').trim() || undefined : undefined
    imported.push({ id: contactId(name, email), name, company, email, phone, source })
  }
  return imported
}

// ── vCard parsing ────────────────────────────────────────────────────────────

export function importVCF(vcfText: string, source: string): Contact[] {
  const contacts: Contact[] = []
  // Split into individual vCards
  const cards = vcfText.split(/BEGIN:VCARD/i).slice(1)

  for (const card of cards) {
    let name = '', company = '', email = '', phone = ''

    const lines = card.split(/\r?\n/)
    for (const line of lines) {
      const upper = line.toUpperCase()
      if (upper.startsWith('FN:') || upper.startsWith('FN;')) {
        // FN;CHARSET=UTF-8:John Smith  OR  FN:John Smith
        name = line.split(':').slice(1).join(':').trim()
      } else if (upper.startsWith('ORG:') || upper.startsWith('ORG;')) {
        company = line.split(':').slice(1).join(':').split(';')[0].trim()
      } else if (upper.startsWith('EMAIL') && !email) {
        email = line.split(':').slice(1).join(':').trim()
      } else if (upper.startsWith('TEL') && !phone) {
        phone = line.split(':').slice(1).join(':').trim()
      }
    }

    if (!name) continue
    contacts.push({
      id: contactId(name, email),
      name,
      company: company || undefined,
      email: email || undefined,
      phone: phone || undefined,
      source
    })
  }
  return contacts
}

// ── IPC setup ────────────────────────────────────────────────────────────────

export function setupContactIpc(): void {
  ipcMain.removeHandler('contact:list')
  ipcMain.handle('contact:list', () => loadContacts())

  ipcMain.removeHandler('contact:import-csv')
  ipcMain.handle('contact:import-csv', (_e, csvText: string, source: string) => {
    const existing = loadContacts()
    const existingIds = new Set(existing.map(c => c.id))
    const incoming = importCSV(csvText, source)
    const deduped = incoming.filter(c => !existingIds.has(c.id))
    saveContacts([...existing, ...deduped])
    return { count: deduped.length, total: existing.length + deduped.length }
  })

  ipcMain.removeHandler('contact:import-vcf')
  ipcMain.handle('contact:import-vcf', (_e, vcfText: string, source: string) => {
    const existing = loadContacts()
    const existingIds = new Set(existing.map(c => c.id))
    const incoming = importVCF(vcfText, source)
    const deduped = incoming.filter(c => !existingIds.has(c.id))
    saveContacts([...existing, ...deduped])
    return { count: deduped.length, total: existing.length + deduped.length }
  })

  ipcMain.removeHandler('contact:delete')
  ipcMain.handle('contact:delete', (_e, id: string) => {
    const contacts = loadContacts().filter(c => c.id !== id)
    saveContacts(contacts)
    return { ok: true }
  })

  ipcMain.removeHandler('contact:clear-source')
  ipcMain.handle('contact:clear-source', (_e, source: string) => {
    const contacts = loadContacts().filter(c => c.source !== source)
    saveContacts(contacts)
    return { ok: true }
  })

  // File picker + auto-import in one step
  ipcMain.removeHandler('contact:pick-and-import')
  ipcMain.handle('contact:pick-and-import', async (_e, source: string) => {
    const result = await dialog.showOpenDialog({
      title: `Import ${source} contacts`,
      filters: [
        { name: 'Contact files', extensions: ['csv', 'vcf', 'txt'] },
        { name: 'CSV', extensions: ['csv'] },
        { name: 'vCard', extensions: ['vcf'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths.length) return { canceled: true }

    const filePath = result.filePaths[0]
    const text = fs.readFileSync(filePath, 'utf-8')
    const isVcf = filePath.toLowerCase().endsWith('.vcf') || text.trimStart().toUpperCase().startsWith('BEGIN:VCARD')

    const existing = loadContacts()
    const existingIds = new Set(existing.map(c => c.id))
    const incoming = isVcf ? importVCF(text, source) : importCSV(text, source)
    const deduped = incoming.filter(c => !existingIds.has(c.id))
    saveContacts([...existing, ...deduped])
    return { count: deduped.length, total: existing.length + deduped.length, canceled: false }
  })
}
