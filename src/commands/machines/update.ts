import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { makeOption } from "../../lib/options";
import { getVMByName, setVMCPUType } from "../../proxmox";

export function registerUpdateCommand(program: CLICommand): void {
  program
    .command("update <vm>")
    .description("Update a VM's settings")
    .addOption(
      makeOption({
        flags: "--cpu-type <type>",
        description: "CPU type, e.g. host, x86-64-v2-AES, kvm64",
      }),
    )
    .action(
      actionWithErrorHandler(
        async (name: string, options: { cpuType?: string }) => {
          const cpuType = options.cpuType;
          if (!cpuType) {
            throw new Error("Nothing to update. Pass --cpu-type <type>.");
          }

          const vm = await getVMByName(name);
          if (!vm) {
            throw new Error(`VM "${name}" not found`);
          }

          await spinnerWrap(() => setVMCPUType(vm.id, cpuType))
            .start(`Setting CPU type to ${cpuType}...`)
            .run();

          notifySuccess(`VM "${name}" CPU type set to ${cpuType}`);

          if (vm.status.toLowerCase() === "running") {
            console.log(
              "  The VM is running: stop and start it for the change to take effect.",
            );
          }
        },
      ),
    );
}
