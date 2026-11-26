import { existsSync } from "node:fs";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";
import { spinnerWrap } from "../../lib/loader";
import { uploadISO } from "../../proxmox";

export function registerUploadCommand(program: CLICommand): void {
  program
    .command("upload <path>")
    .description("Upload a local ISO to Proxmox")
    .action(
      actionWithErrorHandler(async (localPath: string) => {
        if (!existsSync(localPath)) {
          throw new Error(`File not found: ${localPath}`);
        }

        if (!localPath.endsWith(".iso")) {
          throw new Error("File must be an ISO (.iso extension)");
        }

        const filename = await spinnerWrap(() => uploadISO(localPath))
          .start("Uploading ISO...")
          .run();

        notifySuccess(`Uploaded ${filename}`);
      }),
    );
}
