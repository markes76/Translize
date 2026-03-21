#!/usr/bin/env node
// Re-sign the Electron binary after npm install.
// On macOS 26 (Tahoe), the npm-distributed Electron binary has an ad-hoc signature
// that fails SecCodeCheckValidity, preventing lib/common/init.ts from executing.
// Re-signing with codesign --force --deep --sign - fixes this.
// See: https://github.com/electron/electron/issues/49652

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

if (process.platform !== 'darwin') {
  process.exit(0)
}

const electronApp = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app')

if (!fs.existsSync(electronApp)) {
  console.log('[resign-electron] Electron.app not found, skipping.')
  process.exit(0)
}

try {
  execSync(`codesign --force --deep --sign - "${electronApp}"`, { stdio: 'pipe' })
  console.log('[resign-electron] Electron.app re-signed successfully.')
} catch (err) {
  console.warn('[resign-electron] codesign failed:', err.message)
  // Non-fatal — dev may still work without this on some macOS versions
}
