import type React from "react";

import type { CompetitionLessonPlan, CompetitionLessonPlanRow } from "@/lib/competition-lesson-contract";

interface CompetitionLessonPrintViewProps {
  lesson: CompetitionLessonPlan;
}

function mergeNarrativeLines(lines: string[]) {
  const normalized = lines.map((line) => line.trim()).filter(Boolean);

  return normalized.length ? [normalized.join("")] : [];
}

function joinTextBlock(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean).join("；");
}

function NarrativeParagraphs({ lines }: { lines: string[] }) {
  return (
    <>
      {mergeNarrativeLines(lines).map((line, index) => (
        <p className="competition-print-paragraph" key={`${line}-${index}`}>
          {line}
        </p>
      ))}
    </>
  );
}

function CompactLines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <p className="competition-print-compact-line" key={`${line}-${index}`}>
          {line}
        </p>
      ))}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="competition-print-section">
      <h3 className="competition-print-section-title">{title}</h3>
      {children}
    </section>
  );
}

function VerticalText({ text }: { text: string }) {
  return <>{text.split("").map((char, index) => <span key={`${char}-${index}`}>{char}</span>)}</>;
}

function ObjectivesList({ lesson }: CompetitionLessonPrintViewProps) {
  return (
    <div className="competition-print-numbered">
      <p>
        1. <strong>运动能力</strong>：{joinTextBlock(lesson.learningObjectives.sportAbility)}
      </p>
      <p>
        2. <strong>健康行为</strong>：{joinTextBlock(lesson.learningObjectives.healthBehavior)}
      </p>
      <p>
        3. <strong>体育品德</strong>：{joinTextBlock(lesson.learningObjectives.sportMorality)}
      </p>
    </div>
  );
}

function KeyPointList({ lesson }: CompetitionLessonPrintViewProps) {
  return (
    <div className="competition-print-numbered">
      <p>
        1. <strong>学生学习</strong>：{joinTextBlock(lesson.keyDifficultPoints.studentLearning)}
      </p>
      <p>
        2. <strong>教学内容</strong>：{joinTextBlock(lesson.keyDifficultPoints.teachingContent)}
      </p>
      <p>
        3. <strong>教学组织</strong>：{joinTextBlock(lesson.keyDifficultPoints.teachingOrganization)}
      </p>
      <p>
        4. <strong>教学方法</strong>：{joinTextBlock(lesson.keyDifficultPoints.teachingMethod)}
      </p>
    </div>
  );
}

