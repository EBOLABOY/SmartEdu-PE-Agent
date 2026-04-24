import { useEffect, useState } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { ProjectEditor } from './components/ProjectEditor'
import { ScreenPreview } from './components/ScreenPreview'
import { defaultProject, demoPrompts } from './data/defaultProject'
import { fetchProviderHealth, requestProviderPatch } from './lib/api'
import type {
  PatchResponse,
  PatchValidation,
  ProjectState,
  ProviderHealth,
  ProviderMode,
  ProviderPatchResponse,
  ScreenModule,
} from './types'
import { downloadFile, evidenceMarkdown, exportedHtml, lessonMarkdown } from './utils/export'
import { applyPatch, cloneState, createRuntimeEvent, createVersion, makeMockPatch, validatePatch } from './utils/patch'
import './styles.css'

type ProviderState = {
  backend: 'checking' | 'ready' | 'unavailable'
  configured: boolean
  request: 'idle' | 'loading' | 'success' | 'fallback' | 'error'
  model: string | null
  message: string
}

const defaultProviderState: ProviderState = {
  backend: 'checking',
  configured: false,
  request: 'idle',
  model: null,
  message: '正在检测本地后端状态。',
}

export function App() {
  const [project, setProject] = useState<ProjectState>(defaultProject)
  const [input, setInput] = useState('')
  const [selectedModuleId, setSelectedModuleId] = useState('rules-main')
  const [lastValidation, setLastValidation] = useState<PatchValidation | null>(null)
  const [aiMode, setAiMode] = useState<ProviderMode>('real')
  const [providerState, setProviderState] = useState<ProviderState>(defaultProviderState)

  useEffect(() => {
    void refreshProviderHealth()
  }, [])

  async function refreshProviderHealth() {
    try {
      const health = await fetchProviderHealth()
      setProviderState({
        backend: 'ready',
        configured: health.configured,
        request: 'idle',
        model: health.model,
        message: health.configured ? '本地代理可用，优先请求真实模型。' : '本地代理已启动，但尚未配置 API Key 或模型。',
      })
      return health
    } catch {
      setProviderState({
        backend: 'unavailable',
        configured: false,
        request: 'idle',
        model: null,
        message: '无法连接本地后端，将在需要时回退到 Mock。',
      })
      return null
    }
  }

  const applyUserPrompt = async (prompt: string) => {
    if (!prompt.trim()) return

    if (aiMode === 'mock') {
      const patch = makeMockPatch(prompt)
      commitPatch(prompt, patch, 'mock')
      return
    }

    setProviderState((current) => ({
      ...current,
      request: 'loading',
      message: '正在向本地代理发送结构化 patch 请求。',
    }))

    try {
      const response = await requestProviderPatch({ prompt, projectState: project })
      commitPatch(prompt, response, 'real')
      setProviderState((current) => ({
        ...current,
        backend: 'ready',
        configured: true,
        request: 'success',
        model: response.providerMeta?.model ?? current.model,
        message: `真实模型已返回结构化 patch：${response.summary}`,
      }))
    } catch (error) {
      const fallbackPatch = makeMockPatch(prompt)
      commitPatch(prompt, fallbackPatch, 'mock', error instanceof Error ? error.message : '真实 AI 请求失败。')
      setProviderState((current) => ({
        ...current,
        request: 'fallback',
        message: error instanceof Error ? `${error.message} 已自动回退到 Mock。` : '真实 AI 请求失败，已自动回退到 Mock。',
      }))
    }
  }

  const commitPatch = (prompt: string, patch: PatchResponse | ProviderPatchResponse, source: 'real' | 'mock', fallbackReason?: string) => {
    const validation = validatePatch(project, patch)
    setLastValidation(validation)

    if (!validation.valid || patch.requiresConfirmation) {
      const next = cloneState(project)
      const reason = !validation.valid ? validation.errors.join('；') : '模型要求人工确认后再应用。'
      next.conversationHistory = [
        ...project.conversationHistory,
        { role: 'teacher', content: prompt },
        { role: 'agent', content: `修改被拦截：${reason}` },
      ]
      if (source === 'real') {
        next.runtime.events.push(createRuntimeEvent('provider_request', `向真实模型请求：${prompt}`))
      }
      next.runtime.events.push(createRuntimeEvent('validation_blocked', `拦截${source === 'real' ? '真实模型' : 'Mock'}修改：${reason}`))
      if (source === 'real') {
        next.runtime.events.push(createRuntimeEvent('provider_error', `真实模型 patch 未通过前端校验：${reason}`))
        setProviderState((current) => ({
          ...current,
          request: 'error',
          message: `真实模型返回的 patch 未通过前端校验：${reason}`,
        }))
      }
      setProject(next)
      setInput('')
      return
    }

    const previous = createVersion(patch.summary, project)
    const next = applyPatch(project, patch)
    next.versions = [previous, ...project.versions]
    next.conversationHistory = [
      ...project.conversationHistory,
      { role: 'teacher', content: prompt },
      {
        role: 'agent',
        content:
          source === 'real'
            ? `${patch.summary}（真实模型返回 ${patch.operations.length} 项局部修改，风险：${validation.riskLevel}）`
            : `${patch.summary}（Mock 返回 ${patch.operations.length} 项局部修改，风险：${validation.riskLevel}${fallbackReason ? `；回退原因：${fallbackReason}` : ''}）`,
      },
    ]
    if (source === 'real') {
      next.runtime.events.push(createRuntimeEvent('provider_request', `向真实模型请求：${prompt}`))
    }
    next.runtime.events.push(createRuntimeEvent('ai_patch', `${patch.summary}；来源：${source}`))
    if (source === 'real') {
      const providerMeta = 'providerMeta' in patch ? patch.providerMeta : undefined
      next.runtime.events.push(createRuntimeEvent('provider_success', `模型 ${providerMeta?.model ?? providerState.model ?? 'unknown'} 返回成功`))
    }
    if (source === 'mock' && fallbackReason) {
      next.runtime.events.push(createRuntimeEvent('provider_request', `尝试请求真实模型：${prompt}`))
      next.runtime.events.push(createRuntimeEvent('provider_error', fallbackReason))
    }
    setProject(next)
    setInput('')
  }

  const updateModule = (module: ScreenModule, detail: string) => {
    const previous = createVersion(detail, project)
    const next = cloneState(project)
    next.versions = [previous, ...project.versions]
    next.screenConfig.modules = next.screenConfig.modules.map((item) => (item.id === module.id ? module : item))
    next.runtime.manualAdjustments.push(detail)
    next.runtime.events.push(createRuntimeEvent(detail.includes('分') ? 'score_change' : detail.includes('秒') ? 'timer_change' : 'manual_edit', detail))
    setProject(next)
  }

  const rollback = () => {
    const [latest, ...rest] = project.versions
    if (!latest) return
    const restored = cloneState(latest.state)
    restored.versions = rest
    restored.conversationHistory = [...project.conversationHistory, { role: 'agent', content: `已回退：${latest.summary}` }]
    restored.runtime.events = [...project.runtime.events, createRuntimeEvent('rollback', `回退到：${latest.summary}`)]
    setProject(restored)
  }

  const exportWithLog = (kind: 'json' | 'lesson' | 'html' | 'evidence') => {
    const next = cloneState(project)
    next.runtime.events.push(createRuntimeEvent('export', `导出${kind}`))
    setProject(next)
    if (kind === 'json') downloadFile('动屏智创_ProjectState.json', JSON.stringify(next, null, 2), 'application/json;charset=utf-8')
    if (kind === 'lesson') downloadFile('篮球运球接力教案.md', lessonMarkdown(next), 'text/markdown;charset=utf-8')
    if (kind === 'html') downloadFile('篮球运球接力互动大屏.html', exportedHtml(next), 'text/html;charset=utf-8')
    if (kind === 'evidence') downloadFile('动屏智创应用证据包.md', evidenceMarkdown(next), 'text/markdown;charset=utf-8')
  }

  const handleModeChange = async (mode: ProviderMode) => {
    setAiMode(mode)
    if (mode === 'real') {
      setProviderState((current) => ({ ...current, backend: 'checking', message: '正在重新检测本地后端。' }))
      const health = await refreshProviderHealth()
      if (!health) return
      hydrateProviderState(health)
      return
    }
    setProviderState((current) => ({
      ...current,
      request: 'idle',
      message: '已切换到 Mock 模式，所有 patch 将在前端本地生成。',
    }))
  }

  const hydrateProviderState = (health: ProviderHealth) => {
    setProviderState({
      backend: 'ready',
      configured: health.configured,
      request: 'idle',
      model: health.model,
      message: health.configured ? '真实 AI 已准备就绪。' : '后端可连接，但尚未配置模型。当前请求将回退 Mock。',
    })
  }

  return <main className={`app theme-${project.screenConfig.theme}`}>
    <header className="topbar">
      <div><strong>动屏智创</strong><span>小学体育课堂互动大屏协同创作智能体</span></div>
      <div className="actions">
        <button onClick={() => exportWithLog('json')}>导出JSON</button>
        <button onClick={() => exportWithLog('lesson')}>导出教案</button>
        <button onClick={() => exportWithLog('evidence')}>导出证据包</button>
        <button onClick={() => exportWithLog('html')}>导出HTML</button>
      </div>
    </header>
    <section className="workspace">
      <ChatPanel
        project={project}
        input={input}
        validation={lastValidation}
        demoPrompts={demoPrompts}
        aiMode={aiMode}
        providerState={providerState}
        onInputChange={setInput}
        onPrompt={(prompt) => {
          void applyUserPrompt(prompt)
        }}
        onModeChange={(mode) => {
          void handleModeChange(mode)
        }}
      />
      <ProjectEditor project={project} selectedModuleId={selectedModuleId} onSelectedModuleIdChange={setSelectedModuleId} onModuleChange={updateModule} onRollback={rollback} />
      <ScreenPreview project={project} onUpdateModule={updateModule} />
    </section>
  </main>
}
