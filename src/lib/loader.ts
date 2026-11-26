import chalk from "chalk";
import ora, { type Ora } from "ora";
import { blue } from "./colors";

// TTY normalization.
//
// Node's `process.stdout.isTTY` / `stderr.isTTY` are `true` on a real terminal
// and `undefined` (never `false`) on a pipe. Ora checks `stream.isTTY` and
// silently does nothing without a fix; chalk's supports-color probe treats
// `undefined` as "maybe on."
//
// The Node case is already correct: treat `undefined` as "not a TTY." Under
// Node we leave values untouched so a piped stream keeps its falsy value.
//
// For Bun we only rescue stderr (spinners go to stderr). If stdin OR stdout
// is a TTY, that's proof we're attached to a real terminal, so promote an
// undefined stderr. Never touch stdout: a piped stdout must stay falsy to
// keep `machine0 ls | cat` output clean (no colors, no ANSI escapes). Users
// who really want color over a pipe can set FORCE_COLOR.
// biome-ignore lint/suspicious/noExplicitAny: Bun global isn't typed under Node
const isBun = typeof (globalThis as any).Bun !== "undefined";

if (isBun && process.stderr.isTTY === undefined) {
  process.stderr.isTTY = !!process.stdin.isTTY || !!process.stdout.isTTY;
}

// Chalk gates on stdout (not interactivity). If stdout isn't a TTY, colors
// off — unless the user explicitly asked via FORCE_COLOR.
if (!process.stdout.isTTY && !process.env.FORCE_COLOR) {
  chalk.level = 0;
}

/**
 * Interactive = stderr is a TTY (spinners go to stderr).
 * Prompts have a stricter check: see `confirmOrExit` which requires stdin too.
 */
export function isInteractive(): boolean {
  return !!process.stderr.isTTY;
}

const loaderStrings = [
  "Hang on...",
  "Sit tight...",
  "Just a sec...",
  "Brewing some magic...",
  "Dusting pixels...",
  "Loading unicorns...",
  "Spinning the hamster wheel...",
  "Counting to infinity...",
  "Sharpening crayons...",
  "Training AI hamsters...",
  "Waking up the elves...",
  "Charging flux capacitor...",
  "Polishing the bits...",
  "Assembling Lego bricks...",
  "Mixing secret sauce...",
  "Feeding the loading monster...",
  "Convincing electrons...",
  "Summoning digital wizards...",
  "Reticulating splines...",
  "Inflating balloons...",
  "Taming wild data...",
  "Cooking your request...",
  "Adjusting reality...",
  "Aligning planets...",
  "Unpacking virtual boxes...",
  "Fueling rocket boosters...",
  "Rounding up bytes...",
  "Stretching pixels...",
  "Firing lasers...",
  "Dancing with servers...",
  "Tuning frequencies...",
  "Hunting for lost bits...",
  "Fluffing clouds...",
  "Drawing pretty circles...",
  "Building sandcastles...",
  "Tickling the circuits...",
  "Tightening screws...",
  "Magic happening...",
  "Making it awesome...",
  "Catching fireflies...",
];

function sample<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

// Null object used in non-interactive contexts. Matches ora's chainable API
// surface that spinnerWrap / waitFor rely on, so callers don't need to branch.
const noopSpinner = {
  start: () => noopSpinner,
  stop: () => noopSpinner,
  succeed: () => noopSpinner,
  fail: () => noopSpinner,
  render: () => noopSpinner,
  clear: () => noopSpinner,
  stopAndPersist: () => noopSpinner,
  info: () => noopSpinner,
  warn: () => noopSpinner,
  set text(_v: string) {},
  get text() {
    return "";
  },
  get isSpinning() {
    return false;
  },
} as unknown as Ora;

export const loader = (text?: string): Ora => {
  if (!isInteractive()) {
    return noopSpinner;
  }
  return ora({
    text: text ?? sample(loaderStrings),
    isEnabled: true,
    discardStdin: false,
    spinner: {
      interval: 80,
      frames: [blue(">  "), blue(">> "), blue(">>>"), blue(">> ")],
    },
  });
};

/**
 * Wraps an async function with a spinner, allowing chainable start and success messages.
 * In non-interactive contexts (pipes, CI, agents), the spinner is a no-op —
 * the function runs without any terminal decoration.
 * Usage:
 *   await spinnerWrap(() => myAsyncFn()).start('...').succeed('...').run();
 */
export function spinnerWrap<T>(fn: () => Promise<T>) {
  let startMsg = "Working...";
  let successMsg: string | undefined;
  return {
    start(msg: string) {
      startMsg = msg;
      return this;
    },
    succeed(msg: string) {
      successMsg = msg;
      return this;
    },
    async run() {
      if (!isInteractive()) {
        return fn();
      }
      // ora installs cli-cursor → signal-exit under the hood; that already
      // restores the cursor on SIGINT and re-sends the signal to terminate
      // the process. No manual SIGINT handler needed.
      const spinner = loader();
      spinner.start(startMsg);
      try {
        const result = await fn();
        if (successMsg) {
          spinner.succeed(successMsg);
        } else {
          spinner.stop();
        }
        return result;
      } catch (error) {
        spinner.stop();
        throw error;
      }
    },
  };
}
