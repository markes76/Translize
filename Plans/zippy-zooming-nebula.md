# NotebookLM Smart Transcription App — Implementation Plan

## Context

Build a macOS-only Electron desktop app (macOS 12.3+) that captures system audio + mic in real-time using Apple's ScreenCaptureKit (no third-party drivers), transcribes live via OpenAI Realtime API, surfaces relevant context from a local ChromaDB knowledge base during calls, and syncs post-call summaries to Google NotebookLM via MCP. Primary users: sales reps and customer success managers.

The project directory (`/Users/mark.s/Cursor/Translize`) is completely empty. This is a greenfield build.

**Machine environment:** Apple Silicon (arm64), macOS 26.3 (Tahoe), Node 25.x, Xcode 26.2 SDK.

---

## Architecture Overview

```
Renderer (React/TS)
  ↕ contextBridge IPC
Main Process (Electron)
  ├── audio-bridge.ts → spawns Swift audio subprocess
  │     reads stdout pipe (Int16 PCM) → chunks → renderer
  ├── keychain.ts → Electron safeStorage (API keys, OAuth tokens)
  ├── chromadb-manager.ts → spawns ChromaDB Python sidecar on :8420
  └── mcp-server-manager.ts → spawns notebooklm-mcp Python sidecar (stdio)

Swift Subprocess (ScreenCaptureKit — NO native Node addon)
  swift/AudioCapture/Sources/main.swift
    → SCShareableContent + SCContentFilter + SCStream
    → CMSampleBuffer → Float32 → Int16 → writes to stdout
    → Electron reads via child_process pipe
  Compiled to: resources/AudioCapture (signed binary)
```

### Why Swift subprocess instead of a Node native addon

A native Node addon (`.node` file) requires cmake-js or node-gyp, Objective-C++ with N-API bridging, ThreadSafeFunction for cross-thread callbacks, and must be recompiled every time the Electron version changes (ABI versioning). Getting this right is the hardest part of the original plan.

The Swift subprocess approach eliminates all of that:
- **No cmake-js, no N-API, no ABI versioning** — Swift binary runs independently of Electron's Node runtime
- **Swift is the first-class language for ScreenCaptureKit** — Apple's own sample code is in Swift
- **IPC is a stdout pipe** — Electron reads raw bytes from `child_process.spawn`, trivial to implement
- **Latency overhead is ~0.5ms** — negligible for audio
- **Compile once with `swiftc`** — no postinstall hooks, no rebuild-native scripts

---

## Audio Format Pipeline

```
ScreenCaptureKit (Swift)
  → Float32 PCM, 24kHz, mono (SCStreamConfiguration output)
  → vDSP_vsmul + vDSP_vfix16 (Accelerate — SIMD conversion)
  → Int16 PCM, 24kHz, mono
  → written to stdout as raw bytes
Electron main process
  → reads stdout pipe (child_process)
  → accumulates to 2400-frame chunks (100ms at 24kHz)
  → sends to renderer via IPC
Renderer
  → base64 encodes chunk
  → sends to OpenAI Realtime API WebSocket
```

---

## Build Phases

### Phase 0: Project Setup + Onboarding UX

**Goal:** Working Electron + React + TypeScript skeleton with polished first-launch onboarding (6 steps).

**Packages:**
```bash
# devDependencies
npm install -D electron electron-vite electron-builder @electron/rebuild vite @vitejs/plugin-react typescript @types/node @types/react @types/react-dom concurrently

# dependencies
npm install react react-dom openai chromadb zustand ws zod
```

Note: no `node-addon-api`, no `cmake-js` — the Swift subprocess replaces both.

**Key files to create:**

`package.json` — scripts:
```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "build:swift": "cd swift/AudioCapture && swift build -c release && cp .build/release/AudioCapture ../../resources/AudioCapture",
    "package": "npm run build && npm run build:swift && electron-builder"
  }
}
```

