import type { ServerProjectState } from './schema.js'

function summarizeProjectState(projectState: ServerProjectState) {
  const metadata = projectState.metadata
  const lesson = projectState.lessonPlan
  const modules =
    projectState.screenConfig?.modules?.map((module) => ({
      id: module.id,
      type: module.type,
      title: module.title,
      items: module.items?.slice(0, 4),
      duration: module.duration,
      teams: module.teams?.map((team) => team.name),
      instruction: module.instruction,
      groups: module.groups,
      steps: module.steps?.map((step) => `${step.name}:${step.duration}`),
      routes: module.routes?.map((route) => route.label),
    })) ?? []

  const history = projectState.conversationHistory?.slice(-4) ?? []
  const versions = projectState.versions?.slice(0, 3) ?? []

  return {
    metadata: {
      projectName: metadata?.projectName,
      grade: metadata?.grade,
      subject: metadata?.subject,
      studentCount: metadata?.studentCount,
      duration: metadata?.duration,
      venue: metadata?.venue,
      equipment: metadata?.equipment,
    },
    lesson: {
      title: lesson?.title,
      objectives: lesson?.objectives,
      keyPoints: lesson?.keyPoints,
      difficultPoints: lesson?.difficultPoints,
      sections: lesson?.sections?.map((section) => `${section.name}:${section.duration}`),
      safety: lesson?.safety,
    },
    modules,
    history,
    versions,
  }
}

export function buildMessages(prompt: string, projectState: ServerProjectState) {
  const snapshot = JSON.stringify(summarizeProjectState(projectState), null, 2)

  const system = [
    '你是一个体育课堂互动大屏 patch 生成器。',
    '你的任务不是解释，也不是写 HTML，而是根据教师指令，返回严格的 JSON patch。',
    '你只能输出 JSON，对象字段必须是：summary、riskLevel、requiresConfirmation、operations。',
    '当前版本只允许 replace 操作，禁止 add、remove、禁止返回未知字段。',
    '允许修改的路径只有：',
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
    'riskLevel 规则：规则/队名/时间/主题为 low，路线或安全相关改动至少为 medium。',
    '若教师请求超出允许范围，请在允许范围内给出最接近的可执行修改，不要返回空 operations。',
    '不要输出 Markdown，不要输出解释文字，不要加代码块。',
  ].join('\n')

  const user = [
    `教师请求：${prompt}`,
    '当前课堂项目摘要：',
    snapshot,
    '现在返回 JSON。',
  ].join('\n\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
