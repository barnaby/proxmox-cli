import type { CLICommand } from "../../lib/cli-command";
import { registerCreateCommand } from "./create";
import { registerDestroyCommand } from "./destroy";
import { registerGetCommand } from "./get";
import { registerInstallCommand } from "./install";
import { registerListCommand } from "./list";
import { registerProvisionCommand } from "./provision";
import { registerSshCommand } from "./ssh";
import { registerStartCommand } from "./start";
import { registerStopCommand } from "./stop";

export function registerMachineCommands(program: CLICommand): void {
  registerListCommand(program);
  registerGetCommand(program);
  registerCreateCommand(program);
  registerStartCommand(program);
  registerStopCommand(program);
  registerDestroyCommand(program);
  registerSshCommand(program);
  registerProvisionCommand(program);
  registerInstallCommand(program);
}
