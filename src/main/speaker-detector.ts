import { ipcMain } from 'electron'
import { keychainGet } from './keychain'

export interface Speaker {
  id: string
  name: string
  color: string
  isUser: boolean
}

export const SPEAKER_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed',
  '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5',
  '#be185d', '#0d9488', '#ca8a04', '#9333ea', '#e11d48'
]

let followUpItems: string[] = []

// Detect speaker names from a batch of recent transcript text.
// Returns names of people who introduced themselves or were identified as speaking.
async function gptDetectSpeakers(recentTranscript: string, existingNames: string[]): Promise<{ speakers: Array<{ name: string; context: string }> } | null> {
  const apiKey = keychainGet('openai-api-key')
  if (!apiKey) return null

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `You are analyzing a conversation transcript to identify WHO IS SPEAKING, not who is being spoken to.

Detect speakers only when someone IDENTIFIES THEMSELVES or is CLEARLY IDENTIFIED AS THE SPEAKER. Look for:
- Self-introductions: "Hi I'm [name]", "My name is [name]", "This is [name]", "[name] speaking", "[name] here"
- Role introductions: "I'm [name] from [company]", "[name] calling from..."
- Signing off: "[name] signing off", "This was [name]"
- Third-party intro by host: "I'd like to introduce [name]", "joining us is [name]"

DO NOT flag these as speaker identifications (these name someone being addressed, not who is speaking):
- "Thanks, [name]" — addressing someone else
- "What do you think, [name]?" — asking someone a question
- "I agree with [name]" — referencing someone else

Already known speakers (skip these): ${existingNames.length > 0 ? existingNames.join(', ') : 'none yet'}

Return JSON only: {"speakers": [{"name": "First Last or First name", "context": "exact phrase that identified them"}]}
If no new speakers, return: {"speakers": []}`
        }, {
          role: 'user',
          content: recentTranscript
        }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 300
      })
    })

    if (!resp.ok) return null
    const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
    return JSON.parse(data.choices[0]?.message?.content ?? '{"speakers":[]}')
  } catch {
    return null
  }
}

// Detect a speaker name from a single segment with surrounding context.
// Returns: { name: string; slot: string } if identified, or null.
async function gptDetectSegmentSpeaker(
  segmentText: string,
  speakerSlot: string,
  contextLines: string[],
  existingSlotNames: Record<string, string>
): Promise<{ name: string; slot: string } | null> {
  const apiKey = keychainGet('openai-api-key')
  if (!apiKey) return null

  const knownSlots = Object.entries(existingSlotNames)
    .map(([slot, name]) => `${slot} = "${name}"`)
    .join(', ')

  const contextBlock = contextLines.length > 0
    ? `Recent conversation context:\n${contextLines.join('\n')}\n\n`
    : ''

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `You are analyzing a single utterance from speaker slot "${speakerSlot}" to determine if the speaker identified themselves.

${knownSlots ? `Already identified slots: ${knownSlots}` : 'No speakers identified yet.'}

Rules — ONLY return a name if the SPEAKER OF THIS UTTERANCE is identifying themselves:
- "Hi I'm Sarah" → {"name": "Sarah", "slot": "${speakerSlot}"}
- "This is John from Acme" → {"name": "John", "slot": "${speakerSlot}"}
- "Thanks Sarah" → null (addressing someone, not self-introduction)
- "Sarah mentioned..." → null (referencing someone)

Return JSON: {"name": "detected name", "slot": "${speakerSlot}"} or {"name": null}`
        }, {
          role: 'user',
          content: `${contextBlock}Current utterance from ${speakerSlot}: "${segmentText}"`
        }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 100
      })
    })

    if (!resp.ok) return null
    const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
    const parsed = JSON.parse(data.choices[0]?.message?.content ?? '{"name":null}') as { name: string | null; slot?: string }
    if (!parsed.name) return null
    return { name: parsed.name, slot: speakerSlot }
  } catch {
    return null
  }
}

export function setupSpeakerIpc(): void {
  ipcMain.removeHandler('speaker:detect')
  ipcMain.handle('speaker:detect', async (_e, transcript: string, existingNames: string[]) => {
    try {
      return await gptDetectSpeakers(transcript, existingNames)
    } catch {
      return { speakers: [] }
    }
  })

  // Per-segment detection: fires immediately when a segment is finalized
  ipcMain.removeHandler('speaker:detect-segment')
  ipcMain.handle('speaker:detect-segment', async (
    _e,
    segmentText: string,
    speakerSlot: string,
    contextLines: string[],
    existingSlotNames: Record<string, string>
  ) => {
    try {
      return await gptDetectSegmentSpeaker(segmentText, speakerSlot, contextLines, existingSlotNames)
    } catch {
      return null
    }
  })

  ipcMain.removeHandler('speaker:get-colors')
  ipcMain.handle('speaker:get-colors', () => SPEAKER_COLORS)

  ipcMain.removeHandler('followup:add')
  ipcMain.handle('followup:add', (_e, question: string) => {
    followUpItems.push(question)
    return { ok: true }
  })

  ipcMain.removeHandler('followup:list')
  ipcMain.handle('followup:list', () => followUpItems)

  ipcMain.removeHandler('followup:clear')
  ipcMain.handle('followup:clear', () => {
    followUpItems = []
    return { ok: true }
  })
}
