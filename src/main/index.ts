import { app, BrowserWindow, nativeTheme, session } from 'electron'
import path from 'path'
import os from 'os'
import { setupIpcHandlers } from './ipc-handlers'
import { setupAudioBridge, cleanupAudioBridge } from './audio-bridge'
import { setupSessionIpc } from './session-manager'
import { setupKnowledgeBaseIpc } from './knowledge-base'
import { setupMcpIpc, cleanupMcpServer } from './mcp-server-manager'
import { setupSpeakerIpc } from './speaker-detector'
import { setupTavilyIpc } from './tavily-search'
import { setupGeminiIpc } from './gemini-service'
import { setupPlatformSkillIpc } from './platform-skill'
import { setupAudioBufferIpc } from './audio-buffer'
import { setupContactIpc } from './contact-store'
import { setupRecordingIpc, purgeOldRecordings } from './recording-writer'
import { keychainGet } from './keychain'
import { readConfig } from './config'

// macOS version check: ScreenCaptureKit requires macOS 12.3 (Darwin 21.3)
function isMacOSSupported(): boolean {
  const release = os.release().split('.').map(Number)
  // Darwin 22.0 = macOS 13.0
  if (release[0] < 22) return false
  return true
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, '../../build/icon.icns'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Inject OpenAI auth headers for WebSocket connections (browser WS can't set custom headers)
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['wss://api.openai.com/*', 'https://api.openai.com/*'] },
    (details, callback) => {
      const key = keychainGet('openai-api-key')
      if (key) {
        callback({
          requestHeaders: {
            ...details.requestHeaders,
            Authorization: `Bearer ${key}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        })
      } else {
        callback({ requestHeaders: details.requestHeaders })
      }
    }
  )

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  setupIpcHandlers()
  setupSessionIpc()
  setupKnowledgeBaseIpc()
  setupMcpIpc()
  setupSpeakerIpc()
  setupTavilyIpc()
  setupGeminiIpc()
  setupPlatformSkillIpc()
  setupAudioBufferIpc()
  setupContactIpc()
  setupRecordingIpc()
  purgeOldRecordings()

  if (!isMacOSSupported()) {
    // Create minimal window to show the version error
    const errWin = new BrowserWindow({
      width: 600,
      height: 300,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    // Pass version info via query param — renderer reads it
    const release = os.release()
    if (process.env.NODE_ENV === 'development') {
      errWin.loadURL(`http://localhost:5173?macos_unsupported=1&release=${release}`)
    } else {
      errWin.loadFile(path.join(__dirname, '../renderer/index.html'), {
        query: { macos_unsupported: '1', release }
      })
    }
    return
  }

  createWindow()

  if (mainWindow) {
    setupAudioBridge(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      if (mainWindow) setupAudioBridge(mainWindow)
    }
  })
})

app.on('window-all-closed', () => {
  cleanupAudioBridge()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  cleanupAudioBridge()
  cleanupMcpServer()
})
