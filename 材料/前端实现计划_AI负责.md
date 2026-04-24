# 前端实现计划文档 (Frontend Implementation Plan)

> **负责人**：Antigravity (AI 架构师)
> **技术栈**：Next.js (App Router), TailwindCSS, Shadcn UI, Vercel AI SDK (UI层), Monaco Editor, React Markdown

## 1. 核心目标
打造一个媲美 ChatGPT Canvas / Vercel v0 的极速、高颜值的多态工作台（Workspace）。界面分为左右两栏：左侧用于与 AI 对话交互，右侧作为 Artifacts 沙箱实时渲染教案与大屏 HTML。

## 2. 页面布局与骨架 (Layout)
- **文件位置**：`src/app/(workspace)/layout.tsx` & `page.tsx`
- **左侧边栏 (Rail)**：极窄 (72px) 的工具栏，包含应用 Logo 和基础导航按钮（浅色/深色高对比度）。
- **会话侧边栏 (Chat Panel)**：固定宽度 (320px)。顶部显示当前会话标题，中间为消息流列表，底部固定为发送请求的输入框（Input Form）。
- **主画布区 (Main Canvas)**：占据右侧剩余所有空间。顶部设有 `Tabs` 切换（如：Teaching Plan, Screen Preview, Code Editor）。

## 3. 核心组件拆解

### 3.1 对话流组件 (`components/chat/ChatPanel.tsx`)
- 利用 Vercel AI SDK 提供的 `useChat` hook。
- **职责**：接收用户的自然语言输入（例如：“帮我加一个计时器”），将其发送给后端的 API 路由，并实时渲染流式返回的文字。
- **视觉**：打字机效果，平滑滚动至底部，精美的输入气泡。

### 3.2 制品调度器 (`components/artifacts/ArtifactContent.tsx`)
- **职责**：核心中的核心。它负责解析流式传输回来的字符串，提取特殊的闭合标签（比如 `<artifact type="html">` 和 `</artifact>`）。
- 如果检测到是教案，则唤起 Markdown 渲染器；如果是代码，则唤起 Iframe 沙箱或代码编辑器。

### 3.3 大屏沙箱 (`components/artifacts/IframeSandbox.tsx`)
- **职责**：使用 `<iframe>` 结合 `srcDoc` 属性，安全地运行后端生成的 HTML / JS / CSS 源码。
- **视觉**：外围包裹精美的设备模型（Device Frame）或纯黑色高级感卡片底座。

### 3.4 教案渲染器 (`components/artifacts/MarkdownViewer.tsx`)
- **职责**：使用 `react-markdown` 和 `remark-gfm` 渲染后端返回的 Markdown 教案。
- **视觉**：适配 Tailwind 的 Typography (prose)，渲染出层级分明、带有优美表格和引用的标准教学文档。

### 3.5 代码编辑器 (`components/artifacts/CodeEditor.tsx`)
- **职责**：使用 `@monaco-editor/react`，让用户能够直接在网页上二次修改 HTML 源码，修改后立刻在 Iframe 沙箱中热更新。

## 4. 交付节点
在您确认后端 API 的基本流式输出格式（如特定的 XML 标签包裹）后，我将立即开始拼装上述前端组件。