- `.npmrc` — electron mirror setting
- `electron.vite.config.ts` — three environments: main, preload, renderer
- `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json`
- `electron-builder.yml` — macOS arm64, entitlements, extra resources (includes `resources/AudioCapture`)
- `build/entitlements.mac.plist`:
  ```xml
  <key>com.apple.security.device.audio-input</key><true/>
  <key>com.apple.security.screen-recording</key><true/>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  ```
- `src/preload/api.ts` — contextBridge exposing typed `window.translize` API
- `src/main/index.ts` — BrowserWindow creation + webRequest interceptor for OpenAI auth headers
- `src/main/keychain.ts` — safeStorage wrapper for API keys
- `src/main/ipc-handlers.ts` — registers all ipcMain.handle calls

**Onboarding — 6 steps** (`src/renderer/components/Onboarding/`):
1. `WelcomeStep.tsx` — value prop, "Get Started"
2. `ApiKeyStep.tsx` — OpenAI key input, "Test Connection" (calls list-models), stores in Keychain, blocks progress until valid
3. `MicPermissionStep.tsx` — triggers macOS mic permission dialog via `systemPreferences.askForMediaAccess('microphone')`
4. `AudioPermissionStep.tsx` — explains ScreenCaptureKit ("audio only, not your screen"), triggers permission, "Open System Settings" deep-link fallback
5. `NotebookStep.tsx` — Google OAuth for NotebookLM (optional, skippable)
6. `AudioTestStep.tsx` — live level meters for mic + system audio, "✓ detected" indicators

**Onboarding state:** `step` ∈ 0–5, persisted `onboarding_complete` flag in `app.getPath('userData')/config.json`. Second launch skips to main app.

**macOS version gate:** Check `os.release()` at startup. If < 21.3 (macOS 12.3), show dedicated error screen with Apple update link. Do not proceed to onboarding.

**Verification:**
- `npm install` succeeds
- `npm run dev` launches Electron showing onboarding
- `npx tsc --noEmit` passes
- API key test returns green checkmark for valid key, clear error message for invalid
- Second launch skips onboarding

---

### Phase 1: Swift Audio Subprocess

**Goal:** Swift binary using ScreenCaptureKit captures system audio, streams Int16 PCM to Electron via stdout pipe.

**Swift project setup:**
```
swift/AudioCapture/
├── Package.swift
└── Sources/
    └── main.swift
```

**`swift/AudioCapture/Package.swift`:**
```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "AudioCapture",
    platforms: [.macOS(.v12_3)],
    targets: [
        .executableTarget(
            name: "AudioCapture",
            path: "Sources",
            linkerSettings: [
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("CoreMedia"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("Accelerate")
            ]
        )
    ]
)
```

**`swift/AudioCapture/Sources/main.swift`** — the full implementation (~120 lines):

