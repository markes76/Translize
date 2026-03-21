import type { TranscriptSegment } from './openai-realtime'

export interface SpeakerSentiment {
  speaker: string
  score: number
  label: string
  dominantEmotions: string[]
  communicationStyle: string
  talkTimePercent: number
}

export interface EmotionalMoment {
  timestamp: string
  speaker: string
  excerpt: string
  significance: string
}

export interface RelationshipSignals {
  trustIndicators: string[]
  riskFlags: string[]
  opportunitySignals: string[]
}

export interface ToneShift {
  windowStart: string
  windowEnd: string
  scores: Record<string, number>
}

export interface SentimentAnalysis {
  overallScore: number
  overallLabel: string
  overallSummary: string
  perSpeaker: SpeakerSentiment[]
  toneTimeline: ToneShift[]
  keyMoments: EmotionalMoment[]
  relationshipSignals: RelationshipSignals
}

export async function analyzeSentiment(
  segments: TranscriptSegment[],
  apiKey: string
): Promise<SentimentAnalysis> {
  const transcript = segments
    .filter(s => s.isFinal)
    .map(s => `[${s.speakerName ?? s.speaker}] ${s.text}`)
    .join('\n')

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'system',
        content: `You are a sentiment analysis expert. Analyze this call transcript and return a structured JSON with:

1. overallScore: -1.0 (very negative) to +1.0 (very positive)
2. overallLabel: one of "Very Negative", "Negative", "Slightly Negative", "Neutral", "Slightly Positive", "Positive", "Very Positive"
3. overallSummary: one sentence describing the emotional arc of the call
4. perSpeaker: array for each speaker with score, label, dominantEmotions (2-3 emotions), communicationStyle (one phrase), talkTimePercent
5. toneTimeline: array of 3-5 time windows showing how sentiment shifted. Each has windowStart, windowEnd, and scores per speaker
6. keyMoments: 3-5 most emotionally significant moments with timestamp reference, speaker, brief excerpt, and significance
7. relationshipSignals: trustIndicators (array), riskFlags (array), opportunitySignals (array)

Return ONLY valid JSON.`
      }, {
        role: 'user',
        content: transcript
      }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2000
    })
  })

  if (!resp.ok) throw new Error(`Sentiment API error: ${resp.status}`)
  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  const parsed = JSON.parse(data.choices[0]?.message?.content ?? '{}')

  return {
    overallScore: parsed.overallScore ?? 0,
    overallLabel: parsed.overallLabel ?? 'Neutral',
    overallSummary: parsed.overallSummary ?? '',
    perSpeaker: parsed.perSpeaker ?? [],
    toneTimeline: parsed.toneTimeline ?? [],
    keyMoments: parsed.keyMoments ?? [],
    relationshipSignals: parsed.relationshipSignals ?? { trustIndicators: [], riskFlags: [], opportunitySignals: [] }
  }
}

// Lightweight live sentiment check (runs every 30s during call)
export async function checkLiveSentiment(
  recentText: string,
  apiKey: string
): Promise<{ score: number; label: string }> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'Rate the emotional tone of this conversation excerpt. Return JSON: {"score": number from -1 to 1, "label": "positive" or "neutral" or "negative"}'
      }, {
        role: 'user',
        content: recentText
      }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 50
    })
  })

  if (!resp.ok) return { score: 0, label: 'neutral' }
  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  try {
    const parsed = JSON.parse(data.choices[0]?.message?.content ?? '{}')
    return { score: parsed.score ?? 0, label: parsed.label ?? 'neutral' }
  } catch {
    return { score: 0, label: 'neutral' }
  }
}
