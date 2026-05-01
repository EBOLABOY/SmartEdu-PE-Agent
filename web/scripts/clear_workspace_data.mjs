#!/usr/bin/env node

import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const CONFIRM_TOKEN = "CLEAR_WORKSPACE_DATA";
const S3_PREFIXES = ["projects/", "users/", "health-checks/"];
const WORKSPACE_TABLES = [
  "audit_events",
  "conversations",
  "export_files",
  "organization_members",
  "organizations",
  "projects",
];
const PRESERVED_TABLES = ["profiles", "standards_corpora", "standard_entries"];

function parseArgs(argv) {
  const args = {
    confirm: "",
    execute: false,
    includeS3: false,
    keepOrganizations: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--execute") {
      args.execute = true;
      continue;
    }

    if (arg === "--include-s3") {
      args.includeS3 = true;
      continue;
    }

    if (arg === "--keep-organizations") {
      args.keepOrganizations = true;
      continue;
    }

    if (arg === "--confirm") {
      args.confirm = argv[index + 1] ?? "";
      index += 1;
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

function getSupabaseConfig(env) {
  return {
    secretKey: requireEnv(env, "SUPABASE_SECRET_KEY"),
    url: requireEnv(env, "NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, ""),
  };
}

function getS3Config(env) {
  return {
    accessKeyId: requireEnv(env, "S3_ACCESS_KEY_ID"),
    bucket: env.S3_WORKSPACE_BUCKET || env.S3_BUCKET,
    endpoint: requireEnv(env, "S3_ENDPOINT").replace(/\/+$/, ""),
    region: env.S3_REGION || "us-east-1",
    secretAccessKey: requireEnv(env, "S3_SECRET_ACCESS_KEY"),
    userAgent: env.S3_USER_AGENT || undefined,
  };
}

function supabaseHeaders(config) {
  return {
    apikey: config.secretKey,
    authorization: `Bearer ${config.secretKey}`,
  };
}

async function fetchTableCount(config, table) {
  const response = await fetch(`${config.url}/rest/v1/${table}?select=*`, {
    headers: {
      ...supabaseHeaders(config),
      prefer: "count=exact",
      range: "0-0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Supabase count failed for ${table}: ${response.status} ${response.statusText} ${(
        await response.text().catch(() => "")
      ).slice(0, 500)}`,
    );
  }

  const contentRange = response.headers.get("content-range") ?? "0-0/0";
  const rawCount = contentRange.split("/")[1] ?? "0";
  return Number.parseInt(rawCount, 10) || 0;
}

async function fetchCounts(config, tables) {
  const entries = [];

  for (const table of tables) {
    entries.push([table, await fetchTableCount(config, table)]);
  }

  return Object.fromEntries(entries);
}

async function deleteAllRows(config, table) {
  const response = await fetch(`${config.url}/rest/v1/${table}?id=not.is.null`, {
    headers: supabaseHeaders(config),
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(
      `Supabase delete failed for ${table}: ${response.status} ${response.statusText} ${(
        await response.text().catch(() => "")
      ).slice(0, 500)}`,
    );
  }
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

function encodeQueryValue(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
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

function buildS3Url(config, key, query = {}) {
  const objectPath = key
    ? `/${key.split("/").map(encodePathSegment).join("/")}`
    : "";
  const url = new URL(
    `${config.endpoint}/${encodePathSegment(config.bucket)}${objectPath}`,
  );

  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(name, value);
    }
  }

  return url;
}

function canonicalQueryString(url) {
  return [...url.searchParams.entries()]
    .map(([key, value]) => [encodeQueryValue(key), encodeQueryValue(value)])
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function buildSignedS3Headers(config, input) {
  const url = buildS3Url(config, input.key ?? "", input.query);
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
    canonicalQueryString(url),
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

function decodeXmlText(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseListObjectsResponse(xml) {
  const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((match) =>
    decodeXmlText(match[1] ?? ""),
  );
  const token = xml.match(
    /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/,
  )?.[1];

  return {
    keys,
    nextContinuationToken: token ? decodeXmlText(token) : null,
  };
}

async function listS3Prefix(config, prefix) {
  const keys = [];
  let continuationToken = null;

  do {
    const { headers, url } = buildSignedS3Headers(config, {
      method: "GET",
      query: {
        "continuation-token": continuationToken,
        "list-type": "2",
        prefix,
      },
    });
    const response = await fetch(url, { headers, method: "GET" });

    if (!response.ok) {
      throw new Error(
        `S3 list failed for prefix ${prefix}: ${response.status} ${response.statusText} ${(
          await response.text().catch(() => "")
        ).slice(0, 500)}`,
      );
    }

    const parsed = parseListObjectsResponse(await response.text());
    keys.push(...parsed.keys);
    continuationToken = parsed.nextContinuationToken;
  } while (continuationToken);

  return keys;
}

async function deleteS3Object(config, key) {
  const { headers, url } = buildSignedS3Headers(config, {
    key,
    method: "DELETE",
  });
  const response = await fetch(url, { headers, method: "DELETE" });

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `S3 delete failed for ${key}: ${response.status} ${response.statusText} ${(
        await response.text().catch(() => "")
      ).slice(0, 500)}`,
    );
  }
}

async function collectS3Keys(config) {
  const keys = new Set();

  for (const prefix of S3_PREFIXES) {
    for (const key of await listS3Prefix(config, prefix)) {
      keys.add(key);
    }
  }

  return [...keys].sort();
}

function printCounts(title, counts) {
  console.log(title);
  console.log(JSON.stringify(counts, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const supabase = getSupabaseConfig(env);
  const tablesToClear = args.keepOrganizations
    ? WORKSPACE_TABLES.filter(
        (table) => table !== "organizations" && table !== "organization_members",
      )
    : WORKSPACE_TABLES;
  const allReportedTables = [...WORKSPACE_TABLES, ...PRESERVED_TABLES];
  const beforeCounts = await fetchCounts(supabase, allReportedTables);
  let s3Keys = [];

  printCounts("Workspace data clear plan", {
    mode: args.execute ? "execute" : "dry-run",
    preservedTables: PRESERVED_TABLES,
    tablesToClear,
  });
  printCounts("Rows before", beforeCounts);

  if (args.includeS3) {
    const s3 = getS3Config(env);
    s3Keys = await collectS3Keys(s3);
    console.log(
      `S3 objects matched by prefixes ${S3_PREFIXES.join(", ")}: ${s3Keys.length}`,
    );
  }

  if (!args.execute) {
    console.log(
      `Dry run only. Re-run with --execute --confirm ${CONFIRM_TOKEN} to delete.`,
    );
    return;
  }

  if (args.confirm !== CONFIRM_TOKEN) {
    throw new Error(`Refusing to execute without --confirm ${CONFIRM_TOKEN}`);
  }

  if (args.includeS3) {
    const s3 = getS3Config(env);

    for (const key of s3Keys) {
      await deleteS3Object(s3, key);
    }
  }

  if (args.keepOrganizations) {
    await deleteAllRows(supabase, "projects");
    await deleteAllRows(supabase, "audit_events");
    await deleteAllRows(supabase, "export_files");
  } else {
    await deleteAllRows(supabase, "organizations");
  }

  const afterCounts = await fetchCounts(supabase, allReportedTables);
  printCounts("Rows after", afterCounts);
  console.log("Workspace data clear completed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
