import { describe, expect, it } from "vitest";

import { readJsonRequest } from "./request";

describe("readJsonRequest", () => {
  it("parses valid JSON within the byte limit", async () => {
    const request = new Request("https://example.test/api", {
      body: JSON.stringify({ ok: true }),
      method: "POST",
    });

    await expect(readJsonRequest(request, { maxBytes: 1024 })).resolves.toEqual({ ok: true });
  });

  it("rejects invalid JSON", async () => {
    const request = new Request("https://example.test/api", {
      body: "not-json",
      method: "POST",
    });

    await expect(readJsonRequest(request, { maxBytes: 1024 })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects oversized declared bodies before reading them", async () => {
    const request = new Request("https://example.test/api", {
      body: "{}",
      headers: {
        "content-length": "2048",
      },
      method: "POST",
    });

    await expect(readJsonRequest(request, { maxBytes: 1024 })).rejects.toMatchObject({
      status: 413,
    });
  });
});
