"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Folder, Plus, Settings, Square } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import SmartEduArtifact from "@/components/ai/SmartEduArtifact";
import {
  extractArtifactFromText,
  getMessageText,
  useArtifactLifecycle,
} from "@/components/ai/artifact-model";
import LandingPage from "@/components/LandingPage";

function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const rawText = getMessageText(message);
  const extracted = extractArtifactFromText(rawText);
  const text = isUser ? rawText : extracted.markdown;

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "rounded-tr-sm bg-blue-600 text-white"
            : "rounded-tl-sm bg-neutral-100 text-neutral-800"
        }`}
      >
        {text || (isUser ? "" : extracted.html ? "HTML Artifact 已生成，请在右侧工作台查看。" : "正在生成...")}
      </div>
    </div>
  );
}

function getLatestLessonMarkdown(messages: UIMessage[]) {
  return [...messages]
    .reverse()
    .map((message) => (message.role === "assistant" ? extractArtifactFromText(getMessageText(message)).markdown : ""))
    .find((content) => content.trim()) ?? "";
}

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [input, setInput] = useState("");
  const [lessonConfirmed, setLessonConfirmed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    experimental_throttle: 50,
  });
  const isLoading = status === "submitted" || status === "streaming";
  const artifactLifecycle = useArtifactLifecycle(messages, status, lessonConfirmed);
  const latestLessonMarkdown = useMemo(() => getLatestLessonMarkdown(messages), [messages]);
  const canGenerateHtml = Boolean(latestLessonMarkdown.trim()) && !artifactLifecycle.html && !isLoading;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const submitPrompt = async (query: string) => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery || isLoading) {
      return;
    }

    setHasStarted(true);
    setLessonConfirmed(false);
    setInput("");
    await sendMessage({ text: normalizedQuery }, { body: { mode: "lesson" } });
  };

  const generateHtmlFromLesson = async () => {
    if (!latestLessonMarkdown.trim() || isLoading) {
      return;
    }

    setLessonConfirmed(true);
    await sendMessage(
      { text: "我已确认教案无误，请基于该教案生成互动大屏 HTML。" },
      { body: { mode: "html", lessonPlan: latestLessonMarkdown } },
    );
  };

  const handleStart = (query: string) => {
    void submitPrompt(query);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitPrompt(input);
  };

  if (!hasStarted) {
    return <LandingPage onStart={handleStart} />;
  }

  return (
    <div className="flex h-screen w-screen min-w-0 overflow-hidden bg-neutral-50 text-neutral-800 font-sans animate-in fade-in duration-500">
      <nav className="z-50 flex w-16 shrink-0 flex-col items-center border-r border-neutral-200 bg-white py-4">
        <button
          className="mb-8 flex size-10 cursor-pointer items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-sm"
          onClick={() => setHasStarted(false)}
          type="button"
        >
          动
        </button>
        <button className="mb-2 flex size-10 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-blue-50 hover:text-blue-600" type="button">
          <Plus aria-hidden size={18} strokeWidth={2} />
        </button>
        <button className="flex size-10 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-blue-50 hover:text-blue-600" type="button">
          <Folder aria-hidden size={18} strokeWidth={2} />
        </button>
        <div className="mt-auto">
          <button className="flex size-10 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-blue-50 hover:text-blue-600" type="button">
            <Settings aria-hidden size={18} strokeWidth={2} />
          </button>
        </div>
      </nav>

      <aside className="z-40 flex h-full w-[340px] shrink-0 flex-col border-r border-neutral-200 bg-white shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 bg-white/80 px-4 backdrop-blur-sm">
          <div>
            <h2 className="font-medium text-neutral-900">创作对话</h2>
            <p className="text-xs text-neutral-500">对话负责意图，Artifact 负责作品。</p>
          </div>
          {isLoading ? <span className="text-xs text-blue-600">AI 生成中</span> : null}
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-500">
              输入一节体育课主题后，AI 会先生成教案；确认后，右侧 Artifact 会生成互动大屏。
            </div>
          ) : (
            messages.map((message) => <ChatMessage key={message.id} message={message} />)
          )}
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              请求失败：{error.message}
            </div>
          ) : null}
          <div ref={scrollRef} />
        </div>

        <div className="border-t border-neutral-100 bg-white p-4">
          <form
            className="relative rounded-xl border border-neutral-200 bg-neutral-50 shadow-inner transition-all focus-within:border-blue-500 focus-within:bg-white"
            onSubmit={handleSubmit}
          >
            <textarea
              className="w-full resize-none border-none bg-transparent p-4 text-sm text-neutral-800 outline-none placeholder-neutral-400 focus:ring-0"
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitPrompt(input);
                }
              }}
              placeholder="继续补充指令，例如：把倒计时改成 8 分钟，并增加分组积分。"
              rows={3}
              value={input}
            />
            <div className="flex items-center justify-end gap-2 px-2 pb-2">
              {isLoading ? (
                <button
                  className="flex h-8 items-center gap-2 rounded-lg border border-neutral-200 px-3 text-xs text-neutral-600 transition-colors hover:bg-neutral-100"
                  onClick={stop}
                  type="button"
                >
                  <Square aria-hidden size={12} />
                  停止
                </button>
              ) : null}
              <button
                className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400"
                disabled={!input.trim() || isLoading}
                type="submit"
              >
                <ArrowUp aria-hidden size={16} strokeWidth={2.5} />
              </button>
            </div>
          </form>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 overflow-hidden">
        <SmartEduArtifact
          canGenerateHtml={canGenerateHtml}
          isLoading={isLoading}
          lifecycle={artifactLifecycle}
          onGenerateHtml={() => {
            void generateHtmlFromLesson();
          }}
        />
      </main>
    </div>
  );
}
