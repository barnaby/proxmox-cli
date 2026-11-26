import { describe, expect, test } from "bun:test";
import { CLICommand } from "./cli-command";

function buildProgram() {
  const program = new CLICommand("test-cli");
  program.description("Test CLI");
  return program;
}

describe("makeHelpText", () => {
  test("flat commands without section appear under COMMANDS", () => {
    const program = buildProgram();
    program.command("foo").description("Do foo");
    program.command("bar").description("Do bar");

    const help = program.helpInformation();
    expect(help).toContain("COMMANDS");
    expect(help).toContain("foo");
    expect(help).toContain("bar");
  });

  test("flat commands with section appear under their section header", () => {
    const program = buildProgram();
    program.command("foo").description("Do foo");
    const login = program.command("login").description("Log in");
    (login as CLICommand).section = "account";
    const logout = program.command("logout").description("Log out");
    (logout as CLICommand).section = "account";

    const help = program.helpInformation();
    expect(help).toContain("COMMANDS");
    expect(help).toContain("ACCOUNT");

    const commandsIdx = help.indexOf("COMMANDS");
    const accountIdx = help.indexOf("ACCOUNT");
    const fooIdx = help.indexOf("foo");
    const loginIdx = help.indexOf("login");

    expect(commandsIdx).toBeLessThan(accountIdx);
    expect(fooIdx).toBeLessThan(accountIdx);
    expect(accountIdx).toBeLessThan(loginIdx);
  });

  test("parent commands with sectionTitle use custom header", () => {
    const program = buildProgram();
    program.command("foo").description("Do foo");

    const parent = new CLICommand("keys")
      .description("Manage keys")
      .addSectionTitle("ssh keys");
    parent.command("ls").description("List keys");
    program.addCommand(parent);

    const help = program.helpInformation();
    expect(help).toContain("SSH KEYS");
    expect(help).not.toContain("\nKEYS\n");
  });

  test("rendering order: unsectioned first, then sections and parent commands interleaved by registration order", () => {
    const program = buildProgram();

    program.command("ls").description("List things");

    const billing = program.command("billing").description("Show billing");
    (billing as CLICommand).section = "account";

    const parent = new CLICommand("sync")
      .description("Sync files")
      .addSectionTitle("file sync");
    parent.command("push").description("Push files");
    program.addCommand(parent);

    const help = program.helpInformation();
    const commandsIdx = help.indexOf("COMMANDS");
    const accountIdx = help.indexOf("ACCOUNT");
    const fileSyncIdx = help.indexOf("FILE SYNC");

    expect(commandsIdx).toBeLessThan(accountIdx);
    expect(accountIdx).toBeLessThan(fileSyncIdx);
  });

  test("a parent command registered before a sectioned flat command renders first", () => {
    const program = buildProgram();

    program.command("ls").description("List things");

    const parent = new CLICommand("sync")
      .description("Sync files")
      .addSectionTitle("file sync");
    parent.command("push").description("Push files");
    program.addCommand(parent);

    const whoami = program.command("whoami").description("Show account");
    (whoami as CLICommand).section = "account";

    const help = program.helpInformation();
    const fileSyncIdx = help.indexOf("FILE SYNC");
    const accountIdx = help.indexOf("ACCOUNT");

    expect(fileSyncIdx).toBeGreaterThan(-1);
    expect(fileSyncIdx).toBeLessThan(accountIdx);
  });

  test("root sectionTitle overrides the default COMMANDS header", () => {
    const program = buildProgram();
    program.addSectionTitle("core commands");
    program.command("foo").description("Do foo");

    const help = program.helpInformation();
    expect(help).toContain("CORE COMMANDS");
  });

  test("multiple sections maintain registration order", () => {
    const program = buildProgram();

    const a = program.command("a").description("A cmd");
    (a as CLICommand).section = "first";
    const b = program.command("b").description("B cmd");
    (b as CLICommand).section = "second";
    const c = program.command("c").description("C cmd");
    (c as CLICommand).section = "first";

    const help = program.helpInformation();
    const firstIdx = help.indexOf("FIRST");
    const secondIdx = help.indexOf("SECOND");

    expect(firstIdx).toBeLessThan(secondIdx);
  });

  test("non-adjacent commands with the same section group under one header", () => {
    const program = buildProgram();

    const a = program.command("aone").description("A one");
    (a as CLICommand).section = "first";
    const b = program.command("btwo").description("B two");
    (b as CLICommand).section = "second";
    const c = program.command("cthree").description("C three");
    (c as CLICommand).section = "first";

    const help = program.helpInformation();
    const firstIdx = help.indexOf("FIRST");
    const secondIdx = help.indexOf("SECOND");
    const cIdx = help.indexOf("cthree");

    // cthree registers after the "second" section opens, but must render
    // inside the earlier "first" group, not start a duplicate header.
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(cIdx).toBeGreaterThan(firstIdx);
    expect(cIdx).toBeLessThan(secondIdx);
    expect(help.indexOf("FIRST")).toBe(help.lastIndexOf("FIRST"));
  });
});
