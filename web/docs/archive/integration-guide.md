# “跃课” 全链路联调落地实战手册

这是一份为您量身定制的、极其详细的**实战编码手册**。您可以完全参照以下四个阶段的步骤，亲手将当前的静态极简 UI 与您已建好的大模型 API 串联起来，达成 MVP 的完全可用状态！

---

## 阶段一：前端接管流式大动脉 (`useChat`)
目前 `page.tsx` 里使用的是 Mock 状态数据。您需要引入 Vercel AI SDK 的 `useChat`，将左侧的聊天框变成真实的流引擎。

### 操作步骤：
1. **安装依赖** (如果尚未安装)：`npm install @ai-sdk/react`
2. **替换 State 为 useChat 钩子**：
   在 `src/app/page.tsx` 中，找到 `const [chatInput, setChatInput] = useState("");` 的位置，加入以下钩子：
   ```tsx
   import { useChat } from "@ai-sdk/react";

   // 内部
   const { messages, input, handleInputChange, handleSubmit, append, isLoading } = useChat({
     api: "/api/chat", // 自动对准您后端的 route.ts
     initialMessages: [],
   });
   ```
3. **绑定 LandingPage 首页逻辑**：
   在首页输入第一句话后，无需点击内部的发送按钮，而是直接触发 `append` 函数。
   ```tsx
   const handleStart = (query: string) => {
     setHasStarted(true);
     append({ role: "user", content: query }); // 直接向 AI 发起请求并进入流式状态
   };
   ```
4. **绑定侧边栏对话历史与输入框**：
   - 将底部的 `<textarea>` 替换为：
     ```tsx
     <form onSubmit={handleSubmit} className="...">
        <textarea value={input} onChange={handleInputChange} ... />
        <button type="submit">发送</button>
     </form>
     ```
   - 将假数据历史替换为对 `messages` 数组的遍历渲染（根据 `role === 'user'` 来决定居左还是居右）。

---

## 阶段二：Artifact 智能正则剥离（核心护城河逻辑）
大模型在流式输出时，会把教案文本和 HTML 代码混在一起吐出来。如果直接把 `messages` 给用户看，就会看到一大堆乱码一样的代码。前端必须“边接流，边切分”。

### 操作步骤：
在 `page.tsx` 或者专门写一个 Hook，从最后一条 Assistant 消息中实时提取内容。

```tsx
function useArtifactExtractor(messages: any[]) {
  const lastMessage = messages.findLast((m) => m.role === "assistant");
  const content = lastMessage?.content || "";

  // 1. 正则：提取包裹在 <artifact type="html"> 和 </artifact> 之间的内容
  const htmlMatch = content.match(/<artifact\s+type="html">([\s\S]*?)<\/artifact>/i);
  const extractedHtml = htmlMatch ? htmlMatch[1] : "";

  // 2. 将 artifact 部分完全挖掉，剩下的文本就是纯净的 Markdown 教案
  const extractedMarkdown = content.replace(/<artifact[\s\S]*?<\/artifact>/i, "").trim();

  return { extractedMarkdown, extractedHtml };
}
```

紧接着，在 `page.tsx` 底部，将提取出的数据**实时**喂给右侧的沙箱调度器：
```tsx
const { extractedMarkdown, extractedHtml } = useArtifactExtractor(messages);

// 此时只要 AI 还在打字，如果吐出了 HTML，沙箱就会自动热更新！
<ArtifactContent 
  markdownContent={extractedMarkdown || mockMarkdown} 
  htmlContent={extractedHtml || MOCK_HTML} 
/>
```

---

## 阶段三：强化后端 Mastra 规则 (System Prompt)
您的前端能否完美劈开教案和代码，100% 取决于大模型是否乖乖遵守了标签规则。

### 操作步骤：
打开您后端的 `src/mastra/agents/pe_teacher.ts`，在 `buildPeTeacherSystemPrompt` 的核心 Prompt 中加入极其强硬的格式约束：

```text
你是一个专业的体育教育大屏设计师与教案规划专家。

【核心任务】
当用户提出需求时，你必须且只能按照以下固定格式回答：

1. 先输出结构化的 Markdown 教案（包含教学目标、器材准备、环节流程）。
2. 教案完毕后，必须生成用于电视互动大屏的 HTML 代码。这段代码必须用且只能用 <artifact type="html"> 开始，用 </artifact> 结束。
3. HTML 代码必须是独立可运行的完整单文件，包含 <html><head><body> 等，默认引入 Tailwind CDN。
4. HTML 内部可以编写 JS 来实现倒计时计时器或炫酷特效。

【禁止事项】
- 绝不要在 <artifact> 标签外解释你的代码！
- 绝不能使用常规的 ```html 这种 markdown 代码块，只能用 <artifact> 包裹！
```

---

## 阶段四：处理体验闭环 (达到完全可用级)
完成前三步，MVP 就彻底活了！为了达到商用可用性，还需要注意以下三个细节：

1. **加载感知**：利用 `useChat` 传出的 `isLoading`，当 AI 在思考时，在右侧沙箱的头部加个 Loading Spinner 或平滑的骨架屏。
2. **自动滚底**：给聊天历史区套一个 `useRef`，用 `useEffect` 监听 `messages` 的变化，让屏幕自动向下滚动，不要让打字机的文字掉出视线。
3. **Iframe 自适应缩放**：由于电视大屏（通常 1920x1080）塞进右侧的狭小区域（可能只有 800px 宽）会变形。我们需要在 `IframeSandbox.tsx` 内部，通过 `ResizeObserver` 或者简单的 CSS `transform: scale()` 让 iframe 里面的内容等比例缩小适应容器。

