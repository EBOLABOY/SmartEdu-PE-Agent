import {
  rewriteArtifactImageUrlsInHtml,
  type RewriteArtifactImageUrlsResult,
} from "@/lib/artifact-image-html-rewriter";

export type InlineArtifactImagesForBrowserHtmlInput = {
  htmlContent: string;
  signal?: AbortSignal;
};

export async function blobToDataUrl(input: {
  blob: Blob;
  contentType?: string;
}) {
  const bytes = new Uint8Array(await input.blob.arrayBuffer());
  const chunks: string[] = [];
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }

  return `data:${input.contentType || input.blob.type || "application/octet-stream"};base64,${btoa(chunks.join(""))}`;
}

export async function fetchArtifactImageAsDataUrl(
  source: string,
  options?: { signal?: AbortSignal },
) {
  const response = await fetch(source, {
    credentials: "include",
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.startsWith("image/")) {
    throw new Error(`unexpected content-type: ${contentType || "unknown"}`);
  }

  return blobToDataUrl({
    blob: await response.blob(),
    contentType,
  });
}

export async function inlineArtifactImagesForBrowserHtml(
  input: InlineArtifactImagesForBrowserHtmlInput,
): Promise<RewriteArtifactImageUrlsResult> {
  return rewriteArtifactImageUrlsInHtml({
    htmlContent: input.htmlContent,
    resolveReplacementUrl: (source) =>
      fetchArtifactImageAsDataUrl(source, { signal: input.signal }),
  });
}
