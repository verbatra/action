import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repoFile = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const latestReleasedVersion = repoFile("CHANGELOG.md").match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];
const shaPin = repoFile("README.md").match(
  /uses: verbatra\/action@([0-9a-f]{40}) # v(\d+\.\d+\.\d+)/,
);

function localTagCommit(tag) {
  try {
    return execFileSync("git", ["rev-parse", `${tag}^{commit}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

describe("release documentation", () => {
  it("keeps CHANGELOG.md headed by an Unreleased entry", () => {
    expect(repoFile("CHANGELOG.md")).toMatch(/^## \[Unreleased\]$/m);
  });

  it("matches package.json to the latest released CHANGELOG.md entry", () => {
    expect(latestReleasedVersion).toBeDefined();
    expect(JSON.parse(repoFile("package.json")).version).toBe(latestReleasedVersion);
  });

  it("pins the README full-SHA example to the latest released version", () => {
    expect(shaPin).not.toBeNull();
    expect(shaPin?.[2]).toBe(latestReleasedVersion);
  });

  it.skipIf(shaPin === null || localTagCommit(`v${shaPin[2]}`) === undefined)(
    "pins the README full-SHA example to the commit its version tag points at",
    () => {
      expect(shaPin?.[1]).toBe(localTagCommit(`v${shaPin?.[2]}`));
    },
  );
});
