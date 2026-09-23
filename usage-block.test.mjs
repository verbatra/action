import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { END_MARKER, renderUsageBlock, replaceUsageRegion, START_MARKER } from "./usage-block.mjs";

const repoFile = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

function actionYaml(inputs) {
  return `name: probe\ninputs:\n${inputs}\nruns:\n  using: composite\n  steps: []\n`;
}

describe("renderUsageBlock: the committed README is a fresh regeneration", () => {
  it("regenerating from the committed action.yml reproduces the committed README byte for byte", () => {
    const readme = repoFile("README.md");
    expect(replaceUsageRegion(readme, renderUsageBlock(repoFile("action.yml")))).toBe(readme);
  });
});

describe("renderUsageBlock: every input comes from action.yml alone", () => {
  it("renders one commented entry per input, in declaration order", () => {
    const block = renderUsageBlock(
      actionYaml(
        [
          "  first:",
          "    description: The first input.",
          "    required: true",
          "  second:",
          "    description: The second input.",
          "    default: plain",
        ].join("\n"),
      ),
    );
    expect(block).toBe(
      [
        "```yaml",
        "- uses: verbatra/action@v1",
        "  with:",
        "    # The first input.",
        "    first: ''",
        "",
        "    # The second input.",
        "    # Default: plain",
        "    second: plain",
        "```",
      ].join("\n"),
    );
  });

  it("an added, renamed, or removed input and a changed default or description each show up", () => {
    const before = renderUsageBlock(
      actionYaml(["  kept:", "    description: Old text.", "    default: one"].join("\n")),
    );
    const after = renderUsageBlock(
      actionYaml(
        [
          "  kept:",
          "    description: New text.",
          "    default: two",
          "  added:",
          "    description: Brand new.",
        ].join("\n"),
      ),
    );
    expect(before).toContain("# Old text.");
    expect(after).toContain("# New text.");
    expect(after).toContain("# Default: two\n    kept: two");
    expect(after).toContain("    # Brand new.\n    added: ''");
    expect(after).not.toContain("one");
  });

  it("quotes a default a YAML reader would take for a boolean or a number", () => {
    const block = renderUsageBlock(
      actionYaml(
        [
          "  flag:",
          "    description: A flag.",
          '    default: "false"',
          "  count:",
          "    description: A count.",
          '    default: "24"',
          "  answer:",
          "    description: A YAML 1.1 boolean.",
          '    default: "yes"',
        ].join("\n"),
      ),
    );
    expect(block).toContain('    # Default: false\n    flag: "false"');
    expect(block).toContain('    # Default: 24\n    count: "24"');
    expect(block).toContain('    # Default: yes\n    answer: "yes"');
  });

  it("renders an empty default as an empty single-quoted string", () => {
    const block = renderUsageBlock(
      actionYaml(["  path:", "    description: A path.", '    default: ""'].join("\n")),
    );
    expect(block).toContain("    # Default: ''\n    path: ''");
  });

  it("wraps a long folded description at 90 columns and never splits a word", () => {
    const words = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ");
    const block = renderUsageBlock(
      actionYaml(["  long:", "    description: >-", `      ${words}`].join("\n")),
    );
    const comments = block.split("\n").filter((line) => line.startsWith("    # "));
    expect(comments.length).toBeGreaterThan(1);
    for (const line of comments) {
      expect(line.length).toBeLessThanOrEqual(90);
    }
    expect(comments.map((line) => line.slice(6)).join(" ")).toBe(words);
  });

  it("an input with no description still renders its key", () => {
    expect(renderUsageBlock(actionYaml("  bare:\n    required: false"))).toContain("    bare: ''");
    expect(renderUsageBlock(actionYaml("  empty:"))).toContain("  with:\n    empty: ''");
  });

  it("names a different uses reference when asked", () => {
    expect(renderUsageBlock(actionYaml("  a:\n    description: A."), "./")).toContain("- uses: ./");
  });

  it("rejects an action.yml with no inputs map", () => {
    expect(() => renderUsageBlock("name: probe\n")).toThrow("no inputs map");
    expect(() => renderUsageBlock("name: probe\ninputs: [a]\n")).toThrow("no inputs map");
    expect(() => renderUsageBlock("")).toThrow("no inputs map");
  });
});

describe("replaceUsageRegion: only the region between the markers changes", () => {
  it("replaces what sits between the markers and keeps everything around them", () => {
    const readme = `intro\n${START_MARKER}\nstale\n${END_MARKER}\noutro\n`;
    expect(replaceUsageRegion(readme, "fresh")).toBe(
      `intro\n${START_MARKER}\nfresh\n${END_MARKER}\noutro\n`,
    );
  });

  it("fails when a marker is missing or the markers are out of order", () => {
    expect(() => replaceUsageRegion(`${END_MARKER}\n`, "x")).toThrow(START_MARKER);
    expect(() => replaceUsageRegion(`${START_MARKER}\n`, "x")).toThrow(END_MARKER);
    expect(() => replaceUsageRegion(`${END_MARKER}\n${START_MARKER}\n`, "x")).toThrow("before");
  });
});
