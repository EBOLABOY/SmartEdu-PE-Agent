# ppt-master 借鉴分析：用于优化体育课堂 HTML 学习辅助大屏

## 一、结论

可以借鉴 `ppt-master`，但不能直接照搬。

它的核心价值不在某一个漂亮模板，而在一套“先策划、再锁定设计规范、再逐页执行、最后质量检查”的生产关系。把这套方法转化到本项目，应服务于体育课堂 HTML 学习辅助大屏，而不是把我们的产物改成普通 PPT 或 SVG/PPTX 导出工具。

当前项目应优先吸收以下理念：

1. 设计规格锁定：在生成 HTML 前先形成可执行的主题、色彩、字体、节奏、模块约束。
2. 页面节奏控制：不要每页都是同一种卡片网格，要区分总览页、密集操作页、呼吸型提示页、总结页。
3. 可视化组件库：把时间轴、步骤卡、路线图、战术板、评价卡、计分器做成可复用渲染模块。
4. 质量检查门禁：生成后用规则判断是否满足投屏、可读性、安全、离线运行、16:9、倒计时与控制按钮要求。
5. Prompt 分工：把“策划/设计规范”和“执行/生成 HTML”拆开，减少模型一次性自由发挥导致的审美漂移。

不建议直接照搬的部分：

1. SVG 转 PPTX 的 DrawingML 转换链路。本项目目标是离线 HTML 投屏和课堂交互，不是原生 PPTX 编辑。
2. PPT 兼容的 SVG 禁用规则。本项目 HTML 允许 CSS、class、script 和动画，只要满足沙箱安全即可。
3. 强制逐页生成 SVG 的工作流。本项目更需要结构化状态驱动的单文件 HTML 模板渲染。
4. 外部图片生成和图标嵌入流程。学校投屏场景优先离线、稳定、低依赖。

## 二、已拉取位置

外部源码已拉取到：

```text
.external/ppt-master
```

该目录仅作分析参考，不应被业务代码直接 import，也不应纳入当前应用运行链路。

## 三、ppt-master 怎么做

### 3.1 总体流程

`ppt-master` 的核心流水线是：

```text
Source Document
→ Create Project
→ Template Option
→ Strategist
→ Image_Generator
→ Executor
→ Post-processing
→ Export
```

对应关键文件：

```text
.external/ppt-master/skills/ppt-master/SKILL.md
.external/ppt-master/skills/ppt-master/references/strategist.md
.external/ppt-master/skills/ppt-master/references/executor-base.md
.external/ppt-master/skills/ppt-master/references/shared-standards.md
.external/ppt-master/skills/ppt-master/templates/spec_lock_reference.md
.external/ppt-master/skills/ppt-master/templates/layouts/layouts_index.json
.external/ppt-master/skills/ppt-master/templates/charts/charts_index.json
.external/ppt-master/skills/ppt-master/scripts/svg_quality_checker.py
```

### 3.2 核心不是“一键生成”，而是“八项确认”

它在正式出设计前要求确认：

1. 画布格式。
2. 页数范围。
3. 目标受众。
4. 风格目标。
5. 色彩方案。
6. 图标方案。
7. 字体方案。
8. 图片方案。

这和我们体育课堂场景可以对应为：

1. 投屏比例：默认 16:9，iframe 当前按 1920×1080 预览。
2. 课堂环节数：来自教案课时计划。
3. 目标学生：年级、人数、运动基础。
4. 风格目标：篮球热血、足球草场、体能挑战、低年级游戏化、比赛教研严肃风等。
5. 色彩方案：依据运动项目和安全语义设置。
6. 图标方案：统一线性或实体风格，避免混乱。
7. 字体方案：大屏安全字号，不使用外链字体。
8. 图示方案：战术板、路线图、队形图、计分器、时间轴。

### 3.3 spec_lock 是防止审美漂移的关键

`ppt-master` 会生成 `spec_lock.md`，要求执行器每一页都重读它。它锁定：

1. 画布。
2. 色彩。
3. 字体。
4. 图标库。
5. 图片资源。
6. 页面节奏。
7. 禁用规则。

