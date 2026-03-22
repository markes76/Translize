# Translize

<p align="center">
  <img src="Translize.png" alt="Translize" width="180" />
</p>

**Real-time call intelligence for sales, support, and relationship professionals.** Translize runs on your Mac, listens to both sides of any call, transcribes in real-time with speaker attribution, surfaces relevant context from your knowledge base mid-call, and builds deep relationship intelligence across every conversation — all stored locally and encrypted.

---

## Features

### Live Call Intelligence
- **Dual-channel transcription** — captures mic (you) and system audio (them) as separate streams via OpenAI Realtime API
- **Clean live transcript** — plain text with timestamps during the call, no distracting speaker labels
- **Live Context panel** — detects questions as you speak and surfaces answers in real-time from local documents, NotebookLM, and web search
- **Live sentiment bar** — color-coded emotional tone indicator updated every 30 seconds during the call
- **Contact name** — add or edit the contact name inline at any time during a live call

### Voice Recordings
- **Automatic call recording** — every call is saved as a 16kHz mono WAV file (~3.5MB/30min), mixing mic + system audio channels
- **In-app playback** — play, pause, and seek recordings directly from the post-call summary screen
- **Auto-delete controls** — configurable retention: 7, 30, 90 days, or never (default: 30 days)
- Recording can be disabled entirely in Settings → Audio

### Knowledge & Context
- **Local document indexing** — upload PDFs or text files before a call; chunks are embedded with `text-embedding-3-small` and queried in real-time
- **NotebookLM integration** — query Google NotebookLM notebooks mid-call; every answer links directly back to the source notebook URL
- **Web search fallback** — Tavily API fills gaps when local docs and NotebookLM have no answer
- **Save to KB** — pin any Live Context answer to the local knowledge base with one click
- **Ask manually** — type any question into the Live Context panel to query all sources simultaneously

### Post-Call Intelligence
- **GPT-4o speaker diarization** — automatically attributes every transcript line to speakers by name after the call ends, using conversation pattern analysis and name detection
- **Speaker management** — detected speakers shown as pills with line counts; click to rename, or add additional speakers GPT missed
- **Auto-generated summary** — overview, key topics, action items, decisions, follow-ups, and risk flags
- **Sentiment analysis** — per-speaker scores, tone timeline, key emotional moments, and relationship signals
- **Transcript editing** — find & replace text content, or reassign lines from one speaker to another
- **NotebookLM sync** — push the full call summary (transcript + insights) to a notebook with one click
- **Recording player** — play back the call audio with seek bar directly on the summary screen
- **Contact association** — search and assign a contact from your imported contact list after the call

### Relationship Intelligence
- **Conversation Skills** — persistent per-contact memory that grows after every call; captures communication style, preferences, topics, and relationship context
- **Relationships dashboard** — portfolio view across all contacts: sentiment trajectories, call frequency, risk flags, and outstanding action items
- **Contact management** — import from Google Contacts (CSV), Microsoft Outlook (CSV/VCF), or Google Sheets; supports 2500+ contacts
- **Contact search** — instant search available from Settings, New Call setup, and post-call association

### Settings & Customization
- **Theme** — light, dark, or system
- **Language support** — multi-language transcription (set preferred languages in Settings)
- **Context interval** — configure how often the Live Context panel polls for new questions (default: every 6 seconds)
- **Voice recording retention** — auto-delete recordings after 7, 30, or 90 days
- **API key management** — all keys stored encrypted via Electron safeStorage, never written as plain text

---

## Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| macOS | 13.0+ (Ventura) | ScreenCaptureKit requires Darwin 22+ |
| Node.js | 20+ | `node --version` to check |
| Xcode CLT | Any | `xcode-select --install` |
| Python | 3.11+ | Only needed for NotebookLM — `brew install python@3.13` |

---

## API Keys

| Service | Required | Purpose |
|---------|----------|---------|
| OpenAI | **Yes** | Transcription (Realtime API), embeddings, summaries, sentiment |
| Tavily | Optional | Web search fallback in Live Context |
| Gemini | Optional | Deep voice sentiment analysis |
| NotebookLM | Optional | Knowledge sync via `notebooklm-mcp-cli` |

All keys are entered through the in-app onboarding flow and stored encrypted in `~/Library/Application Support/Translize/keychain.enc`.

---

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

The first launch walks you through API key setup and microphone/screen recording permissions.

---

## Run

```bash
# Development mode (hot-reload, DevTools with Cmd+Option+I)
npm run dev

# Production build and package as .dmg (arm64)
npm run package
open dist/mac-arm64/Translize.app
```

---

## Permissions

On first launch macOS will prompt for two permissions:

1. **Microphone** — captures your voice channel
2. **Screen Recording** — captures system audio (calls, meetings, any app audio)

If denied, go to **System Settings → Privacy & Security → Microphone / Screen Recording** and enable Translize. The onboarding screen has a "Request Permissions" button that re-prompts if needed.

---

## Data Storage

All user data lives locally in Electron's userData directory:

