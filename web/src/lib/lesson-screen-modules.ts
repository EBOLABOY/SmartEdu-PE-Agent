export type LessonSupportModule = "tacticalBoard" | "scoreboard" | "rotation" | "formation";

export type RenderableLessonSlide = {
  title: string;
  durationSeconds: number;
  durationLabel: string;
  estimated: boolean;
  content: string[];
  organization: string;
  teacherTip: string;
  studentAction: string;
  safety: string;
  assessment: string;
  boardRequired: boolean;
  supportModule: LessonSupportModule;
  actionSteps: string[];
  selfHelp: string;
};

export type LoadCurvePoint = {
  timeMinute: number;
  heartRate: number;
};

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTimelineModule(slides: RenderableLessonSlide[]) {
  return slides
    .map(
      (slide, index) => `
        <div class="timeline-item">
          <b>${String(index + 1).padStart(2, "0")}</b>
          <span>${escapeHtml(slide.title)}</span>
          <em>${escapeHtml(slide.durationLabel)}</em>
        </div>`,
    )
    .join("");
}

export function renderStepCardsModule(slide: RenderableLessonSlide) {
  return `
    <div class="steps-card">
      <span>学生三步行动</span>
      <ol>
        ${slide.actionSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
    </div>`;
}

export function renderInfoCardModule(label: string, value: string) {
  return `<div class="info-card"><span>${escapeHtml(label)}</span><p>${escapeHtml(value)}</p></div>`;
}

function isCompetitionSlide(slide: RenderableLessonSlide) {
  const source = `${slide.title} ${slide.content.join(" ")} ${slide.organization}`;

  return /比赛|竞赛|挑战|对抗|计分|得分|积分|展示/.test(source);
}

function isRotationSlide(slide: RenderableLessonSlide) {
  const source = `${slide.title} ${slide.content.join(" ")} ${slide.organization}`;

  return /轮换|站点|循环|接力|绕|返回|依次|分区|换位/.test(source);
}

function hasTacticalSignal(slide: Pick<RenderableLessonSlide, "title" | "content" | "organization">) {
  const source = `${slide.title} ${slide.content.join(" ")} ${slide.organization}`;

  return /战术|攻防|配合|跑位|阵型|路线|传接球|掩护|突破|防守/.test(source);
}

export function resolveLessonSupportModule(slide: Pick<RenderableLessonSlide, "title" | "content" | "organization" | "boardRequired"> & {
  supportModule?: LessonSupportModule;
}): LessonSupportModule {
  if (slide.supportModule) {
    return slide.supportModule;
  }

  if (isCompetitionSlide(slide as RenderableLessonSlide)) {
    return "scoreboard";
  }

  if (isRotationSlide(slide as RenderableLessonSlide) && !hasTacticalSignal(slide)) {
    return "rotation";
  }

  if (slide.boardRequired) {
    return "tacticalBoard";
  }

  if (isRotationSlide(slide as RenderableLessonSlide)) {
    return "rotation";
  }

  return "formation";
}

