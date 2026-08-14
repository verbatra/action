import { describe, expect, it } from "vitest";
import {
  buildReport,
  extractCliError,
  parseSummaryJson,
  resolveExitCode,
  WIRING_FAILURE_EXIT_CODE,
} from "./report.mjs";

function locale(over = {}) {
  return {
    locale: "de",
    status: "succeeded",
    translated: [],
    unchanged: [],
    orphaned: [],
    invalidIcuSource: [],
    integrityMismatches: [],
    providerFailures: [],
    notices: [],
    ...over,
  };
}

function summary(over = {}) {
  return { dryRun: false, locales: [], succeeded: [], failed: [], ...over };
}

describe("buildReport: exit code is a literal pass-through", () => {
  it("clean (exit 0): no annotations, exitStatus 0, a summary", () => {
    const s = summary({
      locales: [locale({ translated: ["a", "b"], unchanged: ["c"] })],
      succeeded: ["de"],
    });
    const report = buildReport(s, 0);
    expect(report.annotations).toEqual([]);
    expect(report.exitStatus).toBe(0);
    expect(report.summary).toContain("1 locales: 1 succeeded, 0 failed");
    expect(report.summary).toContain("| de | ok | 2 | 1 |");
  });

  it("exitStatus mirrors the CLI code exactly, not re-derived from summary.failed", () => {
    expect(buildReport(summary({ succeeded: ["de"] }), 0).exitStatus).toBe(0);
    expect(buildReport(summary({ succeeded: ["de"] }), 2).exitStatus).toBe(2);
  });
});

describe("buildReport: per-locale failure (exit 1): the conjunction criterion", () => {
  it("produces one annotation per failed locale AND a non-zero exitStatus in the SAME result", () => {
    const s = summary({
      locales: [
        locale({ locale: "de", translated: ["x"] }),
        locale({
          locale: "fr",
          status: "failed",
          error: { code: "LOCALE_FAILED", message: "provider 503" },
        }),
        locale({
          locale: "es",
          status: "failed",
          error: { code: "SOURCE_INVALID", message: "bad icu" },
        }),
      ],
      succeeded: ["de"],
      failed: ["fr", "es"],
    });
    const report = buildReport(s, 1);

    expect(report.annotations).toHaveLength(2);
    expect(report.exitStatus).not.toBe(0);
    expect(report.exitStatus).toBe(1);

    expect(report.annotations[0]).toContain("title=verbatra%3A fr");
    expect(report.annotations[0]).toContain("[LOCALE_FAILED] provider 503");
    expect(report.annotations[1]).toContain("title=verbatra%3A es");
    expect(report.annotations[1]).toContain("[SOURCE_INVALID] bad icu");
    expect(report.summary).toContain("Failed locales:");
    expect(report.summary).toContain("- fr: [LOCALE_FAILED] provider 503");
  });
});

describe("buildReport: whole-run error (exit 2, empty stdout)", () => {
  it("uses the captured stderr {code,message}; one annotation; exitStatus 2", () => {
    const stderr =
      "verbatra: error [CONFIG_NOT_FOUND] No verbatra configuration found. Create a verbatra.config.ts.";
    const report = buildReport(null, 2, stderr);
    expect(report.annotations).toHaveLength(1);
    expect(report.annotations[0]).toContain("[CONFIG_NOT_FOUND] No verbatra configuration found");
    expect(report.exitStatus).toBe(2);
    expect(report.summary).toContain("verbatra run failed");
    expect(report.summary).toContain("exit 2");
  });

  it("falls back to a generic message when stderr has no recognizable error line", () => {
    const report = buildReport(null, 2, "");
    expect(report.annotations).toHaveLength(1);
    expect(report.annotations[0]).toContain("[VERBATRA_FAILED]");
    expect(report.exitStatus).toBe(2);
  });
});