本项目可以转化为 `HtmlDesignSpec` 或 `LessonScreenDesignSpec`，不一定落成 Markdown 文件，也可以是 TypeScript 对象。

建议结构：

```ts
type LessonScreenDesignSpec = {
  canvas: {
    width: 1920;
    height: 1080;
    aspectRatio: "16:9";
  };
  theme: {
    name: "basketball-energy" | "football-field" | "calm-safety" | "competition";
    colors: {
      background: string;
      surface: string;
      primary: string;
      secondary: string;
      accent: string;
      danger: string;
      text: string;
      muted: string;
    };
  };
  typography: {
    title: number;
    subtitle: number;
    body: number;
    caption: number;
    timer: number;
    fontFamily: string;
  };
  rhythm: Record<string, "anchor" | "dense" | "breathing" | "activity">;
  modules: Array<"timer" | "timeline" | "steps" | "safety" | "assessment" | "tacticalBoard" | "scoreboard">;
};
```

### 3.4 page_rhythm 能解决“AI 味”

`ppt-master` 把页面分为：

1. `anchor`：封面、目录、章节、结尾等结构页。
2. `dense`：信息密集页，允许卡片、表格、多列。
3. `breathing`：低密度冲击页，避免堆卡片，用留白、单句、图片或大数字。

本项目可以扩展为：

1. `anchor`：课堂运行总览、结束总结。
2. `dense`：技能练习、比赛规则、安全评价等信息多的环节。
3. `breathing`：课前提醒、核心口诀、关键动作提示、课堂小结。
4. `activity`：战术跑位、路线图、计分器、轮换练习等可交互环节。

这能直接提升美观程度，因为现在很多 AI 页面的问题不是“不够华丽”，而是每页结构过于平均，没有视觉呼吸。

### 3.5 图表库的价值是“选择规则”

`charts_index.json` 不是简单列模板，而是告诉模型“什么内容适合什么可视化”。例如：

1. 时间进程选 `timeline`。
2. 流程关系选 `process_flow`。
3. 指标概览选 `kpi_cards`。
4. 对比评价选 `comparison_table`。
5. 分层结构选 `pyramid_chart` 或 `layered_architecture`。

体育课堂可映射为：

1. 课堂流程：`timeline`。
2. 热身动作序列：`numbered_steps`。
3. 小组轮换：`process_flow` 或 `cycle_diagram`。
4. 战术跑位：`tactical_board`，本项目需要自建。
5. 运动负荷：`line_chart` 或 `progress_bar_chart`。
6. 学习评价：`harvey_balls_table` 或星级评价卡。
7. 安全风险：`pros_cons_chart` 或 warning checklist。

## 四、对当前项目的落地建议

### 4.1 短期：先改提示词和兜底 HTML

位置：

```text
web/src/mastra/agents/pe_teacher.ts
web/src/lib/lesson-slideshow-html.ts
web/src/lib/lesson-slideshow-html.test.ts
```

建议：

1. 在 HTML 阶段提示词中加入“设计规格确认思维”，但不一定要求用户二次确认。
2. 在 `buildLessonSlideshowHtml` 中引入 `getLessonScreenDesignSpec()`。
3. 按运动项目推导主题：篮球、足球、排球、田径、体能、武术等。
4. 按页面功能推导 rhythm：封面 `anchor`，战术页 `activity`，普通环节 `dense`，总结页 `breathing`。
5. 把 CSS 变量从硬编码颜色升级为主题变量。

### 4.2 中期：建立 HTML 大屏组件库

建议新增或重构：

```text
web/src/lib/lesson-screen-design.ts
web/src/lib/lesson-screen-modules.ts
web/src/lib/lesson-screen-quality.ts
```

模块建议：

1. `renderTimelineModule`：全课时间轴。
2. `renderStepCardsModule`：学生三步行动。
3. `renderSafetyModule`：安全提醒。
4. `renderAssessmentModule`：评价观察。
5. `renderTacticalBoardModule`：战术板自动跑位。
6. `renderFormationModule`：队形图。
7. `renderScoreboardModule`：分组计分。
8. `renderLoadCurveModule`：运动负荷曲线。

### 4.3 中期：增加质量检查门禁

