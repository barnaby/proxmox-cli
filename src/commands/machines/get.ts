import chalk from "chalk";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { blue, whiteBold } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { type AttributeRow, attributeTable, makeTable } from "../../lib/tables";
import {
  getVMByName,
  getVMConfig,
  getVMIP,
  getVMMAC,
  getVMUSBDevices,
  listUSBDevices,
} from "../../proxmox";

function formatStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "running":
      return chalk.green(status);
    case "stopped":
      return chalk.gray(status);
    default:
      return chalk.yellow(status);
  }
}

export function registerGetCommand(program: CLICommand): void {
  program
    .command("get <vm>")
    .description("Show VM details")
    .action(
      actionWithErrorHandler(async (vmName: string) => {
        const vm = await spinnerWrap(() => getVMByName(vmName))
          .start("Fetching VM...")
          .run();

        if (!vm) {
          throw new Error(`VM "${vmName}" not found`);
        }

        const [config, ip, mac, usbDevices, hostUSBDevices] = await Promise.all(
          [
            getVMConfig(vm.id),
            vm.status === "running" ? getVMIP(vm.id) : Promise.resolve(null),
            getVMMAC(vm.id),
            getVMUSBDevices(vm.id),
            listUSBDevices().catch(() => []),
          ],
        );

        const rows: AttributeRow[] = [
          { key: "ID", value: vm.id },
          { key: "Name", value: vm.name },
          { key: "Status", value: formatStatus(vm.status) },
          null,
          { key: "IP", value: ip },
          { key: "MAC", value: mac },
          null,
          { key: "CPU Cores", value: config.cores ?? "--" },
          { key: "Memory (MB)", value: config.memory ?? vm.mem },
          { key: "Disk (GB)", value: vm.bootdisk },
          null,
          { key: "Boot Disk", value: config.scsi0?.split(",")[0] ?? "--" },
          { key: "CD/DVD", value: config.ide2?.split(",")[0] ?? "--" },
        ];

        console.log();
        console.log(whiteBold(`MACHINES > ${blue(vm.name)}`));
        console.log();
        console.log(attributeTable(rows));

        if (usbDevices.length > 0) {
          console.log();
          console.log(whiteBold("USB Devices"));
          console.log();

          const usbTable = makeTable(["Slot", "ID", "Description"]);

          for (const usb of usbDevices) {
            const usbId = `${usb.vendorId}:${usb.productId}`;
            const hostDevice = hostUSBDevices.find(
              (d) =>
                d.vendorId === usb.vendorId && d.productId === usb.productId,
            );
            usbTable.push([usb.slot, usbId, hostDevice?.description ?? "--"]);
          }

          console.log(usbTable.toString());
        }

        console.log();
      }),
    );
}