describe("buildReport: whole-run fallback chain, pinned per stderr class", () => {
  it("recognizable stderr line: annotation and summary both use the extracted code and message", () => {
    const stderr = "verbatra: error [CONFIG_NOT_FOUND] No config found.";
    const report = buildReport(null, 2, stderr);
    expect(report.annotations[0]).toBe(
      "::error title=verbatra::[CONFIG_NOT_FOUND] No config found.",
    );
    expect(report.summary).toBe(
      [
        "## verbatra run failed",
        "",
        "The verbatra run could not complete (exit 2).",
        "",
        "[CONFIG_NOT_FOUND] No config found.",
      ].join("\n"),
    );
  });

  it("non-empty stderr with no recognizable error line: raw trimmed stderr, un-bracketed in the summary", () => {
    const report = buildReport(null, 2, "boom");
    expect(report.annotations[0]).toBe("::error title=verbatra::[VERBATRA_FAILED] boom");
    expect(report.summary).toBe(
      [
        "## verbatra run failed",
        "",
        "The verbatra run could not complete (exit 2).",
        "",
        "boom",
      ].join("\n"),
    );
  });

  it("empty stderr: annotation and summary each fall back to their own generic sentence", () => {
    const report = buildReport(null, 2, "");
    expect(report.annotations[0]).toBe(
      "::error title=verbatra::[VERBATRA_FAILED] The verbatra run failed (exit 2).",
    );
    expect(report.summary).toBe(
      [
        "## verbatra run failed",
        "",
        "The verbatra run could not complete (exit 2).",
        "",
        "The run could not complete (exit 2).",
      ].join("\n"),
    );
  });

  it("undefined stderr behaves identically to empty stderr", () => {
    expect(buildReport(null, 2)).toEqual(buildReport(null, 2, ""));
  });
});

describe("buildReport: provider failures render as their own column", () => {
  it("counts a provider failure separately from an integrity mismatch", () => {
    const s = summary({
      locales: [
        locale({
          translated: ["a"],
          integrityMismatches: ["b"],
          providerFailures: ["c", "d"],
        }),
      ],
      succeeded: ["de"],
    });
    const report = buildReport(s, 0);
    expect(report.summary).toContain("| de | ok | 1 | 0 | 0 | 0 | 1 | 2 | 0 |");
  });
});

describe("buildReport: dry-run mirrors the CLI", () => {
  it("exit 0 with pending work: no failure, the would-change summary is still produced", () => {
    const s = summary({
      dryRun: true,
      locales: [locale({ translated: ["pending1", "pending2"] })],
      succeeded: ["de"],
    });
    const report = buildReport(s, 0);
    expect(report.annotations).toEqual([]);
    expect(report.exitStatus).toBe(0);
    expect(report.summary).toContain("(dry run)");
    expect(report.summary).toContain("dry run: nothing written");
    expect(report.summary).toContain("| de | ok | 2 |");
  });
});

describe("buildReport: rendered summaries never contain emoji", () => {
  it("clean, per-locale-failure, whole-run, and dry-run summaries are all emoji-free", () => {
    const clean = buildReport(
      summary({
        locales: [locale({ translated: ["a", "b"], unchanged: ["c"] })],
        succeeded: ["de"],
      }),
      0,
    ).summary;
    const perLocaleFailure = buildReport(
      summary({
        locales: [
          locale({
            locale: "fr",
            status: "failed",
            error: { code: "LOCALE_FAILED", message: "provider 503" },
          }),
        ],
        failed: ["fr"],
      }),
      1,
    ).summary;
    const wholeRun = buildReport(
      null,
      2,
      "verbatra: error [CONFIG_NOT_FOUND] No verbatra configuration found. Create a verbatra.config.ts.",
    ).summary;
    const dryRun = buildReport(
      summary({
        dryRun: true,
        locales: [locale({ translated: ["pending1", "pending2"] })],
        succeeded: ["de"],
      }),
      0,
    ).summary;

    for (const rendered of [clean, perLocaleFailure, wholeRun, dryRun]) {
      expect(/\p{Extended_Pictographic}/u.test(rendered)).toBe(false);
    }
  });
});

