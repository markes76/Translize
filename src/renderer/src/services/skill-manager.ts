import type { TranscriptSegment } from './openai-realtime'
import type { CallSummary } from './summarizer'
import type { SentimentAnalysis } from './sentiment-engine'

export interface ConversationSkill {
  skillId: string
  contact: {
    name: string
    company?: string
    role?: string
    firstInteraction: string
    totalCalls: number
    totalTalkTimeMinutes: number
  }
  relationshipSummary: string
  communicationPatterns: {
    theirStyle: string
    whatWorks: string
    whatToAvoid: string
  }
  sentimentTrajectory: Array<{ date: string; score: number; label: string; note: string }>
  keyTopics: Array<{ topic: string; status: string; lastMentioned: string; sentiment: string }>
  openActionItems: Array<{ item: string; owner: string; created: string }>
  resolvedActionItems: Array<{ item: string; owner: string; created: string; resolved: string }>
  riskFlags: Array<{ flag: string; severity: string; date: string }>
  languagesUsed: string[]
  lastUpdated: string
  callLog: Array<{ date: string; durationMinutes: number; overallSentiment: number; summary: string }>
}

export async function generateOrUpdateSkill(
  existingSkill: ConversationSkill | null,
  contactName: string,
  segments: TranscriptSegment[],
  summary: CallSummary,
  sentiment: SentimentAnalysis | null,
  apiKey: string
): Promise<ConversationSkill> {
  const transcript = segments.filter(s => s.isFinal).map(s => `[${s.speakerName ?? s.speaker}] ${s.text}`).join('\n')

  const prompt = existingSkill
    ? `You are updating an existing Conversation Skill for "${contactName}". Here is the CURRENT skill (JSON):\n\n${JSON.stringify(existingSkill, null, 2)}\n\nA new call just happened. Here is the new call transcript:\n\n${transcript}\n\nCall summary: ${summary.overview}\nSentiment score: ${sentiment?.overallScore ?? 'N/A'}\nSentiment label: ${sentiment?.overallLabel ?? 'N/A'}\n\nUpdate the skill by:\n1. APPEND a new entry to sentimentTrajectory\n2. APPEND a new entry to callLog\n3. REWRITE relationshipSummary to reflect the latest state\n4. UPDATE communicationPatterns with new observations\n5. ADD new keyTopics, update existing ones' status\n6. ADD new openActionItems, move completed ones to resolvedActionItems\n7. ADD any new riskFlags\n8. INCREMENT totalCalls and totalTalkTimeMinutes\n9. NEVER delete existing data -- only append or update\n\nReturn the COMPLETE updated skill as JSON.`
    : `Create a new Conversation Skill for "${contactName}" based on this first call.\n\nTranscript:\n${transcript}\n\nSummary: ${summary.overview}\nSentiment: ${sentiment?.overallScore ?? 0} (${sentiment?.overallLabel ?? 'Neutral'})\nDuration: ${summary.durationMinutes} minutes\n\nCreate a skill JSON with: skillId, contact (name, company if mentioned, role if mentioned), relationshipSummary, communicationPatterns (theirStyle, whatWorks, whatToAvoid), sentimentTrajectory (one entry), keyTopics, openActionItems, resolvedActionItems (empty), riskFlags, languagesUsed, callLog (one entry).\n\nReturn ONLY valid JSON.`

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You generate and update Conversation Skills -- structured intelligence briefs about contacts. Return ONLY valid JSON.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 3000
    })
  })

  if (!resp.ok) throw new Error(`Skill generation error: ${resp.status}`)
  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  const parsed = JSON.parse(data.choices[0]?.message?.content ?? '{}')

  return {
    skillId: parsed.skillId ?? parsed.skill_id ?? `skill-${contactName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    contact: {
      name: parsed.contact?.name ?? contactName,
      company: parsed.contact?.company,
      role: parsed.contact?.role,
      firstInteraction: parsed.contact?.firstInteraction ?? parsed.contact?.first_interaction ?? new Date().toISOString(),
      totalCalls: parsed.contact?.totalCalls ?? parsed.contact?.total_calls ?? 1,
      totalTalkTimeMinutes: parsed.contact?.totalTalkTimeMinutes ?? parsed.contact?.total_talk_time_minutes ?? summary.durationMinutes
    },
    relationshipSummary: parsed.relationshipSummary ?? parsed.relationship_summary ?? '',
    communicationPatterns: {
      theirStyle: parsed.communicationPatterns?.theirStyle ?? parsed.communication_patterns?.their_style ?? '',
      whatWorks: parsed.communicationPatterns?.whatWorks ?? parsed.communication_patterns?.what_works ?? '',
      whatToAvoid: parsed.communicationPatterns?.whatToAvoid ?? parsed.communication_patterns?.what_to_avoid ?? ''
    },
    sentimentTrajectory: parsed.sentimentTrajectory ?? parsed.sentiment_trajectory ?? [],
    keyTopics: parsed.keyTopics ?? parsed.key_topics ?? [],
    openActionItems: parsed.openActionItems ?? parsed.open_action_items ?? [],
    resolvedActionItems: parsed.resolvedActionItems ?? parsed.resolved_action_items ?? [],
    riskFlags: parsed.riskFlags ?? parsed.risk_flags ?? [],
    languagesUsed: parsed.languagesUsed ?? parsed.languages_used ?? ['English'],
    lastUpdated: new Date().toISOString(),
    callLog: parsed.callLog ?? parsed.call_log ?? []
  }
}

// Fuzzy match contact name against existing skills
export function fuzzyMatchContact(name: string, skills: ConversationSkill[]): ConversationSkill | null {
  if (!name) return null
  const lower = name.toLowerCase().trim()

  // Exact match
  const exact = skills.find(s => s.contact.name.toLowerCase() === lower)
  if (exact) return exact

  // Partial match (first name or last name)
  const parts = lower.split(/\s+/)
  const partial = skills.find(s => {
    const skillParts = s.contact.name.toLowerCase().split(/\s+/)
    return parts.some(p => skillParts.some(sp => sp.includes(p) || p.includes(sp)))
  })
  if (partial) return partial

  // Company match
  const company = skills.find(s => s.contact.company && s.contact.company.toLowerCase().includes(lower))
  if (company) return company

  return null
}
