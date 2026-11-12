import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const SEARCH_PLACES = [
  "package.json",
  ".verbatrarc",
  ".verbatrarc.json",
  ".verbatrarc.yaml",
  ".verbatrarc.yml",
  ".verbatrarc.js",
  ".verbatrarc.cjs",
  ".verbatrarc.ts",
  "verbatra.config.js",
  "verbatra.config.cjs",
  "verbatra.config.ts",
];

function isRegularFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function readNonEmptyContent(path) {
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  return content.trim() === "" ? null : content;
}

function isPackageJsonMatch(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(parsed, "verbatra") && parsed.verbatra !== null;
}

function matchesSearchPlace(entry, content) {
  return entry === "package.json" ? isPackageJsonMatch(content) : true;
}

export function resolveConfigPath(workingDirectory) {
  for (const entry of SEARCH_PLACES) {
    const candidate = join(workingDirectory, entry);
    if (!isRegularFile(candidate)) {
      continue;
    }
    const content = readNonEmptyContent(candidate);
    if (content === null || !matchesSearchPlace(entry, content)) {
      continue;
    }
    return candidate;
  }
  return null;
}

function main() {
  const [workingDirectory] = process.argv.slice(2);
  const resolved = resolveConfigPath(workingDirectory ?? "");
  if (resolved === null) {
    process.exit(1);
    return;
  }
  process.stdout.write(`${resolved}\n`);
}

main();