describe("parseSummaryJson: empty-stdout handling (no JSON.parse crash)", () => {
  it("returns null for empty/blank stdout and an object for real JSON", () => {
    expect(parseSummaryJson("")).toBeNull();
    expect(parseSummaryJson("   \n  ")).toBeNull();
    expect(parseSummaryJson("not json")).toBeNull();
    expect(parseSummaryJson(JSON.stringify(summary({ succeeded: ["de"] })))).toMatchObject({
      succeeded: ["de"],
    });
  });

  it("unwraps the result out of a success envelope", () => {
    const stdout = JSON.stringify({
      ok: true,
      version: 1,
      command: "translate",
      result: summary({ succeeded: ["de"] }),
    });
    expect(parseSummaryJson(stdout)).toMatchObject({ succeeded: ["de"] });
  });

  it("returns null for a failure envelope, so the stderr whole-run path still reports it", () => {
    const stdout = JSON.stringify({
      ok: false,
      version: 1,
      command: "translate",
      code: "CONFIG_INVALID",
      message: "bad config",
    });
    expect(parseSummaryJson(stdout)).toBeNull();

    const report = buildReport(
      parseSummaryJson(stdout),
      2,
      "verbatra: error [CONFIG_INVALID] bad config",
    );
    expect(report.exitStatus).toBe(2);
    expect(report.annotations[0]).toContain("[CONFIG_INVALID] bad config");
  });

  it("returns null for a success envelope carrying no result", () => {
    expect(parseSummaryJson(JSON.stringify({ ok: true, version: 1, command: "translate" }))).toBe(
      null,
    );
  });

  it("empty stdout + exit 2 routes through the whole-run path end to end", () => {
    const report = buildReport(
      parseSummaryJson(""),
      2,
      "verbatra: error [SOURCE_UNREADABLE] missing",
    );
    expect(report.exitStatus).toBe(2);
    expect(report.annotations[0]).toContain("[SOURCE_UNREADABLE] missing");
  });
});

describe("buildReport: defensive branches", () => {
  it("a failed locale with no error object falls back to LOCALE_FAILED / 'locale failed'", () => {
    const s = summary({
      locales: [locale({ locale: "fr", status: "failed" })],
      failed: ["fr"],
    });
    const report = buildReport(s, 1);
    expect(report.annotations[0]).toContain("[LOCALE_FAILED] locale failed");
    expect(report.summary).toContain("- fr: [LOCALE_FAILED] locale failed");
    expect(report.exitStatus).toBe(1);
  });

  it("no summary with a clean exit (anomalous empty output, exit 0): no annotation, exitStatus 0", () => {
    const report = buildReport(null, 0, "");
    expect(report.annotations).toEqual([]);
    expect(report.exitStatus).toBe(0);
    expect(report.summary).toContain("verbatra run failed");
  });
});

describe("extractCliError and workflow-command escaping", () => {
  it("extracts {code,message} from the CLI stderr line", () => {
    expect(extractCliError("verbatra: error [CONFIG_INVALID] bad config")).toEqual({
      code: "CONFIG_INVALID",
      message: "bad config",
    });
    expect(extractCliError("some unrelated text")).toBeNull();
  });

  it("escapes %, newlines (data) and ':' (property) in annotations", () => {
    const s = summary({
      locales: [
        locale({
          locale: "x:y",
          status: "failed",
          error: { code: "C", message: "50% off\nline2" },
        }),
      ],
      failed: ["x:y"],
    });
    const report = buildReport(s, 1);
    expect(report.annotations[0]).toContain("verbatra%3A x%3Ay");
    expect(report.annotations[0]).toContain("50%25 off%0Aline2");
    expect(report.annotations[0]).not.toContain("\n");
  });
});

