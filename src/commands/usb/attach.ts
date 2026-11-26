import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { attachUSBToVM, getVMByName, listUSBDevices } from "../../proxmox";

export function registerAttachCommand(program: CLICommand): void {
  program
    .command("attach <vm-name> <vendor:product>")
    .description("Attach a USB device to a VM")
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

        const devices = await listUSBDevices();
        const device = devices.find(
          (d) => d.vendorId === vendorId && d.productId === productId,
        );
        if (!device) {
          throw new Error(
            `USB device ${deviceId} not found. Use "proxmox usb ls" to list available devices.`,
          );
        }

        const slot = await spinnerWrap(() =>
          attachUSBToVM(vm.id, vendorId, productId),
        )
          .start(`Attaching ${device.description} to ${vmName}...`)
          .run();

        notifySuccess(
          `Attached ${device.description} (${deviceId}) to ${vmName} on ${slot}`,
        );
      }),
    );
}
