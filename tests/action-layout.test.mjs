import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoUrl = new URL("../", import.meta.url);
const repoFile = (path) => readFileSync(new URL(path, repoUrl), "utf8");
const repoPathExists = (path) => existsSync(new URL(path, repoUrl));

const actionText = repoFile("action.yml");
const action = parse(actionText);
const runScript = repoFile("src/run.sh");
const ci = parse(repoFile(".github/workflows/ci.yml"));
const runStep = action.runs.steps.find((step) => step.id === "run");

const actionPathReferences = (text) =>
  [...text.matchAll(/\$GITHUB_ACTION_PATH\/([\w./-]+)/g)].map((match) => match[1]);

const RUNNER_VARIABLES = new Set(["GITHUB_ACTION_PATH", "GITHUB_OUTPUT"]);

describe("action.yml run step", () => {
  it("runs src/run.sh through bash from the action path", () => {
    expect(runStep.shell).toBe("bash");
    expect(runStep.run).toBe('bash "$GITHUB_ACTION_PATH/src/run.sh"');
  });

  it("keeps the -eo pipefail options the inline composite step ran with", () => {
    expect(runScript.startsWith("#!/usr/bin/env bash\nset -eo pipefail\n")).toBe(true);
  });

  it("passes exactly the environment variables src/run.sh reads", () => {
    const read = new Set(
      [...runScript.matchAll(/\$\{?([A-Z][A-Z0-9_]+)/g)]
        .map((match) => match[1])
        .filter((name) => !RUNNER_VARIABLES.has(name)),
    );
    expect(Object.keys(runStep.env).sort()).toEqual([...read].sort());
  });

  it("references only runtime files that exist in the repository", () => {
    const references = [...actionPathReferences(actionText), ...actionPathReferences(runScript)];
    expect(references.length).toBeGreaterThan(0);
    for (const path of references) {
      expect(path.startsWith("src/"), path).toBe(true);
      expect(repoPathExists(path), path).toBe(true);
    }
  });
});

describe("ci.yml self-test", () => {
  const steps = ci.jobs["self-test"].steps;

  it("points every working-directory at an existing fixture", () => {
    const directories = steps.map((step) => step.with?.["working-directory"]).filter(Boolean);
    expect(directories.length).toBeGreaterThan(0);
    for (const directory of directories) {
      expect(directory.startsWith("tests/fixtures/"), directory).toBe(true);
      expect(repoPathExists(directory), directory).toBe(true);
    }
  });

  it("runs every shell test in tests/shell, and only existing ones", () => {
    const invoked = steps
      .map((step) => step.run?.match(/^bash (tests\/shell\/[\w-]+\.test\.sh)$/)?.[1])
      .filter(Boolean)
      .sort();
    const present = readdirSync(new URL("tests/shell/", repoUrl))
      .filter((name) => name.endsWith(".test.sh"))
      .map((name) => `tests/shell/${name}`)
      .sort();
    expect(invoked).toEqual(present);
  });
});
