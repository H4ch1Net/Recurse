// Optional AI features (Feynman feedback, pack generation). Calls go straight from the
// browser to the provider with the learner's own key; nothing passes through a server.
import { sanitizePack } from './packSchema'

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    defaultModel: 'claude-haiku-4-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-...'
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-...'
  },
  openrouter: {
    label: 'OpenRouter',
    defaultModel: 'google/gemma-3-4b-it:free',
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-...'
  }
}

export function isAIConfigured(config) {
  return Boolean(config?.apiKey && PROVIDERS[config.provider])
}

function errorMessage(status, body) {
  const detail = body?.error?.message || body?.message || (typeof body?.error === 'string' ? body.error : '')
  if (status === 401 || status === 403) return 'The provider rejected the API key. Check it in Settings.'
  if (status === 429) return 'Rate limited by the provider. Wait a moment and try again.'
  if (status >= 500) return 'The provider is having trouble right now. Try again shortly.'
  return detail ? `Request failed: ${detail}` : `Request failed with status ${status}`
}

/** Send one system + user prompt and return the text reply. Throws with a readable message. */
export async function callAI(config, system, user, { maxTokens = 2048, timeoutMs = 60000, signal } = {}) {
  if (!isAIConfigured(config)) throw new Error('Add an API key in Settings to use AI features.')
  const provider = PROVIDERS[config.provider]
  const model = config.model?.trim() || provider.defaultModel
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  signal?.addEventListener('abort', () => controller.abort())

  let url
  let headers
  let body
  if (config.provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages'
    headers = {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    }
    body = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }
  } else {
    url = config.provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions'
    headers = { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` }
    if (config.provider === 'openrouter') headers['X-Title'] = 'Recurse'
    body = { model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }
  }

  let response
  try {
    response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out or was cancelled.', { cause: error })
    throw new Error('Could not reach the provider. Check your connection.', { cause: error })
  } finally {
    clearTimeout(timer)
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorMessage(response.status, data))

  const text = config.provider === 'anthropic'
    ? (data?.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('')
    : data?.choices?.[0]?.message?.content
  if (!text) {
    if (data?.stop_reason === 'refusal') throw new Error('The model declined this request.')
    throw new Error('The provider returned an empty response.')
  }
  return text
}

/** Pull the first JSON object out of a model reply (tolerates code fences and prose). */
export function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const source = fenced ? fenced[1] : text
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('The reply did not contain JSON.')
  return JSON.parse(source.slice(start, end + 1))
}

const FEYNMAN_SYSTEM = `You are a patient tutor grading a learner's plain-language explanation of a topic.
Judge understanding, not vocabulary. Be specific and encouraging, and point at concrete gaps.
Reply with only a JSON object with these keys:
{"score": integer 0-100, "strengths": "2-3 sentences", "gaps": "2-3 sentences on what is missing", "misconceptions": "anything factually wrong, or an empty string", "modelExplanation": "a clear 3-5 sentence explanation a beginner would understand"}`

export async function gradeExplanation(config, { topic, prompt, keyTerms = [], text }) {
  const user = `Topic: ${topic}\nPrompt: ${prompt}\nKey ideas the explanation could cover: ${keyTerms.join(', ') || 'n/a'}\n\nLearner's explanation:\n${text}`
  const parsed = extractJSON(await callAI(config, FEYNMAN_SYSTEM, user, { maxTokens: 2048 }))
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)))
  return {
    score,
    strengths: String(parsed.strengths || ''),
    gaps: String(parsed.gaps || ''),
    misconceptions: String(parsed.misconceptions || '').replace(/^none\.?$/i, ''),
    modelExplanation: String(parsed.modelExplanation || parsed.suggestion || '')
  }
}

const PACK_SYSTEM = `You write study packs for Recurse, a spaced-repetition app. Reply with only one JSON object, no prose.
Shape:
{"id": "kebab-case-slug", "name": "Topic name", "subject": one of "programming","cs","tools","web","security","math","science","humanities","languages",
 "level": "beginner"|"intermediate"|"advanced", "description": "one sentence", "icon": "1-3 characters",
 "language": code highlighting language or "plaintext",
 "lesson": {"estimatedMinutes": number, "intro": "2 sentences", "sections": [{"title": "", "body": "short paragraphs separated by blank lines", "code": "optional", "check": {"question": "", "choices": [4 strings], "answer": index, "explanation": ""}}],
            "keyTerms": [{"term": "", "definition": ""}], "summary": ["3-5 takeaways"], "feynmanPrompt": "Explain ..."},
 "questions": [ ... ]}
Question shapes (every question has "id", "type", "difficulty" easy|medium|hard, "question", "explanation", "concept", "section" index):
- "mcq": "choices" (4 plausible options), "answer" (index of the correct one)
- "typed": short exact "answer" string plus "accept" array of equivalent answers
- "recall": open question with "answer" as the 1-3 sentence back of a flashcard
Rules: facts must be correct; one unambiguous answer per question; distractors are realistic mistakes; explanations say why.
Use 3-5 lesson sections and the requested number of questions, mixing the three types sensibly for the subject.`

export async function generatePack(config, { topic, level = 'beginner', count = 12, notes = '' }, signal) {
  const user = `Topic: ${topic}\nLevel: ${level}\nNumber of questions: ${count}${notes ? `\nFocus: ${notes}` : ''}`
  const raw = extractJSON(await callAI(config, PACK_SYSTEM, user, { maxTokens: 16000, timeoutMs: 180000, signal }))
  return sanitizePack({ ...raw, author: 'AI generated' })
}