参考 `svg_quality_checker.py`，但本项目应检查 HTML：

1. 是否完整 HTML 文档。
2. 是否 `lang="zh-CN"`。
3. 是否 16:9 全屏。
4. 是否至少 3 个 `.slide`。
5. 是否有 `data-duration`。
6. 是否有开始、暂停、上一页、下一页、重新计时。
7. 是否无外链资源。
8. 是否无主动网络、本地存储和打开新窗口。
9. 字号是否适合投屏。
10. 是否每页都有安全/行动/时间信息。

可以增强现有：

```text
web/src/lib/sandbox-html.ts
web/src/lib/lesson-slideshow-html.ts
```

### 4.4 长期：从“AI 自由生成 HTML”转为“结构化状态渲染 HTML”

项目总纲中已经写过正确方向：

```text
教师输入需求
→ AI 生成结构化 JSON 配置
→ 系统校验 JSON
→ 模板引擎渲染 HTML
→ 教师预览和修改
→ 导出 HTML 大屏
```

这与 `ppt-master` 的 `spec_lock` 思想一致。真正稳定的美观，应来自“结构化设计状态 + 模板渲染”，而不是每次让模型重写完整 HTML。

## 五、可直接借鉴的设计原则

### 5.1 60-30-10 色彩规则

每个主题最多 4 个主色：

1. 主背景/主色 60%。
2. 卡片/辅助色 30%。
3. 强调色 10%。
4. 危险/安全语义色单独控制。

### 5.2 字号比例规则

大屏不是网页，建议：

1. 封面标题：72-108px。
2. 页面标题：56-76px。
3. 倒计时：64-96px。
4. 卡片正文：26-34px。
5. 辅助说明：20-24px。

### 5.3 图标统一规则

同一套大屏只用一种图标风格。体育课堂建议优先：

1. 线性图标：适合高年级、教研、比赛课。
2. 圆润实体图标：适合低年级、游戏化课堂。
3. 几何实心图标：适合体能、挑战、训练营风格。

### 5.4 视觉深度规则

不要所有卡片都加重阴影。建议：

1. 主行动卡可以有轻阴影。
2. 同级信息卡保持扁平。
3. 安全卡用色块和边框强调，不靠阴影。
4. 战术板作为主视觉，可以有最高层级。

### 5.5 页面节奏规则

一节课的大屏不应每页都像信息看板。建议：

1. 开始页：总览型，建立全局联系。
2. 热身页：节奏型，强调跟做。
3. 技能页：密集型，强调步骤和安全。
4. 战术页：活动型，强调自动跑位。
5. 比赛页：操作型，强调规则、计分、轮换。
6. 总结页：呼吸型，强调反思和评价。

## 六、下一步实现计划

### 第一步：建立设计规格对象

位置：

```text
web/src/lib/lesson-screen-design.ts
```

理由：把主题、色彩、字体、页面节奏从 HTML 字符串里抽出来，提升可维护性。

同步检查：

1. `lesson-slideshow-html.ts` 是否只消费 spec，不重复硬编码。
2. 测试是否覆盖不同运动项目主题。
3. 沙箱检查是否不受影响。

### 第二步：主题变量化

位置：

```text
web/src/lib/lesson-slideshow-html.ts
```

理由：当前 CSS 视觉风格偏固定，主题变量化后才能做到篮球、足球、体能、低年级游戏化等差异化。

同步检查：

1. 所有颜色来自 spec。
2. 安全/警告色保持稳定语义。
3. 文本对比度满足投屏需求。

### 第三步：页面 rhythm 化

位置：

```text
web/src/lib/lesson-slideshow-html.ts
```

理由：解决“每页都是卡片”的平均化问题。

同步检查：

1. 封面页为 `anchor`。
2. 战术页为 `activity`。
3. 总结页为 `breathing`。
4. 普通教学环节为 `dense`。

### 第四步：增加 HTML 质量检查

位置：

```text
web/src/lib/lesson-screen-quality.ts
web/src/lib/lesson-slideshow-html.test.ts
```

理由：借鉴 `svg_quality_checker.py`，把审美和可用性底线工程化。

