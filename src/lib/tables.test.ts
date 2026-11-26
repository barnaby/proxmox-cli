import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { attributeTable, makeTable, truncate } from "./tables";

function setStdoutTTY(value: boolean | undefined) {
  // @ts-expect-error — isTTY is writable on process streams at runtime
  process.stdout.isTTY = value;
}

describe("tables non-TTY rendering", () => {
  const originalStdout = process.stdout.isTTY;

  beforeEach(() => {
    setStdoutTTY(originalStdout);
  });

  afterEach(() => {
    setStdoutTTY(originalStdout);
  });

  test("makeTable omits box-drawing borders when stdout is not a TTY", () => {
    setStdoutTTY(false);
    const table = makeTable(["Name", "Status"]);
    table.push(["foo", "RUNNING"]);
    const output = table.toString();
    // Box-drawing characters should be absent
    expect(output).not.toContain("┌");
    expect(output).not.toContain("─");
    expect(output).not.toContain("│");
    expect(output).not.toContain("└");
    // Data must still be present
    expect(output).toContain("Name");
    expect(output).toContain("Status");
    expect(output).toContain("foo");
    expect(output).toContain("RUNNING");
  });

  test("makeTable omits ANSI color codes on head when stdout is not a TTY", () => {
    setStdoutTTY(false);
    const table = makeTable(["Name"]);
    table.push(["foo"]);
    const output = table.toString();
    // No ANSI escape sequences on the header row
    expect(output).not.toMatch(/\u001B\[[0-9;]*m/);
  });

  test("makeTable keeps box-drawing borders when stdout is a TTY", () => {
    setStdoutTTY(true);
    const table = makeTable(["Name"]);
    table.push(["foo"]);
    const output = table.toString();
    expect(output).toContain("┌");
    expect(output).toContain("│");
    expect(output).toContain("└");
  });

  test("attributeTable omits box-drawing borders when stdout is not a TTY", () => {
    setStdoutTTY(false);
    const output = attributeTable({ Name: "foo", Status: "RUNNING" });
    expect(output).not.toContain("┌");
    expect(output).not.toContain("│");
    expect(output).toContain("Name");
    expect(output).toContain("foo");
  });

  test("makeTable keeps decoration when FORCE_COLOR is set even on non-TTY", () => {
    const originalForceColor = process.env.FORCE_COLOR;
    setStdoutTTY(false);
    process.env.FORCE_COLOR = "1";
    try {
      const table = makeTable(["Name"]);
      table.push(["foo"]);
      const output = table.toString();
      expect(output).toContain("┌");
    } finally {
      if (originalForceColor === undefined) {
        delete process.env.FORCE_COLOR;
      } else {
        process.env.FORCE_COLOR = originalForceColor;
      }
    }
  });
});

describe("truncate", () => {
  test("returns short values unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  test("caps long values at max with an ellipsis", () => {
    const result = truncate("a".repeat(100), 20);
    expect(result).toHaveLength(20);
    expect(result.endsWith("…")).toBe(true);
  });

  test("collapses newlines and control characters to spaces", () => {
    expect(truncate("line1\nline2\r\nline3", 80)).toBe("line1 line2 line3");
    expect(truncate("bell\x07and\x1b[31mescape", 80)).toBe(
      "bell and [31mescape",
    );
  });

  test("trims whitespace before appending the ellipsis", () => {
    const result = truncate("word word word", 10);
    expect(result).not.toContain(" …");
    expect(result.endsWith("…")).toBe(true);
  });

  test("exactly max length stays untouched", () => {
    expect(truncate("x".repeat(20), 20)).toBe("x".repeat(20));
  });
});

describe("truncate multibyte", () => {
  test("never splits a surrogate pair at the cut point", () => {
    const emoji = "🎉".repeat(30); // 60 UTF-16 units, 30 code points
    const result = truncate(emoji, 20);
    expect(result).not.toContain("�");
    // Every char before the ellipsis is an intact emoji.
    const body = result.slice(0, -1);
    for (const ch of body) {
      expect(ch).toBe("🎉");
    }
    expect(result.endsWith("…")).toBe(true);
  });

  test("keeps astral strings that fit by code points but not UTF-16 units", () => {
    const emoji = "🎉".repeat(15); // 30 UTF-16 units, 15 code points
    expect(truncate(emoji, 20)).toBe(emoji);
  });
});
