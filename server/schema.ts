export type RiskLevel = 'low' | 'medium' | 'high'

export type PatchOperation = {
  op: 'replace'
  path: string
  value: unknown
}

export type PatchResponse = {
  summary: string
  riskLevel: RiskLevel
  requiresConfirmation: boolean
  operations: PatchOperation[]
}

export type ProviderMeta = {
  model: string
  backend: 'openai-compatible'
}

export type ServerProjectState = {
  metadata?: {
    projectName?: string
    grade?: string
    subject?: string
    studentCount?: number
    duration?: number
    venue?: string
    equipment?: string[]
  }
  lessonPlan?: {
    title?: string
    objectives?: string[]
    keyPoints?: string[]
    difficultPoints?: string[]
    sections?: { name?: string; duration?: number; organization?: string }[]
    safety?: string[]
  }
  screenConfig?: {
    theme?: string
    modules?: {
      id?: string
      type?: string
      title?: string
      items?: string[]
      duration?: number
      teams?: { name?: string; score?: number }[]
      groups?: string[]
      instruction?: string
      steps?: { name?: string; duration?: number }[]
      routes?: { from?: [number, number]; to?: [number, number]; label?: string }[]
    }[]
  }
  conversationHistory?: { role?: string; content?: string }[]
  versions?: { summary?: string; createdAt?: string }[]
}

const allowedPaths = new Set([
  '/screenConfig/theme',
  '/screenConfig/modules/rules-main/items',
  '/screenConfig/modules/flow-main/steps',
  '/screenConfig/modules/timer-game/duration',
  '/screenConfig/modules/score-main/teams',
  '/screenConfig/modules/rotation-main/instruction',
  '/screenConfig/modules/rotation-main/groups',
  '/screenConfig/modules/route-main/routes',
  '/screenConfig/modules/safety-main/items',
  '/screenConfig/modules/spirit-main/items',
])

export function assertPatchRequestBody(input: unknown): asserts input is { prompt: string; projectState: ServerProjectState } {
  if (!input || typeof input !== 'object') {
    throw new Error('请求体必须是对象。')
  }

  const body = input as Record<string, unknown>
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
    throw new Error('prompt 不能为空。')
  }

  if (!body.projectState || typeof body.projectState !== 'object') {
    throw new Error('projectState 缺失。')
  }
}

export function parsePatchResponse(raw: string): PatchResponse {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`模型未返回合法 JSON：${cleaned.slice(0, 200)}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('模型返回内容不是对象。')
  }

  const data = parsed as Record<string, unknown>
  if (typeof data.summary !== 'string' || !data.summary.trim()) {
    throw new Error('summary 缺失。')
  }
  if (!['low', 'medium', 'high'].includes(String(data.riskLevel))) {
    throw new Error('riskLevel 非法。')
  }
  if (typeof data.requiresConfirmation !== 'boolean') {
    throw new Error('requiresConfirmation 必须是布尔值。')
  }
  if (!Array.isArray(data.operations) || data.operations.length === 0) {
    throw new Error('operations 不能为空。')
  }

  const operations = data.operations.map(validateOperation)

  return {
    summary: data.summary,
    riskLevel: data.riskLevel as RiskLevel,
    requiresConfirmation: data.requiresConfirmation,
    operations,
  }
}

function validateOperation(input: unknown): PatchOperation {
  if (!input || typeof input !== 'object') {
    throw new Error('operation 必须是对象。')
  }

  const operation = input as Record<string, unknown>
  if (operation.op !== 'replace') {
    throw new Error('当前真实 AI 模式仅允许 replace 操作。')
  }
  if (typeof operation.path !== 'string' || !allowedPaths.has(operation.path)) {
    throw new Error(`不允许修改路径：${String(operation.path)}`)
  }
  if (!('value' in operation)) {
    throw new Error(`value 缺失：${operation.path}`)
  }

  validateValueByPath(operation.path, operation.value)

  return {
    op: 'replace',
    path: operation.path,
    value: operation.value,
  }
}

function validateValueByPath(path: string, value: unknown) {
  if (path === '/screenConfig/theme') {
    if (!['basketball', 'field', 'contrast'].includes(String(value))) {
      throw new Error('主题值非法。')
    }
    return
  }

  if (path === '/screenConfig/modules/timer-game/duration') {
    if (typeof value !== 'number' || value <= 0) {
      throw new Error('倒计时必须大于 0。')
    }
    return
  }

  if (path.endsWith('/items')) {
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new Error('items 必须是非空字符串数组。')
    }
    return
  }

  if (path.endsWith('/teams')) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error('teams 不能为空。')
    }
    for (const team of value) {
      if (!team || typeof team !== 'object') throw new Error('队伍项必须是对象。')
      const item = team as Record<string, unknown>
      if (typeof item.name !== 'string' || typeof item.score !== 'number') throw new Error('队伍项结构非法。')
    }
    return
  }

  if (path.endsWith('/groups')) {
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string')) {
      throw new Error('groups 必须是非空字符串数组。')
    }
    return
  }

  if (path.endsWith('/instruction')) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('instruction 不能为空。')
    }
    return
  }

  if (path.endsWith('/steps')) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error('steps 不能为空。')
    }
    for (const step of value) {
      if (!step || typeof step !== 'object') throw new Error('step 必须是对象。')
      const item = step as Record<string, unknown>
      if (typeof item.name !== 'string' || typeof item.duration !== 'number') throw new Error('step 结构非法。')
    }
    return
  }

  if (path.endsWith('/routes')) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error('routes 不能为空。')
    }
    for (const route of value) {
      if (!route || typeof route !== 'object') throw new Error('route 必须是对象。')
      const item = route as Record<string, unknown>
      const from = item.from as number[] | undefined
      const to = item.to as number[] | undefined
      if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) {
        throw new Error('route 坐标非法。')
      }
      if ([...from, ...to].some((point) => typeof point !== 'number' || point < 0 || point > 100)) {
        throw new Error('route 坐标必须在 0 到 100 范围内。')
      }
      if (typeof item.label !== 'string' || !item.label.trim()) {
        throw new Error('route label 不能为空。')
      }
    }
  }
}