describe("job-summary escaping: untrusted values cannot break the markdown", () => {
  const tableLines = (rendered) => rendered.split("\n").filter((line) => line.startsWith("|"));
  const headingLines = (rendered) => rendered.split("\n").filter((line) => line.startsWith("#"));
  const cells = (row) => row.split(/(?<!\\)\|/);

  it("a locale name with a newline and a pipe stays one table row of the right width", () => {
    const s = summary({
      locales: [locale({ locale: "de|x\n| zz | ok | 9 | 9 | 9 | 9 | 9 | 9 | 9 |" })],
      succeeded: ["de"],
    });
    const report = buildReport(s, 0);
    const [head, , row] = tableLines(report.summary);

    expect(tableLines(report.summary)).toHaveLength(3);
    expect(cells(row)).toHaveLength(cells(head).length);
    expect(row).toContain("| de\\|x \\| zz \\| ok \\|");
    expect(headingLines(report.summary)).toHaveLength(1);
  });

  it("a locale name with a newline cannot inject a heading into the summary", () => {
    const s = summary({
      locales: [locale({ locale: "de\n## Forged heading\n[phish](https://evil.example)" })],
      succeeded: ["de"],
    });
    const report = buildReport(s, 0);

    expect(tableLines(report.summary)).toHaveLength(3);
    expect(headingLines(report.summary)).toEqual(["## verbatra translation summary"]);
    expect(report.summary).not.toContain("\n## Forged heading");
  });

  it("a provider error message with a newline and a heading stays one list item", () => {
    const s = summary({
      locales: [
        locale({
          locale: "fr",
          status: "failed",
          error: {
            code: "LOCALE_FAILED",
            message: "provider 503\n## Forged heading\n[phish](https://evil.example)",
          },
        }),
      ],
      failed: ["fr"],
    });
    const report = buildReport(s, 1);
    const listItems = report.summary.split("\n").filter((line) => line.startsWith("- "));

    expect(listItems).toHaveLength(1);
    expect(listItems[0]).toContain("[phish](https://evil.example)");
    expect(headingLines(report.summary)).toEqual(["## verbatra translation summary"]);
  });

  it("a pipe in a failed locale's code or message is escaped in the list item", () => {
    const s = summary({
      locales: [
        locale({
          locale: "fr|1",
          status: "failed",
          error: { code: "C|D", message: "a|b" },
        }),
      ],
      failed: ["fr|1"],
    });
    const report = buildReport(s, 1);
    expect(report.summary).toContain("- fr\\|1: [C\\|D] a\\|b");
  });

  it("raw stderr with a newline and a heading cannot inject structure into the failure summary", () => {
    const report = buildReport(null, 2, "boom\n## Forged heading\n[phish](https://evil.example)");

    expect(headingLines(report.summary)).toEqual(["## verbatra run failed"]);
    expect(report.summary).toBe(
      [
        "## verbatra run failed",
        "",
        "The verbatra run could not complete (exit 2).",
        "",
        "boom ## Forged heading [phish](https://evil.example)",
      ].join("\n"),
    );
  });

  it("a trailing backslash cannot escape the pipe escape", () => {
    const s = summary({
      locales: [locale({ locale: "de\\|x" })],
      succeeded: ["de"],
    });
    const report = buildReport(s, 0);
    expect(tableLines(report.summary)).toHaveLength(3);
    expect(report.summary).toContain("| de\\\\\\|x | ok |");
  });
});

describe("resolveExitCode: the legitimate-success case survives", () => {
  it("passes through a genuine zero exit code (the CLI succeeded)", () => {
    expect(resolveExitCode("0")).toBe(0);
  });

  it("passes through any other genuine numeric exit code", () => {
    expect(resolveExitCode("1")).toBe(1);
    expect(resolveExitCode("2")).toBe(2);
    expect(resolveExitCode("137")).toBe(137);
  });
});

describe("resolveExitCode: a broken wiring fails loudly instead of defaulting to success", () => {
  it("defaults a missing argument to WIRING_FAILURE_EXIT_CODE, not 0", () => {
    expect(resolveExitCode(undefined)).toBe(WIRING_FAILURE_EXIT_CODE);
    expect(WIRING_FAILURE_EXIT_CODE).not.toBe(0);
  });

  it("defaults an empty string to WIRING_FAILURE_EXIT_CODE", () => {
    expect(resolveExitCode("")).toBe(WIRING_FAILURE_EXIT_CODE);
  });

  it("defaults a non-numeric value to WIRING_FAILURE_EXIT_CODE", () => {
    expect(resolveExitCode("not-a-number")).toBe(WIRING_FAILURE_EXIT_CODE);
  });
});

