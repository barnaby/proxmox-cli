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

function formatGB(mb: number): string {
  return (mb / 1024).toFixed(1);
}

function usageColor(fraction: number): (text: string) => string {
  if (fraction >= 0.9) {
    return chalk.red;
  }
  if (fraction >= 0.7) {
    return chalk.yellow;
  }
  return (text) => text;
}

export function formatCPUUsage(cpuUsage: number | null): string {
  if (cpuUsage === null) {
    return "--";
  }
  return usageColor(cpuUsage)(`${(cpuUsage * 100).toFixed(1)}%`);
}

// Running: "3.1 / 8.0 GB (39%)". Otherwise just the allocation: "8.0 GB".
export function formatMemory(memUsed: number | null, mem: number): string {
  if (memUsed === null || mem === 0) {
    return `${formatGB(mem)} GB`;
  }
  const fraction = memUsed / mem;
  return usageColor(fraction)(
    `${formatGB(memUsed)} / ${formatGB(mem)} GB (${Math.round(fraction * 100)}%)`,
  );
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
          "Cores",
          "CPU",
          "Memory",
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
              formatCPUUsage(vm.cpuUsage),
              formatMemory(vm.memUsed, vm.mem),
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
