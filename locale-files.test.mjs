import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scriptUrl = new URL("./locale-files.mjs", import.meta.url);

let workDir;
let importCase = 0;
let originalArgv;
let originalWorkspace;

async function importModule(argv) {
  process.argv = ["node", "locale-files.mjs", ...argv];
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
