import { env } from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { spinnerWrap } from "../../lib/loader";
import { makeOption } from "../../lib/options";
import { getVMByName, getVMIP } from "../../proxmox";
import { sshInteractive } from "../../ssh";

export function registerSshCommand(program: CLICommand): void {
  program
    .command("ssh <name> [command...]")
    .description("SSH into a VM or run a command")
    .addOption(
      makeOption({
        flags: "-u, --username <username>",
        description: `SSH username (default: ${env.DEFAULT_SSH_USER})`,
      }),
    )
    .addOption(
      makeOption({
        flags: "-k, --key <path>",
        description: "Path to SSH private key for VM",
      }),
    )
    .action(
      actionWithErrorHandler(
        async (
          name: string,
          command: string[],
          options: { username?: string; key?: string },
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
          const keyPath = options.key ?? env.SSH_KEY_PATH;

          if (command.length > 0) {
            await sshInteractive(ip, username, keyPath, command.join(" "));
          } else {
            await sshInteractive(ip, username, keyPath);
          }
        },
      ),
    );
}
