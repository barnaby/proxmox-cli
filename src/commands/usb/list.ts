import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { spinnerWrap } from "../../lib/loader";
import { makeTable } from "../../lib/tables";
import {
  getVMByName,
  getVMUSBDevices,
  listUSBDevices,
  type USBDevice,
} from "../../proxmox";

export function registerListCommand(program: CLICommand): void {
  program
    .command("ls [vm-name]")
    .alias("list")
    .description("List USB devices (on host, or attached to a VM)")
    .action(
      actionWithErrorHandler(async (vmName?: string) => {
        if (vmName) {
          await listVMUSBDevices(vmName);
        } else {
          await listHostUSBDevices();
        }
      }),
    );
}

async function listHostUSBDevices(): Promise<void> {
  const devices = await spinnerWrap(() => listUSBDevices())
    .start("Fetching USB devices...")
    .run();

  if (devices.length === 0) {
    console.log("\n   No USB devices found.\n");
    return;
  }

  const table = makeTable(["Bus", "Device", "ID", "Description"]);

  for (const d of devices) {
    table.push([
      d.bus,
      d.device,
      `${d.vendorId}:${d.productId}`,
      d.description,
    ]);
  }

  console.log(table.toString());
}

async function listVMUSBDevices(vmName: string): Promise<void> {
  const vm = await spinnerWrap(() => getVMByName(vmName))
    .start(`Finding VM "${vmName}"...`)
    .run();

  if (!vm) {
    throw new Error(`VM "${vmName}" not found`);
  }

  const [vmDevices, hostDevices] = await spinnerWrap(async () => {
    const vmUsb = await getVMUSBDevices(vm.id);
    const hostUsb = await listUSBDevices();
    return [vmUsb, hostUsb] as const;
  })
    .start("Fetching USB devices...")
    .run();

  if (vmDevices.length === 0) {
    console.log(`\n   No USB devices attached to "${vmName}".\n`);
    return;
  }

  const hostMap = new Map<string, USBDevice>();
  for (const d of hostDevices) {
    hostMap.set(`${d.vendorId}:${d.productId}`, d);
  }

  const table = makeTable(["Slot", "ID", "Description"]);

  for (const d of vmDevices) {
    const id = `${d.vendorId}:${d.productId}`;
    const hostDevice = hostMap.get(id);
    table.push([d.slot, id, hostDevice?.description ?? "--"]);
  }

  console.log(table.toString());
}
