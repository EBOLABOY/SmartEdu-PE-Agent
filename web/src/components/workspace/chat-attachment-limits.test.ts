import { describe, expect, it } from "vitest";

import {
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
  formatByteSize,
  getAttachmentErrorMessage,
} from "./chat-attachment-limits";

describe("chat attachment limits", () => {
  it("keeps raw file limits safely below the 2 MiB chat request cap after base64 expansion", () => {
    const estimatedDataUrlBytes = Math.ceil(
      CHAT_ATTACHMENT_MAX_FILE_BYTES * CHAT_ATTACHMENT_MAX_FILES * 1.37,
    );

    expect(estimatedDataUrlBytes).toBeLessThan(2 * 1024 * 1024);
  });

  it("formats user-facing limit messages", () => {
    expect(formatByteSize(CHAT_ATTACHMENT_MAX_FILE_BYTES)).toBe("512 KiB");
    expect(getAttachmentErrorMessage({ code: "max_files", message: "" })).toContain("2");
    expect(getAttachmentErrorMessage({ code: "max_file_size", message: "" })).toContain("512 KiB");
    expect(getAttachmentErrorMessage({ code: "accept", message: "" })).toBe("当前文件类型不支持。");
  });
});
