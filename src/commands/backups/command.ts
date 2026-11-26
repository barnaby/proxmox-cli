import { CLICommand } from "../../lib/cli-command";
import { registerListCommand } from "./list";
import { registerNewCommand } from "./new";
import { registerRestoreCommand } from "./restore";

export function registerBackupCommands(program: CLICommand): void {
  const backupsCommand = new CLICommand("backups").description(
    "Manage VM backups",
  );
  program.addCommand(backupsCommand);

  registerListCommand(backupsCommand);
  registerNewCommand(backupsCommand, "new");
  registerRestoreCommand(backupsCommand);

  // Top-level shortcuts for the two everyday commands.
  registerNewCommand(program, "backup");
  registerRestoreCommand(program);
}
