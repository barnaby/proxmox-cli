import { CLI_NAME } from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { whiteBold } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { makeTable } from "../../lib/tables";
import { listISOs, listTemplates } from "../../proxmox";

export function registerListCommand(program: CLICommand): void {
  program
    .command("ls")
    .alias("list")
    .description("List ISOs and templates on Proxmox")
    .action(
      actionWithErrorHandler(async () => {
        const [isos, templates] = await spinnerWrap(() =>
          Promise.all([listISOs(), listTemplates()]),
        )
          .start("Fetching images...")
          .run();

        if (isos.length === 0 && templates.length === 0) {
          console.log();
          console.log("   No ISOs or templates found.");
          console.log(
            `   Use \`${CLI_NAME} images upload <path>\` to upload an ISO.`,
          );
          console.log(
            `   Use \`${CLI_NAME} images new <vm> <name>\` to create a template.`,
          );
          console.log();
          return;
        }

        if (isos.length > 0) {
          console.log();
          console.log(whiteBold("ISOs"));
          console.log();

          const isoTable = makeTable(["Name"]);
          for (const iso of isos) {
            isoTable.push([iso]);
          }
          console.log(isoTable.toString());
        }

        if (templates.length > 0) {
          console.log();
          console.log(whiteBold("Templates"));
          console.log();

          const templateTable = makeTable([
            "ID",
            "Name",
            "CPU",
            "Memory (MB)",
            "Disk (GB)",
          ]);
          for (const t of templates) {
            templateTable.push([
              t.id.toString(),
              t.name,
              t.cores.toString(),
              t.mem.toString(),
              t.disk.toString(),
            ]);
          }
          console.log(templateTable.toString());
        }

        console.log();
      }),
    );
}
