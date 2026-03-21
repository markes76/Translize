import { app, ipcMain, BrowserWindow, shell } from 'electron'
import { spawn, execSync, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import readline from 'readline'

let mcpProcess: ChildProcess | null = null
let restartCount = 0
let ready = false
let pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let nextId = 1

const MAX_RESTARTS = 3

function venvDir(): string {
  return path.join(app.getPath('userData'), 'python-venv')
}

function venvBin(cmd: string): string {
  return path.join(venvDir(), 'bin', cmd)
}

function isVenvReady(): boolean {
  return fs.existsSync(venvBin('python3'))
}

function isNlmInstalled(): boolean {
  return fs.existsSync(venvBin('nlm'))
}

function isAuthenticated(): boolean {
  const cookieFile = path.join(process.env.HOME ?? '', '.notebooklm-mcp-cli', 'profiles', 'default', 'cookies.json')
  return fs.existsSync(cookieFile)
}

function sendProgress(msg: string): void {
  const win = BrowserWindow.getFocusedWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('notebooklm:setup-progress', msg)
  }
  console.log('[NLM Setup]', msg)
}

function findPython311Plus(): string {
  const candidates = [
    '/opt/homebrew/bin/python3.13',
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3.11',
    '/usr/local/bin/python3.13',
    '/usr/local/bin/python3.12',
    '/usr/local/bin/python3.11'
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }

  // Check if default python3 is 3.11+
  try {
    const version = execSync('python3 --version', { timeout: 5000 }).toString().trim()
    const match = version.match(/(\d+)\.(\d+)/)
    if (match && (parseInt(match[1]) > 3 || (parseInt(match[1]) === 3 && parseInt(match[2]) >= 11))) {
      return 'python3'
    }
  } catch { /* ignore */ }

  return ''
}

async function setupPythonEnv(): Promise<{ ok: boolean; error?: string }> {
  const venv = venvDir()

  const pythonBin = findPython311Plus()
  if (!pythonBin) {
    return {
      ok: false,
      error: 'Python 3.11 or later is required for NotebookLM. Install it via: brew install python@3.13'
    }
  }

  try {
    // Step 1: Create venv with Python 3.11+
    if (!isVenvReady()) {
      sendProgress(`Creating Python environment (${pythonBin})...`)
      execSync(`"${pythonBin}" -m venv "${venv}"`, { timeout: 60000 })
    }

    // Step 2: Upgrade pip
    sendProgress('Upgrading pip...')
    execSync(`"${venvBin('python3')}" -m pip install --upgrade pip --quiet`, {
      timeout: 60000,
      env: { ...process.env, VIRTUAL_ENV: venv }
    })

    // Step 3: Install notebooklm-mcp-cli
    sendProgress('Installing NotebookLM CLI & MCP server...')
    execSync(`"${venvBin('python3')}" -m pip install notebooklm-mcp-cli --quiet`, {
      timeout: 180000,
      env: { ...process.env, VIRTUAL_ENV: venv }
    })

    sendProgress('Installation complete!')
    return { ok: true }
  } catch (err) {
    const msg = (err as Error).message
    console.error('[NLM Setup] Failed:', msg)
    return { ok: false, error: msg }
  }
}

async function runNlmLogin(): Promise<{ ok: boolean; error?: string }> {
  if (!isNlmInstalled()) {
    return { ok: false, error: 'NotebookLM CLI not installed. Run setup first.' }
  }

  sendProgress('Opening browser for Google sign-in...')

  return new Promise((resolve) => {
    const loginProcess = spawn(venvBin('nlm'), ['login'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, VIRTUAL_ENV: venvDir(), PATH: `${venvDir()}/bin:${process.env.PATH}` }
    })

    let output = ''
    let errOutput = ''

    loginProcess.stdout?.on('data', (d: Buffer) => {
      output += d.toString()
      console.log('[NLM Login]', d.toString().trim())
    })

    loginProcess.stderr?.on('data', (d: Buffer) => {
      errOutput += d.toString()
      console.error('[NLM Login]', d.toString().trim())
    })

    loginProcess.on('exit', (code) => {
      if (code === 0) {
        resolve({ ok: true })
      } else {
        resolve({ ok: false, error: errOutput || `Login exited with code ${code}` })
      }
    })

    // Timeout after 120s
    setTimeout(() => {
      loginProcess.kill()
      resolve({ ok: false, error: 'Login timed out. Try running "nlm login" manually in your terminal.' })
    }, 120000)
  })
}

