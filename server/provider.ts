import type { ServerProjectState } from './schema.js'
import { buildMessages } from './prompt.js'

type ProviderConfig = {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export function getProviderConfig(): ProviderConfig | null {
  const baseUrl = process.env.AI_BASE_URL?.trim()
  const apiKey = process.env.AI_API_KEY?.trim()
  const model = process.env.AI_MODEL?.trim()
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? '45000')

  if (!baseUrl || !apiKey || !model) {
    return null
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, model, timeoutMs }
}

export async function requestPatchFromProvider(prompt: string, projectState: ServerProjectState) {
  const config = getProviderConfig()
  if (!config) {
    throw new Error('AI provider 尚未配置，请检查 AI_BASE_URL、AI_API_KEY、AI_MODEL。')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: buildMessages(prompt, projectState),
      }),
    })

    const text = await response.text()
    let payload: unknown = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }

    if (!response.ok) {
      throw new Error(
        payload && typeof payload === 'object' && payload && 'error' in payload
          ? JSON.stringify(payload)
          : `模型请求失败：${text.slice(0, 240)}`,
      )
    }

    const content = extractMessageContent(payload)
    if (!content) {
      throw new Error('模型响应中未找到 message.content。')
    }

    return {
      model: config.model,
      content,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function extractMessageContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const choices = (payload as { choices?: unknown[] }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const message = (choices[0] as { message?: { content?: unknown } }).message
  const content = message?.content

  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: unknown }).text ?? '')
        }
        return ''
      })
      .join('')
  }
  return null
}
