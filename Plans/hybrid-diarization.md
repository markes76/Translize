# Plan: Full Hybrid Diarization + Live Speaker Correction

## Goal
Always-on dual-channel diarization. No mode switching for audio. Every voice — in-room or remote — gets a numbered slot with live rename, "Not me" correction, and GPT name auto-detection.

## Architecture

### Audio channels (unchanged hardware, new labeling)
- Mic channel → in-room voices → slots `mic-1`, `mic-2`... labeled "In-Room 1", "In-Room 2"
- System channel → remote voices → slots `them-1`, `them-2`... labeled "Remote 1", "Remote 2"

### Speaker slot model
```typescript
interface Speaker {
  id: string           // 'mic-1' | 'mic-2' | 'them-1' | 'them-2' | 'you' (legacy)
  name: string         // "In-Room 1" | "Remote 1" | "Sarah" etc
  color: string
  isUser: boolean      // true = marked as "That's me"
  source: 'mic' | 'sys'
}
```

### TranscriptSegment changes
- `speaker: 'you' | 'them'` → `speaker: 'mic' | 'sys'`
- `speakerSlot` now used for BOTH channels (mic-1..N and them-1..N)

## Step-by-Step

### Step 1 — `openai-realtime.ts`
- Remove `faceToFace` flag entirely
- Mic channel: `diarize = true` always (not conditional)
- Mic slots use prefix `mic-` instead of `them-` 
- Sys slots use prefix `rem-` (remote) instead of `them-`
- `speaker` field: mic channel emits `'mic'`, sys channel emits `'sys'`

### Step 2 — `useRealtimeTranscription.ts`
- Remove `isFaceToFace` branch — always start both audio channels
- Remove `mode` param from `startSession()`
- Initial speakers list: empty (no pre-seeded "You" speaker)
- `handleTranscriptSegment`: mic slots → "In-Room N", sys slots → "Remote N"
- `detectSegmentSpeaker`: runs on ALL slots (mic and sys)
- Add `markAsMe(slotId)` action — sets `isUser=true` on that slot, sets `isUser=false` on all others
- Add `unmarkMe(slotId)` action — "Not me" button → sets `isUser=false`
- Slot label helpers: `mic-1` → "In-Room 1", `rem-1` → "Remote 1"

### Step 3 — `SessionSetup.tsx`
- Remove `facetime` mode from MODES array
- Rename remaining modes to clarify they are KNOWLEDGE modes:
  - `local` → "Local Docs" — search your uploaded documents
  - `both` → "Docs + NLM" — local speed + NotebookLM depth
  - `notebook` → "NotebookLM" — all context from NLM
- Add a `none` mode: "No Context" — pure transcription, no knowledge lookup
- Label the section "Knowledge Source" (not "Context Mode")

### Step 4 — `CallIntelligence.tsx` (speaker panel)
- Each speaker slot shows:
  - Colored dot + name label
  - "✎" rename button (existing)
  - If `isUser=false`: small "Me" button → calls `markAsMe(id)`
  - If `isUser=true`: "Not me" button → calls `unmarkMe(id)`
- "Me" button is subtle (ghost style) so it doesn't dominate

### Step 5 — `Transcript.tsx` (speaker labels in transcript)
- If segment's speaker slot has `isUser=true` → label shows "You (In-Room 2)" style
- Otherwise shows slot name: "In-Room 1", "Remote 2", "Sarah" etc.

### Step 6 — Sentiment + Summary compatibility
- Sentiment engine: update speaker references from `'you'/'them'` to handle `'mic'/'sys'`
- Post-call summary: segments now have mic/sys source — summarizer prompt unchanged (it uses speakerName)

## Files Changed
| File | Change |
|------|--------|
| `src/renderer/src/services/openai-realtime.ts` | Always diarize mic; mic→'mic', sys→'sys'; slot prefixes mic-/rem- |
| `src/renderer/src/hooks/useRealtimeTranscription.ts` | Remove facetime branch; always dual channel; markAsMe/unmarkMe actions |
| `src/renderer/src/components/SessionSetup.tsx` | Remove facetime; rename to knowledge modes; add 'none' mode |
| `src/renderer/src/components/CallIntelligence.tsx` | Add Me/Not-me buttons per speaker slot |
| `src/renderer/src/components/SessionView/Transcript.tsx` | Show "You (In-Room N)" when isUser=true |
| `src/renderer/src/components/MainApp.tsx` | Remove mode param from startSession call |
