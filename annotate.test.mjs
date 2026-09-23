import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scriptUrl = new URL("./annotate.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);

function successEnvelope(over = {}) {
  return {
    ok: true,
    version: 1,
    command: "translate",
    result: {
      dryRun: false,
      locales: [
        {
          locale: "de",
          status: "succeeded",
          translated: ["greeting"],
          unchanged: [],
          orphaned: [],
          invalidIcuSource: [],
          integrityMismatches: [],
          providerFailures: [],
          notices: [],
        },
      ],
      succeeded: ["de"],
      failed: [],
      ...over,
    },
  };
}

function failedLocaleEnvelope() {
  return {
    ok: true,
    version: 1,
    command: "translate",
    result: {
      dryRun: false,
      locales: [
        {
          locale: "fr",
          status: "failed",
          translated: [],
          unchanged: [],
          orphaned: [],
          invalidIcuSource: [],
          integrityMismatches: [],
          providerFailures: [],
          notices: [],
          error: { code: "LOCALE_FAILED", message: "provider 503" },
        },
      ],
      succeeded: [],
      failed: ["fr"],
    },
  };
}

let workDir;
let importCase = 0;
let originalArgv;
let originalGithubStepSummary;
let originalGithubOutput;

function fixture(name, content) {
  const path = join(workDir, name);
  writeFileSync(path, content);
  return path;
}

async function runInProcess(argv, stepSummaryPath, outputPath) {
  process.argv = ["node", scriptPath, ...argv];
  if (stepSummaryPath === undefined) {
    delete process.env.GITHUB_STEP_SUMMARY;
  } else {
    process.env.GITHUB_STEP_SUMMARY = stepSummaryPath;
  }
  if (outputPath === undefined) {
    delete process.env.GITHUB_OUTPUT;
  } else {
    process.env.GITHUB_OUTPUT = outputPath;
  }

  const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined);
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  importCase += 1;
  await import(/* @vite-ignore */ `${scriptUrl.href}?case=${importCase}`);

  return { exitSpy, writeSpy };
}

function runOutOfProcess(argv, env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...argv], { encoding: "utf8", env });
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "verbatra-annotate-"));
  originalArgv = process.argv;
  originalGithubStepSummary = process.env.GITHUB_STEP_SUMMARY;
  originalGithubOutput = process.env.GITHUB_OUTPUT;
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(workDir, { recursive: true, force: true });
  process.argv = originalArgv;
  if (originalGithubStepSummary === undefined) {
    delete process.env.GITHUB_STEP_SUMMARY;
  } else {
    process.env.GITHUB_STEP_SUMMARY = originalGithubStepSummary;
  }
  if (originalGithubOutput === undefined) {
    delete process.env.GITHUB_OUTPUT;
  } else {
    process.env.GITHUB_OUTPUT = originalGithubOutput;
  }
});

