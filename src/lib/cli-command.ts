import chalk from "chalk";
import { Command, type CommandOptions, Option } from "commander";
import { whiteBold, yellow } from "./colors";

declare module "commander" {
  interface Command {
    _debug?: boolean;
    _helpOption?: Option;
    _enableDebugCommands?: boolean;
    _hidden?: boolean;
    _requiresAuth?: boolean;
    /**
     * Mark this command as requiring authentication. Implemented on CLICommand;
     * at runtime every Command created via `program.command()` is actually a
     * CLICommand (see `createCommand` override), so this is safe to call on any
     * Commander Command derived from a CLICommand root.
     */
    requiresAuth(): this;
  }
}

export class CLICommand extends Command {
  public debug = true;
  public examples = "";
  public helpNote = "";
  /** Header text used in three render contexts: as this command's group
   * header in its parent's help, as the "<title> commands" heading on its own
   * sub-help screen, and — when set on the root program — as the replacement
   * for the default "commands" header over unsectioned flat commands. */
  public sectionTitle = "";
  /** Groups a flat (leaf) command under a named section header in its
   * parent's help; sections interleave with command groups in registration
   * order. */
  public section = "";

  constructor(name?: string) {
    super(name);
    this.helpCommand(false);
    this.helpOption("-h, --help", "Show help");
    this.showHelpAfterError(true);
  }

  override createCommand(name: string): CLICommand {
    return new CLICommand(name);
  }

  /**
   * Mark this command as requiring authentication. The CLI's preAction hook
   * reads this flag and runs an interactive login if the user has no session.
   */
  override requiresAuth(): this {
    this._requiresAuth = true;
    return this;
  }

  showDebugCommands(showDebugCommands: boolean) {
    this._enableDebugCommands = showDebugCommands;
    return this;
  }

  debugCommand(nameAndArgs: string, opts?: CommandOptions) {
    if (this._enableDebugCommands) {
      const command = super.command(nameAndArgs, opts);
      command._enableDebugCommands = true;
      command._debug = true;
      return command;
    } else {
      return new Command(nameAndArgs);
    }
  }

  override helpInformation(): string {
    return makeHelpText(this);
  }

  addExamples(examples: string) {
    this.examples = examples;
  }

  addHelpNote(note: string) {
    this.helpNote = note;
    return this;
  }

  addSectionTitle(title: string) {
    this.sectionTitle = title;
    return this;
  }

  override addCommand(cmd: Command, opts?: CommandOptions) {
    if (cmd instanceof CLICommand) {
      cmd._enableDebugCommands = this._enableDebugCommands;
      cmd._debug = this._debug;
    }
    return super.addCommand(cmd, opts);
  }
}

const LEFT_PADDING = "  ";

// The flags this screen lists. Respects commander's Option.hideHelp()
// (`makeOption({ hidden: true })`): a hidden flag still parses, it is just
// not advertised.
function visibleOptions(program: CLICommand): Option[] {
  return [program._helpOption, ...program.options].filter(
    (opt): opt is Option => opt !== undefined && !opt.hidden,
  );
}

