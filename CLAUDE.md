# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start Electron app with DevTools (unsets ELECTRON_RUN_AS_NODE)

# Build
npm run build            # Build all three processes (main, preload, renderer) via electron-vite
npm run build:swift      # Compile AudioCapture Swift binary → resources/AudioCapture
npm run package          # Full production build + package as .dmg (arm64)

# Preview
npm run preview          # Preview production build locally
```

No test suite is configured. TypeScript is the only static check — run `tsc --noEmit` to type-check without building.

## Architecture

Translize is a **macOS-only Electron app** (arm64, macOS 13+) built with three separate processes:

### Electron Main Process (`src/main/`)
Handles all privileged operations via IPC handlers. Key modules:

- **`audio-bridge.ts`** — Spawns the Swift `AudioCapture` binary as a child process. Captures raw Int16 PCM at 24kHz (2400 frames = 100ms chunks) from mic + system audio separately and forwards via `audio:chunk` IPC events.
- **`session-manager.ts`** — Persists sessions to `~/.../userData/sessions.json`. Each session has a directory for transcripts, summaries, and sentiment files.
- **`knowledge-base.ts`** — Orchestrates document indexing and smart querying over `vector-store.ts`. Uses `gpt-4o-mini` to detect questions in transcripts and answer from the vector index.
- **`vector-store.ts`** — Local vector store using ChromaDB + OpenAI embeddings (`text-embedding-3-small`).
- **`keychain.ts`** — Stores API keys encrypted via Electron's `safeStorage` in `keychain.enc` (not the OS keychain).
- **`config.ts`** — JSON config at `userData/config.json`. Schema: `onboarding_complete`, `theme`, `context_threshold`, `context_interval_seconds`, `retention_days`, `notebooklm_enabled`.
- **`gemini-service.ts`** — Deep sentiment analysis via Gemini API.
- **`platform-skill.ts`** — Persistent per-contact skill/memory system.
- **`mcp-server-manager.ts`** — Manages NotebookLM MCP Python subprocess.
- **`tavily-search.ts`** — Web search fallback via Tavily API.

### Preload (`src/preload/index.ts`)
Single bridge file exposing 50+ typed IPC APIs as `window.translize`. All renderer code accesses the main process through this bridge — never via `ipcRenderer` directly. The full API surface is defined here.

### Renderer (`src/renderer/src/`)
React 18 + TypeScript SPA. No router — state machine in `App.tsx` drives screens via an `AppState` string union: `loading | unsupported-os | onboarding | home | setup | call | summary | relationships | settings`.

**Key services:**
- **`services/openai-realtime.ts`** — Dual-channel WebSocket transcription. Opens **two** separate OpenAI Realtime API sessions (one for mic, one for system audio) to guarantee speaker attribution. Auth headers are injected by the main process via `session.defaultSession.webRequest.onBeforeSendHeaders` because browser WebSocket can't set custom headers.
- **`services/sentiment-engine.ts`** — Per-call and longitudinal sentiment scoring.
- **`services/skill-manager.ts`** — Reads/writes per-contact conversation skills.
- **`services/summarizer.ts`** — Post-call summarization.
- **`hooks/useRealtimeTranscription.ts`** — Central hook coordinating audio capture, WebSocket sessions, and transcript state.

**Key components:**
- `components/SessionView/` — Active call UI (Transcript, AudioControls, ContextPanel)
- `components/KnowledgePanel/ContextPanel.tsx` — Real-time knowledge surfacing during calls
- `components/Onboarding/` — Multi-step setup flow (API keys, permissions, audio test)
- `components/RelationshipsDashboard.tsx` — Portfolio analytics across all contacts
- `components/PostCallSummary.tsx` — Post-call review and sentiment

### Swift AudioCapture (`swift/AudioCapture/`)
ScreenCaptureKit-based binary that captures both mic and system audio channels, outputs raw Int16 PCM to stdout. Must be built separately with `npm run build:swift`. The binary is bundled into `resources/AudioCapture` for dev and `Resources/AudioCapture` inside the `.app` for production.

### Python NotebookLM MCP (`python/notebooklm_mcp/`)
Optional MCP server for NotebookLM integration. Managed as a subprocess by `mcp-server-manager.ts`.

## Design System

CSS custom properties only — no Tailwind utility classes in component logic. All tokens defined in `src/renderer/src/styles/global.css`:

- **Fonts**: `--font-display` (Fraunces, serif) for headings, `--font-body` (Plus Jakarta Sans) for UI
- **Surfaces**: `--surface-1` through `--surface-4` (warm slate, never pure gray)
- **Ink**: `--ink-1` through `--ink-5` for text hierarchy
- **Spacing**: 4pt system via `--sp-1` (4px) through `--sp-16` (64px)
- **Semantic colors**: `--positive`, `--negative`, `--warning`, `--primary`, `--amber`, `--purple`

## Data Storage

All user data lives in Electron's `userData` directory (macOS: `~/Library/Application Support/Translize/`):
- `config.json` — App settings
- `keychain.enc` — Encrypted API keys (Electron safeStorage)
- `sessions.json` — Session index
- `sessions/<id>/` — Per-session transcripts, summaries, sentiment JSON files

`app:reset` IPC deletes config, sessions, and keychain — full wipe.

## API Keys

Keys stored in `keychain.enc` under these string keys:
- `openai-api-key` — Required for transcription, embeddings, analysis
- `tavily-api-key` — Optional, web search
- `gemini-api-key` — Optional, deep sentiment
