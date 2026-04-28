export const CHAT_ATTACHMENT_MAX_FILES = 2;
export const CHAT_ATTACHMENT_MAX_FILE_BYTES = 512 * 1024;

export type ChatAttachmentError = {
  code: "max_files" | "max_file_size" | "accept";
  message: string;
};

export function formatByteSize(bytes: number) {
  return `${Math.round(bytes / 1024)} KiB`;
}

export function getAttachmentErrorMessage(error: ChatAttachmentError) {
  switch (error.code) {
    case "max_files":
      return `最多只能附加 ${CHAT_ATTACHMENT_MAX_FILES} 个文件。`;
    case "max_file_size":
      return `单个文件不能超过 ${formatByteSize(CHAT_ATTACHMENT_MAX_FILE_BYTES)}。`;
    case "accept":
      return "当前文件类型不支持。";
  }
}