同步检查：

1. 不阻断安全 HTML。
2. 能识别长文网页、无倒计时、无控制按钮、外链资源。
3. 与 `sandbox-html.ts` 职责不冲突：前者查课堂大屏质量，后者查安全风险。

## 七、风险与边界

1. 不能为了美观牺牲课堂可读性。体育课堂投屏首先要大字、高对比、低认知负担。
2. 不能为了动画牺牲交互稳定。自动跑位只做 CSS/SVG 动画，不引入复杂状态机。
3. 不能让模型完全自由决定安全规则。安全提醒必须来自教案或结构化约束。
4. 不能直接依赖外部仓库代码。`ppt-master` 是参考资料，不是运行依赖。
5. 不能用 PPT 逻辑覆盖课堂逻辑。我们的大屏服务的是学生行动和教师组织，不是演讲叙事。

## 八、建议优先级

P0：

1. 设计规格对象。
2. 主题变量化。
3. 页面 rhythm。
4. HTML 大屏质量检查。

P1：

1. 体育项目主题库。
2. 队形/战术/轮换组件库。
3. 运动负荷曲线组件。
4. 计分器和分组轮换交互。

P2：

1. 用户可选风格。
2. AI 先生成大屏策划稿，再渲染 HTML。
3. 类似 `spec_lock` 的可视化编辑与版本回滚。

## 九、执行记录

### 9.1 已完成：P0 设计规格与质量检查

完成位置：

```text
web/src/lib/lesson-screen-design.ts
web/src/lib/lesson-screen-design.test.ts
web/src/lib/lesson-screen-quality.ts
web/src/lib/lesson-slideshow-html.ts
web/src/lib/lesson-slideshow-html.test.ts
```

完成内容：

1. 新增 `LessonScreenDesignSpec`，承载画布、主题、字体、页面节奏和模块清单。
2. 新增运动项目主题识别：篮球、足球、排球、田径/体能、通用安全主题。
3. 新增页面 rhythm：封面 `anchor`，战术页 `activity`，总结页 `breathing`，普通页 `dense`。
4. 将 HTML 生成器的核心颜色和字体改为 CSS 变量驱动。
5. 新增 `analyzeLessonScreenHtml`，检查课堂大屏是否满足完整 HTML、多页、倒计时、控制按钮、学生三步行动、安全提醒等底线。

验证命令：

```bash
npm test -- --run src/lib/lesson-slideshow-html.test.ts src/lib/lesson-screen-design.test.ts src/lib/sandbox-html.test.ts
npx tsc --noEmit
```

### 9.2 已完成：P1 模块化渲染第一步

完成位置：

```text
web/src/lib/lesson-screen-modules.ts
web/src/lib/lesson-screen-modules.test.ts
web/src/lib/lesson-slideshow-html.ts
```

完成内容：

1. 拆出 `RenderableLessonSlide`，避免渲染模块反向依赖主生成器。
2. 拆出 `escapeHtml`，统一模块级 HTML 文本转义。
3. 拆出 `renderTimelineModule`，负责课堂运行总览时间轴。
4. 拆出 `renderStepCardsModule`，负责学生三步行动。
5. 拆出 `renderInfoCardModule`，负责教师提示、学生行动、安全提醒、评价观察等卡片。
6. 拆出 `renderTacticalBoardModule`，负责普通重点卡和自动跑位战术板。
7. 拆出 `renderLessonSlideModule`，负责单个教学环节页面组装。

验证命令：

```bash
npm test -- --run src/lib/lesson-slideshow-html.test.ts src/lib/lesson-screen-design.test.ts src/lib/lesson-screen-modules.test.ts src/lib/sandbox-html.test.ts
npx tsc --noEmit
```

### 9.9 已完成：P2 支持模块策略结构化

完成位置：

```text
web/src/lib/lesson-screen-modules.ts
web/src/lib/lesson-slideshow-html.ts
web/src/lib/lesson-screen-state.ts
web/src/lib/lesson-screen-quality.ts
web/src/lib/lesson-screen-modules.test.ts
web/src/lib/lesson-slideshow-html.test.ts
```

完成内容：

