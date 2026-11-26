import { CLI_NAME } from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess, yellow } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { makeOption } from "../../lib/options";
import {
  findBackup,
  getTemplateByName,
  listBackups,
  listVMs,
  restoreBackup,
} from "../../proxmox";

export function registerRestoreCommand(program: CLICommand): void {
  program
    .command("restore <backup> [name]")
    .description(
      "Restore a backup as a new VM (<backup>: a backup file, or a VM name for its latest backup)",
    )
    .addOption(
      makeOption({
        flags: "--new-mac",
        description:
          "Give the restored VM a new MAC address (use when the original VM still exists)",
      }),
    )
    .addOption(
      makeOption({
        flags: "--storage <storage>",
        description: "Storage the backup is on",
      }),
    )
    .addOption(
      makeOption({
        flags: "--vm-storage <storage>",
        description:
          "Storage for the restored disks (default: where they were backed up from)",
      }),
    )
    .action(
      actionWithErrorHandler(
        async (
          ref: string,
          nameArg: string | undefined,
          options: { newMac?: boolean; storage?: string; vmStorage?: string },
        ) => {
          const [backups, vms] = await spinnerWrap(() =>
            Promise.all([listBackups(options.storage), listVMs()]),
          )
            .start("Finding backup...")
            .run();

          const backup = findBackup(
            backups,
            ref,
            vms.find((vm) => vm.name === ref)?.id,
          );
          if (!backup) {
            throw new Error(
              `No backup found for "${ref}". Run \`${CLI_NAME} backups ls\` to see what is available.`,
            );
          }

          const name = nameArg ?? backup.vmName;
          if (!name) {
            throw new Error(
              `${backup.filename} does not record a VM name. Pass one: ${CLI_NAME} restore ${ref} <name>`,
            );
          }
          if (
            vms.some((vm) => vm.name === name) ||
            (await getTemplateByName(name))
          ) {
            throw new Error(
              nameArg
                ? `A VM named "${name}" already exists`
                : `A VM named "${name}" already exists. Restore under another name: ${CLI_NAME} restore ${ref} <name>`,
            );
          }

          const vmId = await spinnerWrap(() =>
            restoreBackup(backup, name, {
              newMac: options.newMac,
              storage: options.vmStorage,
            }),
          )
            .start(
              `Restoring ${backup.filename} as "${name}" (this can take a while)...`,
            )
            .run();

          notifySuccess(
            `Restored ${backup.filename} as "${name}" (ID: ${vmId})`,
          );
          console.log();
          const original = vms.find((vm) => vm.id === backup.vmId);
          if (original && !options.newMac) {
            console.log(
              yellow(
                `  "${name}" has the same MAC address as "${original.name}". Do not run both at once.`,
              ),
            );
          }
          console.log(`  Start it: ${CLI_NAME} start ${name}`);
          console.log();
        },
      ),
    );
}
