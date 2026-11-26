import { CLI_NAME } from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { makeOption } from "../../lib/options";
import { createBackup, getVMByName } from "../../proxmox";
import { formatSize } from "./format";

export function registerNewCommand(program: CLICommand, name: string): void {
  program
    .command(`${name} <vm>`)
    .description("Back up a VM (it keeps running unless --stop is given)")
    .addOption(
      makeOption({
        flags: "--stop",
        description:
          "Shut the VM down for the backup, then start it again if it was running",
      }),
    )
    .addOption(
      makeOption({
        flags: "--storage <storage>",
        description: "Storage to write the backup to",
      }),
    )
    .action(
      actionWithErrorHandler(
        async (
          vmName: string,
          options: { stop?: boolean; storage?: string },
        ) => {
          const vm = await getVMByName(vmName);
          if (!vm) {
            throw new Error(`VM "${vmName}" not found`);
          }

          const backup = await spinnerWrap(() =>
            createBackup(vm.id, {
              stop: options.stop,
              storage: options.storage,
            }),
          )
            .start(`Backing up "${vmName}" (this can take a while)...`)
            .run();

          notifySuccess(
            `Backed up "${vmName}" to ${backup.filename} (${formatSize(backup.size)})`,
          );
          console.log();
          console.log(`  Restore it: ${CLI_NAME} restore ${vmName} <new-name>`);
          console.log();
        },
      ),
    );
}
