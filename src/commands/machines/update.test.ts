import { describe, expect, test } from "bun:test";
import { maxCoresPerVM, parsePositiveInt } from "./update";

describe("parsePositiveInt", () => {
  test("parses whole numbers", () => {
    expect(parsePositiveInt("8", "--cpu")).toBe(8);
    expect(parsePositiveInt("8192", "--memory")).toBe(8192);
  });

  test("rejects zero, negatives, fractions and units", () => {
    for (const value of ["0", "-2", "1.5", "8G", "", "abc"]) {
      expect(() => parsePositiveInt(value, "--memory")).toThrow("--memory");
    }
  });
});

describe("maxCoresPerVM", () => {
  test("is the host CPU count for a single-socket VM", () => {
    expect(maxCoresPerVM(4, 1)).toBe(4);
  });

  test("divides across the VM's sockets", () => {
    expect(maxCoresPerVM(4, 2)).toBe(2);
    expect(maxCoresPerVM(6, 4)).toBe(1);
  });
});
