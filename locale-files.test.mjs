import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scriptUrl = new URL("./locale-files.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);

let workDir;
let importCase = 0;
let originalArgv;
let originalWorkspace;

async function importModule(argv) {
  process.argv = ["node", "locale-files.mjs", ...argv];
  vi.spyOn(process, "exit").mockImplementation(() => undefined);
  importCase += 1;
  return import(/* @vite-ignore */ `${scriptUrl.href}?case=${importCase}`);
}

function fakeSdk(config) {
  const calls = {};
  return {
    calls,
    loadConfig: async (options) => {
      calls.loadConfig = options;
      return config;
    },
    createLocalePathResolver: (cwd, resolverConfig) => {
      calls.resolver = { cwd, resolverConfig };
      return { pathFor: (locale) => join(cwd, "locales", `${locale}.json`) };
    },
  };
}

function installFakeSdk(installDir, source) {
  const packageDir = join(installDir, "node_modules", "@verbatra", "sdk");
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify({ name: "@verbatra/sdk", main: "index.cjs" }),
  );
  writeFileSync(join(packageDir, "index.cjs"), source);
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "verbatra-locale-files-"));
  originalArgv = process.argv;
  originalWorkspace = process.env.GITHUB_WORKSPACE;
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(workDir, { recursive: true, force: true });
  process.argv = originalArgv;
  if (originalWorkspace === undefined) {
    delete process.env.GITHUB_WORKSPACE;
  } else {
    process.env.GITHUB_WORKSPACE = originalWorkspace;
  }
});

describe("repoRelativePath", () => {
  it("returns a forward-slash path inside the workspace", async () => {
    const { repoRelativePath } = await importModule(["", "", "", join(workDir, "out.json")]);
    expect(repoRelativePath(join(workDir, "apps", "web", "de.json"), workDir)).toBe(
      "apps/web/de.json",
    );
  });

  it("returns null for the workspace itself or a path outside it", async () => {
    const { repoRelativePath } = await importModule(["", "", "", join(workDir, "out.json")]);
    expect(repoRelativePath(workDir, workDir)).toBeNull();
    expect(repoRelativePath(join(workDir, ".."), workDir)).toBeNull();
    expect(repoRelativePath(join(workDir, "..", "other", "de.json"), workDir)).toBeNull();
    expect(repoRelativePath(join(workDir, `..notparent${sep}de.json`), workDir)).toBe(
      "..notparent/de.json",
    );
  });
});

describe("resolveLocaleFiles", () => {
  it("maps the source and every target locale through the SDK's own resolver", async () => {
    const { resolveLocaleFiles } = await importModule(["", "", "", join(workDir, "out.json")]);
    const config = { sourceLocale: "en", targetLocales: ["de", "fr"] };
    const sdk = fakeSdk(config);
    const cwd = join(workDir, "apps", "web");

    const files = await resolveLocaleFiles(sdk, {
      cwd,
      configPath: join(cwd, "verbatra.config.ts"),
      workspace: workDir,
    });

    expect(files).toEqual({
      en: "apps/web/locales/en.json",
      de: "apps/web/locales/de.json",
      fr: "apps/web/locales/fr.json",
    });
    expect(sdk.calls.loadConfig).toEqual({ cwd, configPath: join(cwd, "verbatra.config.ts") });
    expect(sdk.calls.resolver).toEqual({ cwd, resolverConfig: config });
  });

  it("keeps the other locales when the resolver throws for one", async () => {
    const { resolveLocaleFiles } = await importModule(["", "", "", join(workDir, "out.json")]);
    const sdk = {
      loadConfig: async () => ({ sourceLocale: "en", targetLocales: ["de", "fr"] }),
      createLocalePathResolver: (cwd) => ({
        pathFor: (locale) => {
          if (locale === "de") {
            throw new Error("LOCALE_LAYOUT_INVALID");
          }
          return join(cwd, `${locale}.json`);
        },
      }),
    };
    const files = await resolveLocaleFiles(sdk, {
      cwd: workDir,
      configPath: "verbatra.config.ts",
      workspace: workDir,
    });
    expect(files).toEqual({ en: "en.json", fr: "fr.json" });
  });

  it("leaves out a locale whose file lies outside the workspace", async () => {
    const { resolveLocaleFiles } = await importModule(["", "", "", join(workDir, "out.json")]);
    const files = await resolveLocaleFiles(fakeSdk({ sourceLocale: "en", targetLocales: ["de"] }), {
      cwd: join(workDir, ".."),
      configPath: "verbatra.config.ts",
      workspace: workDir,
    });
    expect(files).toEqual({});
  });
});

