export type LessonScreenThemeName =
  | "basketball-energy"
  | "football-field"
  | "volleyball-court"
  | "track-training"
  | "calm-safety";

export type LessonScreenRhythm = "anchor" | "dense" | "breathing" | "activity";

export type LessonScreenTheme = {
  name: LessonScreenThemeName;
  label: string;
  colors: {
    background: string;
    backgroundAlt: string;
    surface: string;
    surfaceStrong: string;
    primary: string;
    secondary: string;
    accent: string;
    danger: string;
    warning: string;
    text: string;
    muted: string;
    line: string;
    court: string;
  };
};

export type LessonScreenTypography = {
  fontFamily: string;
  coverTitle: number;
  title: number;
  body: number;
  caption: number;
  timer: number;
};

export type LessonScreenDesignSpec = {
  canvas: {
    width: 1920;
    height: 1080;
    aspectRatio: "16:9";
  };
  theme: LessonScreenTheme;
  typography: LessonScreenTypography;
  rhythm: Record<string, LessonScreenRhythm>;
  modules: Array<"timer" | "timeline" | "steps" | "safety" | "assessment" | "tacticalBoard">;
};

type RhythmInputSlide = {
  title: string;
  boardRequired: boolean;
};

const THEMES: Record<LessonScreenThemeName, LessonScreenTheme> = {
  "basketball-energy": {
    name: "basketball-energy",
    label: "篮球热血橙",
    colors: {
      background: "#160d08",
      backgroundAlt: "#3b1d0c",
      surface: "#fff7ed1c",
      surfaceStrong: "#431407d9",
      primary: "#f97316",
      secondary: "#fb923c",
      accent: "#facc15",
      danger: "#ef4444",
      warning: "#f59e0b",
      text: "#fff7ed",
      muted: "#fed7aa",
      line: "#fdba74",
      court: "#7c2d12",
    },
  },
  "football-field": {
    name: "football-field",
    label: "足球草场绿",
    colors: {
      background: "#07111f",
      backgroundAlt: "#16351f",
      surface: "#ffffff13",
      surfaceStrong: "#052e1acc",
      primary: "#22c55e",
      secondary: "#38bdf8",
      accent: "#bef264",
      danger: "#ef4444",
      warning: "#facc15",
      text: "#f8fafc",
      muted: "#c7f9d4",
      line: "#bbf7d0",
      court: "#166534",
    },
  },
  "volleyball-court": {
    name: "volleyball-court",
    label: "排球清爽蓝",
    colors: {
      background: "#07152f",
      backgroundAlt: "#0f2f5f",
      surface: "#dbeafe18",
      surfaceStrong: "#082f49d9",
      primary: "#38bdf8",
      secondary: "#60a5fa",
      accent: "#fde68a",
      danger: "#f43f5e",
      warning: "#f59e0b",
      text: "#eff6ff",
      muted: "#bfdbfe",
      line: "#bae6fd",
      court: "#1d4ed8",
    },
  },
  "track-training": {
    name: "track-training",
    label: "田径冲刺红",
    colors: {
      background: "#18090d",
      backgroundAlt: "#3f101a",
      surface: "#ffe4e61a",
      surfaceStrong: "#4c0519d9",
      primary: "#fb7185",
      secondary: "#f97316",
      accent: "#fde047",
      danger: "#ef4444",
      warning: "#f59e0b",
      text: "#fff1f2",
      muted: "#fecdd3",
      line: "#fda4af",
      court: "#be123c",
    },
  },
  "calm-safety": {
    name: "calm-safety",
    label: "通用安全青",
    colors: {
      background: "#061a1a",
      backgroundAlt: "#0f3030",
      surface: "#ccfbf11a",
      surfaceStrong: "#134e4ad9",
      primary: "#14b8a6",
      secondary: "#2dd4bf",
      accent: "#a7f3d0",
      danger: "#ef4444",
      warning: "#facc15",
      text: "#f0fdfa",
      muted: "#99f6e4",
      line: "#5eead4",
      court: "#0f766e",
    },
  },
};

export function resolveLessonScreenTheme(lessonText: string): LessonScreenTheme {
  if (/篮球|传切|运球|投篮|篮板/.test(lessonText)) {
    return THEMES["basketball-energy"];
  }

  if (/足球|射门|控球|带球|传球/.test(lessonText)) {
    return THEMES["football-field"];
  }

  if (/排球|垫球|发球|扣球/.test(lessonText)) {
    return THEMES["volleyball-court"];
  }

  if (/田径|跑|跳|投掷|耐力|体能|冲刺/.test(lessonText)) {
    return THEMES["track-training"];
  }

  return THEMES["calm-safety"];
}

export function resolveSlideRhythm(slide: RhythmInputSlide, index: number, total: number): LessonScreenRhythm {
  if (slide.boardRequired) {
    return "activity";
  }

  if (index === total - 1 || /放松|总结|小结|结束/.test(slide.title)) {
    return "breathing";
  }

  if (index === 0 || /常规|准备|热身/.test(slide.title)) {
    return "dense";
  }

  return "dense";
}

export function buildLessonScreenDesignSpec(lessonText: string, slides: RhythmInputSlide[]): LessonScreenDesignSpec {
  const rhythm = slides.reduce<Record<string, LessonScreenRhythm>>((acc, slide, index) => {
    acc[`P${String(index + 1).padStart(2, "0")}`] = resolveSlideRhythm(slide, index, slides.length);
    return acc;
  }, {});

  return {
    canvas: {
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
    },
    theme: resolveLessonScreenTheme(lessonText),
    typography: {
      fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
      coverTitle: 92,
      title: 76,
      body: 27,
      caption: 22,
      timer: 62,
    },
    rhythm,
    modules: ["timer", "timeline", "steps", "safety", "assessment", "tacticalBoard"],
  };
}

export function renderLessonScreenCssVariables(spec: LessonScreenDesignSpec) {
  const { colors } = spec.theme;
  const { typography } = spec;

  return [
    `--screen-bg: ${colors.background}`,
    `--screen-bg-alt: ${colors.backgroundAlt}`,
    `--screen-surface: ${colors.surface}`,
    `--screen-surface-strong: ${colors.surfaceStrong}`,
    `--screen-primary: ${colors.primary}`,
    `--screen-secondary: ${colors.secondary}`,
    `--screen-accent: ${colors.accent}`,
    `--screen-danger: ${colors.danger}`,
    `--screen-warning: ${colors.warning}`,
    `--screen-text: ${colors.text}`,
    `--screen-muted: ${colors.muted}`,
    `--screen-line: ${colors.line}`,
    `--screen-court: ${colors.court}`,
    `--font-family: ${typography.fontFamily}`,
    `--font-cover-title: ${typography.coverTitle}px`,
    `--font-title: ${typography.title}px`,
    `--font-body: ${typography.body}px`,
    `--font-caption: ${typography.caption}px`,
    `--font-timer: ${typography.timer}px`,
  ].join(";\n      ");
}
