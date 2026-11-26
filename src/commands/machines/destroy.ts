import { confirm } from "@inquirer/prompts";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { makeOption } from "../../lib/options";
import { destroyVM, getVMByName } from "../../proxmox";

export function registerDestroyCommand(program: CLICommand): void {
  program
    .command("rm <name>")
    .alias("destroy")
    .description("Remove a VM")
    .addOption(
      makeOption({
        flags: "-y, --yes",
        description: "Skip confirmation prompt",
      }),
    )
    .action(
      actionWithErrorHandler(
        async (name: string, options: { yes?: boolean }) => {
          const vm = await getVMByName(name);
          if (!vm) {
            throw new Error(`VM "${name}" not found`);
          }

          if (!options.yes) {
            const confirmed = await confirm({
              message: `Are you sure you want to destroy VM "${name}" (ID: ${vm.id})?`,
              default: false,
            });
            if (!confirmed) {
              console.log("Aborted");
              return;
            }
          }

          await spinnerWrap(() => destroyVM(vm.id))
            .start("Destroying VM...")
            .run();

          notifySuccess(`VM "${name}" destroyed`);
        },
      ),
    );
}