```swift
import ScreenCaptureKit
import CoreMedia
import Accelerate
import Foundation

// Writes Int16 PCM to stdout. Electron reads via pipe.
// Protocol: raw bytes only. No framing headers needed — Electron
// accumulates bytes into fixed-size chunks.

class AudioDelegate: NSObject, SCStreamDelegate, SCStreamOutput {
    private var convBuffer = [Int16]()

    func stream(_ stream: SCStream,
                didOutputSampleBuffer buffer: CMSampleBuffer,
                of type: SCStreamOutputType) {
        guard type == .audio else { return }

        var list = AudioBufferList()
        var blockBuffer: CMBlockBuffer?
        CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            buffer, bufferListSizeNeededOut: nil,
            bufferListOut: &list, bufferListSize: MemoryLayout<AudioBufferList>.size,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil,
            flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
            blockBufferOut: &blockBuffer)

        let audioBuffer = list.mBuffers
        guard let data = audioBuffer.mData else { return }
        let frameCount = Int(audioBuffer.mDataByteSize) / MemoryLayout<Float>.size
        let floatPtr = data.bindMemory(to: Float.self, capacity: frameCount)

        // vDSP Float32 → Int16 conversion (SIMD via Accelerate)
        if convBuffer.count < frameCount { convBuffer = [Int16](repeating: 0, count: frameCount) }
        var scale: Float = 32767.0
        var scaled = [Float](repeating: 0, count: frameCount)
        vDSP_vsmul(floatPtr, 1, &scale, &scaled, 1, vDSP_Length(frameCount))
        vDSP_vfix16(&scaled, 1, &convBuffer, 1, vDSP_Length(frameCount))

        // Write raw Int16 bytes to stdout
        convBuffer.withUnsafeBytes { ptr in
            FileHandle.standardOutput.write(Data(ptr.prefix(frameCount * 2)))
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fputs("AudioCapture error: \(error)\n", stderr)
        exit(1)
    }
}

// Request permission + start stream
let delegate = AudioDelegate()
let semaphore = DispatchSemaphore(value: 0)

SCShareableContent.getWithCompletionHandler { content, error in
    guard let content = content, let display = content.displays.first else {
        fputs("No display found or permission denied\n", stderr)
        exit(1)
    }

    let filter = SCContentFilter(display: display,
                                  excludingApplications: [],
                                  exceptingWindows: [])

    let config = SCStreamConfiguration()
    config.capturesAudio = true
    config.sampleRate = 24000
    config.channelCount = 1
    config.width = 2          // minimal video — we only want audio
    config.height = 2
    config.minimumFrameInterval = CMTime(value: 1, timescale: 1)  // 1fps

    let stream = SCStream(filter: filter, configuration: config, delegate: delegate)
    try? stream.addStreamOutput(delegate, type: .audio,
                                 sampleHandlerQueue: .global(qos: .userInteractive))

    stream.startCapture { err in
        if let err = err {
            fputs("Start failed: \(err)\n", stderr)
            exit(1)
        }
        semaphore.signal()
    }
}

semaphore.wait()

// Keep running until stdin closes (Electron closes it on stop)
FileHandle.standardInput.readDataToEndOfFile()
```

**Compilation:**
```bash
cd swift/AudioCapture
swift build -c release
# Output: .build/release/AudioCapture
# Copy to resources/ for electron-builder to bundle
```

**Code signing the Swift binary:**
The Swift binary needs the Screen Recording entitlement. Sign it separately during the build:
```bash
codesign --force --sign "Developer ID Application: ..." \
  --entitlements build/entitlements.swift.plist \
  resources/AudioCapture
```

`build/entitlements.swift.plist` (for the Swift binary only, minimal):
```xml
<key>com.apple.security.screen-recording</key><true/>
<key>com.apple.security.device.audio-input</key><true/>
```

**`src/main/audio-bridge.ts`** — Electron side:
```typescript
import { app, ipcMain, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'

let captureProcess: ChildProcess | null = null
const CHUNK_BYTES = 2400 * 2  // 2400 frames × 2 bytes (Int16) = 100ms at 24kHz
let accumulator = Buffer.alloc(CHUNK_BYTES)
let accPos = 0

export function setupAudioBridge(win: BrowserWindow) {
  ipcMain.handle('audio:start', async () => {
    if (captureProcess) return { error: 'Already running' }

    const bin = app.isPackaged
      ? path.join(process.resourcesPath, 'AudioCapture')
      : path.join(app.getAppPath(), 'resources/AudioCapture')

    captureProcess = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] })

    captureProcess.stdout!.on('data', (chunk: Buffer) => {
      // Accumulate bytes into fixed 100ms chunks before forwarding
      let offset = 0
      while (offset < chunk.length) {
        const copy = Math.min(chunk.length - offset, CHUNK_BYTES - accPos)
        chunk.copy(accumulator, accPos, offset, offset + copy)
        accPos += copy
        offset += copy
        if (accPos >= CHUNK_BYTES) {
          win.webContents.send('audio:chunk', accumulator.buffer.slice(0))
          accPos = 0
        }
      }
    })

    captureProcess.stderr!.on('data', (d: Buffer) => console.error('[AudioCapture]', d.toString()))
    captureProcess.on('exit', () => { captureProcess = null })

    return { ok: true }
  })

  ipcMain.handle('audio:stop', async () => {
    captureProcess?.stdin?.end()   // closing stdin signals the Swift process to exit
    captureProcess = null
    accPos = 0
  })
}
```

