import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { getVMByName, stopVM } from "../../proxmox";

export function registerStopCommand(program: CLICommand): void {
  program
    .command("stop <name>")
    .description("Stop a VM")
    .action(
      actionWithErrorHandler(async (name: string) => {
        const vm = await getVMByName(name);
        if (!vm) {
          throw new Error(`VM "${name}" not found`);
        }

        if (vm.status.toLowerCase() === "stopped") {
          throw new Error(`VM "${name}" is already stopped`);
        }

        await spinnerWrap(() => stopVM(vm.id))
          .start("Stopping VM...")
          .run();

        notifySuccess(`VM "${name}" stopped`);
      }),
    );
}
