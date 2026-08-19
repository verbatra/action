import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scriptUrl = new URL("./resolve-config.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);

function packageJsonWithProperty() {
  return JSON.stringify({ verbatra: { sourceLocale: "en" } });
}

function contentFor(entry) {
  return entry === "package.json" ? packageJsonWithProperty() : "placeholder config content\n";
}

let workDir;
let importCase = 0;

async function importModule() {
  process.argv = ["node", scriptPath, workDir];
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined);
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  importCase += 1;
  const mod = await import(/* @vite-ignore */ `${scriptUrl.href}?case=${importCase}`);
  return { mod, exitSpy, writeSpy };
}

function runOutOfProcess(argv, options = {}) {
  return spawnSync(process.execPath, [scriptPath, ...argv], { encoding: "utf8", ...options });
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "verbatra-resolve-config-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(workDir, { recursive: true, force: true });
});

describe("resolveConfigPath", () => {
  it("returns null when the directory has no recognized config file", async () => {
    const { mod } = await importModule();
    expect(mod.resolveConfigPath(workDir)).toBeNull();
  });

  it("exposes SEARCH_PLACES in the exact precedence order used by the SDK's load-config.ts", async () => {
    const { mod } = await importModule();
    expect(mod.SEARCH_PLACES).toEqual([
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
    ]);
  });

  const orderedSearchPlaces = [
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

  it.each(orderedSearchPlaces.map((entry, index) => ({ entry, index })))(
    "resolves $entry when no earlier search place is present",
    async ({ entry, index }) => {
      for (const laterEntry of orderedSearchPlaces.slice(index)) {
        writeFileSync(join(workDir, laterEntry), contentFor(laterEntry));
      }
      const { mod } = await importModule();
      expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, entry));
    },
  );

  it("first match in SEARCH_PLACES order wins when several entries are present", async () => {
    writeFileSync(join(workDir, "package.json"), JSON.stringify({ name: "no-verbatra-property" }));
    writeFileSync(join(workDir, ".verbatrarc"), "placeholder\n");
    writeFileSync(join(workDir, ".verbatrarc.json"), "{}\n");
    const { mod } = await importModule();
    expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, ".verbatrarc"));
  });

  it("skips a package.json with no verbatra property", async () => {
    writeFileSync(join(workDir, "package.json"), JSON.stringify({ name: "fixture" }));
    writeFileSync(join(workDir, ".verbatrarc"), "placeholder\n");
    const { mod } = await importModule();
    expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, ".verbatrarc"));
  });

  it("skips a package.json whose verbatra property is null", async () => {
    writeFileSync(join(workDir, "package.json"), JSON.stringify({ verbatra: null }));
    writeFileSync(join(workDir, ".verbatrarc"), "placeholder\n");
    const { mod } = await importModule();
    expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, ".verbatrarc"));
  });

  it("skips a package.json that parses to a non-object JSON value", async () => {
    writeFileSync(join(workDir, "package.json"), JSON.stringify(["not", "an", "object"]));
    writeFileSync(join(workDir, ".verbatrarc"), "placeholder\n");
    const { mod } = await importModule();
    expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, ".verbatrarc"));
  });

  it("skips a package.json that fails to parse as JSON", async () => {
    writeFileSync(join(workDir, "package.json"), '{ "verbatra": ');
    writeFileSync(join(workDir, ".verbatrarc"), "placeholder\n");
    const { mod } = await importModule();
    expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, ".verbatrarc"));
  });

  it("matches a package.json with a present, non-null verbatra property", async () => {
    writeFileSync(join(workDir, "package.json"), packageJsonWithProperty());
    const { mod } = await importModule();
    expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, "package.json"));
  });

  it("skips an empty package.json and continues the search", async () => {
    writeFileSync(join(workDir, "package.json"), "");
    writeFileSync(join(workDir, ".verbatrarc"), "placeholder\n");
    const { mod } = await importModule();
    expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, ".verbatrarc"));
  });

  it("skips a whitespace-only file at a non-package.json search place", async () => {
    writeFileSync(join(workDir, ".verbatrarc"), "   \n\t\n");
    writeFileSync(join(workDir, ".verbatrarc.json"), "{}\n");
    const { mod } = await importModule();
    expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, ".verbatrarc.json"));
  });

  it("skips a directory that happens to share a search place's name", async () => {
    mkdirSync(join(workDir, ".verbatrarc"));
    writeFileSync(join(workDir, ".verbatrarc.json"), "{}\n");
    const { mod } = await importModule();
    expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, ".verbatrarc.json"));
  });

  it("skips a directory named package.json without erroring", async () => {
    mkdirSync(join(workDir, "package.json"));
    writeFileSync(join(workDir, ".verbatrarc"), "placeholder\n");
    const { mod } = await importModule();
    expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, ".verbatrarc"));
  });

  it("skips a search place that stats as a regular file but fails to read (e.g. EACCES) and continues", async () => {
    const unreadablePath = join(workDir, ".verbatrarc");
    writeFileSync(unreadablePath, "placeholder\n");
    chmodSync(unreadablePath, 0o000);
    writeFileSync(join(workDir, ".verbatrarc.json"), "{}\n");
    try {
      const { mod } = await importModule();
      expect(mod.resolveConfigPath(workDir)).toBe(join(workDir, ".verbatrarc.json"));
    } finally {
      chmodSync(unreadablePath, 0o600);
    }
  });
});

describe("resolve-config.mjs main (in-process)", () => {
  it("prints the matched absolute path to stdout and does not call exit(1)", async () => {
    writeFileSync(join(workDir, ".verbatrarc.json"), "{}\n");
    const { exitSpy, writeSpy } = await importModule();
    expect(exitSpy).not.toHaveBeenCalledWith(1);
    expect(writeSpy).toHaveBeenCalledWith(`${join(workDir, ".verbatrarc.json")}\n`);
  });

  it("calls exit(1) and writes nothing to stdout when there is no match", async () => {
    const { exitSpy, writeSpy } = await importModule();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe("resolve-config.mjs (spawned as a real child process)", () => {
  it("exits 0 and prints the matched absolute path when a config file matches", () => {
    writeFileSync(join(workDir, "verbatra.config.js"), "export default {};\n");

    const child = runOutOfProcess([workDir]);

    expect(child.status).toBe(0);
    expect(child.stdout.trim()).toBe(join(workDir, "verbatra.config.js"));
  });

  it("exits 1 and prints nothing when no recognized config file exists", () => {
    const child = runOutOfProcess([workDir]);

    expect(child.status).toBe(1);
    expect(child.stdout).toBe("");
  });

  it("falls back to process.cwd() and prints the match relative to it when no positional argument is given", () => {
    writeFileSync(join(workDir, "verbatra.config.js"), "export default {};\n");

    const child = runOutOfProcess([], { cwd: workDir });

    expect(child.status).toBe(0);
    expect(child.stdout.trim()).toBe("verbatra.config.js");
    expect(child.stderr).toBe("");
  });

  it("falls back to process.cwd() and exits 1 cleanly, with nothing on stderr, when it has no config", () => {
    const child = runOutOfProcess([], { cwd: workDir });

    expect(child.status).toBe(1);
    expect(child.stdout).toBe("");
    expect(child.stderr).toBe("");
  });
});
