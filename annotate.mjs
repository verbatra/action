import { appendFileSync, existsSync, readFileSync } from "node:fs";
import {
  buildReport,
  parseErrorEnvelope,
  parseSummaryJson,
  resolveExitCode,
} from "./report.mjs";

const [summaryFile, errorFile, exitCodeArg, commandArg] = process.argv.slice(2);

const readOrEmpty = (path) => (path && existsSync(path) ? readFileSync(path, "utf8") : "");

const stdoutText = readOrEmpty(summaryFile);
const summary = parseSummaryJson(stdoutText);
const stderrText = readOrEmpty(errorFile);

const report = buildReport(
  summary,
  resolveExitCode(exitCodeArg),
  stderrText,
  commandArg || "translate",
  { qaStrict: process.env.QA_STRICT === "true", errorEnvelope: parseErrorEnvelope(stdoutText) },
);

for (const annotation of report.annotations) {
  process.stdout.write(`${annotation}\n`);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `needs-human=${report.needsHuman}\n`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report.summary}\n`);
}

process.exit(report.exitStatus);
