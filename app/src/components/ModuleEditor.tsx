import type { ScreenModule } from '../types'

export function ModuleEditor({ module, onChange }: { module: ScreenModule; onChange: (module: ScreenModule, detail: string) => void }) {
  if (module.type === 'rules' || module.type === 'safety' || module.type === 'spirit') {
    return <label>{module.title}<textarea value={module.items.join('\n')} onChange={(event) => onChange({ ...module, items: event.target.value.split('\n').filter(Boolean) } as ScreenModule, `手动编辑${module.title}`)} /></label>
  }

  if (module.type === 'timer') {
    return <label>倒计时秒数<input type="number" value={module.duration} onChange={(event) => onChange({ ...module, duration: Number(event.target.value) }, `手动修改${module.title}`)} /></label>
  }

  if (module.type === 'scoreboard') {
    return <div className="team-editor">{module.teams.map((team, index) => <label key={index}>队伍 {index + 1}<input value={team.name} onChange={(event) => { const teams = [...module.teams]; teams[index] = { ...team, name: event.target.value }; onChange({ ...module, teams }, '手动修改队名') }} /><input type="number" value={team.score} onChange={(event) => { const teams = [...module.teams]; teams[index] = { ...team, score: Number(event.target.value) }; onChange({ ...module, teams }, '手动修改比分') }} /></label>)}</div>
  }

  if (module.type === 'flow') {
    return <div>{module.steps.map((step, index) => <label key={index}>环节 {index + 1}<input value={step.name} onChange={(event) => { const steps = [...module.steps]; steps[index] = { ...step, name: event.target.value }; onChange({ ...module, steps }, '手动修改课堂流程') }} /></label>)}</div>
  }

  return <p className="hint">该模块首版通过AI补丁和预览编辑。</p>
}
