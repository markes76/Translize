import { ipcMain } from 'electron'
import { keychainGet } from './keychain'

export interface Speaker {
  id: string
  name: string
  color: string
  isUser: boolean
}

const SPEAKER_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed',
  '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5',
  '#be185d', '#0d9488', '#ca8a04', '#9333ea', '#e11d48'
]

let followUpItems: string[] = []

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
          content: `Analyze this conversation transcript and detect any speaker introductions or name mentions. Look for patterns like:
- "Hi, I'm [name]" / "My name is [name]"
- "This is [name] from [company]"
- "[Name] speaking" / "[Name] here"
- Someone addressing another person by name

Already known speakers: ${existingNames.length > 0 ? existingNames.join(', ') : 'none yet'}

Return JSON: {"speakers": [{"name": "detected name", "context": "the phrase where name was found"}]}
If no new speakers detected, return {"speakers": []}`
        }, {
          role: 'user',
          content: recentTranscript
        }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 200
      })
    })

    if (!resp.ok) return null
    const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
    return JSON.parse(data.choices[0]?.message?.content ?? '{"speakers":[]}')
  } catch {
    return null
  }
}

export function setupSpeakerIpc(): void {
  ipcMain.handle('speaker:detect', async (_e, transcript: string, existingNames: string[]) => {
    try {
      return await gptDetectSpeakers(transcript, existingNames)
    } catch {
      return { speakers: [] }
    }
  })

  ipcMain.handle('speaker:get-colors', () => SPEAKER_COLORS)

  ipcMain.handle('followup:add', (_e, question: string) => {
    followUpItems.push(question)
    return { ok: true }
  })

  ipcMain.handle('followup:list', () => followUpItems)

  ipcMain.handle('followup:clear', () => {
    followUpItems = []
    return { ok: true }
  })
}
