import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { getVMByName, startVM } from "../../proxmox";

export function registerStartCommand(program: CLICommand): void {
  program
    .command("start <name>")
    .description("Start a VM")
    .action(
      actionWithErrorHandler(async (name: string) => {
        const vm = await getVMByName(name);
        if (!vm) {
          throw new Error(`VM "${name}" not found`);
        }

        if (vm.status.toLowerCase() === "running") {
          throw new Error(`VM "${name}" is already running`);
        }

        await spinnerWrap(() => startVM(vm.id))
          .start("Starting VM...")
          .run();

        notifySuccess(`VM "${name}" started`);
      }),
    );
}
