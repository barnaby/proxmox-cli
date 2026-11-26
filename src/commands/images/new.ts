import { CLI_NAME } from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import {
  addCloudInitDrive,
  convertToTemplate,
  getTemplateByName,
  getVMByName,
  getVMStatus,
  hasCloudInitDrive,
  renameVM,
  stopVM,
  waitForVMStopped,
} from "../../proxmox";

export function registerNewCommand(program: CLICommand): void {
  program
    .command("new <vm> <name>")
    .alias("save")
    .description("Create a template from a VM (with cloud-init for hostname)")
    .action(
      actionWithErrorHandler(async (vmName: string, templateName: string) => {
        // Check if VM exists
        const vm = await getVMByName(vmName);
        if (!vm) {
          throw new Error(`VM "${vmName}" not found`);
        }

        // Check if template name already exists
        const existingTemplate = await getTemplateByName(templateName);
        if (existingTemplate) {
          throw new Error(
            `Template "${templateName}" already exists (ID: ${existingTemplate.id})`,
          );
        }

        // Check if a VM with the template name exists (we'll be renaming)
        if (vmName !== templateName) {
          const existingVM = await getVMByName(templateName);
          if (existingVM) {
            throw new Error(
              `A VM named "${templateName}" already exists (ID: ${existingVM.id})`,
            );
          }
        }

        // Stop VM if running
        const status = await getVMStatus(vm.id);
        if (status === "running") {
          await spinnerWrap(() => stopVM(vm.id))
            .start("Stopping VM...")
            .run();
          await spinnerWrap(() => waitForVMStopped(vm.id))
            .start("Waiting for VM to stop...")
            .run();
        }

        // Add cloud-init drive if not present (enables hostname injection on clone)
        const hasCloudInit = await hasCloudInitDrive(vm.id);
        if (!hasCloudInit) {
          await spinnerWrap(() => addCloudInitDrive(vm.id))
            .start("Adding cloud-init drive...")
            .run();
        }

        // Rename VM to template name if different
        if (vmName !== templateName) {
          await spinnerWrap(() => renameVM(vm.id, templateName))
            .start("Renaming VM...")
            .run();
        }

        // Convert to template
        await spinnerWrap(() => convertToTemplate(vm.id))
          .start("Converting to template...")
          .run();

        notifySuccess(`Created template "${templateName}" (ID: ${vm.id})`);
        console.log();
        console.log(
          `  Clone it: ${CLI_NAME} new <name> --template ${templateName}`,
        );
        console.log(
          "  The VM name will be set as the hostname via cloud-init.",
        );
        console.log();
      }),
    );
}
