#!/usr/bin/env node

import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const DEFAULT_LIMIT = 500;
const EXTERNAL_PROVIDERS = new Set(["s3-compatible", "cloudflare-r2"]);

function parseArgs(argv) {
  const args = {
    json: false,
    limit: DEFAULT_LIMIT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--json") {
      args.json = true;
      continue;
    }

    if (arg === "--limit") {
      const rawValue = argv[index + 1];
      index += 1;
      const limit = Number.parseInt(rawValue ?? "", 10);

      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error("--limit must be a positive integer");
      }

      args.limit = limit;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function loadEnv(path = ".env") {
  const env = {};

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const index = line.indexOf("=");

    if (index < 0) {
      continue;
    }

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function requireEnv(env, name) {
  const value = env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function hashHex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key, value) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function buildObjectUrl(config, bucket, key) {
  const endpoint = config.endpoint.replace(/\/+$/, "");
  const objectPath = key.split("/").map(encodePathSegment).join("/");

  return new URL(`${endpoint}/${encodePathSegment(bucket)}/${objectPath}`);
}

function getAmzDates(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");

  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function getSigningKey(config, dateStamp) {
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, "s3");

  return hmac(serviceKey, "aws4_request");
}

function buildSignedHeaders(config, input) {
  const url = buildObjectUrl(config, input.bucket, input.key);
  const payloadHash = hashHex("");
  const { amzDate, dateStamp } = getAmzDates();
  const headers = new Headers();

  headers.set("host", url.host);
  headers.set("x-amz-content-sha256", payloadHash);
  headers.set("x-amz-date", amzDate);

  const canonicalHeaders = [...headers.entries()]
    .map(([key, value]) => [key.toLowerCase(), value.trim()])
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
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(getSigningKey(config, dateStamp), stringToSign);

  headers.set(
    "authorization",
    [
      `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(", "),
  );
  headers.delete("host");

  if (config.userAgent) {
    headers.set("user-agent", config.userAgent);
  }

  return { headers, url };
}

async function headS3Object(config, input) {
  const { headers, url } = buildSignedHeaders(config, {
    ...input,
    method: "HEAD",
  });
  const response = await fetch(url, {
    headers,
    method: "HEAD",
  });

  return {
    etag: response.headers.get("etag"),
    ok: response.ok,
    size: Number.parseInt(response.headers.get("content-length") ?? "", 10),
    status: response.status,
    statusText: response.statusText,
  };
}

function getS3Config(env) {
  return {
    accessKeyId: requireEnv(env, "S3_ACCESS_KEY_ID"),
    endpoint: requireEnv(env, "S3_ENDPOINT"),
    region: env.S3_REGION || "us-east-1",
    secretAccessKey: requireEnv(env, "S3_SECRET_ACCESS_KEY"),
    userAgent: env.S3_USER_AGENT || undefined,
  };
}

async function fetchArtifactVersions(env, limit) {
  const supabaseUrl = requireEnv(env, "NEXT_PUBLIC_SUPABASE_URL").replace(
    /\/+$/,
    "",
  );
  const serviceRoleKey = requireEnv(env, "SUPABASE_SECRET_KEY");
  const url = new URL(`${supabaseUrl}/rest/v1/artifact_versions`);
  url.searchParams.set(
    "select",
    [
      "id",
      "project_id",
      "stage",
      "content_type",
      "content_storage_provider",
      "content_storage_bucket",
      "content_storage_object_key",
      "content_byte_size",
      "content_checksum",
      "content",
      "created_at",
    ].join(","),
  );
  url.searchParams.set("content_storage_provider", "neq.inline");
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Supabase artifact_versions query failed: ${response.status} ${response.statusText} ${(
        await response.text().catch(() => "")
      ).slice(0, 500)}`,
    );
  }

  return response.json();
}

function classifyRow(row) {
  if (!EXTERNAL_PROVIDERS.has(row.content_storage_provider)) {
    return "unsupported-provider";
  }

  if (!row.content_storage_bucket || !row.content_storage_object_key) {
    return "invalid-pointer";
  }

  return "checkable";
}

async function auditRows(rows, s3Config) {
  const results = [];

  for (const row of rows) {
    const classification = classifyRow(row);

    if (classification !== "checkable") {
      results.push({
        classification,
        id: row.id,
        projectId: row.project_id,
        provider: row.content_storage_provider,
      });
      continue;
    }

    const head = await headS3Object(s3Config, {
      bucket: row.content_storage_bucket,
      key: row.content_storage_object_key,
    });
    const inlineLength = typeof row.content === "string" ? row.content.length : 0;

    results.push({
      bucket: row.content_storage_bucket,
      checksum: row.content_checksum,
      classification: head.ok ? "available" : "missing-or-inaccessible",
      contentType: row.content_type,
      expectedSize: row.content_byte_size,
      hasInlineFallback: inlineLength > 0,
      id: row.id,
      key: row.content_storage_object_key,
      projectId: row.project_id,
      provider: row.content_storage_provider,
      size: Number.isFinite(head.size) ? head.size : null,
      stage: row.stage,
      status: head.status,
      statusText: head.statusText,
    });
  }

  return results;
}

function summarize(results) {
  return results.reduce(
    (summary, result) => {
      summary.total += 1;
      summary[result.classification] =
        (summary[result.classification] ?? 0) + 1;
      return summary;
    },
    { total: 0 },
  );
}

function printHumanReport(results) {
  const summary = summarize(results);

  console.log("Artifact object storage audit");
  console.log(JSON.stringify(summary, null, 2));

  const actionable = results.filter(
    (result) => result.classification !== "available",
  );

  if (!actionable.length) {
    console.log("All checked external artifact objects are available.");
    return;
  }

  console.log("Actionable findings:");
  for (const result of actionable) {
    console.log(
      [
        `- ${result.classification}`,
        `id=${result.id}`,
        `project=${result.projectId}`,
        `provider=${result.provider}`,
        result.bucket ? `bucket=${result.bucket}` : undefined,
        result.key ? `key=${result.key}` : undefined,
        result.status ? `status=${result.status}` : undefined,
        result.hasInlineFallback ? "inlineFallback=yes" : "inlineFallback=no",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const s3Config = getS3Config(env);
  const rows = await fetchArtifactVersions(env, args.limit);
  const results = await auditRows(rows, s3Config);

  if (args.json) {
    console.log(JSON.stringify({ results, summary: summarize(results) }, null, 2));
  } else {
    printHumanReport(results);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