function LearningEvaluationTable({ lesson }: CompetitionLessonPrintViewProps) {
  return (
    <table className="competition-print-table competition-print-eval-table">
      <colgroup>
        <col className="competition-print-eval-level-col" />
        <col />
      </colgroup>
      <tbody>
        <tr>
          <th>星级</th>
          <th>评价方面</th>
        </tr>
        {lesson.evaluation.map((item) => (
          <tr key={item.level}>
            <td className="competition-print-center competition-print-eval-level-cell">
              <span className="competition-print-eval-level-text">{item.level}</span>
            </td>
            <td>{item.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FormationDiagram({ compact = false }: { compact?: boolean }) {
  const rows = compact ? [5, 5] : [4, 4, 4, 4];

  return (
    <div className="competition-print-diagram-box">
      <div className="competition-print-formation-grid">
        {rows.map((count, rowIndex) => (
          <div key={`formation-row-${rowIndex}`}>
            {Array.from({ length: count }).map((_, index) => (
              <span className="competition-print-dot-student" key={`student-${rowIndex}-${index}`} />
            ))}
          </div>
        ))}
        <div className="competition-print-dot-teacher">
          <div className="competition-print-dot-teacher-smile" />
        </div>
      </div>
    </div>
  );
}

function FieldDiagram({
  title,
  height = 90,
  scattered = false,
}: {
  title?: string;
  height?: number;
  scattered?: boolean;
}) {
  const studentPositions = [
    ["20%", "20%"],
    ["60%", "30%"],
    ["40%", "70%"],
    ["75%", "65%"],
    ["30%", "80%"],
    ["15%", "50%"],
    ["80%", "40%"],
  ];

  return (
    <div className="competition-print-diagram-box">
      {title ? <div className="competition-print-diagram-title">{title}</div> : null}
      <div className="competition-print-field-box" style={{ height }}>
        <div className="competition-print-field-line competition-print-field-penalty-left" />
        <div className="competition-print-field-line competition-print-field-penalty-right" />
        <div className="competition-print-field-line competition-print-field-center" />
        <div className="competition-print-field-line competition-print-field-circle" />
        {scattered
          ? studentPositions.map(([top, left]) => (
              <span
                className="competition-print-dot-student-sm"
                key={`${top}-${left}`}
                style={{ top, left }}
              />
            ))
          : null}
      </div>
    </div>
  );
}

function OrganizationDiagram({ row, index }: { row: CompetitionLessonPlanRow; index: number }) {
  const primaryDiagram = row.diagramAssets?.[0];

  if (primaryDiagram) {
    return (
      <div className="competition-print-ai-diagram">
        <img
          alt={primaryDiagram.alt}
          className="competition-print-ai-diagram-image"
          height={primaryDiagram.height}
          src={primaryDiagram.imageUrl}
          width={primaryDiagram.width}
        />
        <p className="competition-print-ai-diagram-caption">
          {primaryDiagram.caption ?? row.organization[0] ?? `第 ${index + 1} 环节组织图`}
        </p>
      </div>
    );
  }

  if (row.structure === "准备部分") {
    return (
      <>
        <FormationDiagram />
        <FieldDiagram scattered title={row.organization[0] ?? "热身特训"} />
      </>
    );
  }

  if (row.structure === "结束部分") {
    return <FormationDiagram compact />;
  }

  return (
    <>
      <p className="competition-print-organization-note">{row.organization.join("；")}</p>
      {row.content.slice(0, 4).map((item, contentIndex) => (
        <FieldDiagram
          height={50}
          key={`${row.structure}-${index}-${contentIndex}`}
          title={item.replace(/^[0-9一二三四五六七八九十、.．\s]+/, "")}
        />
      ))}
    </>
  );
}

function PeriodPlanRow({
  row,
  index,
}: {
  row: CompetitionLessonPlanRow;
  index: number;
}) {
  return (
    <tr>
      <td className="competition-print-center competition-print-row-title">
        <VerticalText text={row.structure} />
      </td>
      <td>
        <CompactLines lines={row.content} />
      </td>
      <td colSpan={2}>
        <p className="competition-print-method-label">教师：</p>
        <CompactLines lines={row.methods.teacher} />
        <p className="competition-print-method-label">学生：</p>
        <CompactLines lines={row.methods.students} />
      </td>
      <td colSpan={2}>
        <OrganizationDiagram index={index} row={row} />
      </td>
      <td className="competition-print-center competition-print-vertical-cell">
        <VerticalText text={row.time} />
      </td>
      <td className="competition-print-center competition-print-vertical-cell">
        <VerticalText text={row.intensity} />
      </td>
    </tr>
  );
}

const LOAD_CHART_WIDTH = 400;
const LOAD_CHART_AXIS_RIGHT = 380;
const LOAD_CHART_TOP = 20;
const LOAD_CHART_BOTTOM = 100;
const LOAD_CHART_HEART_RATE_MIN = 80;
const LOAD_CHART_HEART_RATE_MAX = 160;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function heartRateToY(heartRate: number) {
  const ratio =
    (clamp(heartRate, LOAD_CHART_HEART_RATE_MIN, LOAD_CHART_HEART_RATE_MAX) - LOAD_CHART_HEART_RATE_MIN) /
    (LOAD_CHART_HEART_RATE_MAX - LOAD_CHART_HEART_RATE_MIN);

  return LOAD_CHART_BOTTOM - ratio * (LOAD_CHART_BOTTOM - LOAD_CHART_TOP);
}

function parseHeartRateRange(rangeText: string) {
  const values = rangeText.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];

  if (values.length >= 2) {
    return {
      min: Math.min(values[0], values[1]),
      max: Math.max(values[0], values[1]),
    };
  }

  if (values.length === 1) {
    return {
      min: values[0],
      max: values[0],
    };
  }

  return {
    min: 140,
    max: 155,
  };
}

function buildLoadChartGeometry(lesson: CompetitionLessonPlan) {
  const sortedPoints = [...lesson.loadEstimate.chartPoints].sort((left, right) => left.timeMinute - right.timeMinute);
  const totalMinutes = Math.max(...sortedPoints.map((point) => point.timeMinute), 1);
  const points = sortedPoints.map((point) => ({
    ...point,
    x: (point.timeMinute / totalMinutes) * LOAD_CHART_AXIS_RIGHT,
    y: heartRateToY(point.heartRate),
  }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath =
    firstPoint && lastPoint
      ? `${linePath} L ${lastPoint.x} ${LOAD_CHART_BOTTOM} L ${firstPoint.x} ${LOAD_CHART_BOTTOM} Z`
      : "";
  const targetRange = parseHeartRateRange(lesson.loadEstimate.targetHeartRateRange);
  const targetTop = heartRateToY(targetRange.max);
  const targetBottom = heartRateToY(targetRange.min);

  return {
    areaPath,
    linePath,
    points,
    targetBand: {
      y: targetTop,
      height: Math.max(targetBottom - targetTop, 4),
    },
  };
}

function LoadChart({ lesson }: CompetitionLessonPrintViewProps) {
  const chart = buildLoadChartGeometry(lesson);

  return (
    <div className="competition-print-load-container">
      <div className="competition-print-load-chart">
        <svg aria-label="运动负荷心率曲线" role="img" viewBox="0 0 400 120">
          <defs>
            <linearGradient id="competition-print-area-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffcdd2" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ffcdd2" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <rect fill="#ffebee" height={chart.targetBand.height} width={LOAD_CHART_WIDTH} x="0" y={chart.targetBand.y} />
          <text fill="#d32f2f" fontSize="9" fontWeight="bold" x="310" y={Math.max(chart.targetBand.y - 4, 10)}>
            目标区间 {lesson.loadEstimate.targetHeartRateRange}
          </text>
          {[20, 40, 60, 80].map((y) => (
            <line key={y} stroke="#e0e0e0" strokeDasharray="3" x1="0" x2="400" y1={y} y2={y} />
          ))}
          <line stroke="#999" x1="0" x2="400" y1="100" y2="100" />
          {[
            ["160", 16],
            ["140", 36],
            ["120", 56],
            ["100", 76],
            ["80", 96],
          ].map(([label, y]) => (
            <text fill="#999" fontSize="9" key={label} x="0" y={Number(y)}>
              {label}
            </text>
          ))}
          {chart.points.map((point, index) => {
            const isKeyPoint = index === 0 || index === chart.points.length - 1 || point.heartRate >= parseHeartRateRange(lesson.loadEstimate.targetHeartRateRange).min;

            return (
              <text
                fill={isKeyPoint ? "#333" : "#999"}
                fontSize="9"
                fontWeight={isKeyPoint ? "bold" : "normal"}
                key={`${point.timeMinute}-${point.heartRate}-label`}
                x={point.x}
                y="115"
              >
                {point.label ?? `${point.timeMinute}'`}
              </text>
            );
          })}
          {chart.areaPath ? (
            <path
              d={chart.areaPath}
              fill="url(#competition-print-area-gradient)"
            />
          ) : null}
          {chart.linePath ? (
            <path
              d={chart.linePath}
              fill="none"
              stroke="#e53935"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeWidth="2"
            />
          ) : null}
          {chart.points.map((point) => (
            <circle
              cx={point.x}
              cy={point.y}
              fill="#d32f2f"
              key={`${point.timeMinute}-${point.heartRate}`}
              r="2"
            />
          ))}
        </svg>
      </div>
      <div className="competition-print-load-stats">
        <div className="competition-print-stat-value">{lesson.loadEstimate.averageHeartRate}</div>
        <div className="competition-print-stat-label">预计平均心率 (次/分钟)</div>
        <div className="competition-print-density-badges">
          <span className="competition-print-density-badge">
            负荷等级: {lesson.loadEstimate.loadLevel}
          </span>
          <span className="competition-print-density-badge">
            群体运动密度: {lesson.loadEstimate.groupDensity}
          </span>
          <span className="competition-print-density-badge competition-print-density-badge-individual">
            个体运动密度: {lesson.loadEstimate.individualDensity}
          </span>
        </div>
      </div>
    </div>
  );
}

function LessonPlanTable({ lesson }: CompetitionLessonPrintViewProps) {
  return (
    <table className="competition-print-table competition-print-lesson-table">
      <colgroup>
        <col style={{ width: "8%" }} />
        <col style={{ width: "26%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "16%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "20%" }} />
        <col style={{ width: "5%" }} />
        <col style={{ width: "5%" }} />
      </colgroup>
      <tbody>
        <tr>
          <td className="competition-print-col-title">主题</td>
          <td className="competition-print-center">{lesson.meta.topic}</td>
          <td className="competition-print-col-title">课次</td>
          <td className="competition-print-center">{lesson.meta.lessonNo}</td>
          <td className="competition-print-col-title">学生人数</td>
          <td className="competition-print-center" colSpan={3}>
            {lesson.meta.studentCount}
          </td>
        </tr>
        <tr>
          <td className="competition-print-col-title">主要<br />学习<br />内容</td>
          <td colSpan={7}>
            <CompactLines lines={lesson.periodPlan.mainContent} />
          </td>
        </tr>
        <tr>
          <td className="competition-print-col-title">安全<br />保障</td>
          <td colSpan={3}>
            <CompactLines lines={lesson.periodPlan.safety} />
          </td>
          <td className="competition-print-col-title">场地<br />器材</td>
          <td colSpan={3}>
            <CompactLines lines={[...lesson.venueEquipment.venue, ...lesson.venueEquipment.equipment]} />
          </td>
        </tr>
        <tr>
          <td className="competition-print-col-title">课的<br />结构</td>
          <td className="competition-print-col-title">具体教学内容</td>
          <td className="competition-print-col-title" colSpan={2}>教与学的方法</td>
          <td className="competition-print-col-title" colSpan={2}>组织形式</td>
          <td className="competition-print-col-title">运<br />动<br />时<br />间</td>
          <td className="competition-print-col-title">强<br />度</td>
        </tr>
        {lesson.periodPlan.rows.map((row, index) => (
          <PeriodPlanRow index={index} key={`${row.structure}-${index}`} row={row} />
        ))}
        <tr>
          <td className="competition-print-col-title">预计<br />运动<br />负荷</td>
          <td className="competition-print-load-cell" colSpan={7}>
            <LoadChart lesson={lesson} />
          </td>
        </tr>
        <tr>
          <td className="competition-print-col-title">课后<br />作业</td>
          <td colSpan={7}>
            <CompactLines lines={lesson.periodPlan.homework} />
          </td>
        </tr>
        <tr>
          <td className="competition-print-col-title competition-print-reflection-title">教学<br />反思</td>
          <td className="competition-print-reflection" colSpan={7}>
            {lesson.periodPlan.reflection.length ? <CompactLines lines={lesson.periodPlan.reflection} /> : " "}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default function CompetitionLessonPrintView({ lesson }: CompetitionLessonPrintViewProps) {
  return (
    <article className="competition-print-root" data-testid="competition-print-root">
      <section className="competition-print-page">
        <header className="competition-print-header">
          <h2>{lesson.title}</h2>
          <div className="competition-print-subtitle-level">{lesson.subtitle}</div>
          <div className="competition-print-subtitle-teacher">
            <span>授课教师：{lesson.teacher.school}</span>
            <span>{lesson.teacher.name}</span>
          </div>
        </header>

        <Section title="一、指导思想">
          <NarrativeParagraphs lines={lesson.narrative.guidingThought} />
        </Section>
        <Section title="二、教材分析">
          <NarrativeParagraphs lines={lesson.narrative.textbookAnalysis} />
        </Section>
        <Section title="三、学情分析">
          <NarrativeParagraphs lines={lesson.narrative.studentAnalysis} />
        </Section>
        <Section title="四、学习目标">
          <ObjectivesList lesson={lesson} />
        </Section>
        <Section title="五、教学重难点">
          <KeyPointList lesson={lesson} />
        </Section>
        <Section title="六、教学流程">
          <p className="competition-print-flow">{lesson.flowSummary.join(" → ")}</p>
        </Section>
        <Section title="七、学习评价">
          <LearningEvaluationTable lesson={lesson} />
        </Section>
        <Section title="八、运动负荷预计">
          <p className="competition-print-paragraph">
            根据学生身心、教材特点，运动负荷{lesson.loadEstimate.loadLevel}，目标心率区间：
            {lesson.loadEstimate.targetHeartRateRange}，群体运动密度：
            {lesson.loadEstimate.groupDensity}，个体运动密度：{lesson.loadEstimate.individualDensity}；平均心率：
            {lesson.loadEstimate.averageHeartRate}。{joinTextBlock(lesson.loadEstimate.rationale)}
          </p>
        </Section>
        <Section title="九、课时计划">
          <LessonPlanTable lesson={lesson} />
        </Section>
      </section>
    </article>
  );
}
