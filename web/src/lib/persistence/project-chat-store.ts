import { extractArtifactFromMessage, getMessageText } from "@/lib/artifact-protocol";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import type { Json } from "@/lib/supabase/database.types";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

const MAX_CONVERSATION_TITLE_LENGTH = 80;

export type ProjectChatPersistence = {
  saveMessages: (input: {
    projectId: string;
    requestId?: string;
    messages: SmartEduUIMessage[];
  }) => Promise<void>;
};

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function normalizeInlineText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateInlineText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function getPersistedMessageContent(message: SmartEduUIMessage) {
  const plainText = getMessageText(message).trim();

  if (plainText) {
    return plainText;
  }

  const extracted = extractArtifactFromMessage(message);

  if (extracted.lessonContent.trim()) {
    return extracted.lessonContent.trim();
  }

  if (extracted.html.trim()) {
    return "互动大屏已生成，请在右侧工作台查看。";
  }

  return "";
}

export function deriveConversationTitle(messages: SmartEduUIMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");

  if (!firstUserMessage) {
    return undefined;
  }

  const normalizedText = normalizeInlineText(getPersistedMessageContent(firstUserMessage));

  if (!normalizedText) {
    return undefined;
  }

  return truncateInlineText(normalizedText, MAX_CONVERSATION_TITLE_LENGTH);
}

async function resolveConversationId(input: {
  projectId: string;
  supabase: SmartEduSupabaseClient;
  title?: string;
  userId: string;
}) {
  const { data, error } = await input.supabase
    .from("conversations")
    .select("*")
    .eq("project_id", input.projectId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const existingConversation = data?.[0];

  if (existingConversation) {
    const nextTitle = existingConversation.title ?? input.title ?? null;
    const { error: updateError } = await input.supabase
      .from("conversations")
      .update({ title: nextTitle })
      .eq("id", existingConversation.id);

    if (updateError) {
      throw updateError;
    }

    return {
      id: existingConversation.id,
      title: nextTitle,
    };
  }

  const { data: insertedConversation, error: insertError } = await input.supabase
    .from("conversations")
    .insert({
      created_by: input.userId,
      project_id: input.projectId,
      title: input.title ?? null,
    })
    .select("id")
    .single();

  if (insertError) {
    throw insertError;
  }

  return {
    id: insertedConversation.id,
    title: input.title ?? null,
  };
}

export function createProjectChatPersistence(
  supabase: SmartEduSupabaseClient | null,
  userId?: string,
): ProjectChatPersistence | null {
  if (!supabase || !userId) {
    return null;
  }

  return {
    async saveMessages({ projectId, requestId, messages }) {
      if (messages.length === 0) {
        return;
      }

      const conversationTitle = deriveConversationTitle(messages);
      const conversation = await resolveConversationId({
        projectId,
        supabase,
        title: conversationTitle,
        userId,
      });

      const uiMessageIds = messages.map((message) => message.id);
      const { data: existingRows, error: existingRowsError } = await supabase
        .from("messages")
        .select("ui_message_id")
        .eq("project_id", projectId)
        .in("ui_message_id", uiMessageIds);

      if (existingRowsError) {
        throw existingRowsError;
      }

      const existingMessageIds = new Set(
        ((existingRows ?? []) as Array<{ ui_message_id: string }>).map((row) => row.ui_message_id),
      );

      const rows = messages.map((message) => ({
        content: getPersistedMessageContent(message),
        conversation_id: conversation.id,
        created_by: userId,
        is_active: true,
        project_id: projectId,
        request_id: requestId ?? null,
        role: message.role,
        ui_message: toJson(message),
        ui_message_id: message.id,
      }));

      const { error: upsertError } = await supabase.from("messages").upsert(rows, {
        onConflict: "project_id,ui_message_id",
      });

      if (upsertError) {
        throw upsertError;
      }

      if (existingMessageIds.size === messages.length) {
        return;
      }

      const { error: touchConversationError } = await supabase
        .from("conversations")
        .update({ title: conversation.title })
        .eq("id", conversation.id);

      if (touchConversationError) {
        throw touchConversationError;
      }
    },
  };
}
