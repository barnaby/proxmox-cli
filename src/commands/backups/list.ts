import { CLI_NAME } from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { spinnerWrap } from "../../lib/loader";
import { makeOption } from "../../lib/options";
import { makeTable } from "../../lib/tables";
import { getVMByName, listBackups } from "../../proxmox";
import { formatSize } from "./format";

export function registerListCommand(program: CLICommand): void {
  program
    .command("ls [vm]")
    .alias("list")
    .description("List backups, optionally only those of one VM")
    .addOption(
      makeOption({
        flags: "--storage <storage>",
        description: "Storage to look for backups on",
      }),
    )
    .action(
      actionWithErrorHandler(
        async (vmName: string | undefined, options: { storage?: string }) => {
          const backups = await spinnerWrap(async () => {
            const all = await listBackups(options.storage);
            if (!vmName) {
              return all;
            }
            const vm = await getVMByName(vmName);
            return all.filter(
              (b) => b.vmName === vmName || (vm && b.vmId === vm.id),
            );
          })
            .start("Fetching backups...")
            .run();

          if (backups.length === 0) {
            console.log();
            console.log(
              vmName ? `   No backups of "${vmName}".` : "   No backups yet.",
            );
            console.log(`   Use \`${CLI_NAME} backup <vm>\` to create one.`);
            console.log();
            return;
          }

          const table = makeTable(["Backup", "VM", "Size", "Created"]);
          for (const b of backups) {
            table.push([
              b.filename,
              b.vmName ?? `ID ${b.vmId}`,
              formatSize(b.size),
              b.createdAt.toLocaleString(),
            ]);
          }
          console.log(table.toString());
        },
      ),
    );
}
