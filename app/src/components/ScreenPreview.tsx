import type { ProjectState, ScreenModule } from '../types'

export function ScreenPreview({ project, onUpdateModule }: { project: ProjectState; onUpdateModule: (module: ScreenModule, detail: string) => void }) {
  return <section className="preview-panel">
    <div className="screen-shell">
      <div className="screen-head"><div><span>投屏预览</span><h1>{project.metadata.projectName}</h1></div><button onClick={() => document.querySelector('.screen-shell')?.requestFullscreen()}>全屏</button></div>
      <div className="screen-grid">{project.screenConfig.modules.map((module) => <ScreenModuleView key={module.id} module={module} onChange={onUpdateModule} />)}</div>
    </div>
  </section>
}

function ScreenModuleView({ module, onChange }: { module: ScreenModule; onChange: (module: ScreenModule, detail: string) => void }) {
  if (module.type === 'rules' || module.type === 'safety' || module.type === 'spirit') return <article className={`screen-card ${module.type}`}><h2>{module.title}</h2><ul>{module.items.map((item) => <li key={item}>{item}</li>)}</ul></article>

  if (module.type === 'flow') return <article className="screen-card"><h2>{module.title}</h2><div className="flow-line">{module.steps.map((step) => <span key={step.name}>{step.name}<b>{step.duration}′</b></span>)}</div></article>

  if (module.type === 'timer') return <article className="screen-card timer-card"><h2>{module.title}</h2><div className="timer-value">{Math.floor(module.duration / 60)}:{String(module.duration % 60).padStart(2, '0')}</div><button onClick={() => onChange({ ...module, duration: Math.max(0, module.duration - 30) }, `${module.title}减少30秒`)}>-30秒</button><button onClick={() => onChange({ ...module, duration: module.duration + 30 }, `${module.title}增加30秒`)}>+30秒</button></article>

  if (module.type === 'scoreboard') return <article className="screen-card"><h2>{module.title}</h2><div className="score-grid">{module.teams.map((team, index) => <button key={team.name} onClick={() => { const teams = [...module.teams]; teams[index] = { ...team, score: team.score + 1 }; onChange({ ...module, teams }, `${team.name}加1分`) }}>{team.name}<strong>{team.score}</strong></button>)}</div></article>

  if (module.type === 'rotation') return <article className="screen-card"><h2>{module.title}</h2><p>{module.instruction}</p><div className="chips">{module.groups.map((group) => <span key={group}>{group}</span>)}</div></article>

  if (module.type === 'route_map') return <article className="screen-card route-card"><h2>{module.title}</h2><svg viewBox="0 0 100 100" role="img"><rect x="5" y="8" width="90" height="84" rx="6" /><line x1="50" y1="8" x2="50" y2="92" />{module.routes.map((route) => <g key={route.label}><line x1={route.from[0]} y1={route.from[1]} x2={route.to[0]} y2={route.to[1]} /><text x={route.to[0]} y={route.to[1] - 4}>{route.label}</text></g>)}{module.objects.map((obj, index) => <circle key={index} cx={obj.x} cy={obj.y} r={obj.type === 'cone' ? 3 : 4} />)}</svg></article>

  return null
}
