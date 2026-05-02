import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteS3Object,
  getS3Object,
  getS3ObjectText,
  putS3Object,
  S3ObjectError,
  S3ObjectNotFoundError,
  type S3RestConfig,
} from "./s3-rest-client";

const CONFIG: S3RestConfig = {
  accessKeyId: "test-access-key",
  bucket: "artifact-bucket",
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  secretAccessKey: "test-secret-key",
};

function getFetchCall(index = 0) {
  const fetchMock = vi.mocked(fetch);
  const call = fetchMock.mock.calls[index];

  if (!call) {
    throw new Error(`missing fetch call ${index}`);
  }

  return {
    init: call[1] as RequestInit,
    url: call[0] as URL,
  };
}

function createResponse(input: {
  body?: Buffer | string;
  headers?: Record<string, string>;
  ok: boolean;
  status?: number;
  statusText?: string;
  text?: string;
}) {
  return {
    ok: input.ok,
    status: input.status ?? (input.ok ? 200 : 500),
    statusText: input.statusText ?? (input.ok ? "OK" : "Error"),
    arrayBuffer: vi.fn(async () => {
      const body = input.body ?? input.text ?? "";
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }),
    headers: new Headers(input.headers),
    text: vi.fn(async () => input.text ?? ""),
  } as unknown as Response;
}

describe("S3 REST client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T09:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn(async () => createResponse({ ok: true, text: "stored" })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("signs PUT requests with SigV4 headers and uploads the object body", async () => {
    await putS3Object({
      body: Buffer.from("hello"),
      config: CONFIG,
      contentType: "text/html;charset=utf-8",
      key: "projects/p1/屏幕.html",
    });

    const { init, url } = getFetchCall();
    const headers = init.headers as Headers;

    expect(url.toString()).toBe(
      "https://s3.example.com/artifact-bucket/projects/p1/%E5%B1%8F%E5%B9%95.html",
    );
    expect(init.method).toBe("PUT");
    expect(init.body).toEqual(new Uint8Array(Buffer.from("hello")));
    expect(headers.get("content-type")).toBe("text/html;charset=utf-8");
    expect(headers.get("x-amz-content-sha256")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(headers.get("x-amz-date")).toBe("20260430T090000Z");
    expect(headers.get("authorization")).toContain(
      "Credential=test-access-key/20260430/us-east-1/s3/aws4_request",
    );
    expect(headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=/,
    );
    expect(headers.get("authorization")).toContain(
      "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date",
    );
    expect(headers.get("authorization")).toMatch(/Signature=[a-f0-9]{64}$/);
  });

  it("signs GET requests and returns object text", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createResponse({ ok: true, text: "<html></html>" }));

    const text = await getS3ObjectText({
      config: CONFIG,
      key: "projects/p1/screen.html",
    });

    const { init, url } = getFetchCall();
    const headers = init.headers as Headers;

    expect(text).toBe("<html></html>");
    expect(url.toString()).toBe(
      "https://s3.example.com/artifact-bucket/projects/p1/screen.html",
    );
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(headers.get("authorization")).toContain(
      "SignedHeaders=host;x-amz-content-sha256;x-amz-date",
    );
  });

  it("signs GET requests and returns binary object metadata", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      createResponse({
        body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        headers: {
          "content-length": "4",
          "content-type": "image/png",
        },
        ok: true,
      }),
    );

    const object = await getS3Object({
      config: CONFIG,
      key: "projects/p1/lesson-diagrams/request-1/01-image.png",
    });

    const { init, url } = getFetchCall();
    const headers = init.headers as Headers;

    expect(object.body).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(object.contentLength).toBe("4");
    expect(object.contentType).toBe("image/png");
    expect(url.toString()).toBe(
      "https://s3.example.com/artifact-bucket/projects/p1/lesson-diagrams/request-1/01-image.png",
    );
    expect(init.method).toBe("GET");
    expect(headers.get("authorization")).toContain(
      "SignedHeaders=host;x-amz-content-sha256;x-amz-date",
    );
  });

  it("sends the configured User-Agent without adding it to signed headers", async () => {
    await putS3Object({
      body: "hello",
      config: {
        ...CONFIG,
        userAgent: "S3 Browser",
      },
      contentType: "text/plain;charset=utf-8",
      key: "projects/p1/agent.txt",
    });

    const { init } = getFetchCall();
    const headers = init.headers as Headers;

    expect(headers.get("user-agent")).toBe("S3 Browser");
    expect(headers.get("authorization")).not.toContain("user-agent");
  });

  it("signs PUT object response metadata headers", async () => {
    await putS3Object({
      body: "hello",
      config: CONFIG,
      contentDisposition: "attachment; filename=\"screen.html\"",
      contentType: "text/html;charset=utf-8",
      key: "projects/p1/screen.html",
    });

    const { init } = getFetchCall();
    const headers = init.headers as Headers;

    expect(headers.get("content-disposition")).toBe("attachment; filename=\"screen.html\"");
    expect(headers.get("authorization")).toContain(
      "SignedHeaders=content-disposition;content-type;host;x-amz-content-sha256;x-amz-date",
    );
  });

  it("signs DELETE requests without sending a body", async () => {
    await deleteS3Object({
      config: CONFIG,
      key: "projects/p1/screen.html",
    });

    const { init } = getFetchCall();
    const headers = init.headers as Headers;

    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect(headers.get("authorization")).toContain(
      "SignedHeaders=host;x-amz-content-sha256;x-amz-date",
    );
  });

  it("throws a useful error when S3 rejects the request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: "<Error>SignatureDoesNotMatch</Error>",
      }),
    );

    const promise = getS3ObjectText({
      config: CONFIG,
      key: "projects/p1/private.html",
    });

    await expect(promise).rejects.toThrow(
      "S3 GET projects/p1/private.html failed: 403 Forbidden <Error>SignatureDoesNotMatch</Error>",
    );
    await expect(promise).rejects.toBeInstanceOf(S3ObjectError);
  });

  it("throws a typed not found error for missing S3 objects", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: '<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>',
      }),
    );

    const promise = getS3ObjectText({
      config: CONFIG,
      key: "projects/p1/missing.json",
    });

    await expect(promise).rejects.toMatchObject({
      details: {
        bucket: "artifact-bucket",
        code: "NoSuchKey",
        key: "projects/p1/missing.json",
        method: "GET",
        status: 404,
      },
    });
    await expect(promise).rejects.toBeInstanceOf(S3ObjectNotFoundError);
  });
});
