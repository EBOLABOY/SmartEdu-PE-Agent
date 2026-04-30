import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteR2Object,
  getR2ObjectText,
  putR2Object,
  type R2S3RestConfig,
} from "./s3-rest-client";

const CONFIG: R2S3RestConfig = {
  accessKeyId: "test-access-key",
  bucket: "artifact-bucket",
  endpoint: "https://account-id.r2.cloudflarestorage.com",
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
  ok: boolean;
  status?: number;
  statusText?: string;
  text?: string;
}) {
  return {
    ok: input.ok,
    status: input.status ?? (input.ok ? 200 : 500),
    statusText: input.statusText ?? (input.ok ? "OK" : "Error"),
    text: vi.fn(async () => input.text ?? ""),
  } as unknown as Response;
}

describe("R2 S3 REST client", () => {
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
    await putR2Object({
      body: Buffer.from("hello"),
      config: CONFIG,
      contentType: "text/html;charset=utf-8",
      key: "projects/p1/屏幕.html",
    });

    const { init, url } = getFetchCall();
    const headers = init.headers as Headers;

    expect(url.toString()).toBe(
      "https://account-id.r2.cloudflarestorage.com/artifact-bucket/projects/p1/%E5%B1%8F%E5%B9%95.html",
    );
    expect(init.method).toBe("PUT");
    expect(init.body).toEqual(new Uint8Array(Buffer.from("hello")));
    expect(headers.get("content-type")).toBe("text/html;charset=utf-8");
    expect(headers.get("x-amz-content-sha256")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(headers.get("x-amz-date")).toBe("20260430T090000Z");
    expect(headers.get("authorization")).toContain(
      "Credential=test-access-key/20260430/auto/s3/aws4_request",
    );
    expect(headers.get("authorization")).toContain(
      "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date",
    );
    expect(headers.get("authorization")).toMatch(/Signature=[a-f0-9]{64}$/);
  });

  it("signs GET requests and returns object text", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createResponse({ ok: true, text: "<html></html>" }));

    const text = await getR2ObjectText({
      config: CONFIG,
      key: "projects/p1/screen.html",
    });

    const { init, url } = getFetchCall();
    const headers = init.headers as Headers;

    expect(text).toBe("<html></html>");
    expect(url.toString()).toBe(
      "https://account-id.r2.cloudflarestorage.com/artifact-bucket/projects/p1/screen.html",
    );
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(headers.get("authorization")).toContain(
      "SignedHeaders=host;x-amz-content-sha256;x-amz-date",
    );
  });

  it("signs DELETE requests without sending a body", async () => {
    await deleteR2Object({
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

  it("throws a useful error when R2 rejects the request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: "<Error>SignatureDoesNotMatch</Error>",
      }),
    );

    await expect(
      getR2ObjectText({
        config: CONFIG,
        key: "projects/p1/private.html",
      }),
    ).rejects.toThrow(
      "R2 GET projects/p1/private.html failed: 403 Forbidden <Error>SignatureDoesNotMatch</Error>",
    );
  });
});
