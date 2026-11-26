import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { parse } from "dotenv";
import { z } from "zod";

export const CLI_NAME = "proxmox";

const CONFIG_DIR = join(homedir(), ".proxmox-cli");
export const CONFIG_PATH = join(CONFIG_DIR, "config.env");

const expandTilde = (path: string) =>
  path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;

const tildePathSchema = z.string().transform(expandTilde);

export const configValidators: Record<string, z.ZodType> = {
  PROXMOX_HOST: z.string().min(1),
  PROXMOX_USER: z.string().min(1),
  PROXMOX_API_TOKEN: z.string().min(1),
  PROXMOX_NODE: z.string().min(1),
  SSH_KEY_PATH: z.string(),
  DEFAULT_VM_STORAGE: z.string(),
  DEFAULT_ISO_STORAGE: z.string(),
  DEFAULT_VM_CPU: z.coerce.number().int().positive(),
  DEFAULT_VM_RAM: z.coerce.number().int().positive(),
  DEFAULT_VM_DISK: z.coerce.number().int().positive(),
  DEFAULT_SSH_USER: z.string(),
};

const fileConfig = existsSync(CONFIG_PATH)
  ? parse(readFileSync(CONFIG_PATH, "utf-8"))
  : {};

for (const [key, value] of Object.entries(fileConfig)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

export const env = createEnv({
  server: {
    PROXMOX_HOST: z.string().optional(),
    PROXMOX_USER: z.string().default("root"),
    PROXMOX_API_TOKEN: z.string().optional(),
    PROXMOX_NODE: z.string().default("pve"),
    SSH_KEY_PATH: tildePathSchema.default(join(homedir(), ".ssh", "id_rsa")),
    DEFAULT_VM_STORAGE: z.string().default("local-lvm"),
    DEFAULT_ISO_STORAGE: z.string().default("local"),
    DEFAULT_VM_CPU: z.coerce.number().int().positive().default(4),
    DEFAULT_VM_RAM: z.coerce.number().int().positive().default(4096),
    DEFAULT_VM_DISK: z.coerce.number().int().positive().default(128),
    DEFAULT_SSH_USER: z.string().default("root"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export function readConfig(): Record<string, string> {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }
  return parse(readFileSync(CONFIG_PATH, "utf-8"));
}

export function writeConfig(config: Record<string, string>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const lines = Object.entries(config).map(([key, value]) => `${key}=${value}`);
  writeFileSync(CONFIG_PATH, `${lines.join("\n")}\n`, "utf-8");
}

export function requireProxmoxHost(): string {
  if (!env.PROXMOX_HOST) {
    throw new Error(
      `PROXMOX_HOST not configured. Run: ${CLI_NAME} config set PROXMOX_HOST=<ip>`,
    );
  }
  return env.PROXMOX_HOST;
}

export function requireApiToken(): string {
  if (!env.PROXMOX_API_TOKEN) {
    throw new Error(
      `PROXMOX_API_TOKEN not configured. Run: ${CLI_NAME} config set PROXMOX_API_TOKEN=<token>`,
    );
  }
  return env.PROXMOX_API_TOKEN;
}