function checkLocale(over = {}) {
  return { locale: "de", missing: 0, stale: 0, upToDate: 2, inSync: true, ...over };
}

function checkResult(over = {}) {
  return { inSync: true, locales: [], ...over };
}

function diffLocale(over = {}) {
  return {
    locale: "de",
    missing: [],
    changed: [],
    orphaned: [],
    hasPendingChanges: false,
    ...over,
  };
}

function diffResult(over = {}) {
  return { hasPendingChanges: false, locales: [], ...over };
}

describe("buildReport: check renders its own result shape, not the translate one", () => {
  it("in sync (exit 0): counts table, no annotations, exitStatus 0", () => {
    const report = buildReport(
      checkResult({ inSync: true, locales: [checkLocale()] }),
      0,
      "",
      "check",
    );
    expect(report.annotations).toEqual([]);
    expect(report.exitStatus).toBe(0);
    expect(report.summary).toContain("## verbatra check summary");
    expect(report.summary).toContain("| de | in sync | 0 | 0 | 2 |");
    expect(report.summary).toContain("1 locales: 1 in sync, 0 drifted");
  });

  it("drifted (exit 1): one annotation per drifted locale AND a non-zero exitStatus", () => {
    const report = buildReport(
      checkResult({
        inSync: false,
        locales: [
          checkLocale({ locale: "de", missing: 2, stale: 0, upToDate: 0, inSync: false }),
          checkLocale({ locale: "fr" }),
          checkLocale({ locale: "es", missing: 1, stale: 3, upToDate: 4, inSync: false }),
        ],
      }),
      1,
      "",
      "check",
    );

    expect(report.annotations).toHaveLength(2);
    expect(report.exitStatus).toBe(1);
    expect(report.annotations[0]).toContain("title=verbatra check%3A de");
    expect(report.annotations[0]).toContain("[LOCALE_DRIFTED] 2 missing, 0 stale");
    expect(report.annotations[1]).toContain("title=verbatra check%3A es");
    expect(report.annotations[1]).toContain("[LOCALE_DRIFTED] 1 missing, 3 stale");
    expect(report.summary).toContain("| de | drifted | 2 | 0 | 0 |");
    expect(report.summary).toContain("3 locales: 1 in sync, 2 drifted");
  });

  it("the drifted summary states WHY the step failed without needing the log", () => {
    const report = buildReport(
      checkResult({
        inSync: false,
        locales: [checkLocale({ missing: 2, upToDate: 0, inSync: false })],
      }),
      1,
      "",
      "check",
    );
    expect(report.summary).toContain(
      "Step failed: 1 of 1 locales drifted from the source. check exits 1 when a locale has missing or stale keys.",
    );
    expect(report.summary).toContain("Drifted locales:");
    expect(report.summary).toContain("- de: 2 missing, 0 stale");
  });

  it("an in-sync run does not explain a failure that did not happen", () => {
    const report = buildReport(checkResult({ locales: [checkLocale()] }), 0, "", "check");
    expect(report.summary).not.toContain("Step failed");
    expect(report.summary).not.toContain("Drifted locales:");
  });
});

