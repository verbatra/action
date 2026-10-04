import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, sep } from "node:path";

export const RESOLVE_DEADLINE_MS = 10_000;

export function repoRelativePath(path, workspace) {
  const inside = relative(workspace, path);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    return null;
  }
  return inside.split(sep).join("/");
}

function localePath(resolver, locale, workspace) {
  try {
    return repoRelativePath(resolver.pathFor(locale), workspace);
  } catch {
    return null;
  }
}

export async function resolveLocaleFiles(sdk, { cwd, configPath, workspace }) {
  const config = await sdk.loadConfig({ cwd, configPath });
  const resolver = sdk.createLocalePathResolver(cwd, config);
  const files = {};
  for (const locale of [config.sourceLocale, ...config.targetLocales]) {
    const path = localePath(resolver, locale, workspace);
    if (path !== null) {
      files[locale] = path;
    }
  }
  return files;
}

export function loadSdk(installDir) {
  return createRequire(join(installDir, "package.json"))("@verbatra/sdk");
}

export async function resolveWithinDeadline(resolve, deadlineMs) {
  let timer;
  const deadline = new Promise((settle) => {
    timer = setTimeout(() => settle({}), deadlineMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(resolve), deadline]);
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

function writeMapping(outputFile, files) {
  try {
    writeFileSync(outputFile, `${JSON.stringify(files)}\n`);
  } catch {
    return;
  }
}

async function main() {
  const [installDir, cwd, configPath, outputFile] = process.argv.slice(2);
  const files = await resolveWithinDeadline(
    () =>
      resolveLocaleFiles(loadSdk(installDir), {
        cwd,
        configPath,
        workspace: process.env.GITHUB_WORKSPACE || process.cwd(),
      }),
    RESOLVE_DEADLINE_MS,
  );
  writeMapping(outputFile, files);
  process.exit(0);
}

await main();