describe("annotate.mjs (in-process)", () => {
  it("clean run: exits 0, writes no annotation, appends the summary to GITHUB_STEP_SUMMARY", async () => {
    const summaryFile = fixture("summary.json", JSON.stringify(successEnvelope()));
    const errorFile = fixture("error.txt", "");
    const stepSummaryFile = join(workDir, "step-summary.md");

    const { exitSpy, writeSpy } = await runInProcess(
      [summaryFile, errorFile, "0"],
      stepSummaryFile,
    );

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(readFileSync(stepSummaryFile, "utf8")).toContain("1 locales: 1 succeeded, 0 partial, 0 failed");
  });

  it("failed locale: exits 1 and writes the locale annotation to stdout", async () => {
    const summaryFile = fixture("summary.json", JSON.stringify(failedLocaleEnvelope()));
    const errorFile = fixture("error.txt", "");

    const { exitSpy, writeSpy } = await runInProcess([summaryFile, errorFile, "1"], undefined);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0][0]).toContain("title=verbatra%3A fr");
    expect(writeSpy.mock.calls[0][0]).toContain("[LOCALE_FAILED] provider 503");
  });

  it("missing argv paths read as empty, exercising the whole-run failure path", async () => {
    const { exitSpy, writeSpy } = await runInProcess([], undefined);

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0][0]).toContain("[VERBATRA_FAILED]");
  });

  it("argv paths pointing at files that do not exist also read as empty", async () => {
    const summaryFile = join(workDir, "missing-summary.json");
    const errorFile = join(workDir, "missing-error.txt");

    const { exitSpy, writeSpy } = await runInProcess([summaryFile, errorFile, "2"], undefined);

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0][0]).toContain("[VERBATRA_FAILED]");
  });

  it("a non-numeric exit_code argument falls back to the wiring-failure exit code", async () => {
    const summaryFile = fixture("summary.json", JSON.stringify(successEnvelope()));
    const errorFile = fixture("error.txt", "");

    const { exitSpy } = await runInProcess([summaryFile, errorFile, "not-a-number"], undefined);

    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

function needsHumanEnvelope() {
  const envelope = successEnvelope();
  envelope.result.locales[0].translated = [];
  envelope.result.locales[0].unfilled = ["farewell", "title"];
  envelope.result.locales[0].protected = [{ key: "legal", reason: "human-edited" }];
  return envelope;
}

describe("annotate.mjs: translate exit 3 means a person has work, not a failure", () => {
  it("exits 0, warns per locale, and sets the needs-human output to true", async () => {
    const summaryFile = fixture("summary.json", JSON.stringify(needsHumanEnvelope()));
    const errorFile = fixture("error.txt", "");
    const outputFile = fixture("output.txt", "");

    const { exitSpy, writeSpy } = await runInProcess(
      [summaryFile, errorFile, "3", "translate"],
      undefined,
      outputFile,
    );

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0][0]).toBe(
      "::warning title=verbatra%3A de::[NEEDS_HUMAN] 3 keys need a human translation (unfilled: farewell, title; protected: legal)\n",
    );
    expect(readFileSync(outputFile, "utf8")).toBe("needs-human=true\n");
  });

  it("sets the needs-human output to false on any other outcome", async () => {
    const summaryFile = fixture("summary.json", JSON.stringify(successEnvelope()));
    const errorFile = fixture("error.txt", "");
    const outputFile = fixture("output.txt", "");

    const { exitSpy } = await runInProcess([summaryFile, errorFile, "0"], undefined, outputFile);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(readFileSync(outputFile, "utf8")).toBe("needs-human=false\n");
  });

  it("the spawned process exits 0 on translate exit 3, so the step passes", () => {
    const summaryFile = fixture("summary.json", JSON.stringify(needsHumanEnvelope()));
    const errorFile = fixture("error.txt", "");
    const outputFile = fixture("output.txt", "");

    const child = runOutOfProcess([summaryFile, errorFile, "3", "translate"], {
      GITHUB_OUTPUT: outputFile,
    });

    expect(child.status).toBe(0);
    expect(readFileSync(outputFile, "utf8")).toBe("needs-human=true\n");
  });
});

describe("annotate.mjs (spawned as a real child process)", () => {
  it("clean run: process exits 0, prints nothing, and appends the job summary file", () => {
    const summaryFile = fixture("summary.json", JSON.stringify(successEnvelope()));
    const errorFile = fixture("error.txt", "");
    const stepSummaryFile = join(workDir, "step-summary.md");

    const child = runOutOfProcess([summaryFile, errorFile, "0"], {
      GITHUB_STEP_SUMMARY: stepSummaryFile,
    });

    expect(child.status).toBe(0);
    expect(child.stdout).toBe("");
    expect(readFileSync(stepSummaryFile, "utf8")).toContain("1 locales: 1 succeeded, 0 partial, 0 failed");
  });

  it("whole-run failure: process exits with the given code and prints the error annotation", () => {
    const summaryFile = fixture("summary.json", "");
    const errorFile = fixture(
      "error.txt",
      "verbatra: error [CONFIG_NOT_FOUND] No verbatra configuration found.",
    );

    const child = runOutOfProcess([summaryFile, errorFile, "2"], {});

    expect(child.status).toBe(2);
    expect(child.stdout).toContain("[CONFIG_NOT_FOUND] No verbatra configuration found.");
  });
});

