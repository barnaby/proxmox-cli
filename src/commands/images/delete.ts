import { confirm } from "@inquirer/prompts";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { makeOption } from "../../lib/options";
import {
  deleteISO,
  destroyVM,
  getTemplateByName,
  listISOs,
} from "../../proxmox";

export function registerDeleteCommand(program: CLICommand): void {
  program
    .command("rm <name>")
    .alias("delete")
    .description("Delete an ISO or template from Proxmox")
    .addOption(
      makeOption({
        flags: "-y, --yes",
        description: "Skip confirmation prompt",
      }),
    )
    .action(
      actionWithErrorHandler(
        async (name: string, options: { yes?: boolean }) => {
          // Check if it's an ISO (ends with .iso) or a template
          const isIso = name.endsWith(".iso");

          if (isIso) {
            // Verify ISO exists
            const isos = await spinnerWrap(() => listISOs())
              .start("Checking ISO...")
              .run();

            if (!isos.includes(name)) {
              throw new Error(`ISO "${name}" not found`);
            }

            // Confirm deletion
            if (!options.yes) {
              const confirmed = await confirm({
                message: `Delete ISO "${name}"?`,
                default: false,
              });
              if (!confirmed) {
                console.log("Cancelled");
                return;
              }
            }

            await spinnerWrap(() => deleteISO(name))
              .start("Deleting ISO...")
              .run();

            notifySuccess(`Deleted ISO ${name}`);
          } else {
            // Check if it's a template
            const template = await spinnerWrap(() => getTemplateByName(name))
              .start("Checking template...")
              .run();

            if (!template) {
              throw new Error(
                `Template "${name}" not found. If deleting an ISO, include the .iso extension.`,
              );
            }

            // Confirm deletion
            if (!options.yes) {
              const confirmed = await confirm({
                message: `Delete template "${name}" (ID: ${template.id})?`,
                default: false,
              });
              if (!confirmed) {
                console.log("Cancelled");
                return;
              }
            }

            await spinnerWrap(() => destroyVM(template.id))
              .start("Deleting template...")
              .run();

            notifySuccess(`Deleted template ${name}`);
          }
        },
      ),
    );
}