describe("locale-files.mjs as a script", () => {
  it("writes the mapping resolved through the SDK installed next to the CLI", async () => {
    const installDir = join(workDir, "install");
    installFakeSdk(
      installDir,
      `const { join } = require("node:path");
module.exports = {
  loadConfig: async () => ({ sourceLocale: "en", targetLocales: ["de"] }),
  createLocalePathResolver: (cwd) => ({ pathFor: (locale) => join(cwd, "i18n", locale + ".json") }),
};
`,
    );
    const outputFile = join(workDir, "locale-files.json");
    process.env.GITHUB_WORKSPACE = workDir;

    await importModule([installDir, join(workDir, "project"), "verbatra.config.ts", outputFile]);

    expect(JSON.parse(readFileSync(outputFile, "utf8"))).toEqual({
      en: "project/i18n/en.json",
      de: "project/i18n/de.json",
    });
  });

  it("writes an empty mapping when the SDK cannot be loaded", async () => {
    const outputFile = join(workDir, "locale-files.json");
    await importModule([join(workDir, "no-install"), workDir, "verbatra.config.ts", outputFile]);
    expect(readFileSync(outputFile, "utf8")).toBe("{}\n");
  });

  it("writes an empty mapping when an older SDK has no locale path resolver", async () => {
    const installDir = join(workDir, "install");
    installFakeSdk(
      installDir,
      `module.exports = { loadConfig: async () => ({ sourceLocale: "en", targetLocales: [] }) };\n`,
    );
    const outputFile = join(workDir, "locale-files.json");
    delete process.env.GITHUB_WORKSPACE;

    await importModule([installDir, workDir, "verbatra.config.ts", outputFile]);

    expect(readFileSync(outputFile, "utf8")).toBe("{}\n");
  });
});

describe("resolveWithinDeadline", () => {
  it("returns the resolved mapping when it settles in time", async () => {
    const { resolveWithinDeadline } = await importModule(["", "", "", join(workDir, "o.json")]);
    await expect(resolveWithinDeadline(async () => ({ de: "de.json" }), 1000)).resolves.toEqual({
      de: "de.json",
    });
  });

  it("returns an empty mapping when resolving never settles", async () => {
    const { resolveWithinDeadline } = await importModule(["", "", "", join(workDir, "o.json")]);
    await expect(resolveWithinDeadline(() => new Promise(() => {}), 20)).resolves.toEqual({});
  });

  it("returns an empty mapping when resolving throws or rejects", async () => {
    const { resolveWithinDeadline } = await importModule(["", "", "", join(workDir, "o.json")]);
    await expect(
      resolveWithinDeadline(() => {
        throw new Error("sync");
      }, 1000),
    ).resolves.toEqual({});
    await expect(
      resolveWithinDeadline(() => Promise.reject(new Error("async")), 1000),
    ).resolves.toEqual({});
  });

  it("bounds the helper at ten seconds", async () => {
    const { RESOLVE_DEADLINE_MS } = await importModule(["", "", "", join(workDir, "o.json")]);
    expect(RESOLVE_DEADLINE_MS).toBe(10_000);
  });
});

describe("locale-files.mjs always exits", () => {
  it("exits 0 and writes an empty mapping when loadConfig rejects", async () => {
    const installDir = join(workDir, "install");
    installFakeSdk(
      installDir,
      `module.exports = { loadConfig: async () => { throw new Error("CONFIG_INVALID"); } };\n`,
    );
    const outputFile = join(workDir, "locale-files.json");

    await importModule([installDir, workDir, "verbatra.config.ts", outputFile]);

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(readFileSync(outputFile, "utf8")).toBe("{}\n");
  });

  it("exits 0 without throwing when the mapping cannot be written", async () => {
    await importModule([join(workDir, "no-install"), workDir, "c.ts", join(workDir, "no", "x")]);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("a config that leaves an interval running does not keep the process alive", () => {
    const installDir = join(workDir, "install");
    installFakeSdk(
      installDir,
      `const { join } = require("node:path");
module.exports = {
  loadConfig: async () => {
    setInterval(() => {}, 1000);
    return { sourceLocale: "en", targetLocales: ["de"] };
  },
  createLocalePathResolver: (cwd) => ({ pathFor: (locale) => join(cwd, locale + ".json") }),
};
`,
    );
    const outputFile = join(workDir, "locale-files.json");

    const child = spawnSync(
      process.execPath,
      [scriptPath, installDir, workDir, "verbatra.config.ts", outputFile],
      { encoding: "utf8", env: { ...process.env, GITHUB_WORKSPACE: workDir }, timeout: 5000 },
    );

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(JSON.parse(readFileSync(outputFile, "utf8"))).toEqual({ en: "en.json", de: "de.json" });
  });
});
