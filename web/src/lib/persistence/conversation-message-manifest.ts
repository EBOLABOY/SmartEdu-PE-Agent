import { randomUUID } from "node:crypto";

import { safeValidateUIMessages } from "ai";

import { extractArtifactFromMessage, getMessageText } from "@/lib/artifact-protocol";
import {
  persistedProjectMessageSchema,
  smartEduDataSchemas,
  type PersistedProjectMessage,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
import { getS3ObjectStorageConfig } from "@/lib/s3/object-storage-config";
import {
  getS3ObjectText,
  putS3Object,
  S3ObjectNotFoundError,
} from "@/lib/s3/s3-rest-client";

const CONVERSATION_MESSAGE_MANIFEST_VERSION = 1;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConversationMessageEntry = {
  content: string;
  createdAt: string;
  id: string;
  requestId?: string;
  role: "system" | "user" | "assistant";
  uiMessage: SmartEduUIMessage;
  uiMessageId: string;
};

type ConversationMessageManifest = {
  conversationId: string;
  messages: ConversationMessageEntry[];
  projectId: string;
  schemaVersion: typeof CONVERSATION_MESSAGE_MANIFEST_VERSION;
  updatedAt: string;
};

function getConversationMessageConfig() {
  return getS3ObjectStorageConfig("workspace");
}

export function buildConversationMessagesKey(input: {
  conversationId: string;
  projectId: string;
}) {
  return `projects/${input.projectId}/conversations/${input.conversationId}/messages.json`;
}

function emptyManifest(input: {
  conversationId: string;
  projectId: string;
}): ConversationMessageManifest {
  return {
    conversationId: input.conversationId,
    messages: [],
    projectId: input.projectId,
    schemaVersion: CONVERSATION_MESSAGE_MANIFEST_VERSION,
    updatedAt: new Date().toISOString(),
  };
}

function getPersistedMessageContent(message: SmartEduUIMessage) {
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

function resolvePersistedMessageId(existingId: string | undefined) {
  if (existingId && UUID_PATTERN.test(existingId)) {
    return existingId;
  }

  return randomUUID();
}

async function readConversationMessageManifest(input: {
  conversationId: string;
  projectId: string;
}) {
  const config = getConversationMessageConfig();

  if (!config) {
    return null;
  }

  try {
    const text = await getS3ObjectText({
      config,
      key: buildConversationMessagesKey(input),
    });
    const parsed = JSON.parse(text) as ConversationMessageManifest;

    if (
      parsed.schemaVersion !== CONVERSATION_MESSAGE_MANIFEST_VERSION ||
      parsed.projectId !== input.projectId ||
      parsed.conversationId !== input.conversationId ||
      !Array.isArray(parsed.messages)
    ) {
      return emptyManifest(input);
    }

    return parsed;
  } catch (error) {
    if (error instanceof S3ObjectNotFoundError) {
      return emptyManifest(input);
    }

    throw error;
  }
}

async function writeConversationMessageManifest(manifest: ConversationMessageManifest) {
  const config = getConversationMessageConfig();

  if (!config) {
    throw new Error("S3 workspace storage is not configured.");
  }

  await putS3Object({
    body: JSON.stringify(manifest),
    config,
    contentType: "application/json;charset=utf-8",
    key: buildConversationMessagesKey({
      conversationId: manifest.conversationId,
      projectId: manifest.projectId,
    }),
  });
}

export async function saveConversationMessagesToS3(input: {
  conversationId: string;
  messages: SmartEduUIMessage[];
  projectId: string;
  requestId?: string;
}) {
  const manifest = await readConversationMessageManifest(input);

  if (!manifest) {
    throw new Error("S3 workspace storage is not configured.");
  }

  const messageById = new Map(manifest.messages.map((message) => [message.uiMessageId, message]));
  const now = new Date().toISOString();

  input.messages.forEach((message) => {
    const existingMessage = messageById.get(message.id);

    messageById.set(message.id, {
      content: getPersistedMessageContent(message),
      createdAt: existingMessage?.createdAt ?? now,
      id: resolvePersistedMessageId(existingMessage?.id),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      role: message.role === "system" ? "system" : message.role === "user" ? "user" : "assistant",
      uiMessage: message,
      uiMessageId: message.id,
    });
  });

  manifest.messages = Array.from(messageById.values());
  manifest.updatedAt = now;
  await writeConversationMessageManifest(manifest);
}

export async function listConversationMessagesFromS3(input: {
  conversationId: string;
  limit?: number;
  projectId: string;
}): Promise<PersistedProjectMessage[] | null> {
  const manifest = await readConversationMessageManifest(input);

  if (!manifest) {
    return null;
  }

  const messages = input.limit
    ? manifest.messages.slice(Math.max(0, manifest.messages.length - input.limit))
    : manifest.messages;

  const parsedMessages = await Promise.all(
    messages.map(async (message) => {
      const parsedUiMessage = await safeValidateUIMessages<SmartEduUIMessage>({
        dataSchemas: smartEduDataSchemas,
        messages: [message.uiMessage],
      });

      if (!parsedUiMessage.success) {
        return null;
      }

      return persistedProjectMessageSchema.parse({
        content: message.content,
        createdAt: message.createdAt,
        id: message.id,
        role: message.role,
        uiMessage: parsedUiMessage.data[0],
        uiMessageId: message.uiMessageId,
      });
    }),
  );

  return parsedMessages.filter((message): message is PersistedProjectMessage => message !== null);
}
