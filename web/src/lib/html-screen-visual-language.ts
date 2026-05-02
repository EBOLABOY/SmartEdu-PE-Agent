export const HTML_SCREEN_DESIGN_DIRECTION =
  "视觉方向默认采用“Gym Command Desk”体育课堂投屏风格：页面应像教师在体育馆使用的课堂控制台，使用深色球场基底、实体高对比信息面板、篮球橙任务强调、荧光黄倒计时与清晰图形线条；不要默认套用手机毛玻璃海报风，不要大面积漂浮光斑、空洞封面或过度装饰。";

export const HTML_SCREEN_VISUAL_SYSTEM_REFERENCE = [
  "统一视觉系统参考：采用 Gym Command Desk 体育课堂投屏风格，整体像教师在体育馆使用的课堂控制台，而不是商业海报或手机玻璃 UI。",
  "整体以深墨绿或深青色球场基底承载页面，只用少量篮球橙强调任务路径，用荧光黄或亮青强调倒计时、当前步骤和关键操作。",
  "信息层使用高对比实体面板或轻度半透明面板，不使用大面积毛玻璃、漂浮光斑、空洞封面或过度装饰背景。",
  "所有页面必须优先保证远距离可读：大字号、粗层级、短句、明确模块、清晰安全提醒和稳定的按钮反馈。",
  "首页、学练页、比赛页、体能页和放松页共享同一套色彩、按钮、倒计时、图形线条和空间节奏；最终完整 CSS 和 JavaScript 由服务端 HTML 外壳统一提供。",
  "学练页优先使用 HTML/CSS/SVG 绘制路线、队形、器材路径和动作关键点；比赛、体能、放松和总结页优先采用中心任务模块、侧边规则区和醒目倒计时。",
].join("\n");

export const HTML_SCREEN_SUPPORTED_FRAGMENT_CLASS_GUIDE =
  "优先使用受支持的语义类名：cover-stage、cover-content、cover-kicker、cover-title、cover-subtitle、cover-meta、cover-footer-cues、mini-cue、slide-kicker、pill、time-pill、safety-pill、section-brief、brief-block、cue-grid、module-visual、center-module、scoreboard-grid、teaching-image-layout、teaching-image-cues。服务端 HTML 外壳会为这些类提供稳定样式，不要发明大量没有样式保障的新类名，也不要把首页做成空洞海报。";
