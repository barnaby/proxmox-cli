import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isInteractive, loader, spinnerWrap } from "./loader";

function setStderrTTY(value: boolean | undefined) {
  // @ts-expect-error — isTTY is writable on process streams at runtime
  process.stderr.isTTY = value;
}

describe("loader / spinnerWrap non-TTY behavior", () => {
  const originalStderr = process.stderr.isTTY;

  beforeEach(() => {
    setStderrTTY(originalStderr);
  });

  afterEach(() => {
    setStderrTTY(originalStderr);
  });

  test("isInteractive is false when stderr is not a TTY", () => {
    setStderrTTY(false);
    expect(isInteractive()).toBe(false);
  });

  test("isInteractive is true when stderr is a TTY", () => {
    setStderrTTY(true);
    expect(isInteractive()).toBe(true);
  });

  test("loader returns a no-op spinner in non-TTY mode", () => {
    setStderrTTY(false);
    const spinner = loader("booting");
    // A real ora spinner has isSpinning true after .start(); the noop does not.
    spinner.start("go");
    expect(spinner.isSpinning).toBe(false);
    spinner.stop();
  });

  test("spinnerWrap runs the wrapped function and returns its value on non-TTY", async () => {
    setStderrTTY(false);
    const result = await spinnerWrap(async () => 42)
      .start("starting")
      .succeed("done")
      .run();
    expect(result).toBe(42);
  });

  test("spinnerWrap propagates errors on non-TTY", async () => {
    setStderrTTY(false);
    await expect(
      spinnerWrap(() => Promise.reject(new Error("boom")))
        .start("starting")
        .run(),
    ).rejects.toThrow("boom");
  });
});