1. 新增 `LessonSupportModule` 类型，取值为 `tacticalBoard`、`scoreboard`、`rotation`、`formation`。
2. `RenderableLessonSlide` 和 `LessonSlide` 新增显式 `supportModule` 字段，右侧支持模块不再只依赖自然语言关键词临时判断。
3. 新增 `resolveLessonSupportModule()`，优先读取显式 `supportModule`，缺失时才回落到旧的关键词推断，保证历史输入兼容。
4. `renderLessonSlideModule()` 为每个内容页输出 `data-support-module`，后续质量检查、编辑器定位和模块统计都可以稳定读取。
5. `LessonScreenProjectState` 新增 `supportModuleCounts`，统一统计战术板、计分板、轮换路线和队形图数量；原 `boardCount` 保持兼容，当前指向 `tacticalBoard` 数量。
6. `analyzeLessonScreenHtml()` 新增结构化支持模块标记检查，缺少 `data-support-module` 时给出可维护性警告。
7. 更新测试，覆盖显式模块优先级、HTML 结构化标记、中间态模块统计和质量警告。

同步检查：

1. 从联系观点看，模块选择已经从“渲染时猜测”前移到“解析和 Project State 阶段显式承载”，渲染层只消费结构化结果。
2. 从发展观点看，后续 AI 生成教案或大屏配置时可以直接产出 `supportModule`，逐步减少关键词规则数量。
3. 从实践原则看，本次保留关键词兜底，避免已有自然语言教案输入失效，同时新增测试验证显式配置优先。
4. 质量检查已经纳入 `data-support-module`，让结构化策略不只是类型字段，而能落到最终 HTML 产物。
5. 本次改造可回滚：移除 `supportModule` 字段、`resolveLessonSupportModule()`、`supportModuleCounts` 和质量检查项，即可恢复旧的关键词选择模式。

验证命令：

```bash
npm test -- --run src/lib/lesson-slideshow-html.test.ts src/lib/lesson-screen-design.test.ts src/lib/lesson-screen-modules.test.ts src/lib/sandbox-html.test.ts
npx tsc --noEmit
```

### 9.8 已完成：P2 脚本拆分与中间态 Project State

完成位置：

```text
web/src/lib/lesson-screen-script.ts
web/src/lib/lesson-screen-state.ts
web/src/lib/lesson-slideshow-html.ts
web/src/lib/lesson-slideshow-html.test.ts
```

完成内容：

1. 新增 `lesson-screen-script.ts`，将倒计时、翻页、键盘控制、计分板交互等内联脚本集中到 `renderLessonScreenScript()`。
2. 新增 `lesson-screen-state.ts`，定义 `LessonScreenProjectState`，统一承载标题、环节列表、设计规格、总时长、预计分钟数、战术/活动模块数量、运动负荷曲线点和脚本所需 `slideData`。
3. `lesson-slideshow-html.ts` 改为先构建 `state`，再由 `state` 驱动样式、封面、时间轴、负荷曲线、内容页和脚本渲染。
4. 保留最终单文件 HTML 输出，脚本仍以内联方式进入 HTML，兼容当前沙箱投屏和导出链路。
5. 新增测试覆盖中间态构建和脚本独立渲染，避免后续重构只靠最终 HTML 字符串间接验证。

同步检查：

1. 从整体联系看，当前生成链路已经拆成：解析输入 → 构建 Project State → 生成设计变量与样式 → 渲染页面模块 → 注入运行脚本 → 质量与沙箱检查。
2. 从发展观点看，后续主题切换、模块增删、质量评分、编辑器可视化配置都可以围绕 `LessonScreenProjectState` 扩展，不需要继续堆叠在 HTML 字符串模板里。
3. 从实践原则看，本次不改变用户可见的大屏行为，只改变内部职责边界，并用测试验证倒计时、计分板、沙箱安全和课堂质量要求仍成立。
4. 脚本仍不使用网络、外链、本地存储、Cookie 或窗口打开能力，符合 `sandbox-html.ts` 约束。
5. 本次改造可回滚：删除 `lesson-screen-script.ts` 和 `lesson-screen-state.ts`，把脚本字符串与状态计算放回 `lesson-slideshow-html.ts` 即可恢复旧结构。

