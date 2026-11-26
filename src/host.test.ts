import { describe, expect, test } from "bun:test";
import {
  formatMemoryModules,
  formatModel,
  formatUptime,
} from "./commands/host/command";
import { parseDmidecodeMemory } from "./host";

const DMIDECODE = `# dmidecode 3.6
Getting SMBIOS data from sysfs.

Handle 0x0027, DMI type 16, 23 bytes
Physical Memory Array
	Location: System Board Or Motherboard
	Error Correction Type: None
	Maximum Capacity: 32 GB
	Number Of Devices: 3

Handle 0x0028, DMI type 17, 40 bytes
Memory Device
	Size: 8 GB
	Locator: DIMM1
	Type: DDR4
	Speed: 2133 MT/s
	Manufacturer: Samsung
	Part Number: M471A1K43CB1-CRC    

Handle 0x0029, DMI type 17, 40 bytes
Memory Device
	Size: No Module Installed
	Locator: DIMM2
	Type: Unknown

Handle 0x002A, DMI type 17, 40 bytes
Memory Device
	Size: 8 GB
	Locator: DIMM3
	Type: DDR4
	Speed: 2133 MT/s
	Manufacturer: Samsung
	Part Number: M471A1K43CB1-CRC    
`;

describe("parseDmidecodeMemory", () => {
  test("returns installed modules and counts every slot", () => {
    const memory = parseDmidecodeMemory(DMIDECODE);
    expect(memory.slots).toBe(3);
    expect(memory.maxCapacity).toBe("32 GB");
    expect(memory.modules).toEqual([
      {
        size: "8 GB",
        type: "DDR4",
        speed: "2133 MT/s",
        manufacturer: "Samsung",
        partNumber: "M471A1K43CB1-CRC",
      },
      {
        size: "8 GB",
        type: "DDR4",
        speed: "2133 MT/s",
        manufacturer: "Samsung",
        partNumber: "M471A1K43CB1-CRC",
      },
    ]);
  });

  test("returns nothing for empty output", () => {
    expect(parseDmidecodeMemory("")).toEqual({
      modules: [],
      slots: null,
      maxCapacity: null,
    });
  });
});

describe("formatMemoryModules", () => {
  test("collapses identical modules into one line", () => {
    expect(formatMemoryModules(parseDmidecodeMemory(DMIDECODE))).toEqual([
      "2 × 8 GB DDR4 2133 MT/s (Samsung M471A1K43CB1-CRC)",
    ]);
  });
});

describe("formatUptime", () => {
  test("uses the two largest units", () => {
    expect(formatUptime(1057921)).toBe("12d 5h");
    expect(formatUptime(3 * 3600 + 120)).toBe("3h 2m");
    expect(formatUptime(300)).toBe("5m");
  });
});

describe("formatModel", () => {
  test("does not repeat a manufacturer the model already starts with", () => {
    expect(
      formatModel({ manufacturer: "HP", model: "HP ProDesk 400 G2 MINI" }),
    ).toBe("HP ProDesk 400 G2 MINI");
  });

  test("prefixes the manufacturer otherwise", () => {
    expect(formatModel({ manufacturer: "Dell Inc.", model: "OptiPlex" })).toBe(
      "Dell Inc. OptiPlex",
    );
  });
});