```
~/Library/Application Support/Translize/
├── config.json           # App settings
├── keychain.enc          # Encrypted API keys (Electron safeStorage)
├── sessions.json         # Session index
├── contacts.json         # Imported contacts (Google, Outlook, Sheets)
├── sessions/
│   └── {id}/
│       ├── recording.wav         # Voice recording (16kHz mono WAV)
│       ├── transcript-*.txt      # Call transcript
│       ├── summary-*.txt         # AI-generated summary
│       └── sentiment-*.json      # Sentiment analysis results
└── skills/
    └── {skillId}.json    # Per-contact persistent conversation memory
```

**Reset everything:** Settings → Danger Zone → Reset App, or:
```bash
rm -rf ~/Library/Application\ Support/Translize
```

---

## Troubleshooting

### "AudioCapture binary not found"
```bash
npm run build:swift
# Expected: CompileSwift ... Build complete!
# If it fails: xcode-select --install
```

### No audio / transcription not starting
1. **System Settings → Privacy → Microphone** — Translize must be listed and enabled
2. **System Settings → Privacy → Screen Recording** — same requirement
3. Settings → Permissions → use the "Re-request" buttons
4. Confirm your OpenAI key has access to `gpt-4o-realtime-preview`

### Knowledge base returns no answers
- Upload the document in Session Setup *before* starting the call
- Wait for the "N docs" badge to appear in Live Context (indexing takes a few seconds for large PDFs)
- OpenAI key needs access to `text-embedding-3-small`

### "Attempted to register a second handler" error
Quit all Electron instances and relaunch:
```bash
pkill -f Electron && npm run dev
```

### NotebookLM not connecting
```bash
pip3 install notebooklm-mcp-cli
# Then: Settings → NotebookLM → Connect
```

### TypeScript errors
```bash
npx tsc --noEmit   # check errors without building
npm run build      # full build
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 34 (arm64, macOS 13+) |
| Frontend | React 18 + TypeScript |
| Build | electron-vite, Vite |
| Audio capture | ScreenCaptureKit (Swift subprocess, 24kHz Int16 PCM) |
| Audio recording | WAV writer — 16kHz mono, no external dependencies |
| Transcription | OpenAI Realtime API — dual-channel WebSocket |
| Embeddings | OpenAI `text-embedding-3-small` + local cosine similarity |
| Speaker diarization | OpenAI GPT-4o post-call analysis — name detection + conversation patterns |
| Summaries | OpenAI GPT-4o structured JSON output |
| Sentiment | OpenAI GPT-4o (text-based) + Gemini (optional voice tone) |
| Web search | Tavily API |
| NotebookLM | notebooklm-mcp-cli Python subprocess via MCP protocol |
| Design | Plus Jakarta Sans + Fraunces, CSS custom properties design system |

---

## Project Structure

```
src/
  main/                     # Electron main process
    audio-bridge.ts         # Swift subprocess + PCM chunk routing
    recording-writer.ts     # WAV recorder (16kHz mono, mic+sys mix)
    session-manager.ts      # Session/call storage and IPC
    knowledge-base.ts       # Document indexing + question detection
    speaker-diarizer.ts     # Speaker embedding extraction (sherpa-onnx)
    vector-store.ts         # Local embeddings + cosine similarity search
    contact-store.ts        # Contact import and storage (CSV, VCF)
    platform-skill.ts       # Per-contact persistent conversation memory
    gemini-service.ts       # Gemini API key management (optional)
    tavily-search.ts        # Web search fallback
    mcp-server-manager.ts   # NotebookLM Python subprocess (MCP)
    config.ts               # App config (userData/config.json)
    keychain.ts             # Encrypted key storage (Electron safeStorage)
  preload/
    index.ts                # IPC bridge — 50+ typed APIs as window.translize
  renderer/src/
    App.tsx                 # App state machine (loading → onboarding → home → call → summary)
    components/
      MainApp.tsx           # Active call — 3-panel layout
      SessionView/          # Transcript + audio controls
      KnowledgePanel/       # Live Context, Q&A cards, Ask input
      PostCallSummary.tsx   # Summary + recording player + contact association
      RelationshipsDashboard.tsx  # Portfolio analytics across all contacts
      Settings.tsx          # All app settings + API key management
      Onboarding/           # Multi-step setup flow
      SessionList.tsx       # Home screen with contact portfolio
      SessionSetup.tsx      # New call configuration
    hooks/
      useRealtimeTranscription.ts  # Audio + WebSocket session coordinator
    services/
      openai-realtime.ts    # Dual-channel WebSocket transcription service
      sentiment-engine.ts   # Text-based sentiment scoring (GPT-4o)
      summarizer.ts         # Post-call summary generation
      skill-manager.ts      # Contact skill read/write
    styles/
      global.css            # Design tokens: surfaces, ink, spacing, radius, fonts
swift/
  AudioCapture/             # ScreenCaptureKit binary (mic + system audio)
python/
  notebooklm_mcp/           # NotebookLM MCP server
build/                      # macOS entitlements, app icon
```

---

## License

Private. All rights reserved.
