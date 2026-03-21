import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { keychainGet } from './keychain'
import { processDocument, fileHash, DocChunk } from './doc-processor'

interface StoredVector {
  text: string
  source: string
  chunkIndex: number
  embedding: number[]
}

interface VectorIndex {
  fileHashes: Record<string, string>
  vectors: StoredVector[]
}

export interface QueryResult {
  text: string
  source: string
  chunkIndex: number
  score: number
}

function indexPath(sessionId: string): string {
  return path.join(app.getPath('userData'), 'sessions', sessionId, 'vectors.json')
}

function loadIndex(sessionId: string): VectorIndex {
  const file = indexPath(sessionId)
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'))
    }
  } catch { /* corrupted file */ }
  return { fileHashes: {}, vectors: [] }
}

function saveIndex(sessionId: string, index: VectorIndex): void {
  const file = indexPath(sessionId)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(index))
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = keychainGet('openai-api-key')
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts
    })
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Embeddings API error: ${resp.status} ${err}`)
  }

  const data = await resp.json() as { data: Array<{ embedding: number[] }> }
  return data.data.map(d => d.embedding)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function indexDocument(sessionId: string, filePath: string): Promise<number> {
  const index = loadIndex(sessionId)
  const hash = fileHash(filePath)
  const source = path.basename(filePath)

  if (index.fileHashes[filePath] === hash) {
    return index.vectors.filter(v => v.source === source).length
  }

  // Remove old vectors for this file
  index.vectors = index.vectors.filter(v => v.source !== source)

  const chunks = await processDocument(filePath)
  if (chunks.length === 0) return 0

  // Embed in batches of 20
  const batchSize = 20
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const embeddings = await getEmbeddings(batch.map(c => c.text))
    for (let j = 0; j < batch.length; j++) {
      index.vectors.push({
        text: batch[j].text,
        source: batch[j].source,
        chunkIndex: batch[j].chunkIndex,
        embedding: embeddings[j]
      })
    }
  }

  index.fileHashes[filePath] = hash
  saveIndex(sessionId, index)
  return chunks.length
}

export async function queryVectors(sessionId: string, queryText: string, topK = 3): Promise<QueryResult[]> {
  const index = loadIndex(sessionId)
  if (index.vectors.length === 0) return []

  const [queryEmb] = await getEmbeddings([queryText])

  const scored = index.vectors.map(v => ({
    text: v.text,
    source: v.source,
    chunkIndex: v.chunkIndex,
    score: cosineSimilarity(queryEmb, v.embedding)
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).filter(r => r.score > 0.3)
}

export function removeDocument(sessionId: string, filePath: string): void {
  const index = loadIndex(sessionId)
  const source = path.basename(filePath)
  index.vectors = index.vectors.filter(v => v.source !== source)
  delete index.fileHashes[filePath]
  saveIndex(sessionId, index)
}

export function getIndexStatus(sessionId: string): { documentCount: number; chunkCount: number } {
  const index = loadIndex(sessionId)
  const sources = new Set(index.vectors.map(v => v.source))
  return { documentCount: sources.size, chunkCount: index.vectors.length }
}
