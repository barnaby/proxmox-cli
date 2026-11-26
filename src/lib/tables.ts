import chalk from "chalk";
import Table from "cli-table3";

const TABLE_CHARS = {
  top: "─",
  "top-mid": "──",
  "top-left": "┌",
  "top-right": "┐",
  bottom: "─",
  "bottom-mid": "──",
  "bottom-left": "└",
  "bottom-right": "┘",
  left: "│",
  "left-mid": "",
  mid: "",
  "mid-mid": "",
  right: "│",
  "right-mid": "",
  middle: "  ",
};

// When output is piped (no TTY), drop all border glyphs. The table still
// aligns columns with spaces, but agents / scripts parsing the output don't
// have to strip box-drawing characters.
const PLAIN_TABLE_CHARS = {
  top: "",
  "top-mid": "",
  "top-left": "",
  "top-right": "",
  bottom: "",
  "bottom-mid": "",
  "bottom-left": "",
  "bottom-right": "",
  left: "",
  "left-mid": "",
  mid: "",
  "mid-mid": "",
  right: "",
  "right-mid": "",
  middle: "  ",
};

function decorated(): boolean {
  // Match chalk's gate: decorate if stdout is a TTY, or if the user forced
  // it on via FORCE_COLOR. Keep parity so `FORCE_COLOR=1 machine0 ls | cat`
  // doesn't produce a frankenstein of colored chalk text in plain-ascii tables.
  return !!process.stdout.isTTY || !!process.env.FORCE_COLOR;
}

function tableChars() {
  return decorated() ? TABLE_CHARS : PLAIN_TABLE_CHARS;
}

function headStyle(): string[] {
  // cli-table3 colors the head row via its own color pipeline, separate from
  // chalk. When piped, strip the styling so output is pure text.
  return decorated() ? ["blue", "bold"] : [];
}

/**
 * Cap a cell value to one line of at most `max` characters. cli-table3 wraps
 * long cells onto multiple lines, which breaks one-row-per-item tables; this
 * strips control characters first (third-party text like MCP tool
 * descriptions can carry newlines or hostile escapes) and appends an
 * ellipsis when it cuts. ANSI-free input only — styled strings would be
 * sliced mid-escape.
 */
export function truncate(value: string, max: number): string {
  // Control chars (C0 + DEL + C1) become spaces so words don't fuse
  // together — C1 matters because U+009B is a single-char CSI some
  // terminals honor, an escape-smuggling vector for upstream-controlled
  // text (MCP tool names/descriptions).
  const oneLine = value.replace(/[\x00-\x1f\x7f\u0080-\u009f]+/g, " ").trim();
  // Count and slice by code point, not UTF-16 units — a unit-based length
  // check over-counts astral chars (an emoji is 1 point but 2 units), and a
  // naive slice can split a surrogate pair into a lone "�".
  const points = [...oneLine];
  if (points.length <= max) {
    return oneLine;
  }
  const capped = points.slice(0, Math.max(0, max - 1)).join("");
  return `${capped.trimEnd()}…`;
}

/** Cap a fixed column at the widest sample (≤ `cap`), then budget the
 *  flexible column from the terminal width minus that and the table
 *  chrome/fixed-column `reserved` width. One line per row stays the goal. */
export function columnBudgets(
  samples: string[],
  reserved: number,
  cap = 40,
): { fixedMax: number; flexMax: number } {
  // reduce, not Math.max(...spread): a hostile upstream can return enough
  // tools to blow the argument-count limit on a spread call.
  const widest = samples.reduce(
    (max, sample) => (sample.length > max ? sample.length : max),
    1,
  );
  const fixedMax = Math.min(cap, widest);
  const flexMax = Math.max(
    40,
    (process.stdout.columns ?? 80) - fixedMax - reserved,
  );
  return { fixedMax, flexMax };
}

export function makeTable(head: string[]) {
  return new Table({
    head,
    style: {
      head: headStyle(),
      border: [],
      compact: true,
    },
    chars: tableChars(),
  });
}

type AttributeValue = string | boolean | number | string[] | null | undefined;

export type AttributeRow = {
  key: string;
  value: AttributeValue;
  highlight?: boolean;
} | null;

export function attributeTable(
  attributes: Record<string, AttributeValue> | AttributeRow[],
) {
  const table = new Table({
    style: {
      head: headStyle(),
      border: [],
      compact: true,
    },
    chars: tableChars(),
  });

  if (Array.isArray(attributes)) {
    for (const row of attributes) {
      if (row === null) {
        table.push([" ", " "]);
      } else {
        const displayValue =
          row.value === null || row.value === undefined
            ? "--"
            : row.value.toString();
        const keyStr = row.highlight
          ? chalk.yellow(row.key)
          : chalk.blue(row.key);
        const valueStr = row.highlight
          ? chalk.yellow(displayValue)
          : displayValue;
        table.push([keyStr, valueStr]);
      }
    }
  } else {
    for (const [key, value] of Object.entries(attributes)) {
      const displayValue =
        value === null || value === undefined ? "--" : value.toString();
      table.push([chalk.blue(key), displayValue]);
    }
  }

  return table.toString();
}
