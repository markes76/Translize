# Translize

<p align="center">
  <img src="Translize.png" alt="Translize" width="180" />
</p>

Real-time call intelligence platform. Transcribes live calls, surfaces relevant context from your knowledge base, analyzes sentiment, and builds relationship intelligence across every conversation.

## What It Does

- **Live transcription** with dual-channel speaker diarization (mic + system audio)
- **Knowledge surfacing** during calls from local documents, NotebookLM, and web search (Tavily)
- **Sentiment analysis** — per-call and longitudinal tracking across contacts
- **Conversation Skills** — persistent per-contact memory that grows with every call
- **Relationships dashboard** — portfolio analytics, risk flags, sentiment trajectories
- **NotebookLM integration** — sync summaries, query notebooks, auto web research

## Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| macOS | 13.0+ (Ventura) | ScreenCaptureKit requires Darwin 22+ |
| Node.js | 20+ | `node --version` to check |
| Xcode CLT | Any | `xcode-select --install` |
| Python | 3.11+ | Only needed for NotebookLM — `brew install python@3.13` |

## API Keys

| Service | Required | Purpose |
|---------|----------|---------|
| OpenAI | **Yes** | Transcription, embeddings, summaries, sentiment |
| Tavily | Optional | Web search fallback in Live Context |
| Gemini | Optional | Deep voice sentiment analysis |
| NotebookLM | Optional | Knowledge sync via `notebooklm-mcp-cli` |

You enter all keys through the app's onboarding flow — they are stored encrypted in `~/Library/Application Support/Translize/keychain.enc` and never written to disk in plain text.

## Install

```bash
# 1. Clone
git clone https://github.com/markes76/Translize.git
cd Translize

# 2. Install JS dependencies
npm install

# 3. Build the Swift audio capture binary (requires Xcode CLT)
npm run build:swift
```

That's it. The first time you run the app it will walk you through API key setup and microphone/screen permissions.

## Run

```bash
# Development mode (hot-reload, open DevTools with Cmd+Option+I)
npm run dev

# Production .app (packaged, arm64 .dmg)
npm run package
open dist/mac-arm64/Translize.app
```

## Permissions

On first launch macOS will prompt for two permissions:

1. **Microphone** — for capturing your voice channel
2. **Screen Recording** — for capturing system audio (calls, meetings)

If you accidentally deny either, go to **System Settings → Privacy & Security → Microphone / Screen Recording** and enable Translize. The app has a "Request Permissions" button in the Onboarding screen that will re-prompt if needed.

## Troubleshooting

### App won't launch / crashes immediately

- Confirm macOS 13.0+: `sw_vers -productVersion`
- Confirm Node 20+: `node --version`
- Delete stale build artifacts and rebuild: `rm -rf out dist && npm run build:swift && npm run dev`

### "AudioCapture binary not found"

The Swift binary must be compiled before the app can capture audio.

```bash
npm run build:swift
# Expected output: CompileSwift ... Build complete!
```

If the build fails, install Xcode Command Line Tools:
```bash
xcode-select --install
```

### No audio / transcription not starting

1. Check **System Settings → Privacy → Microphone** — Translize (or Electron) must be listed and enabled.
2. Check **System Settings → Privacy → Screen Recording** — same requirement.
3. In the app, go to **Settings → Permissions** and use the "Re-request" buttons.
4. Make sure your OpenAI API key is valid — the Realtime API requires a key with access to `gpt-4o-realtime-preview`.

### Knowledge base returns no answers

- The document must be indexed first — upload it in the Session Setup screen before starting the call.
- If you uploaded a large PDF, wait a few seconds for indexing to complete (the "docs" badge in Live Context will show a count).
- Check your OpenAI key has access to `text-embedding-3-small` (embeddings endpoint).

### "Attempted to register a second handler" error dialog

This happens when the app is opened while a development (`npm run dev`) process is already running in the background. Quit all Electron instances and relaunch:

```bash
pkill -f Electron
npm run dev
```

### NotebookLM not connecting

NotebookLM integration requires `notebooklm-mcp-cli` and Python 3.11+:

```bash
pip3 install notebooklm-mcp-cli
# Then authenticate inside the app: Settings → NotebookLM → Connect
```

### Reset everything

To wipe all data, API keys, and sessions and start fresh:

**Settings → Danger Zone → Reset App**

Or from the terminal:
```bash
rm -rf ~/Library/Application\ Support/Translize
```

### Build fails with TypeScript errors

```bash
npx tsc --noEmit
```

Fix any reported errors, then rebuild with `npm run build`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 34 |
| Frontend | React 18 + TypeScript |
| Audio | ScreenCaptureKit (Swift subprocess) |
| Transcription | OpenAI Realtime API (dual-channel) |
| Knowledge | Local vector store + OpenAI embeddings |
| NLM Sync | notebooklm-mcp-cli |
| Web Search | Tavily API |
| Sentiment | OpenAI GPT-4o structured output |
| Design | Plus Jakarta Sans + Fraunces, Impeccable design system |

## Project Structure

```
src/
  main/           # Electron main process (audio, sessions, knowledge, MCP, Tavily)
  preload/        # IPC bridge (50+ APIs)
  renderer/src/   # React app
    components/   # UI components
    hooks/        # useRealtimeTranscription
    services/     # OpenAI Realtime, sentiment, skills, summarizer
    styles/       # Global CSS with design tokens
swift/            # ScreenCaptureKit audio capture
python/           # NotebookLM MCP server
scripts/          # Build helpers
build/            # Entitlements, icons
```

## License

Private. All rights reserved.
