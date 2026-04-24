export type ModuleType = 'rules' | 'flow' | 'timer' | 'scoreboard' | 'rotation' | 'route_map' | 'safety' | 'spirit'
export type RiskLevel = 'low' | 'medium' | 'high'
export type ThemeName = 'basketball' | 'field' | 'contrast'
export type ProviderMode = 'real' | 'mock'

export type BaseModule = { id: string; type: ModuleType; title: string }
export type RulesModule = BaseModule & { type: 'rules'; items: string[] }
export type FlowModule = BaseModule & { type: 'flow'; steps: { name: string; duration: number }[] }
export type TimerModule = BaseModule & { type: 'timer'; duration: number }
export type ScoreboardModule = BaseModule & { type: 'scoreboard'; teams: { name: string; score: number }[] }
export type RotationModule = BaseModule & { type: 'rotation'; groups: string[]; instruction: string }
export type RouteMapModule = BaseModule & {
  type: 'route_map'
  field: string
  objects: { type: 'cone' | 'start' | 'finish'; x: number; y: number }[]
  routes: { from: [number, number]; to: [number, number]; label: string }[]
}
export type SafetyModule = BaseModule & { type: 'safety'; items: string[] }
export type SpiritModule = BaseModule & { type: 'spirit'; items: string[] }

export type ScreenModule =
  | RulesModule
  | FlowModule
  | TimerModule
  | ScoreboardModule
  | RotationModule
  | RouteMapModule
  | SafetyModule
  | SpiritModule

export type LessonSection = { name: string; duration: number; organization: string }

export type RuntimeEvent = {
  id: string
  time: string
  type:
    | 'ai_patch'
    | 'manual_edit'
    | 'score_change'
    | 'timer_change'
    | 'export'
    | 'rollback'
    | 'validation_blocked'
    | 'provider_request'
    | 'provider_success'
    | 'provider_error'
  detail: string
}

export type ProjectState = {
  metadata: {
    projectName: string
    grade: string
    subject: string
    studentCount: number
    duration: number
    venue: string
    equipment: string[]
  }
  lessonPlan: {
    title: string
    objectives: string[]
    keyPoints: string[]
    difficultPoints: string[]
    sections: LessonSection[]
    assessment: string[]
    safety: string[]
  }
  screenConfig: {
    theme: ThemeName
    aspectRatio: '16:9'
    modules: ScreenModule[]
  }
  conversationHistory: { role: 'teacher' | 'agent'; content: string }[]
  versions: VersionSnapshot[]
  runtime: {
    startedAt: string
    events: RuntimeEvent[]
    sectionsCompleted: string[]
    timerUsage: string[]
    scoreChanges: string[]
    manualAdjustments: string[]
    teacherNotes: string[]
  }
}

export type VersionSnapshot = { id: string; createdAt: string; summary: string; state: ProjectState }
export type PatchOperation = { op: 'replace' | 'add' | 'remove'; path: string; value?: unknown }
export type PatchResponse = { summary: string; riskLevel: RiskLevel; requiresConfirmation: boolean; operations: PatchOperation[] }
export type PatchValidation = { valid: boolean; errors: string[]; warnings: string[]; riskLevel: RiskLevel }
export type ProviderMeta = { model: string; backend: 'openai-compatible'; fallback?: boolean }
export type ProviderPatchResponse = PatchResponse & { providerMeta?: ProviderMeta }
export type ProviderHealth = { ok: boolean; configured: boolean; model: string | null; baseUrl: string | null }
