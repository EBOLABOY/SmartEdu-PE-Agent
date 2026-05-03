import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const nextDir = resolve(process.cwd(), ".next");

try {
  await rm(nextDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(`[clean:next] removed ${nextDir}`);
} catch (error) {
  console.error(`[clean:next] failed to remove ${nextDir}`);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
