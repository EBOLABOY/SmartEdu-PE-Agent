import { createHash, createHmac } from "node:crypto";

export type R2S3RestConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  secretAccessKey: string;
};

type R2RequestInput = {
  body?: Buffer | string;
  contentType?: string;
  config: R2S3RestConfig;
  key: string;
  method: "DELETE" | "GET" | "PUT";
};

function hashHex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function buildObjectUrl(config: R2S3RestConfig, key: string) {
  const endpoint = config.endpoint.replace(/\/+$/, "");
  const objectPath = key.split("/").map(encodePathSegment).join("/");

  return new URL(`${endpoint}/${encodePathSegment(config.bucket)}/${objectPath}`);
}

function getAmzDates(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");

  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function getSigningKey(secretAccessKey: string, dateStamp: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");

  return hmac(serviceKey, "aws4_request");
}

function buildSignedHeaders(input: R2RequestInput) {
  const url = buildObjectUrl(input.config, input.key);
  const body = input.body ?? "";
  const payloadHash = hashHex(body);
  const { amzDate, dateStamp } = getAmzDates();
  const headers = new Headers();

  headers.set("host", url.host);
  headers.set("x-amz-content-sha256", payloadHash);
  headers.set("x-amz-date", amzDate);

  if (input.contentType) {
    headers.set("content-type", input.contentType);
  }

  const canonicalHeaders = [...headers.entries()]
    .map(([key, value]) => [key.toLowerCase(), value.trim()] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const signedHeaders = canonicalHeaders.map(([key]) => key).join(";");
  const canonicalRequest = [
    input.method,
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders.map(([key, value]) => `${key}:${value}\n`).join(""),
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(
    getSigningKey(input.config.secretAccessKey, dateStamp),
    stringToSign,
  );

  headers.set(
    "authorization",
    [
      "AWS4-HMAC-SHA256",
      `Credential=${input.config.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(", "),
  );
  headers.delete("host");

  return {
    body,
    headers,
    url,
  };
}

async function requestR2Object(input: R2RequestInput) {
  const { body, headers, url } = buildSignedHeaders(input);
  const requestBody =
    input.method !== "PUT"
      ? undefined
      : Buffer.isBuffer(body)
        ? new Uint8Array(body)
        : body;
  const response = await fetch(url, {
    body: requestBody,
    headers,
    method: input.method,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");

    throw new Error(
      `R2 ${input.method} ${input.key} failed: ${response.status} ${response.statusText}${
        errorText ? ` ${errorText.slice(0, 500)}` : ""
      }`,
    );
  }

  return response;
}

export async function putR2Object(input: {
  body: Buffer | string;
  config: R2S3RestConfig;
  contentType: string;
  key: string;
}) {
  await requestR2Object({
    body: input.body,
    config: input.config,
    contentType: input.contentType,
    key: input.key,
    method: "PUT",
  });
}

export async function deleteR2Object(input: {
  config: R2S3RestConfig;
  key: string;
}) {
  await requestR2Object({
    config: input.config,
    key: input.key,
    method: "DELETE",
  });
}

export async function getR2ObjectText(input: {
  config: R2S3RestConfig;
  key: string;
}) {
  const response = await requestR2Object({
    config: input.config,
    key: input.key,
    method: "GET",
  });

  return response.text();
}
