import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export interface DocChunk {
  text: string
  source: string
  page?: number
  chunkIndex: number
}

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 50

function splitIntoChunks(text: string, source: string): DocChunk[] {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: DocChunk[] = []
  let i = 0
  let chunkIndex = 0

  while (i < words.length) {
    const end = Math.min(i + CHUNK_SIZE, words.length)
    const chunkText = words.slice(i, end).join(' ')
    if (chunkText.trim().length > 20) {
      chunks.push({ text: chunkText, source, chunkIndex })
      chunkIndex++
    }
    i += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks
}

async function extractPdf(filePath: string): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse(buffer)
  return data.text
}

async function extractDocx(filePath: string): Promise<string> {
  const mammoth = await import('mammoth')
  const buffer = fs.readFileSync(filePath)
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

function extractText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

export async function processDocument(filePath: string): Promise<DocChunk[]> {
  const ext = path.extname(filePath).toLowerCase()
  const fileName = path.basename(filePath)
  let text: string

  switch (ext) {
    case '.pdf':
      text = await extractPdf(filePath)
      break
    case '.docx':
    case '.doc':
      text = await extractDocx(filePath)
      break
    case '.txt':
    case '.md':
    case '.markdown':
      text = extractText(filePath)
      break
    default:
      throw new Error(`Unsupported file type: ${ext}`)
  }

  return splitIntoChunks(text, fileName)
}

export function fileHash(filePath: string): string {
  const content = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
}

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.markdown']
