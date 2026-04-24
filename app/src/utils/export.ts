import type { ProjectState } from '../types'

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function lessonMarkdown(state: ProjectState) {
  return `# ${state.lessonPlan.title}\n\n## 基本信息\n\n- 年级：${state.metadata.grade}\n- 人数：${state.metadata.studentCount}\n- 场地：${state.metadata.venue}\n- 器材：${state.metadata.equipment.join('、')}\n\n## 教学目标\n\n${state.lessonPlan.objectives.map((item) => `- ${item}`).join('\n')}\n\n## 教学重难点\n\n- 重点：${state.lessonPlan.keyPoints.join('、')}\n- 难点：${state.lessonPlan.difficultPoints.join('、')}\n\n## 课堂流程\n\n${state.lessonPlan.sections.map((item) => `- ${item.name}（${item.duration}分钟）：${item.organization}`).join('\n')}\n\n## 评价方式\n\n${state.lessonPlan.assessment.map((item) => `- ${item}`).join('\n')}\n\n## 安全提醒\n\n${state.lessonPlan.safety.map((item) => `- ${item}`).join('\n')}\n`
}

export function evidenceMarkdown(state: ProjectState) {
  return `# 动屏智创应用证据包\n\n## 项目概况\n\n- 项目：${state.metadata.projectName}\n- 年级：${state.metadata.grade}\n- 人数：${state.metadata.studentCount}\n- 场地：${state.metadata.venue}\n- 器材：${state.metadata.equipment.join('、')}\n\n## 当前大屏模块\n\n${state.screenConfig.modules.map((module) => `- ${module.title}（${module.type}）`).join('\n')}\n\n## 对话修改记录\n\n${state.conversationHistory.map((item) => `- ${item.role === 'teacher' ? '教师' : '智能体'}：${item.content}`).join('\n')}\n\n## 运行记录\n\n${state.runtime.events.map((event) => `- ${event.time}｜${event.type}｜${event.detail}`).join('\n') || '- 暂无运行记录'}\n\n## 后续课堂证据占位\n\n- 投屏照片：待补充\n- 学生反馈：待补充\n- 教师反思：待补充\n`
}

export function exportedHtml(state: ProjectState) {
  const data = JSON.stringify(state).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${state.metadata.projectName}</title><style>${exportStyles()}</style></head><body><div id="screen"></div><script>const project=${data};${exportScript()}</script></body></html>`
}

function exportStyles() {
  return `body{margin:0;background:#101820;color:#fff;font-family:"Microsoft YaHei",Arial,sans-serif}button{font-size:20px;border:0;border-radius:12px;padding:10px 16px;cursor:pointer}.stage{width:100vw;min-height:100vh;padding:28px;box-sizing:border-box;background:linear-gradient(135deg,#16532f,#101820)}.grid{display:grid;grid-template-columns:1.1fr .9fr;gap:20px}.card{background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.18);border-radius:22px;padding:20px}.title{font-size:44px;margin:0 0 18px}.module h2{font-size:30px;margin:0 0 12px}.module li{font-size:24px;margin:10px 0}.score{display:flex;gap:12px;flex-wrap:wrap}.team{background:#f7b733;color:#111;padding:16px;border-radius:18px;font-size:26px;font-weight:800}.timer{font-size:70px;font-weight:900;color:#f7b733}.route{width:100%;height:280px}.route rect{fill:#2f8f46;stroke:#fff;stroke-width:1.5}.route line{stroke:#f7d774;stroke-width:2.5}.route circle{fill:#f25f4c;stroke:#fff}.route text{fill:#fff;font-size:5px;font-weight:800}.safety{background:#8b1e1e}.spirit{background:#1f5f8b}@media(max-width:900px){.grid{grid-template-columns:1fr}.title{font-size:34px}}`
}

function exportScript() {
  return `function byId(id){return project.screenConfig.modules.find(m=>m.id===id)}function fmt(s){return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}let remaining=(byId('timer-game')||{}).duration||300;function routeSvg(route){return '<svg class="route" viewBox="0 0 100 100"><rect x="5" y="8" width="90" height="84" rx="6"></rect><line x1="50" y1="8" x2="50" y2="92"></line>'+route.routes.map(r=>'<g><line x1="'+r.from[0]+'" y1="'+r.from[1]+'" x2="'+r.to[0]+'" y2="'+r.to[1]+'"></line><text x="'+r.to[0]+'" y="'+(r.to[1]-4)+'">'+r.label+'</text></g>').join('')+route.objects.map(o=>'<circle cx="'+o.x+'" cy="'+o.y+'" r="'+(o.type==='cone'?3:4)+'"></circle>').join('')+'</svg>'}function render(){const root=document.getElementById('screen');const rules=byId('rules-main');const flow=byId('flow-main');const timer=byId('timer-game');const score=byId('score-main');const rotation=byId('rotation-main');const route=byId('route-main');const safety=byId('safety-main');const spirit=byId('spirit-main');root.innerHTML='<main class="stage"><h1 class="title">'+project.metadata.projectName+'</h1><section class="grid"><div class="card module"><h2>'+rules.title+'</h2><ul>'+rules.items.map(i=>'<li>'+i+'</li>').join('')+'</ul></div><div class="card module"><h2>'+flow.title+'</h2><ul>'+flow.steps.map(i=>'<li>'+i.name+' · '+i.duration+'分钟</li>').join('')+'</ul></div><div class="card module"><h2>'+timer.title+'</h2><div class="timer">'+fmt(remaining)+'</div><button onclick="remaining=Math.max(0,remaining-30);render()">-30秒</button><button onclick="remaining+=30;render()">+30秒</button></div><div class="card module"><h2>'+score.title+'</h2><div class="score">'+score.teams.map((t,i)=>'<button class="team" onclick="byId(\'score-main\').teams['+i+'].score++;render()">'+t.name+' '+t.score+'</button>').join('')+'</div></div><div class="card module"><h2>'+rotation.title+'</h2><p>'+rotation.instruction+'</p><p>'+rotation.groups.join(' / ')+'</p></div><div class="card module"><h2>'+route.title+'</h2>'+routeSvg(route)+'</div><div class="card module safety"><h2>'+safety.title+'</h2><ul>'+safety.items.map(i=>'<li>'+i+'</li>').join('')+'</ul></div><div class="card module spirit"><h2>'+spirit.title+'</h2><ul>'+spirit.items.map(i=>'<li>'+i+'</li>').join('')+'</ul></div></section></main>'}render()`
}
