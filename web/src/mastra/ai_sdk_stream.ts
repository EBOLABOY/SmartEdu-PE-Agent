import type { MastraModelOutput } from "@mastra/core/stream";
import { toAISdkStream } from "@mastra/ai-sdk";
import type { UIMessageChunk } from "ai";

type MastraUiMessageStreamOptions = {
  sendFinish?: boolean;
  sendStart?: boolean;
};

const AI_SDK_UI_STREAM_VERSION = "v6" as const;

export function createMastraAgentUiMessageStream<TOutput>(
  stream: MastraModelOutput<TOutput>,
  options: MastraUiMessageStreamOptions = {},
) {
  return toAISdkStream(stream, {
    from: "agent",
    version: AI_SDK_UI_STREAM_VERSION,
    sendStart: options.sendStart,
    sendFinish: options.sendFinish,
  }) as ReadableStream<UIMessageChunk>;
}