describe("buildReport: diff renders its own result shape, not the translate one", () => {
  it("clean (exit 0): counts table, no annotations, exitStatus 0", () => {
    const report = buildReport(diffResult({ locales: [diffLocale()] }), 0, "", "diff");
    expect(report.annotations).toEqual([]);
    expect(report.exitStatus).toBe(0);
    expect(report.summary).toContain("## verbatra diff summary");
    expect(report.summary).toContain("| de | clean | 0 | 0 | 0 |");
    expect(report.summary).toContain("1 locales: 1 clean, 0 pending");
  });

  it("pending (exit 1): one annotation per pending locale, naming the keys", () => {
    const report = buildReport(
      diffResult({
        hasPendingChanges: true,
        locales: [
          diffLocale({
            locale: "de",
            missing: ["farewell", "greeting"],
            hasPendingChanges: true,
          }),
          diffLocale({ locale: "fr" }),
        ],
      }),
      1,
      "",
      "diff",
    );

    expect(report.annotations).toHaveLength(1);
    expect(report.exitStatus).toBe(1);
    expect(report.annotations[0]).toContain("title=verbatra diff%3A de");
    expect(report.annotations[0]).toContain("[LOCALE_PENDING] missing: farewell, greeting");
    expect(report.summary).toContain("| de | pending | 2 | 0 | 0 |");
    expect(report.summary).toContain("2 locales: 1 clean, 1 pending");
  });

  it("the pending summary states WHY the step failed without needing the log", () => {
    const report = buildReport(
      diffResult({
        hasPendingChanges: true,
        locales: [diffLocale({ missing: ["greeting"], hasPendingChanges: true })],
      }),
      1,
      "",
      "diff",
    );
    expect(report.summary).toContain(
      "Step failed: 1 of 1 locales have pending changes. diff exits 1 when a locale has missing or changed keys.",
    );
    expect(report.summary).toContain("Pending locales:");
    expect(report.summary).toContain("- de: missing: greeting");
  });

  it("a changed key list is reported alongside the missing one", () => {
    const report = buildReport(
      diffResult({
        hasPendingChanges: true,
        locales: [
          diffLocale({
            missing: ["a"],
            changed: ["b", "c"],
            hasPendingChanges: true,
          }),
        ],
      }),
      1,
      "",
      "diff",
    );
    expect(report.summary).toContain("| de | pending | 1 | 2 | 0 |");
    expect(report.summary).toContain("- de: missing: a; changed: b, c");
  });

  it("long key lists are capped in the annotation instead of emitting hundreds of keys", () => {
    const many = Array.from({ length: 12 }, (_, index) => `key${index}`);
    const report = buildReport(
      diffResult({
        hasPendingChanges: true,
        locales: [diffLocale({ missing: many, hasPendingChanges: true })],
      }),
      1,
      "",
      "diff",
    );
    expect(report.annotations[0]).toContain("key0, key1");
    expect(report.annotations[0]).toContain("and 2 more");
    expect(report.annotations[0]).not.toContain("key10");
  });
});

describe("buildReport: orphans are observed CLI behaviour, not a failure", () => {
  it("a locale whose only difference is an orphan is clean, exit 0, and still lists the orphan", () => {
    const report = buildReport(
      diffResult({
        hasPendingChanges: false,
        locales: [diffLocale({ orphaned: ["obsolete"], hasPendingChanges: false })],
      }),
      0,
      "",
      "diff",
    );
    expect(report.annotations).toEqual([]);
    expect(report.exitStatus).toBe(0);
    expect(report.summary).toContain("| de | clean | 0 | 0 | 1 |");
    expect(report.summary).toContain("Orphaned keys, reported but not a failure:");
    expect(report.summary).toContain("- de: obsolete");
    expect(report.summary).not.toContain("Step failed");
  });

  it("no orphan section is rendered when nothing is orphaned", () => {
    const report = buildReport(diffResult({ locales: [diffLocale()] }), 0, "", "diff");
    expect(report.summary).not.toContain("Orphaned keys");
  });
});

