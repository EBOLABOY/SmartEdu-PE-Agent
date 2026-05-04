import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SmartEduUIMessage } from "@/lib/lesson/authoring-contract";

import {
  buildConversationMessagesKey,
  listConversationMessagesFromS3,
  saveConversationMessagesToS3,
} from "./conversation-message-manifest";

const {
  getS3ObjectStorageConfigMock,
  getS3ObjectTextMock,
  putS3ObjectMock,
} = vi.hoisted(() => ({
  getS3ObjectStorageConfigMock: vi.fn(),
  getS3ObjectTextMock: vi.fn(),
  putS3ObjectMock: vi.fn(),
}));

vi.mock("@/lib/s3/object-storage-config", () => ({
  getS3ObjectStorageConfig: getS3ObjectStorageConfigMock,
}));

vi.mock("@/lib/s3/s3-rest-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/s3/s3-rest-client")>(
    "@/lib/s3/s3-rest-client",
  );

  return {
    ...actual,
    getS3ObjectText: getS3ObjectTextMock,
    putS3Object: putS3ObjectMock,
  };
});

const CONFIG = {
  accessKeyId: "access-key",
  bucket: "workspace-bucket",
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  secretAccessKey: "secret-key",
};
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const CONVERSATION_ID = "22222222-2222-2222-2222-222222222222";
const USER_RECORD_ID = "33333333-3333-4333-8333-333333333333";

describe("conversation-message-manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getS3ObjectStorageConfigMock.mockReturnValue(CONFIG);
  });

  it("builds stable per-conversation message keys", () => {
    expect(
      buildConversationMessagesKey({
        conversationId: CONVERSATION_ID,
        projectId: PROJECT_ID,
      }),
    ).toBe(`projects/${PROJECT_ID}/conversations/${CONVERSATION_ID}/messages.json`);
  });

  it("saves UI messages to S3 and upserts by UI message id", async () => {
    getS3ObjectTextMock.mockResolvedValueOnce(
      JSON.stringify({
        conversationId: CONVERSATION_ID,
        messages: [
          {
            content: "旧内容",
            createdAt: "2026-05-01T00:00:00.000Z",
            id: USER_RECORD_ID,
            role: "user",
            uiMessage: {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "旧内容" }],
            },
            uiMessageId: "user-1",
          },
        ],
        projectId: PROJECT_ID,
        schemaVersion: 1,
        updatedAt: "2026-05-01T00:00:00.000Z",
      }),
    );

    await saveConversationMessagesToS3({
      conversationId: CONVERSATION_ID,
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "新内容" }],
        } as SmartEduUIMessage,
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "回复内容" }],
        } as SmartEduUIMessage,
      ],
      projectId: PROJECT_ID,
      requestId: "request-1",
    });

    const writtenManifest = JSON.parse(putS3ObjectMock.mock.calls[0][0].body);
    expect(writtenManifest.messages).toHaveLength(2);
    expect(writtenManifest.messages[0]).toMatchObject({
      content: "新内容",
      createdAt: "2026-05-01T00:00:00.000Z",
      id: USER_RECORD_ID,
      requestId: "request-1",
      uiMessageId: "user-1",
    });
    expect(writtenManifest.messages[1]).toMatchObject({
      content: "回复内容",
      uiMessageId: "assistant-1",
    });
    expect(writtenManifest.messages[1].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("lists validated persisted messages from S3", async () => {
    getS3ObjectTextMock.mockResolvedValueOnce(
      JSON.stringify({
        conversationId: CONVERSATION_ID,
        messages: [
          {
            content: "用户消息",
            createdAt: "2026-05-01T00:00:00.000Z",
            id: USER_RECORD_ID,
            role: "user",
            uiMessage: {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "用户消息" }],
            },
            uiMessageId: "user-1",
          },
        ],
        projectId: PROJECT_ID,
        schemaVersion: 1,
        updatedAt: "2026-05-01T00:00:00.000Z",
      }),
    );

    const messages = await listConversationMessagesFromS3({
      conversationId: CONVERSATION_ID,
      projectId: PROJECT_ID,
    });

    expect(messages?.[0]).toMatchObject({
      content: "用户消息",
      id: USER_RECORD_ID,
      role: "user",
      uiMessageId: "user-1",
    });
  });
});
