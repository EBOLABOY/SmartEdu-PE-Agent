# 后端实现计划文档 (Backend Implementation Plan)

> **负责人**：USER (人类工程师)
> **技术栈**：Next.js API Routes, Vercel AI SDK (Core 层), Mastra (智能体工作流)

## 1. 核心目标
构建一个流式响应（Streaming）的 AI 后端引擎。接收前端传来的消息历史，利用 Mastra 编排复杂的思维链和检索逻辑，最终通过 Vercel AI SDK 将生成的“教案(Markdown)”和“大屏页面(HTML)”以流的形式返回给前端。

## 2. API 路由设计
- **文件位置**：`src/app/api/chat/route.ts`
- **请求方式**：POST
- **职责**：
  1. 解析前端通过 `useChat` 传来的 `messages` 数组。
  2. 初始化并调用底层的 Mastra Workflow 或直接调用大模型（如使用 `streamText`）。
  3. 将生成的 Text Stream 或 Structured Stream 返给前端。

## 3. Mastra 智能体与工作流编排

这是后端最核心的架构部分，建议按照以下结构进行拆分：

### 3.1 代理人定义 (`mastra/agents/pe_teacher.ts`)
- 定义一个专门针对体育教育领域的 Agent。
- **System Prompt 的黄金法则**：必须要求 Agent 输出结构化的结果！为了配合前端 Artifacts 渲染器，您需要强制 AI 在输出 HTML 代码时，用特定的标识符包裹，例如：
  ```xml
  这里是您的教案分析...
  
  <artifact type="html">
    <!DOCTYPE html>
    <html>...各种计时器和界面的代码...</html>
  </artifact>
  ```
  只有规范的输出格式，前端的正则解析器才能完美剥离出 HTML 扔进沙箱渲染。

### 3.2 工具定义 (`mastra/tools/`)
如果您希望大模型不只是“瞎编”，而是基于真实的课标，您可以定义一些 Tools：
- `search_standards.ts`：通过 RAG 或者 API 查询美国 SHAPE 标准或中国新课标要求。
- 只有触发这些工具后，AI 才会生成合规的教案内容。

### 3.3 工作流定义 (`mastra/workflows/`)
如果业务逻辑复杂（例如：先出教案大纲 -> 校验 -> 再出 HTML），可以通过 Mastra 构建有向无环图 (DAG)：
- `Step 1`: Plan Node (生成教案 Markdown)
- `Step 2`: Code Node (根据教案生成对应的 HTML 交互大屏代码)
- `Step 3`: Response Node (组合并推流给前端)

## 4. 开发建议
为了最快验证流程，建议您：
1. 先不搞复杂的 Workflow，直接在 `api/chat/route.ts` 里用 Vercel AI SDK 的 `streamText`，写死一段带有 System Prompt 的请求。
2. 将流返回给前端，等我（前端）这边的 Artifacts 解析器跑通。
3. 跑通后再逐步把后端的逻辑迁移到强大的 Mastra 框架中进行重构。