验证命令：

```bash
npm test -- --run src/lib/lesson-slideshow-html.test.ts src/lib/lesson-screen-design.test.ts src/lib/lesson-screen-modules.test.ts src/lib/sandbox-html.test.ts
npx tsc --noEmit
```

### 9.7 已完成：P2 样式拆分与解析去重

完成位置：

```text
web/src/lib/lesson-screen-styles.ts
web/src/lib/lesson-slideshow-html.ts
web/src/lib/lesson-slideshow-html.test.ts
```

完成内容：

1. 新增 `lesson-screen-styles.ts`，将课堂学习辅助大屏的内联 CSS 从 `lesson-slideshow-html.ts` 拆出为 `renderLessonScreenStyles()`。
2. `lesson-slideshow-html.ts` 保留 HTML 组装、教案解析、脚本注入和模块调度职责，不再承载大段样式细节。
3. 新增 `isMarkdownTableLine()`，让松散文本解析跳过 Markdown 表格行，避免表格行被二次识别为“热身”“比赛”等短标题环节。
4. 新增 `normalizeSlideIdentity()`，按阶段关键词和分钟级时长生成去重键，作为跨解析来源的兜底去重机制。
5. 更新测试，明确篮球教案表格应解析为 5 个环节，且不再额外生成 `热身`、`比赛` 这类由表格行二次提取出的重复页。

同步检查：

1. 样式仍以 `LessonScreenDesignSpec` 和 CSS 变量为入口，主题能力未被削弱。
2. 最终 HTML 仍是单文件内联 CSS/JS，符合当前沙箱和投屏使用方式。
3. 解析链路保持“结构化表格优先、自由文本补充”的发展方向，减少自然语言猜测对稳定性的影响。
4. 未接入 `.external/ppt-master` 代码，仅继续借鉴其“生成器职责分层”的工程理念。
5. 本次改造可回滚：恢复 `lesson-slideshow-html.ts` 原样并删除 `lesson-screen-styles.ts` 即可回退样式拆分；移除 `isMarkdownTableLine()` 和 `normalizeSlideIdentity()` 即可回退解析去重策略。

验证命令：

```bash
npm test -- --run src/lib/lesson-slideshow-html.test.ts src/lib/lesson-screen-design.test.ts src/lib/lesson-screen-modules.test.ts src/lib/sandbox-html.test.ts
npx tsc --noEmit
```

同步检查：

1. 未引入业务运行时外部依赖。
2. 未接入 `.external/ppt-master` 到产品代码。
3. 未改变沙箱安全策略。
4. 保留原有倒计时、切页、键盘控制和兜底生成链路。

### 9.3 下一步建议

下一步应继续扩展 `lesson-screen-modules.ts`，优先新增：

1. `renderFormationModule`：队形图，服务集合、热身、分组练习。
2. `renderScoreboardModule`：分组计分，服务比赛和挑战类课堂。
3. `renderLoadCurveModule`：运动负荷曲线，服务教研和比赛课展示。
4. `renderRotationModule`：小组轮换路线，服务站点练习和循环练习。

### 9.4 已完成：P1 队形图与计分板模块

完成位置：

```text
web/src/lib/lesson-screen-modules.ts
web/src/lib/lesson-screen-modules.test.ts
web/src/lib/lesson-slideshow-html.ts
```

完成内容：

1. 新增 `renderFormationModule`，可根据组织形式生成四列横队、半圆队形、散点练习、分组轮换等简易队形图。
2. 新增 `renderScoreboardModule`，为比赛、竞赛、挑战、计分等环节生成四组计分板。
3. 新增 `renderActivitySupportModule`，统一判断右侧支持模块：战术页显示自动跑位战术板，比赛页显示计分板，普通页显示组织队形图。
4. 为 `formation-card`、`scoreboard-card`、`module-heading`、`score-grid` 等补充 CSS 样式，沿用当前主题变量。

验证命令：

```bash
npm test -- --run src/lib/lesson-slideshow-html.test.ts src/lib/lesson-screen-design.test.ts src/lib/lesson-screen-modules.test.ts src/lib/sandbox-html.test.ts
npx tsc --noEmit
```

