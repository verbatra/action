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

function errorAnnotation(title, code, message) {
  return `::error title=${escapeProperty(title)}::${escapeData(`[${code}] ${message}`)}`;
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

function resolveLocaleError(entry) {
  return {
    code: entry.error?.code ?? "LOCALE_FAILED",
    message: entry.error?.message ?? "locale failed",
  };
}

function countsRow(entry) {
  const status = entry.status === "failed" ? "failed" : "ok";
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
  const aggregate = `${summary.locales.length} locales: ${summary.succeeded.length} succeeded, ${summary.failed.length} failed${
    summary.dryRun ? " (dry run: nothing written)" : ""
  }`;
  const lines = [heading, "", head, sep, ...rows, "", aggregate];

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

export function buildReport(summary, exitCode, stderrText = "") {
  const exitStatus = exitCode;

  if (summary === null) {
    const annotations = exitCode !== 0 ? [wholeRunAnnotation(exitCode, stderrText)] : [];
    return { annotations, summary: wholeRunMarkdown(exitCode, stderrText), exitStatus };
  }

  const annotations =
    exitCode === 1
      ? summary.locales
          .filter((locale) => locale.status === "failed")
          .map((locale) => {
            const { code, message } = resolveLocaleError(locale);
            return errorAnnotation(`verbatra: ${locale.locale}`, code, message);
          })
      : [];
  return { annotations, summary: summaryMarkdown(summary), exitStatus };
}
