import { Option } from "commander";

export function makeOption({
  flags,
  description,
  defaultValue,
  choices,
  mandatory,
  variadic,
  hidden,
}: {
  flags: string;
  description?: string;
  defaultValue?: string;
  choices?: string[];
  mandatory?: boolean;
  variadic?: boolean;
  /** Still parsed, but left out of --help. */
  hidden?: boolean;
}): Option {
  const option = new Option(flags, description);
  if (hidden) {
    option.hideHelp();
  }
  if (mandatory) {
    option.makeOptionMandatory();
  }
  if (defaultValue) {
    option.default(defaultValue);
  }
  if (choices) {
    option.choices(choices);
  }
  if (variadic) {
    option.argParser((value: string, previous: string[] | undefined) => {
      if (previous === undefined || previous === null) {
        return [value];
      }
      return previous.concat(value);
    });
  }
  return option;
}
