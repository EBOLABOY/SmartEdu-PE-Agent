import type { ProjectState, ProviderHealth, ProviderPatchResponse } from '../types'

type PatchRequestBody = {
  prompt: string
  projectState: ProjectState
}

async function parseJsonResponse(response: Response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`服务返回了非 JSON 内容：${text.slice(0, 160)}`)
  }
}

export async function fetchProviderHealth(): Promise<ProviderHealth> {
  const response = await fetch('/api/health')
  const data = await parseJsonResponse(response)

  if (!response.ok || !data || typeof data !== 'object') {
    throw new Error('无法获取后端健康状态。')
  }

  return data as ProviderHealth
}

export async function requestProviderPatch(body: PatchRequestBody): Promise<ProviderPatchResponse> {
  const response = await fetch('/api/patch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await parseJsonResponse(response)

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : '真实 AI 请求失败。'
    throw new Error(message)
  }

  if (!data || typeof data !== 'object' || !('summary' in data)) {
    throw new Error('后端返回的 patch 结构无效。')
  }

  return data as ProviderPatchResponse
}
