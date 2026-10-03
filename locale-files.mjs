import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, sep } from "node:path";

export function repoRelativePath(path, workspace) {
  const inside = relative(workspace, path);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    return null;
  }
  return inside.split(sep).join("/");
}

export async function resolveLocaleFiles(sdk, { cwd, configPath, workspace }) {
  const config = await sdk.loadConfig({ cwd, configPath });
  const resolver = sdk.createLocalePathResolver(cwd, config);
  const files = {};
  for (const locale of [config.sourceLocale, ...config.targetLocales]) {
    const path = repoRelativePath(resolver.pathFor(locale), workspace);
    if (path !== null) {
      files[locale] = path;
    }
  }
  return files;
}

export function loadSdk(installDir) {
  return createRequire(join(installDir, "package.json"))("@verbatra/sdk");
}

async function main() {
  const [installDir, cwd, configPath, outputFile] = process.argv.slice(2);
  let files = {};
  try {
    files = await resolveLocaleFiles(loadSdk(installDir), {
      cwd,
      configPath,
      workspace: process.env.GITHUB_WORKSPACE || process.cwd(),
    });
  } catch {
    files = {};
  }
  writeFileSync(outputFile, `${JSON.stringify(files)}\n`);
}

await main();
