import { ipcMain } from 'electron'
import { keychainGet, keychainSet, keychainDelete } from './keychain'
import { readConfig, writeConfig } from './config'

async function testGeminiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (resp.ok) return { ok: true }
    return { ok: false, error: `API returned ${resp.status}` }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export function setupGeminiIpc(): void {
  ipcMain.handle('gemini:test-key', async (_e, apiKey: string) => {
    return await testGeminiKey(apiKey)
  })

  ipcMain.handle('gemini:set-key', (_e, apiKey: string) => {
    keychainSet('gemini-api-key', apiKey)
    return { ok: true }
  })

  ipcMain.handle('gemini:remove-key', () => {
    keychainDelete('gemini-api-key')
    return { ok: true }
  })

  ipcMain.handle('gemini:status', () => {
    const key = keychainGet('gemini-api-key')
    const config = readConfig()
    return {
      configured: !!key,
      audioBufferingEnabled: !!(config as any).audio_buffering_enabled
    }
  })

  ipcMain.handle('gemini:toggle-audio-buffering', (_e, enabled: boolean) => {
    writeConfig({ audio_buffering_enabled: enabled } as any)
    return { ok: true }
  })
}