export function extractLoadCurvePoints(source: string): LoadCurvePoint[] {
  const matches = Array.from(source.matchAll(/(\d+(?:\.\d+)?)\s*'?\s*=\s*(\d{2,3})/g));
  const points = matches
    .map((match) => ({
      timeMinute: Number(match[1]),
      heartRate: Number(match[2]),
    }))
    .filter((point) => Number.isFinite(point.timeMinute) && Number.isFinite(point.heartRate))
    .sort((left, right) => left.timeMinute - right.timeMinute);

  return points.length >= 3 ? points.slice(0, 8) : [];
}

export function renderLoadCurveModule(points: LoadCurvePoint[]) {
  if (points.length < 3) {
    return "";
  }

  const maxMinute = Math.max(...points.map((point) => point.timeMinute), 1);
  const minHeartRate = 80;
  const maxHeartRate = 170;
  const chartPoints = points.map((point) => {
    const x = 44 + (point.timeMinute / maxMinute) * 520;
    const y = 180 - ((point.heartRate - minHeartRate) / (maxHeartRate - minHeartRate)) * 128;

    return { ...point, x: Math.round(x), y: Math.round(y) };
  });
  const path = chartPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const areaPath = `${path} L${chartPoints.at(-1)?.x ?? 564},206 L${chartPoints[0]?.x ?? 44},206 Z`;

  return `
    <div class="load-curve-card">
      <div class="module-heading">
        <span>运动负荷曲线</span>
        <b>${escapeHtml(String(points[0]?.timeMinute ?? 0))}' - ${escapeHtml(String(points.at(-1)?.timeMinute ?? maxMinute))}'</b>
      </div>
      <svg viewBox="0 0 608 236" role="img" aria-label="运动负荷曲线">
        <line x1="44" y1="52" x2="564" y2="52" class="load-zone"></line>
        <line x1="44" y1="206" x2="564" y2="206" class="load-axis"></line>
        <line x1="44" y1="36" x2="44" y2="206" class="load-axis"></line>
        <path d="${areaPath}" class="load-area"></path>
        <path d="${path}" class="load-line"></path>
        ${chartPoints
          .map(
            (point) => `
              <circle cx="${point.x}" cy="${point.y}" r="7" class="load-point"></circle>
              <text x="${point.x}" y="${point.y - 14}" class="load-label">${point.heartRate}</text>`,
          )
          .join("")}
        <text x="44" y="226" class="load-time">0'</text>
        <text x="544" y="226" class="load-time">${maxMinute}'</text>
      </svg>
    </div>`;
}

function getFormationRows(slide: RenderableLessonSlide) {
  const source = `${slide.title} ${slide.organization} ${slide.content.join(" ")}`;

  if (/四列|4列|横队/.test(source)) {
    return { label: "四列横队", rows: 4, columns: 6 };
  }

  if (/半圆|圆/.test(source)) {
    return { label: "半圆队形", rows: 2, columns: 8 };
  }

  if (/散点|自由/.test(source)) {
    return { label: "散点练习", rows: 3, columns: 7 };
  }

  if (/分组|小组|轮换|站点/.test(source)) {
    return { label: "分组轮换", rows: 4, columns: 4 };
  }

  return { label: "课堂队形", rows: 3, columns: 6 };
}

export function renderFormationModule(slide: RenderableLessonSlide) {
  const formation = getFormationRows(slide);
  const dots = Array.from({ length: formation.rows * formation.columns }, (_, index) => {
    const row = Math.floor(index / formation.columns);
    const column = index % formation.columns;
    const x = 84 + column * (520 / Math.max(formation.columns - 1, 1));
    const y = 100 + row * (220 / Math.max(formation.rows - 1, 1));

    if (formation.label === "半圆队形") {
      const angle = Math.PI + (Math.PI * index) / Math.max(formation.rows * formation.columns - 1, 1);
      return `<circle cx="${344 + Math.cos(angle) * 238}" cy="${310 + Math.sin(angle) * 170}" r="12" class="formation-student"></circle>`;
    }

    if (formation.label === "散点练习") {
      const offsetX = row % 2 === 0 ? 0 : 36;
      const offsetY = column % 2 === 0 ? 0 : 18;
      return `<circle cx="${x + offsetX}" cy="${y + offsetY}" r="12" class="formation-student"></circle>`;
    }

    return `<circle cx="${x}" cy="${y}" r="12" class="formation-student"></circle>`;
  }).join("");

  return `
    <div class="formation-card" aria-label="组织队形图">
      <div class="module-heading">
        <span>组织队形图</span>
        <b>${escapeHtml(formation.label)}</b>
      </div>
      <svg viewBox="0 0 688 390" role="img">
        <rect x="24" y="34" width="640" height="320" rx="26" class="formation-field"></rect>
        ${dots}
        <circle cx="344" cy="356" r="18" class="formation-teacher"></circle>
        <text x="344" y="364" class="formation-teacher-text">师</text>
      </svg>
      <div class="board-caption">看队形：先找本组位置，再按教师口令进入练习区域。</div>
    </div>`;
}

export function renderScoreboardModule(slide: RenderableLessonSlide) {
  const teams = ["红队", "蓝队", "黄队", "绿队"];

  return `
    <div class="scoreboard-card" aria-label="分组计分板">
      <div class="module-heading">
        <span>分组计分板</span>
        <b>比赛与挑战</b>
      </div>
      <div class="score-grid">
        ${teams
          .map(
            (team, index) => `
              <div class="score-team team-${index + 1}">
                <strong>${team}</strong>
                <em data-score-value>0</em>
                <small>完成动作 +1 分</small>
                <div class="score-actions">
                  <button type="button" data-score-action="minus">-1</button>
                  <button type="button" data-score-action="plus">+1</button>
                  <button type="button" data-score-action="reset">清零</button>
                </div>
              </div>`,
          )
          .join("")}
      </div>
      <div class="score-rule">
        <span>规则</span>
        <p>${escapeHtml(slide.content[0] ?? "按规则完成挑战，安全第一，公平竞争。")}</p>
      </div>
    </div>`;
}

export function renderRotationModule(slide: RenderableLessonSlide) {
  return `
    <div class="rotation-card" aria-label="小组轮换路线图">
      <div class="module-heading">
        <span>小组轮换路线</span>
        <b>按箭头依次换位</b>
      </div>
      <svg viewBox="0 0 688 390" role="img">
        <rect x="24" y="34" width="640" height="320" rx="28" class="formation-field"></rect>
        <defs>
          <marker id="rotationArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L9,3 z" class="arrow-head"></path>
          </marker>
        </defs>
        <path d="M160 112 H528 V278 H160 Z" class="rotation-route" marker-end="url(#rotationArrow)"></path>
        <g class="station station-1"><circle cx="160" cy="112" r="34"></circle><text x="160" y="121">1</text></g>
        <g class="station station-2"><circle cx="528" cy="112" r="34"></circle><text x="528" y="121">2</text></g>
        <g class="station station-3"><circle cx="528" cy="278" r="34"></circle><text x="528" y="287">3</text></g>
        <g class="station station-4"><circle cx="160" cy="278" r="34"></circle><text x="160" y="287">4</text></g>
        <text x="344" y="205" class="rotation-center">完成一轮后顺时针轮换</text>
      </svg>
      <div class="board-caption">${escapeHtml(slide.organization)}：听到口令后按箭头方向换位，不逆行、不抢道。</div>
    </div>`;
}

export function renderActivitySupportModule(slide: RenderableLessonSlide) {
  const supportModule = resolveLessonSupportModule(slide);

  if (supportModule === "scoreboard") return renderScoreboardModule(slide);
  if (supportModule === "tacticalBoard") return renderTacticalBoardModule(slide);
  if (supportModule === "rotation") return renderRotationModule(slide);
  return renderFormationModule(slide);
}

export function renderTacticalBoardModule(slide: RenderableLessonSlide) {
  if (!slide.boardRequired) {
    return `
      <div class="focus-card">
        <div class="focus-label">本页重点</div>
        <div class="focus-title">${escapeHtml(slide.content[0] ?? slide.title)}</div>
        <div class="focus-grid">
          <span>组织</span><b>${escapeHtml(slide.organization)}</b>
          <span>安全</span><b>${escapeHtml(slide.safety)}</b>
        </div>
        <div class="self-help-card">
          <span>学生自助提示</span>
          <p>${escapeHtml(slide.selfHelp)}</p>
        </div>
      </div>`;
  }

  return `
    <div class="tactical-board" aria-label="战术板">
      <svg viewBox="0 0 720 440" role="img">
        <rect x="18" y="18" width="684" height="404" rx="28" class="court"></rect>
        <line x1="360" y1="18" x2="360" y2="422" class="court-line"></line>
        <circle cx="360" cy="220" r="74" class="court-line fill-none"></circle>
        <path d="M118 92 H254 V348 H118 Z" class="court-line fill-none"></path>
        <path d="M466 92 H602 V348 H466 Z" class="court-line fill-none"></path>
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L9,3 z" class="arrow-head"></path>
          </marker>
        </defs>
        <path id="movePathA" d="M180 310 C260 210, 310 180, 410 135" class="move-line" marker-end="url(#arrow)"></path>
        <path id="passPathA" d="M238 126 C315 185, 382 216, 514 278" class="pass-line" marker-end="url(#arrow)"></path>
        <g class="runner runner-one">
          <circle cx="0" cy="0" r="28" class="player attack"></circle>
          <text x="0" y="8" class="player-text">1</text>
        </g>
        <g class="runner runner-two">
          <circle cx="0" cy="0" r="28" class="player attack"></circle>
          <text x="0" y="8" class="player-text">2</text>
        </g>
        <circle cx="410" cy="135" r="28" class="player attack"></circle>
        <circle cx="514" cy="278" r="28" class="player defend"></circle>
        <circle cx="438" cy="322" r="28" class="player defend"></circle>
        <text x="410" y="143" class="player-text">3</text>
        <text x="514" y="286" class="player-text">防</text>
        <text x="438" y="330" class="player-text">防</text>
        <circle class="ball-dot" cx="238" cy="126" r="10"></circle>
      </svg>
      <div class="board-caption">战术板自动跑位：实线为移动路线，虚线为传球或轮换路线。</div>
      <div class="self-help-card compact">
        <span>学生自助提示</span>
        <p>${escapeHtml(slide.selfHelp)}</p>
      </div>
    </div>`;
}

export function renderLessonSlideModule(slide: RenderableLessonSlide, index: number, total: number, rhythm: string) {
  const supportModule = resolveLessonSupportModule(slide);

  return `
    <section class="slide lesson-slide" data-duration="${slide.durationSeconds}" data-index="${index}" data-rhythm="${rhythm}" data-support-module="${supportModule}">
      <div class="slide-bg-mark">0${index}</div>
      <header class="slide-header">
        <div>
          <p class="eyebrow">第 ${index} / ${total} 环节 · 课堂辅助</p>
          <h2>${escapeHtml(slide.title)}</h2>
        </div>
        <div class="timer-panel">
          <span>本环节剩余 · ${escapeHtml(slide.durationLabel)}${slide.estimated ? " · 估算时间" : ""}</span>
          <strong class="timer">00:00</strong>
        </div>
      </header>
      <main class="slide-main">
        <div class="content-stack">
          <div class="info-card primary">
            <span>本环节怎么做</span>
            ${slide.content.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
          </div>
          ${renderStepCardsModule(slide)}
          <div class="two-column">
            ${renderInfoCardModule("教师提示", slide.teacherTip)}
            ${renderInfoCardModule("学生行动", slide.studentAction)}
          </div>
          <div class="two-column">
            ${renderInfoCardModule("安全提醒", slide.safety)}
            ${renderInfoCardModule("评价观察", slide.assessment)}
          </div>
        </div>
        ${renderActivitySupportModule(slide)}
      </main>
    </section>`;
}
