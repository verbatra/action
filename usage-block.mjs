import { parse, stringify } from "yaml";

export const START_MARKER = "<!-- start usage -->";
export const END_MARKER = "<!-- end usage -->";

const INPUT_INDENT = "    ";
const COMMENT_PREFIX = `${INPUT_INDENT}# `;
const MAX_LINE_LENGTH = 90;

function wrapComment(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (current !== "" && COMMENT_PREFIX.length + candidate.length > MAX_LINE_LENGTH) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== "") {
    lines.push(current);
  }
  return lines.map((line) => `${COMMENT_PREFIX}${line}`);
}

function yamlScalar(value) {
  return value === "" ? "''" : stringify(value, { version: "1.1", lineWidth: 0 }).trim();
}

function defaultLabel(value) {
  return value === "" ? "''" : value;
}

function readInputs(actionYamlText) {
  const action = parse(actionYamlText);
  const inputs = action?.inputs;
  if (inputs === null || typeof inputs !== "object" || Array.isArray(inputs)) {
    throw new Error("action.yml declares no inputs map");
  }
  return Object.entries(inputs);
}

function inputLines(name, input) {
  const lines = wrapComment(input?.description ?? "");
  const hasDefault = input?.default !== undefined && input?.default !== null;
  if (!hasDefault) {
    return [...lines, `${INPUT_INDENT}${name}: ''`];
  }
  const value = String(input.default);
  return [
    ...lines,
    `${COMMENT_PREFIX}Default: ${defaultLabel(value)}`,
    `${INPUT_INDENT}${name}: ${yamlScalar(value)}`,
  ];
}

export function renderUsageBlock(actionYamlText, uses = "verbatra/action@v1") {
  const sections = readInputs(actionYamlText).map(([name, input]) =>
    inputLines(name, input).join("\n"),
  );
  return ["```yaml", `- uses: ${uses}`, "  with:", sections.join("\n\n"), "```"].join("\n");
}

function markerIndex(readme, marker) {
  const index = readme.indexOf(marker);
  if (index === -1) {
    throw new Error(`README.md has no ${marker} marker`);
  }
  return index;
}

export function replaceUsageRegion(readme, block) {
  const start = markerIndex(readme, START_MARKER) + START_MARKER.length;
  const end = markerIndex(readme, END_MARKER);
  if (end < start) {
    throw new Error(`README.md has ${END_MARKER} before ${START_MARKER}`);
  }
  return `${readme.slice(0, start)}\n${block}\n${readme.slice(end)}`;
}
