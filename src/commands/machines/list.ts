import chalk from "chalk";
import { CLI_NAME } from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { spinnerWrap } from "../../lib/loader";
import { makeTable } from "../../lib/tables";
import { getVMCores, getVMIP, getVMMAC, listVMs } from "../../proxmox";

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

export function registerListCommand(program: CLICommand): void {
  program
    .command("ls")
    .alias("list")
    .description("List VMs")
    .action(
      actionWithErrorHandler(async () => {
        const vms = await spinnerWrap(() => listVMs())
          .start("Fetching VMs...")
          .run();

        if (vms.length === 0) {
          console.log();
          console.log("   No VMs yet.");
          console.log(
            `   Use \`${CLI_NAME} new <name> --iso <iso>\` to create one.`,
          );
          console.log();
          return;
        }

        const table = makeTable([
          "ID",
          "Name",
          "Status",
          "IP",
          "CPU",
          "Memory (MB)",
        ]);

        const rows = await Promise.all(
          vms.map(async (vm) => {
            let ipDisplay = "--";
            if (vm.status.toLowerCase() === "running") {
              const ip = await getVMIP(vm.id);
              if (ip) {
                ipDisplay = ip;
              } else {
                const mac = await getVMMAC(vm.id);
                ipDisplay = mac ? `MAC: ${mac}` : "--";
              }
            }

            const cores = await getVMCores(vm.id);

            return [
              vm.id.toString(),
              vm.name,
              formatStatus(vm.status),
              ipDisplay,
              cores?.toString() ?? "--",
              vm.mem.toString(),
            ];
          }),
        );

        for (const row of rows) {
          table.push(row);
        }

        console.log(table.toString());
      }),
    );
}
