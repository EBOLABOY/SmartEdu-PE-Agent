import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, normalize, resolve } from "node:path";

const projectRoot = process.cwd();
const manifestPath = join(projectRoot, ".next", "dev", "build-manifest.json");
const lockPath = join(projectRoot, ".next", "dev", "lock");

const warnings = [];

function commandLines(command) {
  try {
    const lookupCommand = process.platform === "win32" ? "where.exe" : "which";

    return execFileSync(lookupCommand, [command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function installationRoot(path) {
  const normalized = normalize(path).toLowerCase();

  if (normalized.includes("\\nvm4w\\") || normalized.includes("/nvm4w/")) {
    return "nvm4w";
  }

  if (normalized.includes("program files\\nodejs") || normalized.includes("program files/nodejs")) {
    return "program-files-nodejs";
  }

  return normalized.split(/[\\/]/).slice(0, 3).join("/");
}

const nodePaths = commandLines("node");
const npmPaths = commandLines("npm");
const nodeRoots = new Set(nodePaths.map(installationRoot));
const npmRoots = new Set(npmPaths.map(installationRoot));
const allRoots = new Set([...nodeRoots, ...npmRoots]);

if (allRoots.size > 1) {
  warnings.push([
    "检测到 node 与 npm 可能来自不同安装根目录。",
    `node: ${nodePaths.join(" | ") || "未找到"}`,
    `npm: ${npmPaths.join(" | ") || "未找到"}`,
    "建议统一 PATH，确保 node/npm 均来自 nvm4w 或均来自同一套 Node 安装。",
  ].join("\n"));
}

if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const pages = manifest && typeof manifest === "object" ? manifest.pages : undefined;
    const pageNames = pages && typeof pages === "object" ? Object.keys(pages) : [];

    if (pageNames.length <= 1 && pageNames.includes("/_app")) {
      warnings.push([
        "检测到 .next/dev/build-manifest.json 疑似残缺。",
        `文件位置: ${resolve(manifestPath)}`,
        "建议先执行 npm run clean:next，再重新 npm run dev。",
      ].join("\n"));
    }
  } catch {
    warnings.push([
      "检测到 .next/dev/build-manifest.json 无法解析。",
      `文件位置: ${resolve(manifestPath)}`,
      "建议先执行 npm run clean:next，再重新 npm run dev。",
    ].join("\n"));
  }
}

if (existsSync(lockPath)) {
  warnings.push([
    "检测到 .next/dev/lock 存在。",
    `文件位置: ${resolve(lockPath)}`,
    "如果当前没有 Next dev 服务运行，说明上次退出可能不完整，可执行 npm run clean:next。",
  ].join("\n"));
}

if (warnings.length > 0) {
  console.warn(`[check:dev-env] ${warnings.length} warning(s):`);

  for (const warning of warnings) {
    console.warn(`\n${warning}`);
  }

  console.warn("\n[check:dev-env] 以上是可维护性风险提示，不阻止启动。若继续出现 EPERM rename，请使用 npm run dev:webpack 验证 Turbopack 差异。");
} else {
  console.log("[check:dev-env] ok");
}
