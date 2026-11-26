import { describe, expect, test } from "bun:test";
import { parseCPUType } from "./proxmox";

describe("parseCPUType", () => {
  test("returns null when the config has no cpu entry", () => {
    expect(parseCPUType(undefined)).toBeNull();
    expect(parseCPUType("")).toBeNull();
  });

  test("reads a bare type", () => {
    expect(parseCPUType("host")).toBe("host");
  });

  test("ignores flags and other properties", () => {
    expect(parseCPUType("x86-64-v2-AES,flags=+aes;+pcid")).toBe(
      "x86-64-v2-AES",
    );
    expect(parseCPUType("flags=+aes,hidden=1,host")).toBe("host");
  });

  test("reads the explicit cputype= form", () => {
    expect(parseCPUType("cputype=kvm64,flags=+aes")).toBe("kvm64");
    expect(parseCPUType("flags=+aes,cputype=host")).toBe("host");
  });
});
