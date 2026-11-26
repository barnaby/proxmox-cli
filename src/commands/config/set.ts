import { parse } from "dotenv";
import { merge } from "lodash";
import {
  CONFIG_PATH,
  configValidators,
  readConfig,
  writeConfig,
} from "../../config";
import { actionWithErrorHandler } from "../../error-handler";
import type { CLICommand } from "../../lib/cli-command";
import { notifySuccess } from "../../lib/colors";

function validateConfigValues(
  values: Record<string, string>,
): string | undefined {
  for (const [key, value] of Object.entries(values)) {
    const validator = configValidators[key];
    if (!validator) {
      const validKeys = Object.keys(configValidators).join(", ");
      return `Unknown config key: ${key}. Valid keys: ${validKeys}`;
    }
    const result = validator.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      return `Invalid value for ${key}: ${issue?.message ?? "validation failed"}`;
    }
  }
  return undefined;
}

export function registerConfigSetCommand(program: CLICommand): void {
  program
    .command("set")
    .description("Set configuration variables (e.g. config set KEY=VALUE)")
    .argument("<assignments...>", "KEY=VALUE pairs to set")
    .action(
      actionWithErrorHandler((_assignments: string[]) => {
        const newValues = parse(_assignments.join("\n"));

        const error = validateConfigValues(newValues);
        if (error) {
          throw new Error(error);
        }

        const existing = readConfig();
        const merged = merge({}, existing, newValues);

        writeConfig(merged);

        notifySuccess(`Config written to ${CONFIG_PATH}`);
      }),
    );
}
