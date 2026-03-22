import { app, ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export interface Contact {
  id: string
  name: string
  firstName?: string
  lastName?: string
  company?: string
  jobTitle?: string
  email?: string
  email2?: string
  phone?: string
  phone2?: string
  address?: string
  city?: string
  state?: string
  country?: string
  website?: string
  birthday?: string
  notes?: string
  source: string  // 'google-contacts' | 'google-sheets' | 'microsoft' | 'manual'
}

function contactsFile(): string {
  return path.join(app.getPath('userData'), 'contacts.json')
}

export function loadContacts(): Contact[] {
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

// Column name aliases — ordered by priority (first match wins)
// Covers: Google Contacts CSV, Google CSV export, Outlook CSV, generic spreadsheets
const FIRST_NAME_COLS = ['given name', 'first name', 'firstname', 'forename']
const LAST_NAME_COLS  = ['family name', 'last name', 'lastname', 'surname']
const NAME_COLS       = ['name', 'full name', 'display name', 'contact name', 'first name + last name']
const COMPANY_COLS    = ['company', 'organization', 'organisation', 'account name', 'employer', 'company name']
const JOB_TITLE_COLS  = ['job title', 'title', 'position', 'role', 'occupation']
const EMAIL_COLS      = ['e-mail 1 - value', 'email address', 'e-mail address', 'primary email', 'work email', 'email']
const EMAIL2_COLS     = ['e-mail 2 - value', 'email 2', 'home email', 'personal email', 'other email']
const PHONE_COLS      = ['phone 1 - value', 'business phone', 'work phone', 'primary phone', 'phone number', 'mobile', 'mobile phone', 'phone']
const PHONE2_COLS     = ['phone 2 - value', 'mobile phone', 'home phone', 'other phone', 'fax', 'phone 2']
const ADDRESS_COLS    = ['address 1 - street', 'business street', 'home street', 'street address', 'address', 'street']
const CITY_COLS       = ['address 1 - city', 'business city', 'home city', 'city']
const STATE_COLS      = ['address 1 - region', 'business state', 'home state', 'state', 'province', 'region']
const COUNTRY_COLS    = ['address 1 - country', 'business country', 'home country', 'country', 'country/region']
const WEBSITE_COLS    = ['web page', 'website', 'url', 'homepage', 'web site']
const BIRTHDAY_COLS   = ['birthday', 'date of birth', 'birth date', 'dob']
const NOTES_COLS      = ['notes', 'description', 'comments', 'memo', 'other']

function findCol(headers: string[], aliases: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const alias of aliases) {
    const idx = lower.findIndex(h => h === alias || h.startsWith(alias))
    if (idx !== -1) return idx
  }
  return -1
}

function findColExact(headers: string[], aliases: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const alias of aliases) {
    const idx = lower.indexOf(alias)
    if (idx !== -1) return idx
  }
  return -1
}

function col(row: string[], idx: number): string | undefined {
  return idx !== -1 ? (row[idx] ?? '').trim() || undefined : undefined
}

// A valid name has at most 1 comma (e.g. "Smith, John") and no semicolons.
// Anything with more commas is a misparse of an address or structured field.
function isValidName(s: string): boolean {
  if (!s) return false
  const commas = (s.match(/,/g) || []).length
  const semis  = (s.match(/;/g) || []).length
  return commas <= 1 && semis === 0
}

// Strip leading punctuation artifacts like ". Reznik"
function cleanName(s: string): string {
  return s.replace(/^[\s.,;:!?]+/, '').trim()
}

// Handle split first/last name columns, fallback to full-name column
function buildName(row: string[], headers: string[]): { name: string; firstName?: string; lastName?: string } {
  const firstIdx = findColExact(headers, FIRST_NAME_COLS)
  const lastIdx  = findColExact(headers, LAST_NAME_COLS)

  let firstName = firstIdx !== -1 ? (row[firstIdx] ?? '').trim() : undefined
  let lastName  = lastIdx  !== -1 ? (row[lastIdx]  ?? '').trim() : undefined

  // Reject if the "first name" column contains a structured/address value
  if (firstName && !isValidName(firstName)) firstName = undefined
  if (lastName  && !isValidName(lastName))  lastName  = undefined

  if (firstName || lastName) {
    const raw = `${firstName ?? ''} ${lastName ?? ''}`.trim()
    const name = cleanName(raw)
    return { name, firstName: firstName ? cleanName(firstName) : undefined, lastName: lastName ? cleanName(lastName) : undefined }
  }

  const nameIdx = findCol(headers, NAME_COLS)
  const raw = nameIdx !== -1 ? (row[nameIdx] ?? '').trim() : ''
  const name = cleanName(raw)
  if (!isValidName(name)) return { name: '' }
  return { name }
}

