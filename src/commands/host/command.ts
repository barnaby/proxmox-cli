import chalk from "chalk";
import { actionWithErrorHandler } from "../../error-handler";
import { getHostInfo, type MemoryHardware } from "../../host";
import type { CLICommand } from "../../lib/cli-command";
import { blue, whiteBold } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { type AttributeRow, attributeTable, makeTable } from "../../lib/tables";

const GB = 1024 ** 3;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * GB) {
    return `${(bytes / (1024 * GB)).toFixed(1)} TB`;
  }
  return `${(bytes / GB).toFixed(1)} GB`;
}

export function formatUsage(used: number, total: number): string {
  if (total === 0) {
    return "--";
  }
  const percent = Math.round((used / total) * 100);
  return `${formatBytes(used)} / ${formatBytes(total)} (${percent}%)`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Identical modules collapse: "2 × 8 GB DDR4 2133 MT/s (Samsung M471A1K43CB1-CRC)".
export function formatMemoryModules(memory: MemoryHardware): string[] {
  const counts = new Map<string, number>();
  for (const module of memory.modules) {
    const maker = [module.manufacturer, module.partNumber]
      .filter(Boolean)
      .join(" ");
    const label = [module.size, module.type, module.speed]
      .filter(Boolean)
      .join(" ")
      .concat(maker ? ` (${maker})` : "");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => `${count} × ${label}`);
}

// Vendors often repeat their name in the product field ("HP" + "HP ProDesk").
export function formatModel(hardware: {
  manufacturer: string | null;
  model: string | null;
}): string | null {
  const { manufacturer, model } = hardware;
  if (!model) {
    return manufacturer;
  }
  if (
    !manufacturer ||
    model.toLowerCase().startsWith(manufacturer.toLowerCase())
  ) {
    return model;
  }
  return `${manufacturer} ${model}`;
}

function formatHealth(health: string | null): string {
  if (!health) {
    return "--";
  }
  return health === "PASSED" || health === "OK"
    ? chalk.green(health)
    : chalk.red(health);
}

export function registerHostCommand(program: CLICommand): void {
  program
    .command("host")
    .description("Show the Proxmox host's hardware specs and usage")
    .action(
      actionWithErrorHandler(async () => {
        const host = await spinnerWrap(() => getHostInfo())
          .start("Fetching host...")
          .run();
        const { cpu, hardware } = host;

        const system: AttributeRow[] = [
          { key: "Model", value: hardware ? formatModel(hardware) : null },
          { key: "BIOS", value: hardware?.bios },
          { key: "Proxmox VE", value: host.pveVersion },
          {
            key: "Kernel",
            value: [host.kernel, host.arch].filter(Boolean).join(" ") || null,
          },
          {
            key: "Boot",
            value: host.bootMode
              ? `${host.bootMode.toUpperCase()}${
                  host.secureBoot === null
                    ? ""
                    : `, Secure Boot ${host.secureBoot ? "on" : "off"}`
                }`
              : null,
          },
          { key: "Uptime", value: formatUptime(host.uptime) },
          null,
          { key: "CPU", value: cpu.model },
          {
            key: "Cores",
            value: `${cpu.cores} cores / ${cpu.threads} threads, ${cpu.sockets} socket${cpu.sockets === 1 ? "" : "s"}`,
          },
          {
            key: "Max Speed",
            value: hardware?.cpuMaxMHz
              ? `${(hardware.cpuMaxMHz / 1000).toFixed(1)} GHz`
              : null,
          },
          { key: "Virtualization", value: cpu.virtualization },
          {
            key: "CPU Usage",
            value:
              cpu.usage === null ? null : `${(cpu.usage * 100).toFixed(1)}%`,
          },
          { key: "Load Average", value: cpu.loadAverage.join("  ") },
          null,
          {
            key: "Memory",
            value: formatUsage(host.memory.used, host.memory.total),
          },
          { key: "Swap", value: formatUsage(host.swap.used, host.swap.total) },
        ];

        if (hardware && hardware.memory.modules.length > 0) {
          const { memory } = hardware;
          system.push({
            key: "Modules",
            value: formatMemoryModules(memory).join("\n"),
          });
          if (memory.slots !== null) {
            system.push({
              key: "Slots",
              value: `${memory.modules.length} of ${memory.slots} used${
                memory.maxCapacity ? `, max ${memory.maxCapacity}` : ""
              }`,
            });
          }
        }

        console.log();
        console.log(whiteBold(`HOST > ${blue(host.node)}`));
        console.log();
        console.log(attributeTable(system));

        if (host.disks.length > 0) {
          console.log();
          console.log(whiteBold("Disks"));
          console.log();
          const table = makeTable([
            "Device",
            "Model",
            "Type",
            "Size",
            "Health",
            "Wear",
          ]);
          for (const disk of host.disks) {
            table.push([
              disk.device,
              disk.model ?? "--",
              disk.type?.toUpperCase() ?? "--",
              formatBytes(disk.size),
              formatHealth(disk.health),
              disk.wearPercent === null ? "--" : `${disk.wearPercent}%`,
            ]);
          }
          console.log(table.toString());
        }

        if (host.storage.length > 0) {
          console.log();
          console.log(whiteBold("Storage"));
          console.log();
          const table = makeTable(["Name", "Type", "Usage", "Content"]);
          for (const item of host.storage) {
            table.push([
              item.name,
              item.type,
              formatUsage(item.used, item.total),
              item.content.join(", "),
            ]);
          }
          console.log(table.toString());
        }

        if (!hardware) {
          console.log();
          console.log(
            chalk.gray(
              "   Model, BIOS and memory modules need SSH access to the host.",
            ),
          );
        }

        console.log();
      }),
    );
}