function startMcpServer(): void {
  if (mcpProcess) return

  if (!isNlmInstalled()) {
    console.error('[NLM] notebooklm-mcp not installed. Run setup first.')
    return
  }

  ready = false

  console.log('[NLM] Starting MCP server...')
  mcpProcess = spawn(venvBin('notebooklm-mcp'), [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, VIRTUAL_ENV: venvDir(), PATH: `${venvDir()}/bin:${process.env.PATH}` }
  })

  const rl = readline.createInterface({ input: mcpProcess.stdout! })
  rl.on('line', (line: string) => {
    try {
      const msg = JSON.parse(line)

      if (msg.method === 'ready' || (msg.result && !msg.id)) {
        ready = true
        console.log('[NLM] MCP server ready')
        return
      }

      if (msg.id != null && pendingRequests.has(msg.id)) {
        const { resolve, reject } = pendingRequests.get(msg.id)!
        pendingRequests.delete(msg.id)
        if (msg.error) {
          reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
        } else {
          resolve(msg.result)
        }
      }
    } catch { /* not JSON */ }
  })

  mcpProcess.stderr!.on('data', (d: Buffer) => {
    const msg = d.toString().trim()
    if (msg) console.error('[NLM]', msg)
  })

  mcpProcess.on('exit', (code) => {
    console.log(`[NLM] MCP server exited with code ${code}`)
    mcpProcess = null
    ready = false

    for (const [, { reject }] of pendingRequests) {
      reject(new Error('MCP server exited'))
    }
    pendingRequests.clear()

    if (restartCount < MAX_RESTARTS) {
      restartCount++
      setTimeout(startMcpServer, 2000)
    }
  })

  // Mark ready after a short delay if the server doesn't send a ready signal
  setTimeout(() => {
    if (mcpProcess && !ready) {
      ready = true
      console.log('[NLM] MCP server assumed ready (timeout)')
    }
  }, 5000)
}

async function callMcp(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  if (!mcpProcess || !ready) {
    throw new Error('MCP server not ready')
  }

  const id = nextId++
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error('MCP request timed out'))
    }, 30000)

    pendingRequests.set(id, {
      resolve: (v) => { clearTimeout(timeout); resolve(v) },
      reject: (e) => { clearTimeout(timeout); reject(e) }
    })

    const request = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    mcpProcess!.stdin!.write(request)
  })
}

// Run nlm CLI commands directly (simpler than MCP for some operations)
function runNlmCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(venvBin('nlm'), args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, VIRTUAL_ENV: venvDir(), PATH: `${venvDir()}/bin:${process.env.PATH}` }
    })

    let output = ''
    let errOutput = ''

    proc.stdout?.on('data', (d: Buffer) => { output += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { errOutput += d.toString() })

    proc.on('exit', (code) => {
      if (code === 0) {
        resolve(output.trim())
      } else {
        reject(new Error(errOutput || `nlm exited with code ${code}`))
      }
    })

    setTimeout(() => { proc.kill(); reject(new Error('Command timed out')) }, 30000)
  })
}

export function setupMcpIpc(): void {
  ipcMain.handle('notebooklm:setup', async () => {
    return await setupPythonEnv()
  })

  ipcMain.handle('notebooklm:login', async () => {
    return await runNlmLogin()
  })

  ipcMain.handle('notebooklm:start', async () => {
    if (!isNlmInstalled()) {
      const setupResult = await setupPythonEnv()
      if (!setupResult.ok) return { ok: false, error: setupResult.error }
    }
    restartCount = 0
    startMcpServer()
    return { ok: true }
  })

  ipcMain.handle('notebooklm:stop', () => {
    if (mcpProcess) { mcpProcess.kill(); mcpProcess = null }
    return { ok: true }
  })

  ipcMain.handle('notebooklm:status', () => {
    return {
      running: mcpProcess !== null,
      ready,
      installed: isNlmInstalled(),
      authenticated: isAuthenticated()
    }
  })

  ipcMain.handle('notebooklm:list-notebooks', async () => {
    try {
      const output = await runNlmCommand(['notebook', 'list', '--json'])
      return JSON.parse(output)
    } catch (e) {
      return { error: (e as Error).message }
    }
  })

  ipcMain.handle('notebooklm:create-notebook', async (_e, title: string) => {
    try {
      const output = await runNlmCommand(['notebook', 'create', title, '--json'])
      return JSON.parse(output)
    } catch (e) {
      return { error: (e as Error).message }
    }
  })

  ipcMain.handle('notebooklm:upload-source', async (_e, notebookId: string, filePath: string) => {
    try {
      await runNlmCommand(['source', 'add', notebookId, '--file', filePath])
      return { ok: true }
    } catch (e) {
      return { error: (e as Error).message }
    }
  })

  ipcMain.handle('notebooklm:add-note', async (_e, notebookId: string, title: string, content: string) => {
    try {
      await runNlmCommand(['source', 'add', notebookId, '--text', `${title}\n\n${content}`])
      return { ok: true }
    } catch (e) {
      return { error: (e as Error).message }
    }
  })

  ipcMain.handle('notebooklm:get-insights', async (_e, notebookId: string) => {
    try {
      const output = await runNlmCommand(['notebook', 'query', notebookId, 'Summarize the key insights', '--json'])
      return JSON.parse(output)
    } catch (e) {
      return { error: (e as Error).message }
    }
  })

  ipcMain.handle('notebooklm:ask', async (_e, notebookId: string, question: string) => {
    try {
      const output = await runNlmCommand(['notebook', 'query', notebookId, question, '--json'])
      return JSON.parse(output)
    } catch (e) {
      return { error: (e as Error).message }
    }
  })
}

export function cleanupMcpServer(): void {
  if (mcpProcess) { mcpProcess.kill(); mcpProcess = null }
}
