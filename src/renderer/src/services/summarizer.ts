import type { TranscriptSegment } from './openai-realtime'

export interface AttributedLine {
  speaker: string   // e.g. "Mark", "Sarah", "Speaker 2"
  text: string
  timestamp: number
}

// Post-call speaker diarization via GPT-4o
// Sends the full raw transcript and gets back speaker-attributed lines
export async function diarizeTranscript(
  segments: TranscriptSegment[],
  apiKey: string
): Promise<AttributedLine[]> {
  const finalSegs = segments.filter(s => s.isFinal && s.text.trim())
  if (!finalSegs.length) return []

  // Build numbered transcript lines
  const lines = finalSegs.map((s, i) =>
    `[${i}] ${s.text}`
  ).join('\n')

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a conversation analyst. Given a raw transcript from a recorded conversation, identify who said each line.

Key instructions:
- This is a real conversation between 2 or more people. Each line was spoken by exactly one person.
- Look for names people introduce themselves with (e.g. "I'm Mark", "My name is Sarah", "I am Larry") — use those names.
- Look for conversational turn-taking: questions followed by answers are different speakers.
- Look for first-person pronouns alternating: one person says "I think...", another responds "You're right, I believe..."
- If the same name is introduced twice in sequence (e.g. "I'm Mark" then "I am Larry"), those are TWO different people speaking in turn.
- If no names are ever mentioned, label them Speaker 1, Speaker 2, etc.
- IMPORTANT: most conversations have at least 2 speakers. Do not assign everything to one person unless the transcript is clearly a monologue.

Return a JSON object with key "lines" containing an array.
Each element: {"index": <number matching [N] prefix>, "speaker": "<name>"}
Example: {"lines": [{"index": 0, "speaker": "Mark"}, {"index": 1, "speaker": "Larry"}, ...]}`
        },
        {
          role: 'user',
          content: `Attribute each line to a speaker:\n\n${lines}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  })

  if (!resp.ok) throw new Error(`Diarization API error: ${resp.status}`)

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  const content = data.choices[0]?.message?.content
  if (!content) return finalSegs.map(s => ({ speaker: 'Speaker 1', text: s.text, timestamp: s.timestamp }))

  let assignments: Array<{ index: number; speaker: string }> = []
  try {
    const parsed = JSON.parse(content)
    // response_format: json_object always returns an object — extract the array from any key
    if (Array.isArray(parsed)) {
      assignments = parsed
    } else {
      // Try known keys, then fallback to first array value found
      const val = parsed.lines ?? parsed.speakers ?? parsed.result ?? parsed.assignments ?? parsed.attribution
      if (Array.isArray(val)) {
        assignments = val
      } else {
        // Last resort: find first array in the object
        for (const v of Object.values(parsed)) {
          if (Array.isArray(v)) { assignments = v as typeof assignments; break }
        }
      }
    }
  } catch {
    return finalSegs.map(s => ({ speaker: 'Speaker 1', text: s.text, timestamp: s.timestamp }))
  }

  const speakerMap = new Map(assignments.map(a => [a.index, a.speaker]))
  return finalSegs.map((s, i) => ({
    speaker: speakerMap.get(i) ?? 'Speaker 1',
    text: s.text,
    timestamp: s.timestamp
  }))
}

export interface CallSummary {
  dateTime: string
  durationMinutes: number
  participants: string[]
  keyTopics: string[]
  actionItems: Array<{ item: string; owner?: string }>
  decisions: string[]
  followUps: string[]
  overview: string
}

export async function generateSummary(
  segments: TranscriptSegment[],
  apiKey: string
): Promise<CallSummary> {
  const transcript = segments
    .map(s => `[${s.speakerName ?? 'Speaker'}] ${s.text}`)
    .join('\n')

  const firstTs = segments[0]?.timestamp ?? Date.now()
  const lastTs = segments[segments.length - 1]?.timestamp ?? Date.now()
  const durationMinutes = Math.round((lastTs - firstTs) / 60000)

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a call summary assistant. Analyze the transcript and produce a structured JSON summary with these fields:
- participants: array of speaker names/labels identified
- keyTopics: 3-5 main topics discussed
- actionItems: array of {item, owner?} for tasks mentioned
- decisions: key decisions made
- followUps: things that need follow-up
- overview: 2-3 sentence summary of the call

Return ONLY valid JSON matching this structure.`
        },
        {
          role: 'user',
          content: `Summarize this call transcript:\n\n${transcript}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    })
  })

  if (!resp.ok) {
    throw new Error(`Summary API error: ${resp.status}`)
  }

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  const content = data.choices[0]?.message?.content
  if (!content) throw new Error('Empty summary response')

  const parsed = JSON.parse(content)

  return {
    dateTime: new Date(firstTs).toISOString(),
    durationMinutes,
    participants: parsed.participants ?? ['You', 'Them'],
    keyTopics: parsed.keyTopics ?? [],
    actionItems: parsed.actionItems ?? [],
    decisions: parsed.decisions ?? [],
    followUps: parsed.followUps ?? [],
    overview: parsed.overview ?? ''
  }
}
