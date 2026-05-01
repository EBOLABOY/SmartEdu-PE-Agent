import { createHash, createHmac } from "node:crypto";

export type S3RestConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  region: string;
  secretAccessKey: string;
  userAgent?: string;
};

export class S3ObjectError extends Error {
  constructor(
    message: string,
    public readonly details: {
      bucket: string;
      code?: string;
      key: string;
      method: string;
      responseText: string;
      status: number;
      statusText: string;
    },
  ) {
    super(message);
    this.name = "S3ObjectError";
  }
}

export class S3ObjectNotFoundError extends S3ObjectError {
  constructor(
    message: string,
    details: ConstructorParameters<typeof S3ObjectError>[1],
  ) {
    super(message, details);
    this.name = "S3ObjectNotFoundError";
  }
}

type S3RequestInput = {
  body?: Buffer | string;
  contentDisposition?: string;
  contentType?: string;
  config: S3RestConfig;
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

function extractS3ErrorCode(responseText: string) {
  return responseText.match(/<Code>([^<]+)<\/Code>/)?.[1];
}

function buildObjectUrl(config: S3RestConfig, key: string) {
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

function getSigningKey(input: {
  dateStamp: string;
  region: string;
  secretAccessKey: string;
}) {
  const dateKey = hmac(`AWS4${input.secretAccessKey}`, input.dateStamp);
  const regionKey = hmac(dateKey, input.region);
  const serviceKey = hmac(regionKey, "s3");

  return hmac(serviceKey, "aws4_request");
}

function buildSignedHeaders(input: S3RequestInput) {
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

  if (input.contentDisposition) {
    headers.set("content-disposition", input.contentDisposition);
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
  const credentialScope = `${dateStamp}/${input.config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(
    getSigningKey({
      dateStamp,
      region: input.config.region,
      secretAccessKey: input.config.secretAccessKey,
    }),
    stringToSign,
  );

  headers.set(
    "authorization",
    [
      `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${credentialScope}`,
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

async function requestS3Object(input: S3RequestInput) {
  const { body, headers, url } = buildSignedHeaders(input);
  const requestBody =
    input.method !== "PUT"
      ? undefined
      : Buffer.isBuffer(body)
        ? new Uint8Array(body)
        : body;

  if (input.config.userAgent) {
    // Keep User-Agent out of SignedHeaders so runtime-level UA normalization cannot invalidate SigV4.
    headers.set("user-agent", input.config.userAgent);
  }

  const response = await fetch(url, {
    body: requestBody,
    headers,
    method: input.method,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const code = extractS3ErrorCode(errorText);
    const message = `S3 ${input.method} ${input.key} failed: ${response.status} ${response.statusText}${
      errorText ? ` ${errorText.slice(0, 500)}` : ""
    }`;
    const details = {
      bucket: input.config.bucket,
      ...(code ? { code } : {}),
      key: input.key,
      method: input.method,
      responseText: errorText,
      status: response.status,
      statusText: response.statusText,
    };

    if (response.status === 404 || code === "NoSuchKey") {
      throw new S3ObjectNotFoundError(message, details);
    }

    throw new S3ObjectError(message, details);
  }

  return response;
}

export async function putS3Object(input: {
  body: Buffer | string;
  config: S3RestConfig;
  contentDisposition?: string;
  contentType: string;
  key: string;
}) {
  await requestS3Object({
    body: input.body,
    config: input.config,
    contentDisposition: input.contentDisposition,
    contentType: input.contentType,
    key: input.key,
    method: "PUT",
  });
}

export async function deleteS3Object(input: {
  config: S3RestConfig;
  key: string;
}) {
  await requestS3Object({
    config: input.config,
    key: input.key,
    method: "DELETE",
  });
}

export async function getS3ObjectText(input: {
  config: S3RestConfig;
  key: string;
}) {
  const response = await requestS3Object({
    config: input.config,
    key: input.key,
    method: "GET",
  });

  return response.text();
}
