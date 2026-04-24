import type {
  PatchOperation,
  PatchResponse,
  PatchValidation,
  ProjectState,
  RiskLevel,
  RuntimeEvent,
  ScreenModule,
  VersionSnapshot,
} from '../types'

export const cloneState = (state: ProjectState): ProjectState => structuredClone(state)

export const createRuntimeEvent = (type: RuntimeEvent['type'], detail: string): RuntimeEvent => ({
  id: crypto.randomUUID(),
  time: new Date().toLocaleString(),
  type,
  detail,
})

export const createVersion = (summary: string, state: ProjectState): VersionSnapshot => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toLocaleString(),
  summary,
  state: cloneState(state),
})

export function makeMockPatch(input: string): PatchResponse {
  const operations: PatchOperation[] = []
  let summary = '根据你的要求优化课堂大屏。'
  let riskLevel: RiskLevel = 'low'

  if (input.includes('规则')) {
    summary = '将规则改成更适合小学生理解的短句。'
    operations.push({ op: 'replace', path: '/screenConfig/modules/rules-main/items', value: ['听清口令再出发', '运球绕过标志桶后返回', '回到起点后拍手交接', '遵守路线，安全第一'] })
  }

  if (input.includes('队') || input.includes('计分')) {
    summary = '更新为四队动物队名，并保留计分器。'
    operations.push({ op: 'replace', path: '/screenConfig/modules/score-main/teams', value: [{ name: '猎豹队', score: 0 }, { name: '雄鹰队', score: 0 }, { name: '海豚队', score: 0 }, { name: '骏马队', score: 0 }] })
  }

  if (input.includes('8分钟') || input.includes('八分钟')) {
    summary = '将接力挑战倒计时改为8分钟。'
    operations.push({ op: 'replace', path: '/screenConfig/modules/timer-game/duration', value: 480 })
  }

  if (input.includes('0分钟') || input.includes('负数')) {
    summary = '尝试修改倒计时为非法时长。'
    operations.push({ op: 'replace', path: '/screenConfig/modules/timer-game/duration', value: 0 })
  }

  if (input.includes('清空队伍')) {
    summary = '尝试清空队伍。'
    operations.push({ op: 'replace', path: '/screenConfig/modules/score-main/teams', value: [] })
  }

  if (input.includes('删除安全')) {
    summary = '尝试删除安全提醒模块。'
    riskLevel = 'high'
    operations.push({ op: 'remove', path: '/screenConfig/modules/safety-main' })
  }

  if (input.includes('路线') || input.includes('右侧')) {
    summary = '更新路线图，强调右侧返回，降低逆向碰撞风险。'
    riskLevel = maxRisk(riskLevel, 'medium')
    operations.push({ op: 'replace', path: '/screenConfig/modules/route-main/routes', value: [{ from: [18, 50], to: [65, 35], label: '绕桶前进' }, { from: [65, 35], to: [18, 62], label: '右侧返回，避免碰撞' }] })
  }

  if (input.includes('安全') || input.includes('掉球')) {
    summary = '增加更明确的安全提醒。'
    riskLevel = maxRisk(riskLevel, 'medium')
    operations.push({ op: 'replace', path: '/screenConfig/modules/safety-main/items', value: ['出发前看清前方同学位置', '绕桶时保持一臂以上距离', '掉球后先观察周围再捡球', '返回时从队伍外侧绕行'] })
  }

  if (input.includes('主题') || input.includes('高对比') || input.includes('投屏')) {
    summary = '切换为高对比投屏主题。'
    operations.push({ op: 'replace', path: '/screenConfig/theme', value: 'contrast' })
  }

  if (operations.length === 0) {
    operations.push({ op: 'replace', path: '/screenConfig/modules/spirit-main/items', value: ['主动合作', '遵守规则', '勇敢尝试', '为队友鼓掌'] })
  }

  return { summary, riskLevel, requiresConfirmation: riskLevel === 'high', operations }
}

