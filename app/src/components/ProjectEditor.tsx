import type { ProjectState, ScreenModule } from '../types'
import { ModuleEditor } from './ModuleEditor'

export function ProjectEditor({
  project,
  selectedModuleId,
  onSelectedModuleIdChange,
  onModuleChange,
  onRollback,
}: {
  project: ProjectState
  selectedModuleId: string
  onSelectedModuleIdChange: (id: string) => void
  onModuleChange: (module: ScreenModule, detail: string) => void
  onRollback: () => void
}) {
  const selectedModule = project.screenConfig.modules.find((item) => item.id === selectedModuleId)
  return <section className="panel editor-panel">
    <h2>项目结构与编辑区</h2>
    <div className="meta"><b>{project.metadata.projectName}</b><span>{project.metadata.grade} · {project.metadata.studentCount}人 · {project.metadata.venue}</span></div>
    <label>模块选择<select value={selectedModuleId} onChange={(event) => onSelectedModuleIdChange(event.target.value)}>{project.screenConfig.modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select></label>
    {selectedModule && <ModuleEditor module={selectedModule} onChange={onModuleChange} />}
    <div className="version-row"><button onClick={onRollback} disabled={project.versions.length === 0}>回退上一版本</button><span>{project.versions.length} 个版本快照</span></div>
    <h3>课堂流程</h3>
    <ul className="compact-list">{project.lessonPlan.sections.map((section) => <li key={section.name}>{section.name} · {section.duration}分钟</li>)}</ul>
    <h3>运行记录</h3>
    <ul className="compact-list runtime-list">{project.runtime.events.slice(-5).map((event) => <li key={event.id}>{event.time} · {event.detail}</li>)}</ul>
  </section>
}
