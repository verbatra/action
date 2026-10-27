import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderUsageBlock, replaceUsageRegion } from "./usage-block.mjs";

const checkOnly = process.argv.slice(2).includes("--check");
const root = process.cwd();
const readmePath = join(root, "README.md");

try {
  const readme = readFileSync(readmePath, "utf8");
  const regenerated = replaceUsageRegion(
    readme,
    renderUsageBlock(readFileSync(join(root, "action.yml"), "utf8")),
  );
  if (regenerated === readme) {
    process.stdout.write("README.md input reference is up to date with action.yml\n");
  } else if (checkOnly) {
    process.stderr.write(
      "::error file=README.md::The input reference in README.md is out of date with action.yml. Run npm run docs:usage and commit the result.\n",
    );
    process.exitCode = 1;
  } else {
    writeFileSync(readmePath, regenerated);
    process.stdout.write("README.md input reference regenerated from action.yml\n");
  }
} catch (error) {
  const message = String(error.message)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  process.stderr.write(`::error::could not generate the README input reference: ${message}\n`);
  process.exitCode = 1;
}
