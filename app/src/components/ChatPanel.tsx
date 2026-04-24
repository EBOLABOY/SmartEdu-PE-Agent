import type { PatchValidation, ProjectState, ProviderMode } from '../types'

type ProviderState = {
  backend: 'checking' | 'ready' | 'unavailable'
  configured: boolean
  request: 'idle' | 'loading' | 'success' | 'fallback' | 'error'
  model: string | null
  message: string
}

export function ChatPanel({
  project,
  input,
  validation,
  demoPrompts,
  aiMode,
  providerState,
  onInputChange,
  onPrompt,
  onModeChange,
}: {
  project: ProjectState
  input: string
  validation: PatchValidation | null
  demoPrompts: string[]
  aiMode: ProviderMode
  providerState: ProviderState
  onInputChange: (value: string) => void
  onPrompt: (prompt: string) => void
  onModeChange: (mode: ProviderMode) => void
}) {
  return <aside className="panel chat-panel">
    <div className="panel-head">
      <h2>AI对话修改区</h2>
      <label className="mode-switch">
        <span>模式</span>
        <select value={aiMode} onChange={(event) => onModeChange(event.target.value as ProviderMode)}>
          <option value="real">真实 AI</option>
          <option value="mock">Mock</option>
        </select>
      </label>
    </div>

    <div className={`provider-status ${providerState.backend}`}>
      <b>{aiMode === 'real' ? '真实 AI 已启用' : '当前使用 Mock 引擎'}</b>
      <p>后端状态：{providerState.backend === 'ready' ? '可连接' : providerState.backend === 'checking' ? '检测中' : '不可用'}</p>
      <p>模型：{providerState.model ?? '未配置'}</p>
      <p>请求状态：{providerState.request}</p>
      <p>{providerState.message}</p>
    </div>

    <div className="history">{project.conversationHistory.map((msg, index) => <div key={index} className={`bubble ${msg.role}`}>{msg.content}</div>)}</div>

    {validation && <div className={`validation ${validation.valid ? 'ok' : 'bad'}`}>
      <b>{validation.valid ? `校验通过 · ${validation.riskLevel}` : '校验拦截'}</b>
      {validation.errors.map((item) => <p key={item}>{item}</p>)}
      {validation.warnings.map((item) => <p key={item}>{item}</p>)}
    </div>}

    <textarea value={input} onChange={(event) => onInputChange(event.target.value)} placeholder="例如：把接力挑战倒计时改成8分钟" />
    <button className="primary" disabled={providerState.request === 'loading'} onClick={() => onPrompt(input)}>
      {providerState.request === 'loading' ? '正在请求模型...' : '应用局部修改'}
    </button>
    <div className="prompts">{demoPrompts.map((prompt) => <button key={prompt} onClick={() => onPrompt(prompt)}>{prompt}</button>)}</div>
  </aside>
}
