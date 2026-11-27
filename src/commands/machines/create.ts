import { CLI_NAME, env } from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { makeOption } from "../../lib/options";
import {
  cloneFromTemplate,
  createVM,
  getTemplateByName,
  getVMByName,
  listISOs,
  setVMCPUType,
  startVM,
  updateVMResources,
} from "../../proxmox";

export function registerCreateCommand(program: CLICommand): void {
  program
    .command("new <name>")
    .alias("create")
    .description("Create a VM from ISO or template")
    .addOption(
      makeOption({
        flags: "-i, --iso <iso>",
        description: "ISO filename to boot from",
      }),
    )
    .addOption(
      makeOption({
        flags: "-t, --template <template>",
        description: "Template name to clone from",
      }),
    )
    .addOption(
      makeOption({
        flags: "--full",
        description:
          "Create a full clone instead of linked clone (templates only)",
      }),
    )
    .addOption(
      makeOption({
        flags: "-c, --cpu <cores>",
        description: `CPU cores (default: ${env.DEFAULT_VM_CPU})`,
      }),
    )
    .addOption(
      makeOption({
        flags: "--cpu-type <type>",
        description: `CPU type, e.g. host, x86-64-v2-AES (default: ${env.DEFAULT_VM_CPU_TYPE})`,
      }),
    )
    .addOption(
      makeOption({
        flags: "-m, --memory <mb>",
        description: `RAM in MB (default: ${env.DEFAULT_VM_RAM})`,
      }),
    )
    .addOption(
      makeOption({
        flags: "-d, --disk <gb>",
        description: `Disk size in GB (default: ${env.DEFAULT_VM_DISK})`,
      }),
    )
    .addOption(
      makeOption({
        flags: "--autostart",
        description: "Start the VM automatically when the Proxmox host boots",
      }),
    )
    .addOption(
      makeOption({
        flags: "--no-autostart",
        description: "Don't start the VM when the Proxmox host boots",
      }),
    )
    .addOption(
      makeOption({
        flags: "--no-start",
        description: "Don't start the VM after creation",
      }),
    )
    .action(
      actionWithErrorHandler(
        async (
          name: string,
          options: {
            iso?: string;
            template?: string;
            full?: boolean;
            cpu?: string;
            cpuType?: string;
            memory?: string;
            disk?: string;
            autostart?: boolean;
            start: boolean;
          },
        ) => {
          // Validate options
          if (!options.iso && !options.template) {
            throw new Error(
              "Either --iso or --template is required. Use --iso to boot from an ISO or --template to clone from a template.",
            );
          }

          if (options.iso && options.template) {
            throw new Error("Cannot use both --iso and --template");
          }

          // Check if VM name already exists
          const existing = await getVMByName(name);
          if (existing) {
            throw new Error(`VM "${name}" already exists (ID: ${existing.id})`);
          }

          let vmId: number;

          if (options.template) {
            // Clone from template
            const template = await getTemplateByName(options.template);
            if (!template) {
              throw new Error(
                `Template "${options.template}" not found. Use \`${CLI_NAME} images ls\` to see available templates.`,
              );
            }

            vmId = await spinnerWrap(() =>
              cloneFromTemplate(template.id, name, {
                full: options.full,
              }),
            )
              .start(options.full ? "Cloning (full)..." : "Cloning (linked)...")
              .run();

            // A clone inherits the template's CPU type, so set ours explicitly.
            const cpuType = options.cpuType ?? env.DEFAULT_VM_CPU_TYPE;
            await spinnerWrap(() => setVMCPUType(vmId, cpuType))
              .start(`Setting CPU type to ${cpuType}...`)
              .run();

            // Left unset, a clone keeps the template's autostart setting.
            const autostart = options.autostart;
            if (autostart !== undefined) {
              await spinnerWrap(() => updateVMResources(vmId, { autostart }))
                .start(`Turning autostart ${autostart ? "on" : "off"}...`)
                .run();
            }
          } else {
            // Create from ISO - options.iso is guaranteed to be defined here
            const iso = options.iso as string;
            const isos = await listISOs();
            if (!isos.includes(iso)) {
              throw new Error(
                `ISO "${iso}" not found. Use \`${CLI_NAME} images ls\` to see available ISOs.`,
              );
            }

            vmId = await spinnerWrap(() =>
              createVM({
                name,
                iso,
                cpu: options.cpu ? Number.parseInt(options.cpu, 10) : undefined,
                cpuType: options.cpuType,
                ram: options.memory
                  ? Number.parseInt(options.memory, 10)
                  : undefined,
                disk: options.disk
                  ? Number.parseInt(options.disk, 10)
                  : undefined,
                autostart: options.autostart,
              }),
            )
              .start("Creating VM...")
              .run();
          }

          if (options.start !== false) {
            await spinnerWrap(() => startVM(vmId))
              .start("Starting VM...")
              .run();
          }

          notifySuccess(`VM "${name}" created (ID: ${vmId})`);
        },
      ),
    );
}
