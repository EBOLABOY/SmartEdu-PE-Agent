export class JsonRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "JsonRequestError";
  }
}

export const PROJECT_CREATE_REQUEST_MAX_BYTES = 16 * 1024;
export const SMALL_JSON_REQUEST_MAX_BYTES = 64 * 1024;
export const ARTIFACT_JSON_REQUEST_MAX_BYTES = 1024 * 1024;
export const CHAT_REQUEST_MAX_BYTES = 2 * 1024 * 1024;
export const EXPORT_HTML_REQUEST_MAX_BYTES = 6 * 1024 * 1024;

function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export async function readJsonRequest(
  request: Request,
  {
    maxBytes,
  }: {
    maxBytes: number;
  },
) {
  const contentLength = request.headers.get("content-length");
  const declaredBytes = contentLength ? Number(contentLength) : Number.NaN;

  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
    throw new JsonRequestError("请求体过大。", 413);
  }

  const text = await request.text();

  if (getUtf8ByteLength(text) > maxBytes) {
    throw new JsonRequestError("请求体过大。", 413);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new JsonRequestError("请求体必须是 JSON。", 400);
  }
}

export function jsonRequestErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof JsonRequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  return Response.json({ error: fallbackMessage }, { status: 400 });
}