describe("buildReport: command routing", () => {
  it("defaults to the translate renderer when no command is given, preserving existing consumers", () => {
    const s = summary({
      locales: [locale({ translated: ["a", "b"], unchanged: ["c"] })],
      succeeded: ["de"],
    });
    expect(buildReport(s, 0).summary).toBe(buildReport(s, 0, "", "translate").summary);
    expect(buildReport(s, 0).summary).toContain("## verbatra translation summary");
  });

  it("an unrecognized command falls back to the translate renderer rather than throwing", () => {
    const s = summary({ locales: [locale()], succeeded: ["de"] });
    expect(buildReport(s, 0, "", "nonsense").summary).toContain("## verbatra translation summary");
  });

  it("a command naming an inherited Object property falls back too, instead of resolving one", () => {
    const s = summary({ locales: [locale()], succeeded: ["de"] });
    for (const command of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(buildReport(s, 0, "", command).summary).toContain("## verbatra translation summary");
    }
  });

  it("the whole-run failure path stays command-agnostic when stdout is empty", () => {
    const report = buildReport(null, 2, "verbatra: error [CONFIG_NOT_FOUND] No config found.", "check");
    expect(report.annotations[0]).toBe("::error title=verbatra::[CONFIG_NOT_FOUND] No config found.");
    expect(report.summary).toContain("## verbatra run failed");
    expect(report.exitStatus).toBe(2);
  });
});

describe("check and diff escaping: untrusted locale and key names cannot break out", () => {
  const tableLines = (rendered) => rendered.split("\n").filter((line) => line.startsWith("|"));
  const headingLines = (rendered) => rendered.split("\n").filter((line) => line.startsWith("#"));
  const cells = (row) => row.split(/(?<!\\)\|/);

  it("a check locale name with a pipe and a newline stays one table row of the right width", () => {
    const report = buildReport(
      checkResult({ locales: [checkLocale({ locale: "de|x\n| zz | ok | 9 | 9 | 9 |" })] }),
      0,
      "",
      "check",
    );
    const [head, , row] = tableLines(report.summary);
    expect(tableLines(report.summary)).toHaveLength(3);
    expect(cells(row)).toHaveLength(cells(head).length);
    expect(headingLines(report.summary)).toEqual(["## verbatra check summary"]);
  });

  it("a diff key name with a newline cannot inject a heading into the summary", () => {
    const report = buildReport(
      diffResult({
        hasPendingChanges: true,
        locales: [
          diffLocale({
            missing: ["greeting\n## Forged heading\n[phish](https://evil.example)"],
            hasPendingChanges: true,
          }),
        ],
      }),
      1,
      "",
      "diff",
    );
    expect(headingLines(report.summary)).toEqual(["## verbatra diff summary"]);
    expect(report.summary).not.toContain("\n## Forged heading");
  });

  it("a check locale name with a colon is property-escaped in the annotation", () => {
    const report = buildReport(
      checkResult({
        inSync: false,
        locales: [checkLocale({ locale: "x:y", missing: 1, inSync: false })],
      }),
      1,
      "",
      "check",
    );
    expect(report.annotations[0]).toContain("verbatra check%3A x%3Ay");
    expect(report.annotations[0]).not.toContain("\n");
  });

  it("a diff key name with a percent sign and a newline is data-escaped in the annotation", () => {
    const report = buildReport(
      diffResult({
        hasPendingChanges: true,
        locales: [
          diffLocale({ missing: ["50% off\nline2"], hasPendingChanges: true }),
        ],
      }),
      1,
      "",
      "diff",
    );
    expect(report.annotations[0]).toContain("50%25 off%0Aline2");
    expect(report.annotations[0]).not.toContain("\n");
  });

  it("check and diff summaries are emoji-free", () => {
    const rendered = [
      buildReport(checkResult({ locales: [checkLocale()] }), 0, "", "check").summary,
      buildReport(
        checkResult({ inSync: false, locales: [checkLocale({ missing: 1, inSync: false })] }),
        1,
        "",
        "check",
      ).summary,
      buildReport(diffResult({ locales: [diffLocale({ orphaned: ["o"] })] }), 0, "", "diff").summary,
      buildReport(
        diffResult({
          hasPendingChanges: true,
          locales: [diffLocale({ missing: ["a"], hasPendingChanges: true })],
        }),
        1,
        "",
        "diff",
      ).summary,
    ];
    for (const summaryText of rendered) {
      expect(/\p{Extended_Pictographic}/u.test(summaryText)).toBe(false);
    }
  });
});
