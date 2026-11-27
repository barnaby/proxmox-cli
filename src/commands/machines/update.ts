import { actionWithErrorHandler } from "../../error-handler";
import { getHostCPUCount } from "../../host";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { makeOption } from "../../lib/options";
import { getVMByName, getVMConfig, updateVMResources } from "../../proxmox";

// Proxmox refuses to start a VM with more vCPUs (sockets × cores) than the
// host has logical CPUs, so reject that here instead of at the next start.
export function maxCoresPerVM(hostCPUs: number, sockets: number): number {
  return Math.floor(hostCPUs / sockets);
}

export function parsePositiveInt(value: string, flag: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${flag} must be a positive whole number, got "${value}"`);
  }
  return Number(value);
}

export function registerUpdateCommand(program: CLICommand): void {
  program
    .command("update <vm>")
    .description("Update a VM's settings")
    .addOption(
      makeOption({
        flags: "-c, --cpu <cores>",
        description: "CPU cores",
      }),
    )
    .addOption(
      makeOption({
        flags: "--cpu-type <type>",
        description: "CPU type, e.g. host, x86-64-v2-AES, kvm64",
      }),
    )
    .addOption(
      makeOption({
        flags: "-m, --memory <mb>",
        description: "RAM in MB",
      }),
    )
    .addOption(
      makeOption({
        flags: "--autostart",
        description: "Start the VM automatically when the Proxmox host boots",
      }),
    )
    .addOption(
      makeOption({
        flags: "--no-autostart",
        description: "Don't start the VM when the Proxmox host boots",
      }),
    )
    .action(
      actionWithErrorHandler(
        async (
          name: string,
          options: {
            cpu?: string;
            cpuType?: string;
            memory?: string;
            autostart?: boolean;
          },
        ) => {
          const cores =
            options.cpu !== undefined
              ? parsePositiveInt(options.cpu, "--cpu")
              : undefined;
          const memory =
            options.memory !== undefined
              ? parsePositiveInt(options.memory, "--memory")
              : undefined;
          const cpuType = options.cpuType;
          const autostart = options.autostart;

          const changes = [
            cores !== undefined && `${cores} cores`,
            cpuType !== undefined && `CPU type ${cpuType}`,
            memory !== undefined && `${memory} MB memory`,
            autostart !== undefined && `autostart ${autostart ? "on" : "off"}`,
          ].filter((change): change is string => Boolean(change));

          if (changes.length === 0) {
            throw new Error(
              "Nothing to update. Pass --cpu <cores>, --cpu-type <type>, --memory <mb> or --[no-]autostart.",
            );
          }

          const vm = await getVMByName(name);
          if (!vm) {
            throw new Error(`VM "${name}" not found`);
          }

          if (cores !== undefined) {
            const [hostCPUs, config] = await Promise.all([
              getHostCPUCount(),
              getVMConfig(vm.id),
            ]);
            const max = maxCoresPerVM(hostCPUs, config.sockets ?? 1);
            if (cores > max) {
              throw new Error(
                `--cpu ${cores} is more than this VM can start with: the host has ${hostCPUs} CPUs, so the most is ${max}.`,
              );
            }
          }

          await spinnerWrap(() =>
            updateVMResources(vm.id, { cores, cpuType, memory, autostart }),
          )
            .start(`Updating ${changes.join(", ")}...`)
            .run();

          notifySuccess(`VM "${name}" set to ${changes.join(", ")}`);

          // Autostart only matters at the next host boot; the rest need a restart.
          const needsRestart =
            cores !== undefined ||
            cpuType !== undefined ||
            memory !== undefined;
          if (needsRestart && vm.status.toLowerCase() === "running") {
            console.log(
              "  The VM is running: stop and start it for the change to take effect.",
            );
          }
        },
      ),
    );
}
