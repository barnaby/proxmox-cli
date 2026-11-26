import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import {
  detachUSBFromVM,
  findUSBSlotByDevice,
  getVMByName,
  listUSBDevices,
} from "../../proxmox";

export function registerDetachCommand(program: CLICommand): void {
  program
    .command("detach <vm-name> <vendor:product>")
    .description("Detach a USB device from a VM")
    .action(
      actionWithErrorHandler(async (vmName: string, deviceId: string) => {
        const [vendorId, productId] = deviceId.split(":");
        if (!vendorId || !productId) {
          throw new Error(
            "Invalid device ID. Use format: vendor:product (e.g., 2357:0604)",
          );
        }

        const vm = await spinnerWrap(() => getVMByName(vmName))
          .start(`Finding VM "${vmName}"...`)
          .run();

        if (!vm) {
          throw new Error(`VM "${vmName}" not found`);
        }

        const slot = await findUSBSlotByDevice(vm.id, vendorId, productId);
        if (!slot) {
          throw new Error(
            `USB device ${deviceId} is not attached to ${vmName}. Use "proxmox usb ls ${vmName}" to list attached devices.`,
          );
        }

        const devices = await listUSBDevices();
        const device = devices.find(
          (d) => d.vendorId === vendorId && d.productId === productId,
        );
        const description = device?.description ?? deviceId;

        await spinnerWrap(() => detachUSBFromVM(vm.id, slot))
          .start(`Detaching ${description} from ${vmName}...`)
          .run();

        notifySuccess(`Detached ${description} (${deviceId}) from ${vmName}`);
      }),
    );
}
