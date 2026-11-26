import { $ } from "zx";
import { env } from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { makeOption } from "../../lib/options";
import { getVMByName, getVMIP } from "../../proxmox";

export function registerProvisionCommand(program: CLICommand): void {
  program
    .command("provision <name> <flake-ref>")
    .description("Provision a VM with a NixOS flake configuration")
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
              `Could not get IP for VM "${name}". Make sure qemu-guest-agent is installed.`,
            );
          }

          const username = options.username ?? env.DEFAULT_SSH_USER;

          console.log(`Provisioning ${name} (${ip}) with ${flakeRef}...`);
          console.log();

          const sshTarget = `${username}@${ip}`;

          const result = await $({
            stdio: "inherit",
            nothrow: true,
          })`nixos-rebuild switch --flake ${flakeRef} --target-host ${sshTarget} --use-remote-sudo`;

          if (result.exitCode !== 0) {
            throw new Error(
              `Provisioning failed with exit code ${result.exitCode}`,
            );
          }

          console.log();
          notifySuccess(`Provisioned ${name} with ${flakeRef}`);
        },
      ),
    );
}
