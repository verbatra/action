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

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function annotationProperties(title, file) {
  const titleProperty = `title=${escapeProperty(title)}`;
  return file === undefined ? titleProperty : `file=${escapeProperty(file)},${titleProperty}`;
}

function annotation(level, title, code, message, file) {
  return `::${level} ${annotationProperties(title, file)}::${escapeData(`[${code}] ${message}`)}`;
}

function errorAnnotation(title, code, message, file) {
  return annotation("error", title, code, message, file);
}

function localeFile(options, locale) {
  const files = options.localeFiles;
  if (files === null || typeof files !== "object" || !Object.hasOwn(files, locale)) {
    return undefined;
  }
  const file = files[locale];
  return typeof file === "string" && file !== "" ? file : undefined;
}

export function parseLocaleFiles(text) {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") {
    return {};
  }
  let record;
  try {
    record = JSON.parse(trimmed);
  } catch {
    return {};
  }
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record).filter(([, file]) => typeof file === "string" && file !== ""),
  );
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

function optionalString(value) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function parseErrorEnvelope(stdout) {
  const trimmed = String(stdout ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  let record;
  try {
    record = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (record === null || typeof record !== "object" || record.ok !== false) {
    return null;
  }
  if (typeof record.code !== "string" || record.code === "") {
    return null;
  }
  return {
    code: record.code,
    message: String(record.message ?? ""),
    causeCode: optionalString(record.causeCode),
    hint: optionalString(record.hint),
  };
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
  return `${plural(total, "key")} withheld (${parts.join("; ")})`;
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
  const aggregate = `${plural(summary.locales.length, "locale")}: ${summary.succeeded.length} succeeded, ${partialCount} partial, ${summary.failed.length} failed${
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

function qaAnnotations(result, options) {
  return qaFindings(result).map(({ locale, finding }) =>
    annotation(
      findingLevel(finding),
      `verbatra qa: ${locale}`,
      finding.reason,
      findingMessage(finding),
      localeFile(options, locale),
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

function incompletePluralCount(result) {
  return result.locales.reduce((total, entry) => total + (entry.incompletePlurals ?? []).length, 0);
}

function qaFailedStep(qa, plurals, qaStrict) {
  return qa.errors > 0 || (qaStrict && (qa.warnings > 0 || plurals > 0));
}

function qaFailureLines(result, exitCode, qaStrict) {
  const qa = result.qa;
  const plurals = incompletePluralCount(result);
  if (exitCode === 0 || !qaFailedStep(qa, plurals, qaStrict)) {
    return [];
  }
  const found = qaStrict
    ? `${plural(qa.errors, "error")}, ${plural(qa.warnings, "warning")}, and ${plural(plurals, "incomplete plural")}`
    : plural(qa.errors, "error");
  const rule = qaStrict
    ? "check --qa with qa-strict exits 1 on any error, warning, or incomplete plural."
    : "check --qa exits 1 on any error.";
  return ["", `Step failed: the quality check found ${found}. ${rule}`];
}

function qaMarkdownLines(result, exitCode, qaStrict) {
  if (result.qa === undefined) {
    return [];
  }
  return [
    ...qaFailureLines(result, exitCode, qaStrict),
    ...qaFindingLines(result),
    ...qaSkippedSourceLines(result.qa),
  ];
}

function pluralDetail(plural) {
  const argument = typeof plural.argument === "string" ? ` {${plural.argument}}` : "";
  return `${plural.key}${argument} (missing ${(plural.missing ?? []).join(", ")})`;
}

function incompletePluralLocales(result) {
  return result.locales.filter((entry) => (entry.incompletePlurals ?? []).length > 0);
}

function incompletePluralMessage(entry, escape = String) {
  const plurals = entry.incompletePlurals;
  const noun = plural(plurals.length, "plural lacks", "plurals lack");
  const details = previewKeys(plurals.map(pluralDetail), escape);
  return `${noun} CLDR plural categories the language uses: ${details}`;
}

function incompletePluralAnnotations(result, options) {
  return incompletePluralLocales(result).map((entry) =>
    annotation(
      "warning",
      `verbatra check: ${entry.locale}`,
      "PLURAL_CATEGORIES_INCOMPLETE",
      incompletePluralMessage(entry),
      localeFile(options, entry.locale),
    ),
  );
}

function incompletePluralLines(result) {
  const locales = incompletePluralLocales(result);
  if (locales.length === 0) {
    return [];
  }
  return [
    "",
    "Plurals missing CLDR categories, a warning that fails the step only with qa-strict:",
    ...locales.map(
      (entry) =>
        `- ${escapeMarkdown(entry.locale)}: ${incompletePluralMessage(entry, escapeMarkdown)}`,
    ),
  ];
}

const REVIEW_STATE_UNREADABLE = "REVIEW_STATE_UNREADABLE";

function reviewFailed(result) {
  return result.review !== undefined && result.review.reviewed === false;
}

function unreviewedLocales(result) {
  return result.locales.filter((entry) => (entry.review?.unreviewed ?? []).length > 0);
}

function unreviewedPhrase(count) {
  return `${count} machine-written ${count === 1 ? "translation is" : "translations are"} not approved`;
}

function unreviewedMessage(entry, escape = String) {
  const keys = entry.review.unreviewed;
  return `${unreviewedPhrase(keys.length)}: ${previewKeys(keys, escape)}`;
}

const UNREADABLE_REVIEW_MESSAGE =
  "verbatra.provenance.json is corrupt or was written by a newer verbatra, so no review decision can be read and the review gate fails.";

function reviewAnnotations(result, options) {
  if (!reviewFailed(result)) {
    return [];
  }
  if (result.review.code === REVIEW_STATE_UNREADABLE) {
    return [errorAnnotation("verbatra review", REVIEW_STATE_UNREADABLE, UNREADABLE_REVIEW_MESSAGE)];
  }
  const code = result.review.code ?? "REVIEW_REQUIRED";
  return unreviewedLocales(result).map((entry) =>
    errorAnnotation(
      `verbatra review: ${entry.locale}`,
      code,
      unreviewedMessage(entry),
      localeFile(options, entry.locale),
    ),
  );
}

function reviewMarkdownLines(result) {
  if (!reviewFailed(result)) {
    return [];
  }
  if (result.review.code === REVIEW_STATE_UNREADABLE) {
    return ["", `Step failed: [${REVIEW_STATE_UNREADABLE}] ${UNREADABLE_REVIEW_MESSAGE}`];
  }
  const code = escapeMarkdown(result.review.code ?? "REVIEW_REQUIRED");
  return [
    "",
    `Step failed: [${code}] ${unreviewedPhrase(result.review.unreviewed)} in verbatra.provenance.json. check --require-reviewed exits 1 until a person approves each one.`,
    "",
    "Unreviewed translations:",
    ...unreviewedLocales(result).map(
      (entry) => `- ${escapeMarkdown(entry.locale)}: ${unreviewedMessage(entry, escapeMarkdown)}`,
    ),
  ];
}

function checkColumns(result) {
  const columns = [
    ["locale", (entry) => escapeMarkdown(entry.locale)],
    ["status", (entry) => (entry.inSync ? "in sync" : "drifted")],
    ["missing", (entry) => entry.missing],
    ["stale", (entry) => entry.stale],
    ["up to date", (entry) => entry.upToDate],
  ];
  if (result.qa !== undefined) {
    columns.push(
      ["qa errors", (entry) => entry.qa?.errors ?? 0],
      ["qa warnings", (entry) => entry.qa?.warnings ?? 0],
    );
  }
  if (result.review !== undefined) {
    columns.push(["unreviewed", (entry) => (entry.review?.unreviewed ?? []).length]);
  }
  return columns;
}

function tableRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

function checkTable(result) {
  const columns = checkColumns(result);
  return [
    tableRow(columns.map(([label]) => label)),
    tableRow(columns.map(() => "---")),
    ...result.locales.map((entry) => tableRow(columns.map(([, cell]) => cell(entry)))),
  ];
}

function reviewAggregate(review) {
  return review.reviewed
    ? "review: every machine-written translation approved"
    : `review: ${review.unreviewed} unreviewed`;
}

function checkAggregate(result, drifted) {
  const parts = [
    `${plural(result.locales.length, "locale")}: ${result.locales.length - drifted.length} in sync, ${drifted.length} drifted`,
  ];
  if (result.qa !== undefined) {
    parts.push(
      `quality check: ${plural(result.qa.errors, "error")}, ${plural(result.qa.warnings, "warning")}`,
    );
  }
  if (result.review !== undefined) {
    parts.push(reviewAggregate(result.review));
  }
  return parts.join("; ");
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
      `Step failed: ${drifted.length} of ${plural(result.locales.length, "locale")} drifted from the source. check exits 1 when a locale has missing or stale keys.`,
      "",
      "Drifted locales:",
      ...drifted.map((entry) => `- ${escapeMarkdown(entry.locale)}: ${driftDetail(entry)}`),
    );
  }
  lines.push(
    ...reviewMarkdownLines(result),
    ...qaMarkdownLines(result, exitCode, options.qaStrict === true),
    ...incompletePluralLines(result),
  );
  return lines.join("\n");
}

function driftAnnotations(result, exitCode, options) {
  if (exitCode === 0) {
    return [];
  }
  return result.locales
    .filter((entry) => !entry.inSync)
    .map((entry) =>
      errorAnnotation(
        `verbatra check: ${entry.locale}`,
        "LOCALE_DRIFTED",
        driftDetail(entry),
        localeFile(options, entry.locale),
      ),
    );
}

function checkAnnotations(result, exitCode, options) {
  return [
    ...driftAnnotations(result, exitCode, options),
    ...reviewAnnotations(result, options),
    ...qaAnnotations(result, options),
    ...incompletePluralAnnotations(result, options),
  ];
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
    `${plural(result.locales.length, "locale")}: ${result.locales.length - pending.length} clean, ${pending.length} pending`,
  ];
  if (exitCode !== 0 && pending.length > 0) {
    lines.push(
      "",
      `Step failed: ${pending.length} of ${plural(result.locales.length, "locale")} ${pending.length === 1 ? "has" : "have"} pending changes. diff exits 1 when a locale has missing or changed keys.`,
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

function diffAnnotations(result, exitCode, options) {
  if (exitCode === 0) {
    return [];
  }
  return result.locales
    .filter((entry) => entry.hasPendingChanges)
    .map((entry) =>
      errorAnnotation(
        `verbatra diff: ${entry.locale}`,
        "LOCALE_PENDING",
        pendingDetail(entry),
        localeFile(options, entry.locale),
      ),
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
  return `${plural(total, "key needs", "keys need")} a human translation (${parts.join("; ")})`;
}

function needsHumanAnnotations(result, options) {
  return result.locales.flatMap((entry) => {
    const detail = needsHumanDetail(entry);
    return detail === null
      ? []
      : [
          annotation(
            "warning",
            `verbatra: ${entry.locale}`,
            "NEEDS_HUMAN",
            detail,
            localeFile(options, entry.locale),
          ),
        ];
  });
}

function needsHumanListLines(result) {
  const locales = result.locales.filter((entry) => needsHumanDetail(entry) !== null);
  if (locales.length === 0) {
    return [];
  }
  return [
    "",
    "Needs a human translation:",
    ...locales.map(
      (entry) => `- ${escapeMarkdown(entry.locale)}: ${needsHumanDetail(entry, escapeMarkdown)}`,
    ),
  ];
}

function needsHumanLines(result) {
  return [
    "",
    `Step passed with work left for a person: machine translation is disabled by policy, so translate exited ${NEEDS_HUMAN_EXIT_CODE}. The action reports that as a warning, not a failure. Hand the keys off with verbatra export.`,
    ...needsHumanListLines(result),
  ];
}

function translateMarkdown(result, _exitCode, options = {}) {
  const markdown = summaryMarkdown(result);
  return options.needsHuman === true
    ? [markdown, ...needsHumanLines(result)].join("\n")
    : markdown;
}

function translateAnnotations(result, exitCode, options = {}) {
  if (options.needsHuman === true) {
    return needsHumanAnnotations(result, options);
  }
  if (exitCode !== 1) {
    return [];
  }
  return result.locales.flatMap((entry) => {
    const file = localeFile(options, entry.locale);
    if (entry.status === "failed") {
      const { code, message } = resolveLocaleError(entry);
      return [errorAnnotation(`verbatra: ${entry.locale}`, code, message, file)];
    }
    if (entry.status === "partial") {
      return [
        errorAnnotation(`verbatra: ${entry.locale}`, "LOCALE_PARTIAL", partialDetail(entry), file),
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

function envelopeError(envelope) {
  const cause = envelope.causeCode === undefined ? "" : ` (cause: ${envelope.causeCode})`;
  return { code: envelope.code, message: `${envelope.message}${cause}`, hint: envelope.hint };
}

function resolveWholeRunError(stderrText, genericMessage, errorEnvelope) {
  const cliError =
    errorEnvelope === null || errorEnvelope === undefined
      ? extractCliError(stderrText)
      : envelopeError(errorEnvelope);
  const fallback = String(stderrText ?? "").trim() || genericMessage;
  return { cliError, fallback };
}

function nextStep(hint) {
  return `Next step: ${hint}`;
}

function wholeRunAnnotation(exitCode, stderrText, errorEnvelope) {
  const { cliError, fallback } = resolveWholeRunError(
    stderrText,
    `The verbatra run failed (exit ${exitCode}).`,
    errorEnvelope,
  );
  const message = cliError?.message ?? fallback;
  const hint = cliError?.hint;
  return errorAnnotation(
    "verbatra",
    cliError?.code ?? "VERBATRA_FAILED",
    hint === undefined ? message : `${message} ${nextStep(hint)}`,
  );
}

function wholeRunMarkdown(exitCode, stderrText, errorEnvelope) {
  const { cliError, fallback } = resolveWholeRunError(
    stderrText,
    `The run could not complete (exit ${exitCode}).`,
    errorEnvelope,
  );
  const detail = cliError
    ? `[${escapeMarkdown(cliError.code)}] ${escapeMarkdown(cliError.message)}`
    : escapeMarkdown(fallback);
  const lines = [
    "## verbatra run failed",
    "",
    `The verbatra run could not complete (exit ${exitCode}).`,
    "",
    detail,
  ];
  if (cliError?.hint !== undefined) {
    lines.push("", escapeMarkdown(nextStep(cliError.hint)));
  }
  return lines.join("\n");
}

export const ANNOTATION_LIMIT_PER_LEVEL = 10;

function annotationLevel(line) {
  return line.match(/^::([a-z]+)/)[1];
}

function omittedPhrase(level, count) {
  return plural(count, `more ${level}`);
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
    const errorEnvelope = options.errorEnvelope ?? null;
    const annotations =
      exitCode !== 0 ? [wholeRunAnnotation(exitCode, stderrText, errorEnvelope)] : [];
    return {
      annotations,
      summary: wholeRunMarkdown(exitCode, stderrText, errorEnvelope),
      exitStatus: exitCode,
      needsHuman: false,
    };
  }

  const renderer = resolveRenderer(command);
  const needsHuman = command === "translate" && exitCode === NEEDS_HUMAN_EXIT_CODE;
  const renderOptions = { ...options, needsHuman };
  return {
    annotations: capAnnotations(renderer.annotations(summary, exitCode, renderOptions)),
    summary: renderer.markdown(summary, exitCode, renderOptions),
    exitStatus: needsHuman ? 0 : exitCode,
    needsHuman,
  };
}
