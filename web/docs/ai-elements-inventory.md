# AI Elements Inventory

## 目标

本项目使用 AI SDK、AI Elements、shadcn/ui 与本地 runtime skills 构建体育教案智能体。AI Elements 组件必须作为长期 UI 基础设施治理，不能在遇到通用 AI UI 问题时优先手写。

## 基本原则

1. 禁止默认安装 `https://elements.ai-sdk.dev/api/registry/all.json`，除非单独评审依赖影响。
2. 新增组件前必须先检查 registry JSON，记录业务理由、直接依赖、registryDependencies 与新增 package。
3. 优先复用 AI Elements 与 shadcn/ui；只有业务适配层可以自写，通用 UI 组件不重复造轮子。
4. 官方组件落地后允许做少量本项目路径、中文文案、React Compiler 兼容性调整，但必须保留组件职责边界。
5. 每次新增组件后必须检查 `package.json`，清理 CLI 误装或本阶段不需要的依赖。
6. 业务数据不得直接耦合官方组件；应通过 adapter 转换为稳定 UI props。
7. 新增 adapter 必须有测试；新增纯 UI 组件至少通过 TypeScript 与 ESLint。

## 当前已安装组件

| 组件 | 当前用途 | 来源与说明 |
| --- | --- | --- |
| `artifact` | 右侧教案、大屏与版本工作区基础容器 | AI Elements，本地已有改造 |
| `chain-of-thought` | 对话中展示 workflow/tool/validation 过程流 | AI Elements registry，已适配本地路径 |
| `code-block` | JSON、代码与工具输入输出展示 | AI Elements，本地已有改造 |
| `conversation` | 对话滚动容器 | AI Elements，本地已有改造，基于 `use-stick-to-bottom` |
| `message` | 用户/助手消息与 Markdown 响应 | AI Elements，本地已有改造 |
| `prompt-input` | 输入框、附件基础能力与工具栏 | AI Elements，本地已有改造 |
| `reasoning` | 展示模型 reasoning 摘要 | AI Elements registry，已适配本地路径 |
| `shimmer` | Reasoning 流式文案动效 | AI Elements registry，已做 React Compiler 兼容调整 |
| `tool` | 标准 AI SDK tool part 与 runtime skill 展示基础组件 | AI Elements registry，已适配本地路径 |
| `web-preview` | HTML 大屏预览相关基础组件 | AI Elements，本地已有改造 |
| `sources` | 展示课标来源与引用依据 | AI Elements registry，已适配本地路径 |
| `inline-citation` | 在文本中展示行内引用与来源轮播 | AI Elements registry，依赖本地 `carousel` |
| `suggestion` | 展示下一步建议操作 | AI Elements registry，已适配本地路径 |
| `attachments` | 展示文件、图片、来源类附件 | AI Elements registry，已适配本地路径 |
| `confirmation` | 展示工具审批或高风险操作确认 | AI Elements registry，依赖本地 `alert` |
| `task` | 展示长任务折叠进度 | AI Elements registry，已适配本地路径 |

## 本阶段计划安装组件

| 组件 | 业务价值 | 依赖检查 | 决策 |
| --- | --- | --- | --- |
| `sources` | 展示课标来源与引用依据 | 依赖 `lucide-react` 与 shadcn `collapsible`；均已存在 | 已安装 |
| `inline-citation` | 在教案说明或课标解释中展示行内引用 | 依赖 shadcn `badge`、`hover-card`、`carousel`；`carousel` 新增 `embla-carousel-react` | 已安装 |
| `suggestion` | 展示下一步建议，如生成大屏、优化器材、调整安全提示 | 依赖 shadcn `button`、`scroll-area`；均已存在 | 已安装 |
| `attachments` | 后续上传课例、模板、图片、学校资料 | 依赖 `ai`、`lucide-react`、shadcn `button`、`hover-card`；均已存在 | 已安装 |
| `confirmation` | 高风险操作确认，如恢复版本、覆盖教案、批量 patch | 依赖 `ai`、shadcn `alert`、`button`；新增 `alert` | 已安装 |
| `task` | 展示长任务，如生成、修复、保存、导出 | 依赖 `lucide-react` 与 shadcn `collapsible`；均已存在 | 已安装 |

## 暂不安装组件

| 组件 | 暂不安装原因 |
| --- | --- |
| `canvas`、`node`、`edge` | React Flow 节点画布，适合未来 Skill/Workflow 可视化，不是当前右侧 Artifact 画布的替代品 |
| `audio-player`、`speech-input`、`mic-selector`、`voice-selector`、`transcription` | 语音能力尚未进入当前主链路 |
| `terminal`、`stack-trace`、`test-results` | 偏开发者诊断，不应提前进入教师端主 UI |
| `jsx-preview`、`package-info`、`environment-variables`、`commit` | 偏代码生成产品，与当前体育教案场景弱相关 |

## 新增组件流程

1. 打开 `https://elements.ai-sdk.dev/api/registry/<component>.json`。
2. 记录 `dependencies`、`registryDependencies` 与潜在新增 package。
3. 判断是否已有等价本地组件，避免重复。
4. 使用单组件安装，不使用 `all.json`。
5. 安装后检查 `package.json` 与 `package-lock.json`，清理无关依赖。
6. 如官方 import 指向 registry 路径，适配为 `@/components/ui/*` 与 `@/components/ai-elements/*`。
7. 跑 `npx tsc --noEmit`、相关 `eslint`、`npm test`。
8. 更新本文件。

## 当前 adapter

| 文件 | 职责 |
| --- | --- |
| `src/lib/assistant-process-events.ts` | 将 `WorkflowTraceData` 与 reasoning text 转为对话过程流事件 |
| `src/components/ai/AssistantProcess.tsx` | 组合 `Reasoning`、`ChainOfThought` 与 `use-stick-to-bottom`，展示滚动过程流 |
| `src/lib/assistant-reference-ui.ts` | 将课标 trace 引用与工作区状态转为 `sources`、`inline-citation`、`suggestion` 所需稳定 props |
