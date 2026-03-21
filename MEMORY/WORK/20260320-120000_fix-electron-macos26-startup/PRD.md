---
task: Fix Electron startup failure on macOS 26 Tahoe
slug: 20260320-120000_fix-electron-macos26-startup
effort: Extended
phase: execute
progress: 0/16
mode: algorithm
started: 2026-03-20T12:00:00Z
updated: 2026-03-20T12:00:00Z
---

## Context

### What Was Requested
Fix the Electron dev mode startup failure on macOS 26 Tahoe where `process.type` is `undefined` and `require('electron')` returns the binary path string instead of the Electron API. The app fails with `TypeError: Cannot read properties of undefined (reading 'whenReady')`.

### Root Cause (Confirmed via Research)
`SecCodeCheckValidity` in Electron's `codesign_util.cc` fails on macOS 26 Tahoe with the ad-hoc signed npm Electron binary. When it fails, Electron's JS bootstrap (`lib/common/init.ts`) does not execute. `process.versions.electron` is set (C++ bindings loaded) but `process.type` is `undefined`. `Module._resolveFilename` is never patched, so `require('electron')` falls through to `node_modules/electron/index.js` which returns the binary path string.

### Confirmed Workarounds
1. `codesign --force --deep --sign - /path/to/node_modules/electron/dist/Electron.app` — re-sign the npm Electron binary so macOS 26's stricter code signature validation passes
2. Also check macOS version gate: current code checks `release[0] < 22` (macOS 13) but Darwin 25.x = macOS 26 Tahoe — this may also need correction

### Risks
- Re-signing must be done after every `npm install` (or postinstall hook)
- electron-vite 5.x may also need a compatible Electron version
- The `isMacOSSupported()` function currently blocks macOS 13 and below — it should allow macOS 26

## Criteria

- [ ] ISC-1: Electron binary re-signed with ad-hoc codesign after npm install
- [ ] ISC-2: postinstall script re-signs Electron binary automatically
- [ ] ISC-3: process.type equals "browser" when main process runs
- [ ] ISC-4: app.whenReady() resolves without TypeError
- [ ] ISC-5: BrowserWindow creates successfully in dev mode
- [ ] ISC-6: electron-vite dev server starts (renderer at localhost:5173)
- [ ] ISC-7: Main process loads without "Cannot read properties of undefined" errors
- [ ] ISC-8: isMacOSSupported() allows macOS 26 Tahoe (Darwin 25.x+)
- [ ] ISC-9: isMacOSSupported() correctly gates macOS 12.2 and below
- [ ] ISC-10: Keychain module loads without app.getPath() crash
- [ ] ISC-11: Config module loads without app.getPath() crash
- [ ] ISC-12: IPC handlers register successfully (keychain, config, permissions, shell, audio)
- [ ] ISC-13: Audio bridge IPC handlers register without error
- [ ] ISC-14: Preload script loads and contextBridge exposes window.translize
- [ ] ISC-15: Renderer loads at localhost:5173 (React app renders)
- [ ] ISC-16: No errors in Electron main process stderr on startup
- [ ] ISC-A1: Do NOT remove or restructure existing architecture
- [ ] ISC-A2: Do NOT change electron-vite config unless required for the fix

## Decisions

## Verification
