import { $ } from "zx";
import { env } from "./config";

export interface SSHResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// sshExec is still needed for lsusb command (no API equivalent)
export async function sshExec(
  host: string,
  user: string,
  command: string,
  options: { nothrow?: boolean } = {},
): Promise<SSHResult> {
  const args = [
    "-i",
    env.SSH_KEY_PATH,
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    `${user}@${host}`,
    command,
  ];

  const result = await $({
    quiet: true,
    nothrow: true,
  })`ssh ${args}`;

  if (!options.nothrow && result.exitCode !== 0) {
    throw new Error(`SSH command failed: ${result.stderr}`);
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 0,
  };
}

// sshInteractive is used for connecting to VMs
export async function sshInteractive(
  host: string,
  user: string,
  keyPath: string,
  command?: string,
): Promise<void> {
  const args = [
    "-i",
    keyPath,
    "-o",
    "StrictHostKeyChecking=accept-new",
    `${user}@${host}`,
  ];

  if (command) {
    await $({ stdio: "inherit" })`ssh ${args} ${command}`;
  } else {
    await $({ stdio: "inherit", nothrow: true })`ssh ${args}`;
  }
}
