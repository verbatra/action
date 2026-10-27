import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { END_MARKER, START_MARKER } from "./usage-block.mjs";

const scriptUrl = new URL("./generate-usage.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);

const ACTION = [
  "name: probe",
  "inputs:",
  "  only:",
  "    description: The only input.",
  "    default: value",
  "runs:",
  "  using: composite",
  "  steps: []",
  "",
].join("\n");

const FRESH_BLOCK = [
  "```yaml",
  "- uses: verbatra/action@v1",
  "  with:",
  "    # The only input.",
  "    # Default: value",
  "    only: value",
  "```",
].join("\n");

let dir;
let importCase = 0;
let originalArgv;
let originalExitCode;

function readme(block) {
  return `# probe\n\n${START_MARKER}\n${block}\n${END_MARKER}\n\nmore\n`;
}

async function run(...args) {
  process.argv = ["node", scriptPath, ...args];
  process.exitCode = undefined;
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  importCase += 1;
  await import(/* @vite-ignore */ `${scriptUrl.href}?case=${importCase}`);
  const status = process.exitCode ?? 0;
  const result = {
    status,
    stdout: out.mock.calls.map(([chunk]) => chunk).join(""),
    stderr: err.mock.calls.map(([chunk]) => chunk).join(""),
  };
  vi.restoreAllMocks();
  process.exitCode = undefined;
  return result;
}

beforeEach(() => {
  originalArgv = process.argv;
  originalExitCode = process.exitCode;
  dir = mkdtempSync(join(tmpdir(), "generate-usage-"));
  writeFileSync(join(dir, "action.yml"), ACTION);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  rmSync(dir, { recursive: true, force: true });
});

describe("generate-usage --check: the CI drift guard", () => {
  it("passes and writes nothing when the README is a fresh regeneration", async () => {
    writeFileSync(join(dir, "README.md"), readme(FRESH_BLOCK));
    const result = await run("--check");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("up to date");
  });

  it("fails with an annotation naming the fix when action.yml changed without a regeneration", async () => {
    writeFileSync(join(dir, "README.md"), readme("stale"));
    const result = await run("--check");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("::error file=README.md::");
    expect(result.stderr).toContain("npm run docs:usage");
    expect(readFileSync(join(dir, "README.md"), "utf8")).toBe(readme("stale"));
  });

  it("fails with an escaped annotation when the README has no usage markers", async () => {
    writeFileSync(join(dir, "README.md"), "no markers here\n");
    const result = await run("--check");
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      `::error::could not generate the README input reference: README.md has no ${START_MARKER} marker\n`,
    );
  });

  it("fails without forging a second workflow command when a file is missing", async () => {
    const result = await run("--check");
    expect(result.status).toBe(1);
    expect(result.stderr.trimEnd().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("::error::could not generate the README input reference");
  });
});

describe("generate-usage: write mode", () => {
  it("rewrites only the usage region in one run, after which the check passes", async () => {
    writeFileSync(join(dir, "README.md"), readme("stale"));
    const write = await run();
    expect(write.status).toBe(0);
    expect(write.stdout).toContain("regenerated");
    expect(readFileSync(join(dir, "README.md"), "utf8")).toBe(readme(FRESH_BLOCK));
    expect((await run("--check")).status).toBe(0);
  });
});

describe("generate-usage (out of process)", () => {
  it("sets a non-zero process exit status on drift, which is what fails the CI step", () => {
    writeFileSync(join(dir, "README.md"), readme("stale"));
    const result = spawnSync(process.execPath, [scriptPath, "--check"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
  });
});
