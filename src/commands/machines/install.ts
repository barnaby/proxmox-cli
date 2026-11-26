import { $ } from "zx";
import { env } from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { makeOption } from "../../lib/options";
import { getVMByName, getVMIP } from "../../proxmox";

export function registerInstallCommand(program: CLICommand): void {
  program
    .command("install <name> <flake-ref>")
    .description("Install NixOS on a VM booted from ISO (uses nixos-anywhere)")
    .addOption(
      makeOption({
        flags: "-u, --username <username>",
        description: `SSH username (default: ${env.DEFAULT_SSH_USER})`,
      }),
    )
    .action(
      actionWithErrorHandler(
        async (
          name: string,
          flakeRef: string,
          options: { username?: string },
        ) => {
          const vm = await getVMByName(name);
          if (!vm) {
            throw new Error(`VM "${name}" not found`);
          }

          if (vm.status.toLowerCase() !== "running") {
            throw new Error(
              `VM "${name}" is not running (status: ${vm.status})`,
            );
          }

          const ip = await spinnerWrap(() => getVMIP(vm.id))
            .start("Getting VM IP...")
            .run();

          if (!ip) {
            throw new Error(
              `Could not get IP for VM "${name}". Wait for the ISO to boot and try again.`,
            );
          }

          const username = options.username ?? env.DEFAULT_SSH_USER;

          console.log(
            `Installing NixOS on ${name} (${ip}) with ${flakeRef}...`,
          );
          console.log();

          const sshTarget = `${username}@${ip}`;

          // Use nix run to execute nixos-anywhere
          const result = await $({
            stdio: "inherit",
            nothrow: true,
          })`nix --extra-experimental-features ${"nix-command flakes"} run github:nix-community/nixos-anywhere -- --flake ${flakeRef} ${sshTarget}`;

          if (result.exitCode !== 0) {
            throw new Error(
              `Installation failed with exit code ${result.exitCode}`,
            );
          }

          console.log();
          notifySuccess(`Installed NixOS on ${name} with ${flakeRef}`);
          console.log();
          console.log("The VM has rebooted. You can now:");
          console.log(`  - SSH: proxmox ssh ${name}`);
          console.log(
            `  - Convert to template: proxmox images new ${name} <template-name>`,
          );
          console.log();
        },
      ),
    );
}
