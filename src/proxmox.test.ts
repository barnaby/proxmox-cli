import { describe, expect, test } from "bun:test";
import { type Backup, findBackup, parseCPUType } from "./proxmox";

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

describe("findBackup", () => {
  const backup = (filename: string, vmId: number, vmName: string | null) =>
    ({
      volid: `local:backup/${filename}`,
      filename,
      vmId,
      vmName,
      size: 1,
      createdAt: new Date(0),
    }) satisfies Backup;

  // Newest first, as listBackups returns them.
  const newer = backup("vzdump-qemu-103-2026_11_27.vma.zst", 103, "ha");
  const older = backup("vzdump-qemu-103-2026_11_20.vma.zst", 103, "ha");
  const unnamed = backup("vzdump-qemu-100-2026_11_01.vma.zst", 100, null);
  const backups = [newer, older, unnamed];

  test("finds a backup by filename or volume ID", () => {
    expect(findBackup(backups, older.filename)).toBe(older);
    expect(findBackup(backups, older.volid)).toBe(older);
  });

  test("picks the newest backup of a VM by its recorded name", () => {
    expect(findBackup(backups, "ha")).toBe(newer);
  });

  test("falls back to the VM ID when the backup records no name", () => {
    expect(findBackup(backups, "devbox", 100)).toBe(unnamed);
  });

  test("returns undefined when nothing matches", () => {
    expect(findBackup(backups, "missing")).toBeUndefined();
    expect(findBackup([unnamed], "missing", undefined)).toBeUndefined();
  });
});