后续建议调整为：

1. `renderLoadCurveModule`：把教案中的运动负荷节点转为可视化曲线。
2. `renderRotationModule`：把站点练习、小组轮换、接力路线转为动态图示。
3. 将计分板从静态展示升级为可点击加减分，但要继续遵守沙箱安全限制，不使用本地存储和网络能力。

### 9.5 已完成：P1 运动负荷曲线与轮换路线模块

完成位置：

```text
web/src/lib/lesson-screen-modules.ts
web/src/lib/lesson-screen-modules.test.ts
web/src/lib/lesson-slideshow-html.ts
web/src/lib/lesson-slideshow-html.test.ts
```

完成内容：

1. 新增 `extractLoadCurvePoints`，从教案文本中的“心率曲线节点：0'=90，7'=120...”解析运动负荷节点。
2. 新增 `renderLoadCurveModule`，在课堂运行总览中渲染迷你运动负荷曲线。
3. 新增 `renderRotationModule`，为站点练习、轮换、接力、循环练习等环节渲染小组轮换路线图。
4. 扩展 `renderActivitySupportModule`，右侧支持模块选择顺序为：战术板 → 计分板 → 轮换路线 → 队形图。
5. 为 `load-curve-card`、`rotation-card`、`rotation-route`、`station` 等补充 CSS 样式。

验证命令：

```bash
npm test -- --run src/lib/lesson-slideshow-html.test.ts src/lib/lesson-screen-design.test.ts src/lib/lesson-screen-modules.test.ts src/lib/sandbox-html.test.ts
npx tsc --noEmit
```

下一步建议：

1. 将静态计分板升级为可点击加减分，继续保持无外链、无存储、无网络请求。
2. 把 `LessonSlide` 扩展为更接近 Project State 的结构化大屏配置，减少从自然语言字段猜测模块类型。
3. 将 CSS 从 `lesson-slideshow-html.ts` 继续拆出为 `lesson-screen-styles.ts`，让生成器只负责组装 HTML 文档。

### 9.6 已完成：P1 可点击计分板

完成位置：

```text
web/src/lib/lesson-screen-modules.ts
web/src/lib/lesson-screen-modules.test.ts
web/src/lib/lesson-slideshow-html.ts
web/src/lib/lesson-slideshow-html.test.ts
```

完成内容：

1. 将 `renderScoreboardModule` 从静态展示升级为课堂可用的四队计分板，每队包含当前分值、`+1`、`-1` 和 `清零` 控制。
2. 在 `lesson-slideshow-html.ts` 中新增 `setupScoreboards()`，只用 DOM 内存状态维护分数，刷新页面后自动归零。
3. 为 `.score-actions` 和按钮补充内联样式，保持与当前大屏主题变量一致。
4. 调整 `renderActivitySupportModule` 的模块选择顺序为：计分板 → 战术板 → 轮换路线 → 队形图。原因是比赛、挑战、展示类页面可能同时包含“运球、接力、轮换”等战术关键词，但课堂实践中更需要即时计分反馈。
5. 更新测试断言，覆盖 `data-score-action="plus"`、`data-score-action="minus"`、`data-score-action="reset"`、`setupScoreboards` 和沙箱安全检查。

同步检查：

1. 未使用 `localStorage`、`sessionStorage`、Cookie、网络请求或外部脚本，符合 `sandbox-html.ts` 的安全约束。
2. 未接入 `.external/ppt-master` 代码，仅延续其“结构化配置、模块化渲染、质量检查”的理念。
3. 比赛页优先显示计分板，战术学习页仍显示自动跑位战术板，站点轮换页仍显示轮换路线，普通组织页仍显示队形图。
4. 计分状态只在当前页面生命周期内有效，符合课堂大屏“即时辅助”定位，不制造持久化副作用。

验证命令：

```bash
npm test -- --run src/lib/lesson-slideshow-html.test.ts src/lib/lesson-screen-design.test.ts src/lib/lesson-screen-modules.test.ts src/lib/sandbox-html.test.ts
npx tsc --noEmit
```
