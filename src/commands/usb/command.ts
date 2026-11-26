import { CLICommand } from "../../lib/cli-command";
import { registerAttachCommand } from "./attach";
import { registerDetachCommand } from "./detach";
import { registerListCommand } from "./list";

export function registerUSBCommands(program: CLICommand): void {
  const usbCommand = new CLICommand("usb").description(
    "Manage USB passthrough",
  );
  program.addCommand(usbCommand);

  registerListCommand(usbCommand);
  registerAttachCommand(usbCommand);
  registerDetachCommand(usbCommand);
}
