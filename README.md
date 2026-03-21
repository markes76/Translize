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

## Prerequisites

- **macOS 12.3+** (Monterey or later)
- **Node.js 20+**
- **Python 3.11+** (for NotebookLM CLI — `brew install python@3.13`)
- **Xcode Command Line Tools** (for Swift AudioCapture build)

## API Keys

| Service | Required | Purpose |
|---------|----------|---------|
| OpenAI | Yes | Transcription, analysis, embeddings, summaries |
| Tavily | Optional | Web search fallback |
| NotebookLM | Optional | Knowledge sync via `notebooklm-mcp-cli` |
| Gemini | Optional | Deep voice sentiment analysis |

## Install

```bash
git clone https://github.com/markes76/Translize.git
cd Translize
npm install
npm run build:swift    # Build the ScreenCaptureKit audio capture binary
```

## Run

```bash
# Development (with DevTools)
npm run dev

# Production build
npm run package
open dist/mac-arm64/Translize.app
```

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
