import fs from 'fs'
import path from 'path'
import { app, ipcMain } from 'electron'
import { readConfig } from './config'
import { keychainGet } from './keychain'

let micBuffer: Buffer[] = []
let sysBuffer: Buffer[] = []
let bufferStartTime = 0
let cleanupTimer: ReturnType<typeof setTimeout> | null = null

function tempDir(): string {
  const dir = path.join(app.getPath('temp'), 'translize-audio')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function isBufferingEnabled(): boolean {
  const config = readConfig() as any
  return !!config.audio_buffering_enabled
}

export function appendMicChunk(chunk: Buffer): void {
  if (!isBufferingEnabled()) return
  micBuffer.push(Buffer.from(chunk))
}

export function appendSysChunk(chunk: Buffer): void {
  if (!isBufferingEnabled()) return
  sysBuffer.push(Buffer.from(chunk))
}

export function startBuffering(): void {
  micBuffer = []
  sysBuffer = []
  bufferStartTime = Date.now()
}

export function stopBuffering(): { micFile: string | null; sysFile: string | null; durationMs: number } {
  if (!isBufferingEnabled() || (micBuffer.length === 0 && sysBuffer.length === 0)) {
    return { micFile: null, sysFile: null, durationMs: 0 }
  }

  const dir = tempDir()
  const ts = Date.now()
  let micFile: string | null = null
  let sysFile: string | null = null

  if (micBuffer.length > 0) {
    micFile = path.join(dir, `mic-${ts}.raw`)
    fs.writeFileSync(micFile, Buffer.concat(micBuffer))
  }
  if (sysBuffer.length > 0) {
    sysFile = path.join(dir, `sys-${ts}.raw`)
    fs.writeFileSync(sysFile, Buffer.concat(sysBuffer))
  }

  const durationMs = Date.now() - bufferStartTime
  micBuffer = []
  sysBuffer = []

  // Schedule auto-delete in 30 minutes
  cleanupTimer = setTimeout(() => {
    if (micFile && fs.existsSync(micFile)) fs.unlinkSync(micFile)
    if (sysFile && fs.existsSync(sysFile)) fs.unlinkSync(sysFile)
    console.log('[AudioBuffer] Temp files auto-deleted')
  }, 30 * 60 * 1000)

  return { micFile, sysFile, durationMs }
}

export function deleteBufferedAudio(micFile: string | null, sysFile: string | null): void {
  if (micFile && fs.existsSync(micFile)) fs.unlinkSync(micFile)
  if (sysFile && fs.existsSync(sysFile)) fs.unlinkSync(sysFile)
  if (cleanupTimer) { clearTimeout(cleanupTimer); cleanupTimer = null }
  console.log('[AudioBuffer] Audio files deleted')
}

export function setupAudioBufferIpc(): void {
  ipcMain.handle('audio-buffer:status', () => ({
    enabled: isBufferingEnabled(),
    micChunks: micBuffer.length,
    sysChunks: sysBuffer.length,
    durationMs: bufferStartTime > 0 ? Date.now() - bufferStartTime : 0
  }))

  ipcMain.handle('audio-buffer:stop', () => stopBuffering())

  ipcMain.handle('audio-buffer:delete', (_e, micFile: string | null, sysFile: string | null) => {
    deleteBufferedAudio(micFile, sysFile)
    return { ok: true }
  })

  ipcMain.handle('audio-buffer:deep-analyze', async (_e, micFile: string | null, sysFile: string | null, transcript: string) => {
    const apiKey = keychainGet('gemini-api-key')
    if (!apiKey) return { error: 'Gemini API key not configured' }

    // For now, do text-based enhanced analysis since audio upload to Gemini requires specific format handling
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analyze this call transcript for deep sentiment including likely vocal dynamics. For each speaker, assess:
1. Likely tone of voice (confident, hesitant, frustrated, enthusiastic, neutral)
2. Vocal energy patterns (high/low, changes over time)
3. Emotional peaks (moments where emotion is strongest)
4. Text-voice mismatches (where words might not match likely tone)
5. Overall voice sentiment vs text sentiment

Return JSON: {
  "voiceSentiment": { "overall": number, "label": string },
  "textSentiment": { "overall": number, "label": string },
  "perSpeaker": [{ "speaker": string, "voiceTone": string, "energy": string, "emotions": [string] }],
  "mismatches": [{ "timestamp": string, "text": string, "textSentiment": string, "likelyVoiceSentiment": string }],
  "vocalDynamics": { "paceChanges": [string], "energyArc": string },
  "adjustedScore": number,
  "adjustmentReason": string
}

Transcript:
${transcript}`
            }]
          }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        })
      })

      if (!resp.ok) return { error: `Gemini API error: ${resp.status}` }

      const data = await resp.json() as any
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) return { error: 'Empty Gemini response' }

      // Clean up audio files after analysis
      deleteBufferedAudio(micFile, sysFile)

      return { ok: true, analysis: JSON.parse(text) }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
}