**Permission request** — done from Electron main process before spawning the Swift binary:
```typescript
// src/main/ipc-handlers.ts
import { systemPreferences } from 'electron'

ipcMain.handle('audio:request-screen-permission', async () => {
  // Triggers the macOS Screen Recording dialog
  // Note: on macOS 12+, simply calling getShareableContent from the Swift binary
  // also triggers this dialog. But we want to control it from onboarding.
  // Use systemPreferences to check current status first.
  const status = systemPreferences.getMediaAccessStatus('screen')
  return status  // 'not-determined' | 'denied' | 'granted' | 'restricted'
})
```

The Swift binary itself triggers the permission dialog on first `SCShareableContent.getWithCompletionHandler` call. For onboarding UX control, spawn the binary in "check-only" mode before the real capture start.

**Verification:**
```bash
# Build the Swift binary
npm run build:swift
# → resources/AudioCapture exists and is executable

# Run dev mode
npm run dev
# → Onboarding Step 4 triggers Screen Recording dialog (via Swift binary launch)
# → Start capture → audio:chunk events appear in DevTools console
# → Chunk rate: ~10 chunks/sec (100ms each at 24kHz)
# → Stop capture → Swift process exits cleanly
```

**Pitfalls:**
- Swift binary must be code-signed with Screen Recording entitlement or ScreenCaptureKit will silently fail
- Closing stdin is the clean shutdown signal; never SIGKILL the process during a capture
- The Swift `stream` object must be kept alive (local variable in `main.swift` scope won't do — store as a module-level or class property)
- In dev mode (unsigned), you may need to manually grant Screen Recording permission to the Terminal/Electron app in System Settings

---

### Phase 2: Live Transcription (OpenAI Realtime API)

**Goal:** Audio chunks feed into OpenAI Realtime API WebSocket; live transcript appears with speaker labels.

**Key files:**

`src/renderer/services/openai-realtime.ts` — `RealtimeTranscriptionService`:
- Connects to `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview`
- Session config: `modalities:['text']`, `input_audio_format:'pcm16'`, `input_audio_transcription:{model:'whisper-1'}`, `turn_detection:{type:'server_vad', threshold:0.5, silence_duration_ms:500}`
- `appendAudio(ArrayBuffer)` → base64 encode Int16 bytes → `input_audio_buffer.append` event
- Handles `conversation.item.input_audio_transcription.delta` (partial) + `.completed` (final)
- Exponential backoff reconnect (max 5 retries, 1s/2s/4s/8s/16s)

`src/main/index.ts` — WebSocket auth header injection:
```typescript
session.defaultSession.webRequest.onBeforeSendHeaders(
  { urls: ['wss://api.openai.com/*', 'https://api.openai.com/*'] },
  (details, callback) => {
    const key = safeStorage.decryptString(/* stored key */)
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        'Authorization': `Bearer ${key}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    })
  }
)
```

`src/renderer/hooks/useRealtimeTranscription.ts`:
- Receives `audio:chunk` IPC events (already accumulated to 100ms by audio-bridge)
- Base64 encodes and sends to Realtime API
- Speaker labeling: mic source = "You", system audio = "Them"
- Maintains transcript array: `[{ speaker, text, timestamp, isFinal }]`

`src/renderer/components/SessionView/Transcript.tsx`:
- Scrolling transcript, color-coded speakers
- Auto-scroll with manual scroll lock (if user scrolls up, pause auto-scroll)

**Verification:**
- DevTools Network → WebSocket connection to `wss://api.openai.com/v1/realtime` visible
- Play audio through speakers → transcript appears within ~500ms
- "You" and "Them" labels correct

---

### Phase 3: Local Knowledge Base (ChromaDB)

**Goal:** Transcripts stored locally with vector embeddings; semantic search across past calls.

**ChromaDB deployment:** npm client v3+ requires a running HTTP server. Bundle ChromaDB Python package as a sidecar spawned by Electron:

`src/main/chromadb-manager.ts`:
- Spawns `chromadb run --path <userData>/chromadb --port 8420`
- Waits for HTTP readiness (polls `GET http://localhost:8420/api/v1/heartbeat`)
- Restarts on crash (max 3x)
- Started during app launch (before onboarding completes), so it's ready when needed