function checkEnvelope(over = {}) {
  return {
    ok: true,
    version: 1,
    command: "check",
    result: {
      inSync: false,
      locales: [{ locale: "de", missing: 2, stale: 0, upToDate: 0, inSync: false }],
      ...over,
    },
  };
}

function diffEnvelope() {
  return {
    ok: true,
    version: 1,
    command: "diff",
    result: {
      hasPendingChanges: true,
      locales: [
        {
          locale: "de",
          missing: ["farewell", "greeting"],
          changed: [],
          orphaned: [],
          hasPendingChanges: true,
        },
      ],
    },
  };
}

describe("annotate.mjs: the command argument selects the renderer", () => {
  it("check drift: exits 1, annotates the drifted locale, writes the check summary", async () => {
    const summaryFile = fixture("summary.json", JSON.stringify(checkEnvelope()));
    const errorFile = fixture("error.txt", "");
    const stepSummaryFile = join(workDir, "step-summary.md");

    const { exitSpy, writeSpy } = await runInProcess(
      [summaryFile, errorFile, "1", "check"],
      stepSummaryFile,
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0][0]).toContain("[LOCALE_DRIFTED] 2 missing, 0 stale");
    const written = readFileSync(stepSummaryFile, "utf8");
    expect(written).toContain("## verbatra check summary");
    expect(written).toContain("Step failed: 1 of 1 locales drifted from the source.");
  });

  it("diff pending: exits 1, annotates the pending locale with its keys", async () => {
    const summaryFile = fixture("summary.json", JSON.stringify(diffEnvelope()));
    const errorFile = fixture("error.txt", "");
    const stepSummaryFile = join(workDir, "step-summary.md");

    const { exitSpy, writeSpy } = await runInProcess(
      [summaryFile, errorFile, "1", "diff"],
      stepSummaryFile,
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(writeSpy.mock.calls[0][0]).toContain("[LOCALE_PENDING] missing: farewell, greeting");
    expect(readFileSync(stepSummaryFile, "utf8")).toContain("## verbatra diff summary");
  });

  it("an omitted command argument still renders the translate summary", async () => {
    const summaryFile = fixture("summary.json", JSON.stringify(successEnvelope()));
    const errorFile = fixture("error.txt", "");
    const stepSummaryFile = join(workDir, "step-summary.md");

    const { exitSpy } = await runInProcess([summaryFile, errorFile, "0"], stepSummaryFile);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(readFileSync(stepSummaryFile, "utf8")).toContain("## verbatra translation summary");
  });

  it("a check run in sync exits 0 with no annotation, as a green CI gate", async () => {
    const envelope = checkEnvelope({
      inSync: true,
      locales: [{ locale: "de", missing: 0, stale: 0, upToDate: 2, inSync: true }],
    });
    const summaryFile = fixture("summary.json", JSON.stringify(envelope));
    const errorFile = fixture("error.txt", "");

    const { exitSpy, writeSpy } = await runInProcess(
      [summaryFile, errorFile, "0", "check"],
      undefined,
    );

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe("annotate.mjs: qa-strict reaches the report", () => {
  function warningOnlyEnvelope() {
    return {
      ok: true,
      version: 1,
      command: "check",
      result: {
        inSync: true,
        locales: [
          {
            locale: "de",
            missing: 0,
            stale: 0,
            upToDate: 1,
            inSync: true,
            qa: {
              checked: 1,
              errors: 0,
              warnings: 1,
              findings: [{ key: "title", severity: "warning", reason: "LENGTH_RATIO" }],
            },
          },
        ],
        qa: { errors: 0, warnings: 1, invalidSourceKeys: [] },
      },
    };
  }

  it("reads QA_STRICT from the environment and explains a strict warning failure", () => {
    const summaryFile = fixture("summary.json", JSON.stringify(warningOnlyEnvelope()));
    const errorFile = fixture("error.txt", "");
    const stepSummaryFile = join(workDir, "step-summary.md");

    const child = runOutOfProcess([summaryFile, errorFile, "1", "check"], {
      GITHUB_STEP_SUMMARY: stepSummaryFile,
      QA_STRICT: "true",
    });

    expect(child.status).toBe(1);
    expect(readFileSync(stepSummaryFile, "utf8")).toContain("with qa-strict exits 1");
  });
});
