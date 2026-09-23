import { describe, expect, it } from "vitest";
import {
  buildReport,
  extractCliError,
  NEEDS_HUMAN_EXIT_CODE,
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
    expect(report.summary).toContain("1 locales: 1 succeeded, 0 partial, 0 failed");
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

describe("buildReport: partial locales are reported wherever failed ones are", () => {
  function partialRun() {
    return summary({
      locales: [
        locale({ locale: "de", translated: ["a"] }),
        locale({
          locale: "fr",
          status: "partial",
          translated: ["a", "b"],
          integrityMismatches: ["c"],
          providerFailures: ["d", "e"],
          budgetWithheld: ["f"],
        }),
      ],
      succeeded: ["de"],
      partial: ["fr"],
    });
  }

  it("a run whose only problem is a partial locale annotates it instead of emitting nothing", () => {
    const report = buildReport(partialRun(), 1);
    expect(report.exitStatus).toBe(1);
    expect(report.annotations).toEqual([
      "::error title=verbatra%3A fr::[LOCALE_PARTIAL] 2 translated, 4 keys withheld (integrity: c; provider failure: d, e; budget: f)",
    ]);
  });

  it("the status column shows partial rather than ok", () => {
    const report = buildReport(partialRun(), 1);
    expect(report.summary).toContain("| fr | partial | 2 | 0 | 0 | 0 | 1 | 2 | 0 |");
    expect(report.summary).toContain("| de | ok | 1 |");
  });

  it("the aggregate line counts partial locales between succeeded and failed", () => {
    const report = buildReport(partialRun(), 1);
    expect(report.summary).toContain("2 locales: 1 succeeded, 1 partial, 0 failed");
  });

  it("the summary lists each partial locale with its withheld keys", () => {
    const report = buildReport(partialRun(), 1);
    expect(report.summary).toContain(
      [
        "Partial locales, written with keys still missing:",
        "- fr: 2 translated, 4 keys withheld (integrity: c; provider failure: d, e; budget: f)",
      ].join("\n"),
    );
    expect(report.summary).not.toContain("Failed locales:");
  });

  it("partial and failed locales are annotated side by side, in locale order", () => {
    const s = summary({
      locales: [
        locale({ locale: "fr", status: "partial", translated: ["a"], providerFailures: ["b"] }),
        locale({
          locale: "es",
          status: "failed",
          error: { code: "LOCALE_FAILED", message: "provider 503" },
        }),
      ],
      partial: ["fr"],
      failed: ["es"],
    });
    const report = buildReport(s, 1);
    expect(report.annotations).toEqual([
      "::error title=verbatra%3A fr::[LOCALE_PARTIAL] 1 translated, 1 key withheld (provider failure: b)",
      "::error title=verbatra%3A es::[LOCALE_FAILED] provider 503",
    ]);
    expect(report.summary).toContain("2 locales: 0 succeeded, 1 partial, 1 failed");
  });

  it("a failed locale with nothing thrown names its withheld keys instead of a bare 'locale failed'", () => {
    const s = summary({
      locales: [locale({ locale: "fr", status: "failed", integrityMismatches: ["a", "b"] })],
      failed: ["fr"],
    });
    const report = buildReport(s, 1);
    expect(report.annotations).toEqual([
      "::error title=verbatra%3A fr::[LOCALE_FAILED] 2 keys withheld (integrity: a, b)",
    ]);
    expect(report.summary).toContain("- fr: [LOCALE_FAILED] 2 keys withheld (integrity: a, b)");
  });

  it("a long withheld list is capped in the annotation", () => {
    const keys = Array.from({ length: 12 }, (_, index) => `k${index}`);
    const s = summary({
      locales: [locale({ locale: "fr", status: "partial", providerFailures: keys })],
      partial: ["fr"],
    });
    const [annotation] = buildReport(s, 1).annotations;
    expect(annotation).toContain("12 keys withheld (provider failure: k0,");
    expect(annotation).toContain("k9, and 2 more)");
    expect(annotation).not.toContain("k10");
  });

  it("a partial locale reporting no withheld key still says so rather than rendering nothing", () => {
    const s = summary({
      locales: [locale({ locale: "fr", status: "partial", translated: ["a"] })],
      partial: ["fr"],
    });
    const report = buildReport(s, 1);
    expect(report.annotations).toEqual([
      "::error title=verbatra%3A fr::[LOCALE_PARTIAL] 1 translated, 0 keys withheld",
    ]);
  });

  it("a summary from a CLI that predates the partial list still renders a zero partial count", () => {
    const s = summary({ locales: [locale()], succeeded: ["de"] });
    delete s.partial;
    expect(buildReport(s, 0).summary).toContain("1 locales: 1 succeeded, 0 partial, 0 failed");
  });

  it("a partial locale on a clean exit is shown in the table but not annotated", () => {
    const report = buildReport(partialRun(), 0);
    expect(report.annotations).toEqual([]);
    expect(report.summary).toContain("| fr | partial |");
  });

  it("an untrusted withheld key cannot break out of the summary list or forge a workflow command", () => {
    const s = summary({
      locales: [
        locale({
          locale: "fr",
          status: "partial",
          translated: ["a"],
          providerFailures: ["x|y\n## Forged heading\n::stop-commands::t"],
        }),
      ],
      partial: ["fr"],
    });
    const report = buildReport(s, 1);
    expect(report.summary.split("\n").filter((line) => line.startsWith("#"))).toEqual([
      "## verbatra translation summary",
    ]);
    expect(report.summary).toContain("x\\|y ## Forged heading ::stop-commands::t");
    expect(report.annotations).toHaveLength(1);
    expect(report.annotations[0]).not.toContain("\n");
    expect(report.annotations[0]).toContain("x|y%0A## Forged heading%0A::stop-commands::t");
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

function qaReport(findings) {
  return {
    checked: 5,
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    findings,
  };
}

function qaResult(localeFindings, over = {}) {
  const locales = localeFindings.map(([name, findings]) =>
    checkLocale({ locale: name, qa: qaReport(findings) }),
  );
  const totals = locales.reduce(
    (sum, entry) => ({
      errors: sum.errors + entry.qa.errors,
      warnings: sum.warnings + entry.qa.warnings,
    }),
    { errors: 0, warnings: 0 },
  );
  return checkResult({ locales, qa: { ...totals, invalidSourceKeys: [] }, ...over });
}

const placeholderError = {
  key: "greeting",
  severity: "error",
  reason: "placeholder",
  details: ["-{name}", "+{nom}"],
};
const lengthWarning = { key: "title", severity: "warning", reason: "LENGTH_RATIO" };

describe("buildReport: check --qa findings", () => {
  it("annotates an error finding as an error and a review finding as a warning", () => {
    const report = buildReport(
      qaResult([["de", [placeholderError, lengthWarning]]]),
      1,
      "",
      "check",
    );
    expect(report.exitStatus).toBe(1);
    expect(report.annotations).toEqual([
      "::error title=verbatra qa%3A de::[placeholder] greeting (-{name}, +{nom})",
      "::warning title=verbatra qa%3A de::[LENGTH_RATIO] title",
    ]);
  });

  it("annotates warnings on a passing run too, so a non-strict gate still shows them", () => {
    const report = buildReport(qaResult([["de", [lengthWarning]]]), 0, "", "check");
    expect(report.exitStatus).toBe(0);
    expect(report.annotations).toEqual(["::warning title=verbatra qa%3A de::[LENGTH_RATIO] title"]);
    expect(report.summary).not.toContain("Step failed");
  });

  it("adds per-locale qa columns and totals to the summary only when the check ran --qa", () => {
    const withQa = buildReport(
      qaResult([
        ["de", [placeholderError, lengthWarning]],
        ["fr", []],
      ]),
      1,
      "",
      "check",
    ).summary;
    expect(withQa).toContain("| locale | status | missing | stale | up to date | qa errors | qa warnings |");
    expect(withQa).toContain("| de | in sync | 0 | 0 | 2 | 1 | 1 |");
    expect(withQa).toContain("| fr | in sync | 0 | 0 | 2 | 0 | 0 |");
    expect(withQa).toContain("2 locales: 2 in sync, 0 drifted; quality check: 1 errors, 1 warnings");

    const withoutQa = buildReport(
      checkResult({ locales: [checkLocale()] }),
      0,
      "",
      "check",
    ).summary;
    expect(withoutQa).not.toContain("qa errors");
    expect(withoutQa).not.toContain("quality check");
  });

  it("explains a failure caused by the quality check alone, then lists every finding", () => {
    const summaryText = buildReport(
      qaResult([["de", [placeholderError, lengthWarning]]]),
      1,
      "",
      "check",
    ).summary;
    expect(summaryText).toContain(
      "Step failed: the quality check found 1 errors. check --qa exits 1 on any error.",
    );
    expect(summaryText).not.toContain("Drifted locales:");
    expect(summaryText).toContain(
      [
        "Quality findings:",
        "",
        "| locale | key | severity | reason | details |",
        "| --- | --- | --- | --- | --- |",
        "| de | greeting | error | placeholder | -{name}, +{nom} |",
        "| de | title | warning | LENGTH_RATIO |  |",
      ].join("\n"),
    );
  });

  it("reports drift and quality findings together when both fail the step", () => {
    const result = qaResult([["de", [placeholderError]]]);
    const drifted = {
      ...result,
      inSync: false,
      locales: [{ ...result.locales[0], missing: 1, inSync: false }],
    };
    const report = buildReport(drifted, 1, "", "check");
    expect(report.annotations).toEqual([
      "::error title=verbatra check%3A de::[LOCALE_DRIFTED] 1 missing, 0 stale",
      "::error title=verbatra qa%3A de::[placeholder] greeting (-{name}, +{nom})",
    ]);
    expect(report.summary).toContain("Drifted locales:");
    expect(report.summary).toContain("Step failed: the quality check found 1 errors");
  });

  it("does not blame the quality check for a drift failure when it found only warnings", () => {
    const result = qaResult([["de", [lengthWarning]]]);
    const drifted = {
      ...result,
      inSync: false,
      locales: [{ ...result.locales[0], missing: 1, inSync: false }],
    };
    const text = buildReport(drifted, 1, "", "check").summary;
    expect(text).toContain("Drifted locales:");
    expect(text).not.toContain("Step failed: the quality check");
    expect(text).toContain("| de | title | warning | LENGTH_RATIO |  |");
  });

  it("blames warnings only when qa-strict made them fail the step", () => {
    const report = buildReport(qaResult([["de", [lengthWarning]]]), 1, "", "check", {
      qaStrict: true,
    });
    expect(report.summary).toContain(
      "Step failed: the quality check found 0 errors and 1 warnings. check --qa with qa-strict exits 1 on any error or warning.",
    );
  });

  it("keeps at most 10 annotations per severity, errors listed first, and counts the rest", () => {
    const warnings = Array.from({ length: 60 }, (_, index) => ({
      key: `w${index}`,
      severity: "warning",
      reason: "UNTRANSLATED",
    }));
    const report = buildReport(
      qaResult([
        ["de", warnings],
        ["fr", [placeholderError]],
      ]),
      1,
      "",
      "check",
    );
    expect(report.annotations[0]).toBe(
      "::error title=verbatra qa%3A fr::[placeholder] greeting (-{name}, +{nom})",
    );
    expect(report.annotations.filter((line) => line.startsWith("::warning"))).toHaveLength(10);
    expect(report.annotations).toHaveLength(12);
    expect(report.annotations[11]).toBe(
      "::notice title=verbatra::50 more warnings not annotated, because GitHub shows at most 10 annotations of each severity per step. The job summary lists them all.",
    );
  });

  it("drift errors come before quality errors, so the error cap keeps them", () => {
    const errors = Array.from({ length: 12 }, (_, index) => ({
      ...placeholderError,
      key: `e${index}`,
    }));
    const result = qaResult([["de", errors]]);
    const drifted = {
      ...result,
      inSync: false,
      locales: [{ ...result.locales[0], missing: 2, inSync: false }],
    };
    const report = buildReport(drifted, 1, "", "check");
    expect(report.annotations[0]).toContain("[LOCALE_DRIFTED]");
    expect(report.annotations.filter((line) => line.startsWith("::error"))).toHaveLength(10);
    expect(report.annotations.at(-1)).toContain("::notice title=verbatra::3 more errors not annotated");
    expect(report.annotations.at(-1)).not.toContain("warning");
  });

  it("names both severities in the notice when both overflow, singular when one is left", () => {
    const findings = [
      ...Array.from({ length: 11 }, (_, index) => ({ ...placeholderError, key: `e${index}` })),
      ...Array.from({ length: 12 }, (_, index) => ({ ...lengthWarning, key: `w${index}` })),
    ];
    const report = buildReport(qaResult([["de", findings]]), 1, "", "check");
    expect(report.annotations).toHaveLength(21);
    expect(report.annotations[20]).toContain("::notice title=verbatra::1 more error and 2 more warnings not annotated");
  });

  it("caps translate annotations per step too", () => {
    const locales = Array.from({ length: 12 }, (_, index) =>
      locale({ locale: `l${index}`, status: "failed", error: { code: "X", message: "y" } }),
    );
    const report = buildReport(summary({ locales, failed: locales.map((l) => l.locale) }), 1);
    expect(report.annotations).toHaveLength(11);
    expect(report.annotations[10]).toContain("2 more errors not annotated");
  });

  it("the findings table is the full view, capped only as a guard on the summary size", () => {
    const warnings = Array.from({ length: 1005 }, (_, index) => ({
      key: `w${index}`,
      severity: "warning",
      reason: "UNTRANSLATED",
    }));
    const summaryText = buildReport(qaResult([["de", warnings]]), 0, "", "check").summary;
    expect(summaryText).toContain("| de | w999 | warning | UNTRANSLATED |  |");
    expect(summaryText).not.toContain("| de | w1000 |");
    expect(summaryText).toContain("and 5 more. Run verbatra check --qa locally for the full list.");
  });

  it("names the source keys the quality check skipped for invalid ICU", () => {
    const result = qaResult([["de", []]]);
    const summaryText = buildReport(
      { ...result, qa: { ...result.qa, invalidSourceKeys: ["broken", "also|broken"] } },
      0,
      "",
      "check",
    ).summary;
    expect(summaryText).toContain(
      "Source keys the quality check skipped because the source is not valid ICU: broken, also\\|broken",
    );
    expect(summaryText).not.toContain("Quality findings:");
  });

  it("a clean quality check renders totals and nothing else", () => {
    const report = buildReport(qaResult([["de", []]]), 0, "", "check");
    expect(report.annotations).toEqual([]);
    expect(report.summary).toContain("quality check: 0 errors, 0 warnings");
    expect(report.summary).not.toContain("Quality findings:");
  });

  it("a locale missing its own qa block renders zero counts rather than crashing", () => {
    const summaryText = buildReport(
      checkResult({
        locales: [checkLocale()],
        qa: { errors: 0, warnings: 0 },
      }),
      0,
      "",
      "check",
    ).summary;
    expect(summaryText).toContain("| de | in sync | 0 | 0 | 2 | 0 | 0 |");
  });

  it("an untrusted key, reason, or detail cannot forge a workflow command or break the table", () => {
    const hostile = {
      key: "k|1\n::stop-commands::x",
      severity: "error",
      reason: "icu:x,y",
      details: ["a|b\n## Forged heading"],
    };
    const report = buildReport(qaResult([["de:1", [hostile]]]), 1, "", "check");
    expect(report.annotations).toEqual([
      "::error title=verbatra qa%3A de%3A1::[icu:x,y] k|1%0A::stop-commands::x (a|b%0A## Forged heading)",
    ]);
    const headings = report.summary.split("\n").filter((line) => line.startsWith("#"));
    expect(headings).toEqual(["## verbatra check summary"]);
    expect(report.summary).toContain(
      "| de:1 | k\\|1 ::stop-commands::x | error | icu:x,y | a\\|b ## Forged heading |",
    );
  });
});

describe("buildReport: translate exit 3 is work for a person, not a failure", () => {
  function humanOnlyRun() {
    return summary({
      locales: [
        locale({ locale: "de", unfilled: ["a", "b"], protected: [], unchanged: ["c"] }),
        locale({ locale: "fr", unfilled: [], protected: [{ key: "legal", reason: "pinned" }] }),
        locale({ locale: "es", unfilled: [], protected: [] }),
      ],
      succeeded: ["de", "fr", "es"],
    });
  }

  it("passes the step, reports needsHuman, and warns once per locale with keys left", () => {
    const report = buildReport(humanOnlyRun(), NEEDS_HUMAN_EXIT_CODE, "", "translate");
    expect(report.exitStatus).toBe(0);
    expect(report.needsHuman).toBe(true);
    expect(report.annotations).toEqual([
      "::warning title=verbatra%3A de::[NEEDS_HUMAN] 2 keys need a human translation (unfilled: a, b)",
      "::warning title=verbatra%3A fr::[NEEDS_HUMAN] 1 key needs a human translation (protected: legal)",
    ]);
  });

  it("the summary says why the step passed and lists what is left for a person", () => {
    const text = buildReport(humanOnlyRun(), 3, "", "translate").summary;
    expect(text).toContain("3 locales: 3 succeeded, 0 partial, 0 failed");
    expect(text).toContain(
      "Step passed with work left for a person: machine translation is disabled by policy, so translate exited 3.",
    );
    expect(text).toContain(
      [
        "Needs a human translation:",
        "- de: 2 keys need a human translation (unfilled: a, b)",
        "- fr: 1 key needs a human translation (protected: legal)",
      ].join("\n"),
    );
    expect(text).not.toContain("- es:");
  });

  it("the default command is translate, so a missing command argument gets the same treatment", () => {
    expect(buildReport(humanOnlyRun(), 3).exitStatus).toBe(0);
  });

  it("any other exit code reports needsHuman false and adds no human-work section", () => {
    const report = buildReport(humanOnlyRun(), 0, "", "translate");
    expect(report.needsHuman).toBe(false);
    expect(report.annotations).toEqual([]);
    expect(report.summary).not.toContain("Needs a human translation");
  });

  it("exit 3 from check or diff is not reinterpreted: it still fails the step", () => {
    const check = buildReport(checkResult({ locales: [checkLocale()] }), 3, "", "check");
    expect(check.exitStatus).toBe(3);
    expect(check.needsHuman).toBe(false);
    const diff = buildReport(diffResult({ locales: [diffLocale()] }), 3, "", "diff");
    expect(diff.exitStatus).toBe(3);
  });

  it("exit 3 with no parseable summary is a whole-run failure, not a pass", () => {
    const report = buildReport(null, 3, "", "translate");
    expect(report.exitStatus).toBe(3);
    expect(report.needsHuman).toBe(false);
    expect(report.annotations[0]).toContain("[VERBATRA_FAILED]");
  });

  it("a summary from a CLI without unfilled or protected lists still passes the step", () => {
    const report = buildReport(summary({ locales: [locale()] }), 3, "", "translate");
    expect(report.exitStatus).toBe(0);
    expect(report.annotations).toEqual([]);
  });

  it("an untrusted key cannot forge a workflow command or break the list", () => {
    const s = summary({
      locales: [locale({ locale: "de", unfilled: ["x|y\n::stop-commands::z"] })],
    });
    const report = buildReport(s, 3, "", "translate");
    expect(report.annotations[0]).toContain("unfilled: x|y%0A::stop-commands::z");
    expect(report.summary).toContain("- de: 1 key needs a human translation (unfilled: x\\|y ::stop-commands::z)");
  });
});