function maxRisk(current: RiskLevel, next: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ['low', 'medium', 'high']
  return order.indexOf(next) > order.indexOf(current) ? next : current
}

export function validatePatch(state: ProjectState, patch: PatchResponse): PatchValidation {
  const errors: string[] = []
  const warnings: string[] = []
  let riskLevel = patch.riskLevel

  for (const operation of patch.operations) {
    if (!operation.path.startsWith('/screenConfig/')) {
      errors.push(`不支持的修改路径：${operation.path}`)
      continue
    }

    if (operation.path === '/screenConfig/theme') {
      if (!['basketball', 'field', 'contrast'].includes(String(operation.value))) {
        errors.push('主题值非法。')
      }
      continue
    }

    const moduleId = operation.path.split('/')[3]
    if (!moduleId) {
      errors.push(`缺少模块ID：${operation.path}`)
      continue
    }

    const module = state.screenConfig.modules.find((item) => item.id === moduleId)
    if (!module && operation.op !== 'add') {
      errors.push(`目标模块不存在：${moduleId}`)
      continue
    }

    if (operation.op === 'remove' && module?.type === 'safety') {
      errors.push('不能删除安全提醒模块。')
      riskLevel = 'high'
    }

    if (module?.type === 'timer' && operation.path.endsWith('/duration')) {
      const duration = Number(operation.value)
      if (!Number.isFinite(duration) || duration <= 0) {
        errors.push('倒计时必须大于0秒。')
        riskLevel = 'high'
      }
    }

    if (module?.type === 'scoreboard' && operation.path.endsWith('/teams')) {
      const teams = operation.value as unknown[]
      if (!Array.isArray(teams) || teams.length === 0) {
        errors.push('队伍不能为空。')
        riskLevel = 'high'
      }
    }

    if ((module?.type === 'rules' || module?.type === 'safety') && operation.path.endsWith('/items')) {
      const items = operation.value as unknown[]
      if (!Array.isArray(items) || items.length === 0) {
        errors.push(`${module.title}内容不能为空。`)
        riskLevel = 'high'
      }
    }

    if (module?.type === 'route_map' && operation.path.endsWith('/routes')) {
      riskLevel = maxRisk(riskLevel, 'medium')
      const routes = operation.value as { from: [number, number]; to: [number, number] }[]
      if (!Array.isArray(routes) || routes.some((route) => !pointInBounds(route.from) || !pointInBounds(route.to))) {
        errors.push('路线坐标必须在0到100的画布范围内。')
        riskLevel = 'high'
      } else {
        warnings.push('路线变更会影响课堂组织，请确认场地安全。')
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, riskLevel }
}

function pointInBounds(point: [number, number]) {
  return point.every((value) => Number.isFinite(value) && value >= 0 && value <= 100)
}

export function applyPatch(state: ProjectState, patch: PatchResponse): ProjectState {
  const next = cloneState(state)
  for (const operation of patch.operations) {
    if (operation.op === 'replace') setValueAtPath(next, operation.path, operation.value)
    if (operation.op === 'add' && operation.path === '/screenConfig/modules/-') next.screenConfig.modules.push(operation.value as ScreenModule)
    if (operation.op === 'remove') removeByPath(next, operation.path)
  }
  return next
}

function setValueAtPath(state: ProjectState, path: string, value: unknown) {
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'screenConfig' && parts[1] === 'theme') {
    state.screenConfig.theme = value as ProjectState['screenConfig']['theme']
    return
  }
  if (parts[0] === 'screenConfig' && parts[1] === 'modules') {
    const module = state.screenConfig.modules.find((item) => item.id === parts[2]) as Record<string, unknown> | undefined
    if (!module) throw new Error(`Patch target not found: ${path}`)
    module[parts[3]] = value
    return
  }
  throw new Error(`Unsupported patch path: ${path}`)
}

function removeByPath(state: ProjectState, path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'screenConfig' && parts[1] === 'modules') {
    state.screenConfig.modules = state.screenConfig.modules.filter((item) => item.id !== parts[2])
  }
}
