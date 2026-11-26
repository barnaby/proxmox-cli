import { describe, expect, test } from "bun:test";
import { formatCPUUsage, formatMemory } from "./list";

describe("formatCPUUsage", () => {
  test("shows a percentage of the allocated vCPUs", () => {
    expect(formatCPUUsage(0.0204)).toBe("2.0%");
  });

  test("shows a placeholder when the VM is not running", () => {
    expect(formatCPUUsage(null)).toBe("--");
  });
});

describe("formatMemory", () => {
  test("shows used, allocated and percentage for a running VM", () => {
    expect(formatMemory(3174, 8192)).toBe("3.1 / 8.0 GB (39%)");
  });

  test("shows only the allocation when the VM is not running", () => {
    expect(formatMemory(null, 4096)).toBe("4.0 GB");
  });
});
