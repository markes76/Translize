import { ipcMain } from 'electron'
import { indexDocument, queryVectors, getIndexStatus, QueryResult } from './vector-store'
import { keychainGet } from './keychain'

let indexingInProgress = false

export interface SmartQueryResult {
  question: string
  answer: string
  source: string
  confidence: 'high' | 'medium' | 'low'
}

async function gpt(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = keychainGet('openai-api-key')
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.1,
      max_tokens: 300
    })
  })

  if (!resp.ok) throw new Error(`GPT API error: ${resp.status}`)
  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  return data.choices[0]?.message?.content ?? ''
}

async function detectQuestion(transcript: string): Promise<string | null> {
  const result = await gpt(
    `You analyze conversation transcripts to detect questions. If someone in the transcript is asking a question (directly or indirectly), extract the core question as a clear, searchable query. If no question is being asked, respond with exactly "NONE".

Rules:
- Look for direct questions ("What is...?", "How does...?", "Can you tell me...?")
- Look for indirect questions ("I'm wondering about...", "I'd like to know...", "Tell me about...")
- Look for information-seeking statements ("I need details on...", "Explain the...")
- Extract just the question/query, not the surrounding conversation
- Respond with the extracted question OR "NONE"`,
    transcript
  )

  const trimmed = result.trim()
  if (trimmed === 'NONE' || trimmed.length < 5) return null
  return trimmed
}

async function extractAnswer(question: string, chunks: QueryResult[]): Promise<SmartQueryResult | null> {
  if (chunks.length === 0) return null

  const context = chunks.map((c, i) => `[Source: ${c.source}]\n${c.text}`).join('\n\n---\n\n')
  const bestSource = chunks[0].source
  const bestScore = chunks[0].score

  const answer = await gpt(
    `You are a call assistant. Someone asked a question during a live call. You have document excerpts that may contain the answer. Provide a direct, concise answer (1-3 sentences max) that the user can read at a glance while on a call. If the documents don't contain a clear answer, say "Not found in documents."

Be specific and direct. No filler. The person needs to respond to whoever they're speaking with RIGHT NOW.`,
    `Question: ${question}\n\nDocument excerpts:\n${context}`
  )

  const trimmed = answer.trim()
  if (!trimmed || trimmed.includes('Not found in documents')) return null

  const confidence = bestScore > 0.6 ? 'high' : bestScore > 0.4 ? 'medium' : 'low'

  return { question, answer: trimmed, source: bestSource, confidence }
}

export function setupKnowledgeBaseIpc(): void {
  ipcMain.handle('knowledge:load-doc', async (_e, sessionId: string, filePath: string) => {
    try {
      indexingInProgress = true
      const chunks = await indexDocument(sessionId, filePath)
      indexingInProgress = false
      return { ok: true, chunks }
    } catch (err) {
      indexingInProgress = false
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('knowledge:query', async (_e, sessionId: string, queryText: string): Promise<QueryResult[]> => {
    if (!sessionId || !queryText) return []
    try {
      return await queryVectors(sessionId, queryText, 3)
    } catch (err) {
      console.error('[Knowledge] query failed:', err)
      return []
    }
  })

  ipcMain.handle('knowledge:smart-query', async (_e, sessionId: string, transcript: string): Promise<SmartQueryResult | null> => {
    if (!sessionId || !transcript || transcript.length < 10) return null

    try {
      const question = await detectQuestion(transcript)
      if (!question) return null

      console.log('[Knowledge] Question detected:', question)

      const chunks = await queryVectors(sessionId, question, 5)
      if (chunks.length === 0) return null

      const result = await extractAnswer(question, chunks)
      if (result) {
        console.log('[Knowledge] Answer found from:', result.source)
      }
      return result
    } catch (err) {
      console.error('[Knowledge] smart-query failed:', err)
      return null
    }
  })

  ipcMain.handle('knowledge:detect-question', async (_e, transcript: string): Promise<string | null> => {
    if (!transcript || transcript.length < 10) return null
    try {
      return await detectQuestion(transcript)
    } catch {
      return null
    }
  })

  // Direct ask — skips detectQuestion, takes a literal user question and answers from vectors
  ipcMain.handle('knowledge:ask', async (_e, sessionId: string, question: string): Promise<SmartQueryResult | null> => {
    if (!sessionId || !question || question.length < 3) return null
    try {
      const chunks = await queryVectors(sessionId, question, 5)
      if (chunks.length === 0) return null
      return await extractAnswer(question, chunks)
    } catch (err) {
      console.error('[Knowledge] ask failed:', err)
      return null
    }
  })

  ipcMain.handle('knowledge:status', (_e, sessionId: string) => {
    if (!sessionId) return { documentCount: 0, chunkCount: 0, indexing: false }
    const status = getIndexStatus(sessionId)
    return { ...status, indexing: indexingInProgress }
  })
}
