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

const KEY_PREVIEW_LIMIT = 10;

function previewKeys(keys, escape) {
  const shown = keys.slice(0, KEY_PREVIEW_LIMIT).map((key) => escape(key));
  const remaining = keys.length - shown.length;
  return remaining > 0 ? `${shown.join(", ")}, and ${remaining} more` : shown.join(", ");
}

function driftDetail(entry) {
  return `${entry.missing} missing, ${entry.stale} stale`;
}

function checkRow(entry) {
  const status = entry.inSync ? "in sync" : "drifted";
  return `| ${escapeMarkdown(entry.locale)} | ${status} | ${entry.missing} | ${entry.stale} | ${entry.upToDate} |`;
}

function checkMarkdown(result, exitCode) {
  const drifted = result.locales.filter((entry) => !entry.inSync);
  const lines = [
    "## verbatra check summary",
    "",
    "| locale | status | missing | stale | up to date |",
    "| --- | --- | --- | --- | --- |",
    ...result.locales.map(checkRow),
    "",
    `${result.locales.length} locales: ${result.locales.length - drifted.length} in sync, ${drifted.length} drifted`,
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
  return lines.join("\n");
}

function checkAnnotations(result, exitCode) {
  if (exitCode === 0) {
    return [];
  }
  return result.locales
    .filter((entry) => !entry.inSync)
    .map((entry) =>
      errorAnnotation(`verbatra check: ${entry.locale}`, "LOCALE_DRIFTED", driftDetail(entry)),
    );
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

function translateAnnotations(result, exitCode) {
  if (exitCode !== 1) {
    return [];
  }
  return result.locales
    .filter((entry) => entry.status === "failed")
    .map((entry) => {
      const { code, message } = resolveLocaleError(entry);
      return errorAnnotation(`verbatra: ${entry.locale}`, code, message);
    });
}

const RENDERERS = {
  translate: { annotations: translateAnnotations, markdown: (result) => summaryMarkdown(result) },
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

export function buildReport(summary, exitCode, stderrText = "", command = "translate") {
  const exitStatus = exitCode;

  if (summary === null) {
    const annotations = exitCode !== 0 ? [wholeRunAnnotation(exitCode, stderrText)] : [];
    return { annotations, summary: wholeRunMarkdown(exitCode, stderrText), exitStatus };
  }

  const renderer = resolveRenderer(command);
  return {
    annotations: renderer.annotations(summary, exitCode),
    summary: renderer.markdown(summary, exitCode),
    exitStatus,
  };
}