`src/renderer/services/chromadb-client.ts`:
- `new ChromaClient({ host: 'localhost', port: 8420 })`
- Collections: `meetings` (transcript segments), `entities` (extracted people/companies/topics)
- Embedding function: `OpenAIEmbeddingFunction({ model: 'text-embedding-3-small' })`

`src/renderer/services/entity-extractor.ts` — GPT-4o structured output:
```typescript
import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'

const EntitySchema = z.object({
  people: z.array(z.object({ name: z.string(), role: z.string().optional() })),
  companies: z.array(z.string()),
  topics: z.array(z.string()),
  action_items: z.array(z.string())
})
```

**Post-call pipeline (triggered on Stop):**
1. Chunk full transcript into ≤500-token segments
2. Embed via `text-embedding-3-small` → store in `meetings` with metadata (date, duration, speakers)
3. Extract entities (GPT-4o structured) → store in `entities` collection
4. Generate post-call summary (GPT-4o) → display in `PostCallSummary` component

**Storage path:** `app.getPath('userData')/chromadb/`

**Verification:**
- Complete 2 test calls
- Cmd+K search returns semantically relevant segments
- Entities correctly extracted in metadata

---

### Phase 4: Real-Time Context Surfacing

**Goal:** During live calls, relevant past context surfaces automatically in a side panel.

