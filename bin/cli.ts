#!/usr/bin/env node
import pkg from "../package.json";
import { registerBackupCommands } from "../src/commands/backups/command";
import { registerConfigCommand } from "../src/commands/config/command";
import { registerImageCommands } from "../src/commands/images/command";
import { registerMachineCommands } from "../src/commands/machines/command";
import { registerUSBCommands } from "../src/commands/usb/command";
import { CLI_NAME } from "../src/config";
import { CLICommand } from "../src/lib/cli-command";

const program = new CLICommand();

program
  .name(CLI_NAME)
  .description(pkg.description)
  .version(pkg.version, "-V, --version", "Show version");

program.addExamples(`
  $ proxmox config set PROXMOX_HOST=192.168.1.182
  $ proxmox images upload ./nixos.iso
  $ proxmox new my-vm --iso nixos.iso
  $ proxmox get my-vm
  $ proxmox ssh my-vm
  $ proxmox provision my-vm /path/to/flake.nix#config-name
  $ proxmox images new my-vm my-nixos-template
  $ proxmox new clone-vm --template my-nixos-template
  $ proxmox rm my-vm
  $ proxmox backup my-vm
  $ proxmox backups ls
  $ proxmox restore my-vm my-vm-restored
  $ proxmox usb ls
  $ proxmox usb attach my-vm 2357:0604
  $ proxmox usb detach my-vm 2357:0604
`);

registerMachineCommands(program);
registerImageCommands(program);
registerBackupCommands(program);
registerUSBCommands(program);
registerConfigCommand(program);

program.parse(process.argv);
