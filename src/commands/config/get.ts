import chalk from "chalk";
import { CONFIG_PATH, env, readConfig } from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { type AttributeRow, attributeTable } from "../../lib/tables";

export function registerConfigGetCommand(program: CLICommand): void {
  program
    .command("get")
    .description("Show current configuration")
    .action(
      actionWithErrorHandler(() => {
        const config = { ...env };
        const fileOverrides = readConfig();

        const display: Record<string, unknown> = { ...config };

        const rows: AttributeRow[] = Object.entries(display).map(
          ([key, value]) => {
            if (key in fileOverrides) {
              return { key: `${key} *`, value: value as string };
            }
            return { key, value: value as string };
          },
        );

        const hasOverrides = rows.some((r) => r?.key.endsWith(" *"));
        if (hasOverrides) {
          console.log(
            chalk.dim(`Values marked with * are set in ${CONFIG_PATH}`),
          );
        }

        console.log(attributeTable(rows));
      }),
    );
}