export function importCSV(csvText: string, source: string): Contact[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = parseCSVRow(lines[0])

  // Resolve column indices once
  const companyIdx  = findCol(headers, COMPANY_COLS)
  const titleIdx    = findColExact(headers, JOB_TITLE_COLS)
  const emailIdx    = findCol(headers, EMAIL_COLS)
  const email2Idx   = findCol(headers, EMAIL2_COLS)
  const phoneIdx    = findCol(headers, PHONE_COLS)
  const phone2Idx   = findCol(headers, PHONE2_COLS)
  const addrIdx     = findCol(headers, ADDRESS_COLS)
  const cityIdx     = findCol(headers, CITY_COLS)
  const stateIdx    = findCol(headers, STATE_COLS)
  const countryIdx  = findCol(headers, COUNTRY_COLS)
  const webIdx      = findCol(headers, WEBSITE_COLS)
  const bdayIdx     = findColExact(headers, BIRTHDAY_COLS)
  const notesIdx    = findCol(headers, NOTES_COLS)

  const imported: Contact[] = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i])
    const { name, firstName, lastName } = buildName(row, headers)
    if (!name) continue

    const email = col(row, emailIdx)
    imported.push({
      id: contactId(name, email),
      name,
      firstName,
      lastName,
      company:  col(row, companyIdx),
      jobTitle: col(row, titleIdx),
      email,
      email2:   col(row, email2Idx),
      phone:    col(row, phoneIdx),
      phone2:   col(row, phone2Idx),
      address:  col(row, addrIdx),
      city:     col(row, cityIdx),
      state:    col(row, stateIdx),
      country:  col(row, countryIdx),
      website:  col(row, webIdx),
      birthday: col(row, bdayIdx),
      notes:    col(row, notesIdx),
      source
    })
  }
  return imported
}

// ── vCard parsing ────────────────────────────────────────────────────────────

export function importVCF(vcfText: string, source: string): Contact[] {
  const contacts: Contact[] = []
  const cards = vcfText.split(/BEGIN:VCARD/i).slice(1)

  for (const card of cards) {
    let name = '', firstName = '', lastName = '', company = '', jobTitle = ''
    let email = '', email2 = '', phone = '', phone2 = ''
    let address = '', city = '', state = '', country = ''
    let website = '', birthday = '', notes = ''
    let emailCount = 0, phoneCount = 0

    // Unfold vCard lines (RFC 6350: continuation lines start with whitespace)
    const rawLines = card.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)

    for (const line of rawLines) {
      const upper = line.toUpperCase()
      const value = line.split(':').slice(1).join(':').trim()

      if (upper.startsWith('FN:') || upper.startsWith('FN;')) {
        name = value
      } else if (upper.startsWith('N:') || upper.startsWith('N;')) {
        // N field: LastName;FirstName;Middle;Prefix;Suffix
        const parts = value.split(';')
        lastName  = (parts[0] ?? '').trim()
        firstName = (parts[1] ?? '').trim()
      } else if (upper.startsWith('ORG:') || upper.startsWith('ORG;')) {
        company = value.split(';')[0].trim()
      } else if (upper.startsWith('TITLE:') || upper.startsWith('TITLE;')) {
        jobTitle = value
      } else if (upper.startsWith('EMAIL') && emailCount < 2) {
        emailCount++
        if (emailCount === 1) email = value
        else email2 = value
      } else if (upper.startsWith('TEL') && phoneCount < 2) {
        phoneCount++
        if (phoneCount === 1) phone = value
        else phone2 = value
      } else if (upper.startsWith('ADR:') || upper.startsWith('ADR;')) {
        // ADR: pobox;extended;street;city;state;zip;country
        const parts = value.split(';')
        address = (parts[2] ?? '').trim()
        city    = (parts[3] ?? '').trim()
        state   = (parts[4] ?? '').trim()
        country = (parts[6] ?? '').trim()
      } else if (upper.startsWith('URL:') || upper.startsWith('URL;')) {
        website = value
      } else if (upper.startsWith('BDAY:') || upper.startsWith('BDAY;')) {
        birthday = value
      } else if (upper.startsWith('NOTE:') || upper.startsWith('NOTE;')) {
        notes = value
      }
    }

    if (!name && (firstName || lastName)) {
      name = `${firstName} ${lastName}`.trim()
    }
    if (!name) continue

    contacts.push({
      id: contactId(name, email),
      name,
      firstName: firstName || undefined,
      lastName:  lastName  || undefined,
      company:   company   || undefined,
      jobTitle:  jobTitle  || undefined,
      email:     email     || undefined,
      email2:    email2    || undefined,
      phone:     phone     || undefined,
      phone2:    phone2    || undefined,
      address:   address   || undefined,
      city:      city      || undefined,
      state:     state     || undefined,
      country:   country   || undefined,
      website:   website   || undefined,
      birthday:  birthday  || undefined,
      notes:     notes     || undefined,
      source
    })
  }
  return contacts
}

// ── Data migration ────────────────────────────────────────────────────────────

// Remove contacts whose names are parser artifacts (comma/semicolon-heavy garbage).
// Runs once at startup to clean any data imported before name validation was added.
function migrateCleanCorruptNames(): void {
  const contacts = loadContacts()
  const clean = contacts.filter(c => isValidName(c.name))
  if (clean.length < contacts.length) {
    saveContacts(clean)
    console.log(`[contacts] Removed ${contacts.length - clean.length} corrupt-name entries, ${clean.length} remain`)
  }
}

// ── IPC setup ────────────────────────────────────────────────────────────────

export function setupContactIpc(): void {
  // Auto-clean corrupt entries from pre-validation imports
  try { migrateCleanCorruptNames() } catch {}

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