`src/renderer/services/context-manager.ts` — Web Worker:
- Runs every 10s during active capture
- Takes last 30s of transcript text
- Lightweight regex entity extraction (no API call — avoids latency during live call)
- Queries ChromaDB semantic similarity, threshold 0.75
- Deduplicates (don't repeat same context card within a session)
- Runs in a Web Worker so it never blocks the main thread or transcription

`src/renderer/components/KnowledgePanel/ContextPanel.tsx`:
- Cards fade in with source date, relevant excerpt, entities
- Pin (keeps visible) or Dismiss per card
- Subtle confidence score indicator

`src/renderer/components/SearchOverlay/`:
- Cmd+K hotkey (configurable in Settings), Escape to close
- Free-text semantic search, results in < 1s

**Verification:**
- Context card surfaces within 15s for a topic discussed in a past call
- Transcription latency unchanged (context runs in worker)
- Cmd+K returns results < 1s

---

### Phase 5: NotebookLM MCP Sync

**Goal:** After each call, structured summary syncs to Google NotebookLM. App fully functional without this.

`python/notebooklm_mcp/server.py` — MCP server (stdio transport):
- Uses `mcp` package, tools: `add_to_notebook`, `list_notebooks`, `create_notebook`
- NotebookLM automation via Playwright (unofficial web API)
- Google OAuth browser flow; refresh token in macOS Keychain

`python/requirements.txt`: `mcp>=1.0.0`, `playwright>=1.45.0`, `pydantic>=2.0.0`

`python/build.sh` — PyInstaller `--onefile` → `resources/python/notebooklm-mcp`

`src/main/mcp-server-manager.ts`:
- Spawns MCP binary, communicates via stdin/stdout JSON-RPC
- Auto-restart on crash (max 3x), then disables sync + notifies user
- Sync queue: failed items retried up to 24h, then marked permanently failed

**Post-call summary structure (GPT-4o):** date/time, participants, 3–5 key topics, action items with owners, decisions, follow-up needed.

**Verification:**
- Call ends → summary in NotebookLM within 30s
- Sync disabled in Settings → app fully functional
- MCP crash → auto-restart, user notified after 3 failures

---

### Phase 6: Polish + Pre-Call Briefing

**Goal:** Pre-call briefing, post-call summary view, Settings panel, system tray.

`src/renderer/components/BriefingPanel/PreCallBriefing.tsx`:
- Enter contact name → ChromaDB query for all past interactions → GPT-4o briefing:
  - Last interaction date + summary, key topics, open action items, things they care about, talking points

`src/renderer/components/PostCallSummary.tsx`:
- Structured summary display
- One-click copy to clipboard (CRM/Slack paste)
- One-click push to NotebookLM

`src/renderer/components/Settings.tsx` — mirrors onboarding:
- **Account & API:** masked key, re-test, change (Keychain)
- **Permissions:** live status (green/red), re-enable guidance, "Open System Settings" deep-link
- **Audio:** device selection, system audio toggle, live level meters
- **NotebookLM:** connected account, re-auth, disconnect, sync toggle
- **Context:** sensitivity threshold slider, refresh interval
- **Data:** retention settings, export JSON dump, clear all (confirmation dialog)
- **About:** version, docs link, "Re-run Setup" button

`src/main/tray.ts`:
- System tray with red dot indicator when recording active
- Quick start/stop from tray menu
- Minimize to tray on window close

Dark mode: `nativeTheme.shouldUseDarkColors` → CSS class on `<html>`

**Verification:**
- Full end-to-end: briefing → start call → transcript + context → stop → summary → NotebookLM sync
- Tray shows correct recording state
- Dark/light mode follows macOS system preference
- All Settings panels functional

---

## Project Structure

```
/Users/mark.s/Cursor/Translize/
├── package.json / tsconfig.json / .npmrc / electron-builder.yml
├── electron.vite.config.ts
├── build/
│   ├── entitlements.mac.plist      (Electron app)
│   └── entitlements.swift.plist    (Swift binary)
├── swift/AudioCapture/
│   ├── Package.swift
│   └── Sources/main.swift          (~120 lines, no cmake/gyp)
├── resources/
│   └── AudioCapture                (compiled Swift binary, bundled by electron-builder)
├── src/
│   ├── main/
│   │   ├── index.ts / ipc-handlers.ts
│   │   ├── audio-bridge.ts         (spawns Swift subprocess, reads stdout pipe)
│   │   ├── keychain.ts / tray.ts
│   │   ├── chromadb-manager.ts / mcp-server-manager.ts
│   ├── preload/api.ts              (contextBridge)
│   └── renderer/
│       ├── main.tsx / App.tsx
│       ├── components/
│       │   ├── Onboarding/         (6 step components)
│       │   ├── SessionView/        (Transcript, AudioControls)
│       │   ├── KnowledgePanel/     (ContextPanel)
│       │   ├── BriefingPanel/      (PreCallBriefing)
│       │   ├── PastCalls/ / PostCallSummary.tsx
│       │   ├── NotebookBrowser/ / SearchOverlay/
│       │   └── Settings.tsx / EmptyStates.tsx
│       └── services/
│           ├── openai-realtime.ts / chromadb-client.ts
│           ├── entity-extractor.ts / summarizer.ts
│           └── context-manager.ts / briefing-generator.ts
├── python/
│   ├── notebooklm_mcp/server.py
│   └── requirements.txt / build.sh
└── scripts/notarize.js
```

---

## Dependency Graph

```
Phase 0 (setup + onboarding) → blocks all
Phase 1 (Swift audio subprocess) → blocks Phase 2, 4
Phase 2 (transcription) → requires Phase 1 + OpenAI key
Phase 3 (ChromaDB) → can run parallel with Phase 2
Phase 4 (context surfacing) → requires Phase 2 + Phase 3
Phase 5 (MCP sync) → independent (Python work, can run parallel with 2–4)
Phase 6 (polish) → requires all phases
```

---

## Key Risks

| Risk | Mitigation |
|------|-----------|
| Swift binary not signed with Screen Recording entitlement | Separate `codesign` step in build script; entitlements.swift.plist |
| SCStream object deallocated → delegate never fires | Store stream as module-level var in main.swift (not a local) |
| ChromaDB sidecar startup latency | Start during app boot, not on first capture; show progress in onboarding |
| PyInstaller bundle > 200MB | `--exclude-module` flags, strip debug symbols; or ship thin Python 3.12 embedded |
| NotebookLM unofficial API breaks | App fully functional without it; MCP sync is bonus, not dependency |
| ScreenCaptureKit API changes in macOS 26 Tahoe | Check SCStreamConfiguration deprecations against Xcode 26.2 SDK before building |
