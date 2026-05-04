"use client";

import { SmartEduChatMessage } from "@/components/ai/SmartEduChatMessage";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
  getAttachmentErrorMessage,
} from "@/components/workspace/chat-attachment-limits";
import { StateNotice } from "@/components/ui/state-surface";
import type { SmartEduUIMessage, ArtifactView } from "@/lib/lesson/authoring-contract";
import { motion } from "motion/react";
import { toast } from "sonner";

type ChatStatus = "submitted" | "streaming" | "ready" | "error";

interface ChatPanelProps {
  activeArtifactView?: ArtifactView;
  error: Error | undefined;
  isLoading: boolean;
  messages: SmartEduUIMessage[];
  onSubmitPrompt: (message: PromptInputMessage) => void;
  projectTitle?: string;
  status: ChatStatus;
  stop: () => void;
}

function buildInputPlaceholder(input: {
  activeArtifactView?: ArtifactView;
}) {
  if (input.activeArtifactView === "canvas") {
    return "描述要修改的大屏文案、布局、图示、配色或课堂节奏，系统会重新生成完整 HTML 文件...";
  }

  return "描述要生成或修改的课时计划、大屏、课堂组织、评价与安全要求...";
}

export default function ChatPanel({
  activeArtifactView,
  error,
  isLoading,
  messages,
  onSubmitPrompt,
  projectTitle,
  status,
  stop,
}: ChatPanelProps) {
  return (
    <aside className="z-40 flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-border/80 bg-card/95">
      <div className="flex min-h-20 shrink-0 items-center justify-between border-b border-border/70 bg-card px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-brand ring-4 ring-brand/10" />
            <h2 className="truncate font-semibold text-foreground text-sm">
              {projectTitle ?? "课堂创作对话"}
            </h2>
          </div>
          <p className="mt-1 truncate text-muted-foreground text-xs">
            {projectTitle
              ? "项目历史已恢复，可继续修改课时计划、互动大屏或课堂节奏。"
              : "输入课堂目标，系统会生成结构化课时计划并同步右侧工作台。"}
          </p>
          <div className="mt-2 hidden gap-1.5 text-[10px] text-muted-foreground 2xl:flex">
            <span className="rounded-full border border-border/70 bg-background/55 px-2 py-0.5">课时计划</span>
            <span className="rounded-full border border-border/70 bg-background/55 px-2 py-0.5">安全</span>
            <span className="rounded-full border border-border/70 bg-background/55 px-2 py-0.5">大屏</span>
          </div>
        </div>
        {isLoading ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand/25 bg-brand/10 px-2.5 py-1 font-medium text-brand text-xs">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" />
            生成中
          </span>
        ) : null}
      </div>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="min-h-0 gap-4 px-4 py-5">
          {messages.length === 0 ? (
            <StateNotice
              className="min-h-[320px] rounded-3xl bg-background/55"
              description="先描述年级、项目、课时和目标；生成后可继续要求局部修改或生成互动大屏。"
              layout="center"
              tone="brand"
              title={projectTitle ? "当前项目暂无会话消息" : "输入一节体育课主题"}
            />
          ) : (
            messages.map((message) => <SmartEduChatMessage key={message.id} message={message} />)
          )}
          {error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm">
              请求失败：{error.message}
            </div>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton className="bottom-5 border-border/80 bg-card/95 shadow-lg" />
      </Conversation>

      <div className="shrink-0 border-t border-border/80 bg-card p-4">
        <PromptInputProvider>
          <motion.div layoutId="prompt-input-container">
            <PromptInput
              className="relative rounded-2xl border border-border/80 bg-background/75 shadow-xs transition-colors duration-200 focus-within:border-brand/50 focus-within:bg-card"
              maxFiles={CHAT_ATTACHMENT_MAX_FILES}
              maxFileSize={CHAT_ATTACHMENT_MAX_FILE_BYTES}
              onError={(attachmentError) => {
                toast.warning("附件未添加", {
                  description: getAttachmentErrorMessage(attachmentError),
                });
              }}
              onSubmit={(message) => {
                onSubmitPrompt(message);
              }}
            >
              <PromptInputBody>
                <PromptInputTextarea
                  className="min-h-20 max-h-40 overflow-y-auto px-4 pt-4 pb-1 text-foreground text-[15px] leading-relaxed placeholder:text-muted-foreground/50"
                  disabled={isLoading}
                  placeholder={buildInputPlaceholder({
                    activeArtifactView,
                  })}
                />
              </PromptInputBody>
              <PromptInputFooter className="px-3 pt-1 pb-3">
                <PromptInputTools className="min-w-0 overflow-hidden">
                  <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-1 font-medium text-[11px] text-brand">
                    课时计划 / 大屏 / 复盘
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    回车发送，Shift + 回车换行
                  </span>
                </PromptInputTools>
                <PromptInputSubmit
                  className="size-9 shrink-0 rounded-xl bg-brand text-brand-foreground shadow-sm transition-all hover:bg-brand/90 disabled:bg-muted/50 disabled:text-muted-foreground"
                  onStop={stop}
                  size="icon-sm"
                  status={status}
                />
              </PromptInputFooter>
            </PromptInput>
          </motion.div>
        </PromptInputProvider>
      </div>
    </aside>
  );
}
