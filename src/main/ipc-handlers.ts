import { app, ipcMain, shell, systemPreferences } from 'electron'
import { keychainGet, keychainSet, keychainDelete } from './keychain'
import { readConfig, writeConfig } from './config'
import fs from 'fs'
import path from 'path'

export function setupIpcHandlers(): void {
  // Keychain
  ipcMain.handle('keychain:get', (_e, key: string) => keychainGet(key))
  ipcMain.handle('keychain:set', (_e, key: string, value: string) => keychainSet(key, value))
  ipcMain.handle('keychain:delete', (_e, key: string) => keychainDelete(key))

  // Config
  ipcMain.handle('config:read', () => readConfig())
  ipcMain.handle('config:write', (_e, updates: Record<string, unknown>) => writeConfig(updates as any))

  // Permissions
  ipcMain.handle('permissions:mic-status', () =>
    systemPreferences.getMediaAccessStatus('microphone')
  )
  ipcMain.handle('permissions:mic-request', async () => {
    return systemPreferences.askForMediaAccess('microphone')
  })
  ipcMain.handle('permissions:screen-status', () =>
    systemPreferences.getMediaAccessStatus('screen')
  )

  // Open system settings to a specific pane
  ipcMain.handle('shell:open-privacy-settings', async (_e, pane: string) => {
    await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`)
  })

  // Open external URL
  ipcMain.handle('shell:open-url', async (_e, url: string) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      await shell.openExternal(url)
    }
  })

  // Reset app -- clears all user data and restarts
  ipcMain.handle('app:reset', async () => {
    const userData = app.getPath('userData')
    const filesToDelete = ['config.json', 'sessions.json', 'keychain.enc']
    const dirsToDelete = ['sessions', 'python-venv']

    for (const f of filesToDelete) {
      const p = path.join(userData, f)
      if (fs.existsSync(p)) fs.unlinkSync(p)
    }
    for (const d of dirsToDelete) {
      const p = path.join(userData, d)
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
    }

    // Clear NLM auth
    const nlmDir = path.join(process.env.HOME ?? '', '.notebooklm-mcp-cli')
    if (fs.existsSync(nlmDir)) fs.rmSync(nlmDir, { recursive: true, force: true })

    app.relaunch()
    app.exit(0)
  })
}
