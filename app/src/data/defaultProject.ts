import type { ProjectState } from '../types'

export const demoPrompts = [
  '把规则改得更适合三年级学生',
  '增加四组计分，每组10人，队名用动物名称',
  '把接力挑战倒计时改成8分钟',
  '路线图增加右侧返回，避免碰撞',
  '加入安全提醒，强调掉球后先观察再捡球',
  '改成高对比投屏风格',
]

export const defaultProject: ProjectState = {
  metadata: {
    projectName: '篮球运球接力挑战',
    grade: '三年级',
    subject: '体育',
    studentCount: 40,
    duration: 40,
    venue: '半个篮球场',
    equipment: ['篮球20个', '标志桶8个'],
  },
  lessonPlan: {
    title: '篮球运球接力挑战',
    objectives: ['提升行进间运球能力', '理解接力游戏规则', '培养团队合作和公平竞争意识'],
    keyPoints: ['手控球稳定', '绕桶路线清楚', '交接有序'],
    difficultPoints: ['运球绕桶时保持节奏', '返回路线避免碰撞'],
    sections: [
      { name: '球性热身', duration: 3, organization: '四列横队，每人一球进行原地拨球、绕球和低运球' },
      { name: '运球练习', duration: 10, organization: '分四组绕标志桶练习，强调抬头观察和控制节奏' },
      { name: '接力挑战', duration: 15, organization: '四队依次运球绕桶返回，拍手交接后下一名出发' },
      { name: '放松总结', duration: 5, organization: '围成半圆，进行拉伸并分享合作经验' },
    ],
    assessment: ['能按路线完成绕桶运球', '能遵守接力交接规则', '能主动为队友加油并保持安全距离'],
    safety: ['绕桶时保持前后间距', '返回时从队伍外侧绕行', '掉球后先观察周围再捡球'],
  },
  screenConfig: {
    theme: 'basketball',
    aspectRatio: '16:9',
    modules: [
      { id: 'flow-main', type: 'flow', title: '课堂流程', steps: [{ name: '球性热身', duration: 3 }, { name: '运球练习', duration: 10 }, { name: '接力挑战', duration: 15 }, { name: '放松总结', duration: 5 }] },
      { id: 'rules-main', type: 'rules', title: '游戏规则', items: ['每组依次运球绕桶返回', '掉球后原地捡球继续', '返回后拍手交接', '全队完成后按用时和规范表现积分'] },
      { id: 'timer-game', type: 'timer', title: '接力挑战倒计时', duration: 300 },
      { id: 'score-main', type: 'scoreboard', title: '小组积分', teams: [{ name: '猎豹队', score: 0 }, { name: '雄鹰队', score: 0 }, { name: '海豚队', score: 0 }, { name: '骏马队', score: 0 }] },
      { id: 'rotation-main', type: 'rotation', title: '轮换安排', groups: ['第一组', '第二组', '第三组', '第四组'], instruction: '听到哨声后，下一名队员从起点出发，完成后从右侧返回队尾。' },
      { id: 'route-main', type: 'route_map', title: '运球接力路线', field: 'half_basketball_court', objects: [{ type: 'start', x: 18, y: 50 }, { type: 'cone', x: 45, y: 35 }, { type: 'cone', x: 65, y: 35 }, { type: 'finish', x: 18, y: 62 }], routes: [{ from: [18, 50], to: [65, 35], label: '绕桶前进' }, { from: [65, 35], to: [18, 62], label: '右侧返回' }] },
      { id: 'safety-main', type: 'safety', title: '安全提醒', items: ['绕桶时保持间距', '返回时从队伍外侧绕行', '掉球后先观察再捡球'] },
      { id: 'spirit-main', type: 'spirit', title: '今日体育精神', items: ['遵守规则', '为队友加油', '胜不骄，败不馁'] },
    ],
  },
  conversationHistory: [{ role: 'agent', content: '已载入三年级篮球运球接力挑战课。你可以要求我修改规则、队伍、时间、路线、安全提醒或主题。' }],
  versions: [],
  runtime: {
    startedAt: new Date().toLocaleString(),
    events: [],
    sectionsCompleted: [],
    timerUsage: [],
    scoreChanges: [],
    manualAdjustments: [],
    teacherNotes: [],
  },
}