function makeHelpText(program: CLICommand) {
  const lines: string[] = [];

  // One description column for the whole screen: at least the legacy 45, or
  // wide enough that the longest signature keeps a 2-space gutter. Screens
  // with short signatures render exactly as before; long ones (e.g.
  // `integrations connect <profile> <integration>`) stop overflowing into the
  // descriptions.
  const renderedCommands = allRenderedCommands(program);
  const flagWidths = visibleOptions(program).map((opt) => opt.flags.length);
  const column = Math.max(
    45,
    ...renderedCommands.map((cmd) => makeLeftSide(cmd).length + 2),
    ...flagWidths.map((len) => len + 2),
  );

  if (program._enableDebugCommands) {
    lines.push(yellow("debug commands appear in yellow"));
    lines.push("");
  }

  lines.push(program.description().trim());
  lines.push("");
  lines.push(makeHeader("usage"));
  const usageArgs =
    program.registeredArguments.length > 0
      ? program.registeredArguments
          .map((arg) =>
            arg.required ? required(arg.name()) : optional(arg.name()),
          )
          .join(" ")
      : program.commands.length > 0
        ? required("command")
        : "";
  const ancestors: string[] = [];
  let p = program.parent;
  while (p) {
    ancestors.unshift(p.name());
    p = p.parent;
  }
  lines.push(
    LEFT_PADDING + concat([...ancestors, program.name(), usageArgs, "[flags]"]),
  );
  lines.push("");

  // Respect commander's hidden option (addCommand(cmd, { hidden: true })).
  const visibleCmds = program.commands.filter((c: Command) => !c._hidden);

  // Single classification pass: unsectioned flat commands render first;
  // everything else — flat commands grouped by section, and parent commands
  // as their own group — renders in registration order, so flat sections and
  // command groups interleave.
  type Group =
    | { kind: "section"; title: string; cmds: Command[] }
    | { kind: "parent"; cmd: Command };
  const unsectioned: Command[] = [];
  const groups: Group[] = [];
  const sectionGroups = new Map<string, Command[]>();
  for (const cmd of visibleCmds) {
    if (cmd.commands.length) {
      groups.push({ kind: "parent", cmd });
    } else if (cmd instanceof CLICommand && cmd.section) {
      let cmds = sectionGroups.get(cmd.section);
      if (!cmds) {
        cmds = [];
        sectionGroups.set(cmd.section, cmds);
        groups.push({ kind: "section", title: cmd.section, cmds });
      }
      cmds.push(cmd);
    } else {
      unsectioned.push(cmd);
    }
  }

  if (program.parent && program.commands.length > 0) {
    const title = program.sectionTitle || program.name();
    lines.push(makeHeader(`${title} commands`));
    for (const cmd of unsectioned) {
      lines.push(makeLine(cmd, column));
    }
  } else if (unsectioned.length) {
    lines.push(makeHeader(program.sectionTitle || "commands"));
    for (const cmd of unsectioned) {
      lines.push(makeLine(cmd, column));
    }
  }

  for (const group of groups) {
    lines.push("");
    if (group.kind === "section") {
      lines.push(makeHeader(group.title));
      for (const cmd of group.cmds) {
        lines.push(makeLine(cmd, column));
      }
      continue;
    }
    const cmd = group.cmd;
    lines.push(
      makeHeader(
        cmd instanceof CLICommand && cmd.sectionTitle
          ? cmd.sectionTitle
          : cmd.name(),
      ),
    );
    cmd.commands
      .filter((subcommand: Command) => !subcommand._hidden)
      .forEach((subcommand: Command) => {
        lines.push(makeLine(subcommand, column));
      });
    if (cmd instanceof CLICommand && cmd.helpNote) {
      lines.push("");
      lines.push(LEFT_PADDING + " " + chalk.dim(cmd.helpNote));
    }
  }

  lines.push("");
  const opts = visibleOptions(program);

  if (opts.length) {
    lines.push(makeHeader("flags"));
    opts.forEach((opt) => {
      lines.push(
        concat([
          LEFT_PADDING,
          opt.flags,
          alignRight(opt.description ?? "", opt.flags.length, column),
        ]),
      );
    });
    lines.push("");
  }

  if (program.examples) {
    lines.push(makeHeader("examples"));
    for (const line of program.examples.trim().split("\n")) {
      lines.push(LEFT_PADDING + line.trim());
    }
    lines.push("");
  }
  lines.push("");

  return lines.join("\n");
}

const makeHeader = (text: string) => {
  return whiteBold(text.toLocaleUpperCase());
};

/** Every command a help screen will render — used to size the column.
 * Hidden commands are excluded so they can't widen the visible layout. */
const allRenderedCommands = (program: CLICommand): Command[] => {
  const visible = program.commands.filter((c: Command) => !c._hidden);
  const flatCmds = visible.filter((c: Command) => !c.commands.length);
  const parentCmds = visible.filter((c: Command) => c.commands.length);
  return [
    ...flatCmds,
    ...parentCmds.flatMap((c: Command) =>
      c.commands.filter((sub: Command) => !sub._hidden),
    ),
  ];
};

const makeLeftSide = (cmd: Command) => {
  const args = cmd.registeredArguments
    .map((arg) => (arg.required ? required(arg.name()) : optional(arg.name())))
    .filter((arg) => arg !== "")
    .join(" ");

  return concat([
    concat([
      cmd.parent && cmd.parent.parent ? cmd.parent?.name() : undefined,
      cmd.name(),
    ]),
    args,
    cmd.options.length ? optional("flags") : "",
  ]);
};

const makeLine = (cmd: Command, column: number) => {
  const leftSide = makeLeftSide(cmd);
  const rightSide = cmd.description() || chalk.red("TODO");

  const text = concat([
    LEFT_PADDING,
    leftSide,
    alignRight(rightSide, leftSide.length, column),
  ]);
  return cmd._debug ? yellow(text) : text;
};

const alignRight = (t: string, xIndex: number, column: number) => {
  return " ".repeat(Math.max(1, column - xIndex)) + t;
};

const required = (t: string) => ["<", t, ">"].join("");
const optional = (t: string) => ["[", t, "]"].join("");
const concat = (a: (string | undefined)[]) => a.filter(Boolean).join(" ");
