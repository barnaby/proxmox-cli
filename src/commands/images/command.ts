import { CLICommand } from "../../lib/cli-command";
import { registerDeleteCommand } from "./delete";
import { registerListCommand } from "./list";
import { registerNewCommand } from "./new";
import { registerUploadCommand } from "./upload";

export function registerImageCommands(program: CLICommand): void {
  const imagesCommand = new CLICommand("images").description(
    "Manage ISOs and templates on Proxmox",
  );
  program.addCommand(imagesCommand);

  registerListCommand(imagesCommand);
  registerUploadCommand(imagesCommand);
  registerDeleteCommand(imagesCommand);
  registerNewCommand(imagesCommand);
}
