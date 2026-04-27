import { safeValidateUIMessages } from "ai";

import {
  persistedConversationSchema,
  persistedProjectMessageSchema,
  persistedProjectSummarySchema,
  smartEduDataSchemas,
  type PersistedConversation,
  type PersistedProjectMessage,
  type PersistedProjectSummary,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
import { toIsoDateTime } from "@/lib/date-time";
import type { Database } from "@/lib/supabase/database.types";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

function toPersistedProjectSummary(row: ProjectRow): PersistedProjectSummary {
  return persistedProjectSummarySchema.parse({
    id: row.id,
    title: row.title,
    market: row.market,
    createdAt: toIsoDateTime(row.created_at, "projects.created_at"),
    updatedAt: toIsoDateTime(row.updated_at, "projects.updated_at"),
    ...(row.description ? { description: row.description } : {}),
  });
}

function toPersistedConversation(row: ConversationRow): PersistedConversation {
  return persistedConversationSchema.parse({
    id: row.id,
    createdAt: toIsoDateTime(row.created_at, "conversations.created_at"),
    updatedAt: toIsoDateTime(row.updated_at, "conversations.updated_at"),
    ...(row.title ? { title: row.title } : {}),
  });
}

async function toPersistedProjectMessage(
  row: MessageRow,
): Promise<PersistedProjectMessage | null> {
  const parsedMessage = await safeValidateUIMessages<SmartEduUIMessage>({
    messages: [row.ui_message],
    dataSchemas: smartEduDataSchemas,
  });

  if (!parsedMessage.success) {
    return null;
  }

  return persistedProjectMessageSchema.parse({
    id: row.id,
    uiMessageId: row.ui_message_id,
    role: row.role,
    content: row.content,
    createdAt: toIsoDateTime(row.created_at, "messages.created_at"),
    uiMessage: parsedMessage.data[0],
  });
}

export async function listProjectsForUser(supabase: SmartEduSupabaseClient) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as ProjectRow[]).map((row) => toPersistedProjectSummary(row));
}

export async function getProjectWorkspaceHistory(
  supabase: SmartEduSupabaseClient,
  projectId: string,
) {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projectError) {
    throw projectError;
  }

  const persistedProject = toPersistedProjectSummary(project as ProjectRow);
  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (conversationsError) {
    throw conversationsError;
  }

  const latestConversation = (conversations as ConversationRow[] | null | undefined)?.[0];

  if (!latestConversation) {
    return {
      project: persistedProject,
      conversation: null,
      messages: [] as PersistedProjectMessage[],
    };
  }

  const { data: messageRows, error: messageRowsError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", latestConversation.id)
    .order("created_at", { ascending: true });

  if (messageRowsError) {
    throw messageRowsError;
  }

  const messages = (
    await Promise.all(((messageRows ?? []) as MessageRow[]).map((row) => toPersistedProjectMessage(row)))
  ).filter((message): message is PersistedProjectMessage => message !== null);

  return {
    project: persistedProject,
    conversation: toPersistedConversation(latestConversation),
    messages,
  };
}

export {
  toPersistedConversation,
  toPersistedProjectMessage,
  toPersistedProjectSummary,
};
