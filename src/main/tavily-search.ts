import { ipcMain } from 'electron'
import { keychainGet, keychainSet, keychainDelete } from './keychain'

export interface TavilyResult {
  title: string
  content: string
  url: string
  score: number
}

async function searchTavily(query: string): Promise<{ results: TavilyResult[]; answer?: string; error?: string }> {
  const apiKey = keychainGet('tavily-api-key')
  if (!apiKey) return { results: [], error: 'Tavily API key not configured' }

  try {
    const { tavily } = await import('@tavily/core')
    const client = tavily({ apiKey })
    const response = await client.search(query, {
      searchDepth: 'advanced',
      maxResults: 5,
      includeAnswer: true,
      topic: 'general'
    })

    const results: TavilyResult[] = (response.results ?? []).map((r: any) => ({
      title: r.title ?? '',
      content: r.content ?? '',
      url: r.url ?? '',
      score: r.score ?? 0
    }))

    return { results, answer: response.answer }
  } catch (err) {
    return { results: [], error: (err as Error).message }
  }
}

async function testTavilyKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { tavily } = await import('@tavily/core')
    const client = tavily({ apiKey })
    await client.search('test', { maxResults: 1 })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export function setupTavilyIpc(): void {
  ipcMain.handle('tavily:search', async (_e, query: string) => {
    return await searchTavily(query)
  })

  ipcMain.handle('tavily:test-key', async (_e, apiKey: string) => {
    return await testTavilyKey(apiKey)
  })

  ipcMain.handle('tavily:set-key', (_e, apiKey: string) => {
    keychainSet('tavily-api-key', apiKey)
    return { ok: true }
  })

  ipcMain.handle('tavily:remove-key', () => {
    keychainDelete('tavily-api-key')
    return { ok: true }
  })

  ipcMain.handle('tavily:status', () => {
    const key = keychainGet('tavily-api-key')
    return { configured: !!key, hasKey: !!key }
  })
}
