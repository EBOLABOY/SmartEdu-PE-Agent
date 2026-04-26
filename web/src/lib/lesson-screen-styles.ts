import { renderLessonScreenCssVariables, type LessonScreenDesignSpec } from "./lesson-screen-design";

export function renderLessonScreenStyles(spec: LessonScreenDesignSpec) {
  return `<style>
    :root {
      ${renderLessonScreenCssVariables(spec)};
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body { font-family: var(--font-family); color: var(--screen-text); background: var(--screen-bg); }
    .deck { position: relative; width: 100vw; height: 100vh; background: radial-gradient(circle at 18% 10%, color-mix(in srgb, var(--screen-primary) 38%, transparent), transparent 28%), radial-gradient(circle at 82% 16%, color-mix(in srgb, var(--screen-secondary) 36%, transparent), transparent 30%), linear-gradient(135deg, var(--screen-bg) 0%, var(--screen-bg-alt) 100%); }
    .slide { position: absolute; inset: 0; display: none; width: 100%; height: 100%; padding: 64px 78px 110px; opacity: 0; transform: translateX(36px) scale(.985); transition: opacity .35s ease, transform .35s ease; }
    .slide.active { display: block; opacity: 1; transform: translateX(0) scale(1); }
    .cover { padding: 76px 92px; }
    .cover-grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 56px; height: 100%; align-items: center; }
    .badge { display: inline-flex; padding: 12px 18px; border: 1px solid color-mix(in srgb, var(--screen-line) 70%, transparent); border-radius: 999px; color: var(--screen-muted); background: var(--screen-surface-strong); font-size: 26px; letter-spacing: 2px; }
    h1 { margin: 34px 0 24px; font-size: var(--font-cover-title); line-height: 1.02; letter-spacing: -3px; }
    .subtitle { max-width: 980px; color: var(--screen-muted); font-size: 34px; line-height: 1.45; }
    .start-button { margin-top: 54px; border: 0; border-radius: 28px; padding: 26px 54px; color: var(--screen-bg); background: linear-gradient(135deg, var(--screen-accent), var(--screen-primary)); font-size: 36px; font-weight: 900; cursor: pointer; box-shadow: 0 22px 60px color-mix(in srgb, var(--screen-primary) 42%, transparent); }
    .hero-card, .info-card, .focus-card, .tactical-board, .steps-card, .formation-card, .scoreboard-card, .rotation-card, .load-curve-card { border: 1px solid #ffffff24; border-radius: 30px; background: #ffffff13; box-shadow: inset 0 1px 0 #ffffff30, 0 20px 55px #02061744; backdrop-filter: blur(14px); }
    .hero-card { border-radius: 44px; padding: 38px; background: #ffffff14; box-shadow: inset 0 1px 0 #ffffff55, 0 30px 90px #02061766; }
    .hero-card h2 { margin: 0 0 26px; font-size: 46px; }
    .hero-list { display: grid; gap: 18px; margin: 0; padding: 0; list-style: none; }
    .hero-list li { padding: 22px 24px; border-radius: 24px; background: #02061775; color: #e0f2fe; font-size: 27px; line-height: 1.35; }
    .timeline { display: grid; gap: 12px; margin-top: 28px; }
    .timeline-item { display: grid; grid-template-columns: 54px 1fr 108px; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 18px; background: #02061770; }
    .timeline-item b { color: var(--screen-accent); font-size: 24px; }
    .timeline-item span { color: var(--screen-text); font-size: 22px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .timeline-item em { color: var(--screen-muted); font-size: 19px; font-style: normal; text-align: right; }
    .slide-bg-mark { position: absolute; right: 76px; bottom: 86px; font-size: 220px; font-weight: 900; color: #ffffff0e; letter-spacing: -12px; pointer-events: none; }
    .slide-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 36px; position: relative; z-index: 1; }
    .eyebrow { margin: 0 0 12px; color: var(--screen-accent); font-size: 24px; font-weight: 800; letter-spacing: 5px; }
    .slide h2 { margin: 0; font-size: var(--font-title); line-height: 1.05; letter-spacing: -2px; }
    .timer-panel { min-width: 330px; padding: 24px 30px; border: 1px solid #ffffff33; border-radius: 32px; text-align: right; background: #02061788; box-shadow: inset 0 1px 0 #ffffff44; }
    .timer-panel span { display: block; color: var(--screen-muted); font-size: var(--font-caption); }
    .timer { display: block; margin-top: 10px; color: var(--screen-accent); font-size: var(--font-timer); line-height: 1; font-variant-numeric: tabular-nums; }
    .slide-main { display: grid; grid-template-columns: 1.02fr .98fr; gap: 38px; height: calc(100% - 150px); margin-top: 42px; position: relative; z-index: 1; }
    .content-stack { display: grid; gap: 20px; align-content: start; }
    .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .info-card { min-height: 146px; padding: 24px 28px; }
    .info-card.primary { min-height: 178px; background: linear-gradient(135deg, color-mix(in srgb, var(--screen-primary) 24%, transparent), color-mix(in srgb, var(--screen-secondary) 18%, transparent)); }
    .info-card span, .focus-label, .steps-card span, .self-help-card span, .module-heading span, .score-rule span { display: inline-block; margin-bottom: 12px; color: var(--screen-accent); font-size: 23px; font-weight: 900; }
    .info-card p { margin: 8px 0 0; color: var(--screen-text); font-size: var(--font-body); line-height: 1.42; }
    .steps-card { padding: 22px 28px; background: linear-gradient(135deg, color-mix(in srgb, var(--screen-warning) 18%, transparent), color-mix(in srgb, var(--screen-danger) 10%, transparent)); }
    .steps-card ol { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 0; padding: 0; list-style: none; counter-reset: step; }
    .steps-card li { position: relative; min-height: 92px; padding: 18px 18px 18px 58px; border-radius: 22px; color: #fff7ed; background: #02061770; font-size: 25px; font-weight: 900; line-height: 1.25; counter-increment: step; }
    .steps-card li::before { content: counter(step); position: absolute; left: 18px; top: 18px; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; color: #052e16; background: #bef264; font-size: 18px; }
    .focus-card { display: flex; flex-direction: column; justify-content: center; min-height: 100%; padding: 42px; }
    .focus-title { color: var(--screen-text); font-size: 48px; font-weight: 900; line-height: 1.18; }
    .focus-grid { display: grid; grid-template-columns: 100px 1fr; gap: 18px; margin-top: 36px; font-size: 26px; line-height: 1.35; }
    .focus-grid span { color: #93c5fd; font-weight: 900; }
    .focus-grid b { color: #e0f2fe; font-weight: 600; }
    .self-help-card { margin-top: 30px; padding: 24px; border-radius: 26px; background: #02061785; }
    .self-help-card.compact { margin-top: 12px; padding: 18px 22px; }
    .self-help-card p { margin: 0; color: #fef9c3; font-size: 25px; line-height: 1.35; }
    .formation-card, .scoreboard-card, .rotation-card { display: flex; flex-direction: column; min-height: 100%; padding: 28px; background: linear-gradient(145deg, color-mix(in srgb, var(--screen-primary) 20%, transparent), var(--screen-surface-strong)); }
    .module-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .module-heading b { color: var(--screen-text); font-size: 31px; line-height: 1.15; text-align: right; }
    .formation-card svg, .rotation-card svg { width: 100%; min-height: 390px; flex: 1; }
    .formation-field { fill: color-mix(in srgb, var(--screen-court) 46%, transparent); stroke: var(--screen-line); stroke-width: 4; }
    .formation-student { fill: var(--screen-secondary); stroke: #fff; stroke-width: 4; }
    .formation-teacher { fill: var(--screen-warning); stroke: #fff; stroke-width: 5; }
    .formation-teacher-text { fill: var(--screen-bg); font-size: 19px; font-weight: 900; text-anchor: middle; font-family: sans-serif; }
    .score-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; margin-top: 18px; }
    .score-team { min-height: 168px; padding: 22px; border-radius: 28px; background: #02061770; border: 1px solid #ffffff24; }
    .score-team strong { display: block; color: var(--screen-text); font-size: 30px; }
    .score-team em { display: block; margin-top: 8px; color: var(--screen-accent); font-size: 64px; font-style: normal; font-weight: 900; line-height: 1; }
    .score-team small { display: block; margin-top: 10px; color: var(--screen-muted); font-size: 19px; }
    .score-actions { display: flex; gap: 8px; margin-top: 14px; }
    .score-actions button { flex: 1; border: 1px solid #ffffff24; border-radius: 14px; padding: 10px 8px; color: var(--screen-text); background: #ffffff14; font-size: 18px; font-weight: 900; cursor: pointer; }
    .score-actions button[data-score-action="plus"] { color: var(--screen-bg); background: var(--screen-accent); }
    .team-1 { box-shadow: inset 8px 0 0 #ef4444; }
    .team-2 { box-shadow: inset 8px 0 0 #3b82f6; }
    .team-3 { box-shadow: inset 8px 0 0 #facc15; }
    .team-4 { box-shadow: inset 8px 0 0 #22c55e; }
    .score-rule { margin-top: 18px; padding: 22px; border-radius: 24px; background: #02061780; }
    .score-rule p { margin: 0; color: var(--screen-text); font-size: 24px; line-height: 1.35; }
    .rotation-route { fill: none; stroke: var(--screen-warning); stroke-width: 8; stroke-linejoin: round; stroke-dasharray: 18 12; }
    .station circle { fill: var(--screen-primary); stroke: #fff; stroke-width: 5; }
    .station text { fill: var(--screen-bg); font-size: 28px; font-weight: 900; text-anchor: middle; font-family: sans-serif; }
    .rotation-center { fill: var(--screen-text); font-size: 28px; font-weight: 900; text-anchor: middle; }
    .load-curve-card { margin-top: 18px; padding: 18px 20px; border-radius: 24px; background: #02061770; }
    .load-curve-card svg { width: 100%; height: 178px; display: block; }
    .load-axis { stroke: #ffffff45; stroke-width: 3; }
    .load-zone { stroke: var(--screen-accent); stroke-width: 18; stroke-opacity: .12; }
    .load-area { fill: var(--screen-primary); fill-opacity: .18; }
    .load-line { fill: none; stroke: var(--screen-accent); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; }
    .load-point { fill: var(--screen-warning); stroke: #fff; stroke-width: 3; }
    .load-label, .load-time { fill: var(--screen-muted); font-size: 18px; font-weight: 900; text-anchor: middle; }
    .tactical-board { min-height: 100%; padding: 28px; background: linear-gradient(145deg, color-mix(in srgb, var(--screen-court) 72%, transparent), var(--screen-surface-strong)); }
    .tactical-board svg { width: 100%; height: calc(100% - 158px); min-height: 430px; }
    .court { fill: color-mix(in srgb, var(--screen-court) 52%, transparent); stroke: var(--screen-line); stroke-width: 5; }
    .court-line { stroke: var(--screen-line); stroke-width: 4; opacity: .85; }
    .fill-none { fill: none; }
    .move-line { fill: none; stroke: var(--screen-warning); stroke-width: 8; }
    .pass-line { fill: none; stroke: var(--screen-secondary); stroke-width: 7; stroke-dasharray: 16 12; }
    .arrow-head { fill: var(--screen-warning); }
    .player { stroke: #fff; stroke-width: 5; }
    .attack { fill: #ef4444; }
    .defend { fill: #2563eb; }
    .player-text { fill: #fff; font-size: 24px; font-weight: 900; text-anchor: middle; font-family: sans-serif; }
    .runner-one { offset-path: path("M180 310 C260 210, 310 180, 410 135"); animation: runMove 4.8s ease-in-out infinite; }
    .runner-two { offset-path: path("M238 126 C315 185, 382 216, 514 278"); animation: runMove 4.8s ease-in-out .8s infinite; }
    .ball-dot { fill: #fef08a; stroke: #78350f; stroke-width: 4; offset-path: path("M238 126 C315 185, 382 216, 514 278"); animation: runMove 4.8s ease-in-out 1.2s infinite; }
    @keyframes runMove { 0%, 12% { offset-distance: 0%; } 72%, 100% { offset-distance: 100%; } }
    .board-caption { margin-top: 8px; color: #d9f99d; font-size: 24px; text-align: center; }
    .controls { position: absolute; left: 50%; bottom: 28px; z-index: 5; display: flex; align-items: center; gap: 14px; transform: translateX(-50%); padding: 14px; border: 1px solid #ffffff26; border-radius: 999px; background: #020617cc; box-shadow: 0 20px 60px #02061788; }
    .controls button { border: 0; border-radius: 999px; padding: 16px 24px; color: #e0f2fe; background: #ffffff1a; font-size: 22px; font-weight: 800; cursor: pointer; }
    .controls button.primary { color: #052e16; background: #bef264; }
    .progress-wrap { position: absolute; left: 78px; right: 78px; bottom: 18px; z-index: 4; height: 7px; overflow: hidden; border-radius: 99px; background: #ffffff22; }
    .progress-bar { width: 0; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #bef264, #38bdf8); transition: width .2s linear; }
    .page-indicator { min-width: 138px; color: #dbeafe; font-size: 22px; font-weight: 900; text-align: center; }
  </style>`;
}
