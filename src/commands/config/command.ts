import { CLICommand } from "../../lib/cli-command";
import { registerConfigGetCommand } from "./get";
import { registerConfigSetCommand } from "./set";

export function registerConfigCommand(program: CLICommand): void {
  const configCommand = new CLICommand("config").description(
    "View and manage configuration",
  );
  program.addCommand(configCommand);

  registerConfigGetCommand(configCommand);
  registerConfigSetCommand(configCommand);
}
