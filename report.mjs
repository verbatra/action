function escapeData(value) {
  return String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProperty(value) {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function escapeMarkdown(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r\n|\r|\n/g, " ");
}

function annotation(level, title, code, message) {
  return `::${level} title=${escapeProperty(title)}::${escapeData(`[${code}] ${message}`)}`;
}

function errorAnnotation(title, code, message) {
  return annotation("error", title, code, message);
}

function unwrapSummaryEnvelope(record) {
  if (record === null || typeof record !== "object" || typeof record.ok !== "boolean") {
    return record;
  }
  return record.ok ? (record.result ?? null) : null;
}

export function parseSummaryJson(stdout) {
  const trimmed = String(stdout ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  try {
    return unwrapSummaryEnvelope(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

export function extractCliError(stderrText) {
  const match = String(stderrText ?? "").match(/error \[([^\]]+)\] (.*)/);
  if (match === null) {
    return null;
  }
  return { code: match[1], message: match[2].trim() };
}

export const WIRING_FAILURE_EXIT_CODE = 2;

export function resolveExitCode(exitCodeArg) {
  const parsed = Number.parseInt(exitCodeArg ?? "", 10);
  return Number.isNaN(parsed) ? WIRING_FAILURE_EXIT_CODE : parsed;
}

const KEY_PREVIEW_LIMIT = 10;

function previewKeys(keys, escape) {
  const shown = keys.slice(0, KEY_PREVIEW_LIMIT).map((key) => escape(key));
  const remaining = keys.length - shown.length;
  return remaining > 0 ? `${shown.join(", ")}, and ${remaining} more` : shown.join(", ");
}

function withheldGroups(entry) {
  return [
    ["integrity", entry.integrityMismatches],
    ["provider failure", entry.providerFailures],
    ["budget", entry.budgetWithheld ?? []],
  ].filter(([, keys]) => keys.length > 0);
}

function withheldDetail(entry, escape = String) {
  const groups = withheldGroups(entry);
  const total = groups.reduce((count, [, keys]) => count + keys.length, 0);
  if (total === 0) {
    return null;
  }
  const parts = groups.map(([label, keys]) => `${label}: ${previewKeys(keys, escape)}`);
  return `${total} ${total === 1 ? "key" : "keys"} withheld (${parts.join("; ")})`;
}

function resolveLocaleError(entry) {
  return {
    code: entry.error?.code ?? "LOCALE_FAILED",
    message: entry.error?.message ?? withheldDetail(entry) ?? "locale failed",
  };
}

function partialDetail(entry, escape = String) {
  const withheld = withheldDetail(entry, escape) ?? "0 keys withheld";
  return `${entry.translated.length} translated, ${withheld}`;
}

function countsRow(entry) {
  const status = entry.status === "failed" || entry.status === "partial" ? entry.status : "ok";
  return `| ${escapeMarkdown(entry.locale)} | ${status} | ${entry.translated.length} | ${entry.unchanged.length} | ${entry.orphaned.length} | ${entry.invalidIcuSource.length} | ${entry.integrityMismatches.length} | ${entry.providerFailures.length} | ${entry.notices.length} |`;
}

function summaryMarkdown(summary) {
  const heading = summary.dryRun
    ? "## verbatra translation summary (dry run)"
    : "## verbatra translation summary";
  const head =
    "| locale | status | translated | unchanged | orphaned | invalid ICU | integrity withheld | provider failures | notices |";
  const sep = "| --- | --- | --- | --- | --- | --- | --- | --- | --- |";
  const rows = summary.locales.map(countsRow);
  const partialCount = (summary.partial ?? []).length;
  const aggregate = `${summary.locales.length} locales: ${summary.succeeded.length} succeeded, ${partialCount} partial, ${summary.failed.length} failed${
    summary.dryRun ? " (dry run: nothing written)" : ""
  }`;
  const lines = [heading, "", head, sep, ...rows, "", aggregate];

  const partialLocales = summary.locales.filter((locale) => locale.status === "partial");
  if (partialLocales.length > 0) {
    lines.push("", "Partial locales, written with keys still missing:");
    for (const locale of partialLocales) {
      lines.push(`- ${escapeMarkdown(locale.locale)}: ${partialDetail(locale, escapeMarkdown)}`);
    }
  }

  const failedLocales = summary.locales.filter((locale) => locale.status === "failed");
  if (failedLocales.length > 0) {
    lines.push("", "Failed locales:");
    for (const locale of failedLocales) {
      const { code, message } = resolveLocaleError(locale);
      lines.push(
        `- ${escapeMarkdown(locale.locale)}: [${escapeMarkdown(code)}] ${escapeMarkdown(message)}`,
      );
    }
  }
  return lines.join("\n");
}

function driftDetail(entry) {
  return `${entry.missing} missing, ${entry.stale} stale`;
}

const QA_SUMMARY_LIMIT = 1000;

function qaFindings(result) {
  const findings = result.locales.flatMap((entry) =>
    (entry.qa?.findings ?? []).map((finding) => ({ locale: entry.locale, finding })),
  );
  return [
    ...findings.filter(({ finding }) => finding.severity === "error"),
    ...findings.filter(({ finding }) => finding.severity !== "error"),
  ];
}

function findingLevel(finding) {
  return finding.severity === "error" ? "error" : "warning";
}

function findingDetails(finding, escape = String) {
  return Array.isArray(finding.details) ? finding.details.map(escape).join(", ") : "";
}

function findingMessage(finding) {
  const details = findingDetails(finding);
  return details === "" ? finding.key : `${finding.key} (${details})`;
}

function qaAnnotations(result) {
  return qaFindings(result).map(({ locale, finding }) =>
    annotation(
      findingLevel(finding),
      `verbatra qa: ${locale}`,
      finding.reason,
      findingMessage(finding),
    ),
  );
}

function qaFindingRow({ locale, finding }) {
  return `| ${escapeMarkdown(locale)} | ${escapeMarkdown(finding.key)} | ${findingLevel(finding)} | ${escapeMarkdown(finding.reason)} | ${findingDetails(finding, escapeMarkdown)} |`;
}

function qaFindingLines(result) {
  const findings = qaFindings(result);
  if (findings.length === 0) {
    return [];
  }
  const lines = [
    "",
    "Quality findings:",
    "",
    "| locale | key | severity | reason | details |",
    "| --- | --- | --- | --- | --- |",
    ...findings.slice(0, QA_SUMMARY_LIMIT).map(qaFindingRow),
  ];
  const omitted = findings.length - QA_SUMMARY_LIMIT;
  if (omitted > 0) {
    lines.push(
      "",
      `and ${omitted} more. Run verbatra check --qa locally for the full list.`,
    );
  }
  return lines;
}

function qaSkippedSourceLines(qa) {
  const skipped = qa.invalidSourceKeys ?? [];
  if (skipped.length === 0) {
    return [];
  }
  return [
    "",
    `Source keys the quality check skipped because the source is not valid ICU: ${previewKeys(skipped, escapeMarkdown)}`,
  ];
}

function qaFailedStep(qa, qaStrict) {
  return qa.errors > 0 || (qaStrict && qa.warnings > 0);
}

function qaFailureLines(qa, exitCode, qaStrict) {
  if (exitCode === 0 || !qaFailedStep(qa, qaStrict)) {
    return [];
  }
  const found = qaStrict
    ? `${qa.errors} errors and ${qa.warnings} warnings`
    : `${qa.errors} errors`;
  const rule = qaStrict
    ? "check --qa with qa-strict exits 1 on any error or warning."
    : "check --qa exits 1 on any error.";
  return ["", `Step failed: the quality check found ${found}. ${rule}`];
}

function qaMarkdownLines(result, exitCode, qaStrict) {
  if (result.qa === undefined) {
    return [];
  }
  return [
    ...qaFailureLines(result.qa, exitCode, qaStrict),
    ...qaFindingLines(result),
    ...qaSkippedSourceLines(result.qa),
  ];
}

function checkRow(entry, withQa) {
  const status = entry.inSync ? "in sync" : "drifted";
  const qaCells = withQa ? ` ${entry.qa?.errors ?? 0} | ${entry.qa?.warnings ?? 0} |` : "";
  return `| ${escapeMarkdown(entry.locale)} | ${status} | ${entry.missing} | ${entry.stale} | ${entry.upToDate} |${qaCells}`;
}

function checkTable(result) {
  const withQa = result.qa !== undefined;
  return [
    withQa
      ? "| locale | status | missing | stale | up to date | qa errors | qa warnings |"
      : "| locale | status | missing | stale | up to date |",
    withQa ? "| --- | --- | --- | --- | --- | --- | --- |" : "| --- | --- | --- | --- | --- |",
    ...result.locales.map((entry) => checkRow(entry, withQa)),
  ];
}

function checkAggregate(result, drifted) {
  const counts = `${result.locales.length} locales: ${result.locales.length - drifted.length} in sync, ${drifted.length} drifted`;
  return result.qa === undefined
    ? counts
    : `${counts}; quality check: ${result.qa.errors} errors, ${result.qa.warnings} warnings`;
}

function checkMarkdown(result, exitCode, options = {}) {
  const drifted = result.locales.filter((entry) => !entry.inSync);
  const lines = [
    "## verbatra check summary",
    "",
    ...checkTable(result),
    "",
    checkAggregate(result, drifted),
  ];
  if (exitCode !== 0 && drifted.length > 0) {
    lines.push(
      "",
      `Step failed: ${drifted.length} of ${result.locales.length} locales drifted from the source. check exits 1 when a locale has missing or stale keys.`,
      "",
      "Drifted locales:",
      ...drifted.map((entry) => `- ${escapeMarkdown(entry.locale)}: ${driftDetail(entry)}`),
    );
  }
  lines.push(...qaMarkdownLines(result, exitCode, options.qaStrict === true));
  return lines.join("\n");
}

function driftAnnotations(result, exitCode) {
  if (exitCode === 0) {
    return [];
  }
  return result.locales
    .filter((entry) => !entry.inSync)
    .map((entry) =>
      errorAnnotation(`verbatra check: ${entry.locale}`, "LOCALE_DRIFTED", driftDetail(entry)),
    );
}

function checkAnnotations(result, exitCode) {
  return [...driftAnnotations(result, exitCode), ...qaAnnotations(result)];
}

function pendingDetail(entry, escape = String) {
  const parts = [];
  if (entry.missing.length > 0) {
    parts.push(`missing: ${previewKeys(entry.missing, escape)}`);
  }
  if (entry.changed.length > 0) {
    parts.push(`changed: ${previewKeys(entry.changed, escape)}`);
  }
  return parts.join("; ");
}

function diffRow(entry) {
  const status = entry.hasPendingChanges ? "pending" : "clean";
  return `| ${escapeMarkdown(entry.locale)} | ${status} | ${entry.missing.length} | ${entry.changed.length} | ${entry.orphaned.length} |`;
}

function orphanLines(result) {
  const orphaned = result.locales.filter((entry) => entry.orphaned.length > 0);
  if (orphaned.length === 0) {
    return [];
  }
  return [
    "",
    "Orphaned keys, reported but not a failure:",
    ...orphaned.map(
      (entry) =>
        `- ${escapeMarkdown(entry.locale)}: ${previewKeys(entry.orphaned, escapeMarkdown)}`,
    ),
  ];
}

function diffMarkdown(result, exitCode) {
  const pending = result.locales.filter((entry) => entry.hasPendingChanges);
  const lines = [
    "## verbatra diff summary",
    "",
    "| locale | status | missing | changed | orphaned |",
    "| --- | --- | --- | --- | --- |",
    ...result.locales.map(diffRow),
    "",
    `${result.locales.length} locales: ${result.locales.length - pending.length} clean, ${pending.length} pending`,
  ];
  if (exitCode !== 0 && pending.length > 0) {
    lines.push(
      "",
      `Step failed: ${pending.length} of ${result.locales.length} locales have pending changes. diff exits 1 when a locale has missing or changed keys.`,
      "",
      "Pending locales:",
      ...pending.map(
        (entry) => `- ${escapeMarkdown(entry.locale)}: ${pendingDetail(entry, escapeMarkdown)}`,
      ),
    );
  }
  lines.push(...orphanLines(result));
  return lines.join("\n");
}

function diffAnnotations(result, exitCode) {
  if (exitCode === 0) {
    return [];
  }
  return result.locales
    .filter((entry) => entry.hasPendingChanges)
    .map((entry) =>
      errorAnnotation(`verbatra diff: ${entry.locale}`, "LOCALE_PENDING", pendingDetail(entry)),
    );
}

export const NEEDS_HUMAN_EXIT_CODE = 3;

function needsHumanGroups(entry) {
  return [
    ["unfilled", entry.unfilled ?? []],
    ["protected", (entry.protected ?? []).map((item) => item.key)],
  ].filter(([, keys]) => keys.length > 0);
}

function needsHumanDetail(entry, escape = String) {
  const groups = needsHumanGroups(entry);
  const total = groups.reduce((count, [, keys]) => count + keys.length, 0);
  if (total === 0) {
    return null;
  }
  const parts = groups.map(([label, keys]) => `${label}: ${previewKeys(keys, escape)}`);
  const verb = total === 1 ? "key needs" : "keys need";
  return `${total} ${verb} a human translation (${parts.join("; ")})`;
}

function needsHumanAnnotations(result) {
  return result.locales.flatMap((entry) => {
    const detail = needsHumanDetail(entry);
    return detail === null
      ? []
      : [annotation("warning", `verbatra: ${entry.locale}`, "NEEDS_HUMAN", detail)];
  });
}

function needsHumanLines(result) {
  const locales = result.locales.filter((entry) => needsHumanDetail(entry) !== null);
  return [
    "",
    `Step passed with work left for a person: machine translation is disabled by policy, so translate exited ${NEEDS_HUMAN_EXIT_CODE}. The action reports that as a warning, not a failure. Hand the keys off with verbatra export.`,
    "",
    "Needs a human translation:",
    ...locales.map(
      (entry) => `- ${escapeMarkdown(entry.locale)}: ${needsHumanDetail(entry, escapeMarkdown)}`,
    ),
  ];
}

function translateMarkdown(result, exitCode) {
  const markdown = summaryMarkdown(result);
  return exitCode === NEEDS_HUMAN_EXIT_CODE
    ? [markdown, ...needsHumanLines(result)].join("\n")
    : markdown;
}

function translateAnnotations(result, exitCode) {
  if (exitCode === NEEDS_HUMAN_EXIT_CODE) {
    return needsHumanAnnotations(result);
  }
  if (exitCode !== 1) {
    return [];
  }
  return result.locales.flatMap((entry) => {
    if (entry.status === "failed") {
      const { code, message } = resolveLocaleError(entry);
      return [errorAnnotation(`verbatra: ${entry.locale}`, code, message)];
    }
    if (entry.status === "partial") {
      return [
        errorAnnotation(`verbatra: ${entry.locale}`, "LOCALE_PARTIAL", partialDetail(entry)),
      ];
    }
    return [];
  });
}

const RENDERERS = {
  translate: { annotations: translateAnnotations, markdown: translateMarkdown },
  check: { annotations: checkAnnotations, markdown: checkMarkdown },
  diff: { annotations: diffAnnotations, markdown: diffMarkdown },
};

function resolveRenderer(command) {
  return Object.hasOwn(RENDERERS, command) ? RENDERERS[command] : RENDERERS.translate;
}

function resolveWholeRunError(stderrText, genericMessage) {
  const cliError = extractCliError(stderrText);
  const fallback = String(stderrText ?? "").trim() || genericMessage;
  return { cliError, fallback };
}

function wholeRunAnnotation(exitCode, stderrText) {
  const { cliError, fallback } = resolveWholeRunError(
    stderrText,
    `The verbatra run failed (exit ${exitCode}).`,
  );
  return errorAnnotation(
    "verbatra",
    cliError?.code ?? "VERBATRA_FAILED",
    cliError?.message ?? fallback,
  );
}

function wholeRunMarkdown(exitCode, stderrText) {
  const { cliError, fallback } = resolveWholeRunError(
    stderrText,
    `The run could not complete (exit ${exitCode}).`,
  );
  const detail = cliError
    ? `[${escapeMarkdown(cliError.code)}] ${escapeMarkdown(cliError.message)}`
    : escapeMarkdown(fallback);
  return [
    "## verbatra run failed",
    "",
    `The verbatra run could not complete (exit ${exitCode}).`,
    "",
    detail,
  ].join("\n");
}

export const ANNOTATION_LIMIT_PER_LEVEL = 10;

function annotationLevel(line) {
  return line.match(/^::([a-z]+)/)[1];
}

function omittedPhrase(level, count) {
  return `${count} more ${level}${count === 1 ? "" : "s"}`;
}

function capAnnotations(annotations) {
  const seen = new Map();
  const kept = annotations.filter((line) => {
    const level = annotationLevel(line);
    const count = (seen.get(level) ?? 0) + 1;
    seen.set(level, count);
    return count <= ANNOTATION_LIMIT_PER_LEVEL;
  });
  const omitted = [...seen]
    .filter(([, count]) => count > ANNOTATION_LIMIT_PER_LEVEL)
    .map(([level, count]) => omittedPhrase(level, count - ANNOTATION_LIMIT_PER_LEVEL));
  if (omitted.length === 0) {
    return kept;
  }
  return [
    ...kept,
    `::notice title=verbatra::${omitted.join(" and ")} not annotated, because GitHub shows at most ${ANNOTATION_LIMIT_PER_LEVEL} annotations of each severity per step. The job summary lists them all.`,
  ];
}

export function buildReport(
  summary,
  exitCode,
  stderrText = "",
  command = "translate",
  options = {},
) {
  if (summary === null) {
    const annotations = exitCode !== 0 ? [wholeRunAnnotation(exitCode, stderrText)] : [];
    return {
      annotations,
      summary: wholeRunMarkdown(exitCode, stderrText),
      exitStatus: exitCode,
      needsHuman: false,
    };
  }

  const renderer = resolveRenderer(command);
  const needsHuman = renderer === RENDERERS.translate && exitCode === NEEDS_HUMAN_EXIT_CODE;
  return {
    annotations: capAnnotations(renderer.annotations(summary, exitCode)),
    summary: renderer.markdown(summary, exitCode, options),
    exitStatus: needsHuman ? 0 : exitCode,
    needsHuman,
  };
}
