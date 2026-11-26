import { getClient } from "./api";
import { env, requireProxmoxHost } from "./config";
import { sshExec } from "./ssh";

interface NodeStatusResponse {
  uptime: number;
  pveversion: string;
  loadavg: string[];
  cpuinfo: {
    model: string;
    sockets: number;
    cores: number;
    cpus: number;
    flags?: string;
  };
  memory: { total: number; used: number };
  swap: { total: number; used: number };
  "current-kernel"?: { release: string; machine: string };
  "boot-info"?: { mode: string; secureboot?: number };
}

interface NodeListResponse {
  node: string;
  cpu?: number;
}

interface DiskResponse {
  devpath: string;
  model?: string;
  type?: string;
  size: number;
  health?: string;
  // Percentage of life remaining, or "N/A".
  wearout?: number | string;
}

interface StorageResponse {
  storage: string;
  type: string;
  content?: string;
  active?: number;
  total?: number;
  used?: number;
}

export interface MemoryModule {
  size: string;
  type: string | null;
  speed: string | null;
  manufacturer: string | null;
  partNumber: string | null;
}

export interface MemoryHardware {
  modules: MemoryModule[];
  slots: number | null;
  maxCapacity: string | null;
}

// Details the API does not expose, read over SSH.
export interface HostHardware {
  manufacturer: string | null;
  model: string | null;
  bios: string | null;
  cpuMaxMHz: number | null;
  memory: MemoryHardware;
}

export interface HostDisk {
  device: string;
  model: string | null;
  type: string | null;
  size: number;
  health: string | null;
  wearPercent: number | null;
}

export interface HostStorage {
  name: string;
  type: string;
  content: string[];
  total: number;
  used: number;
}

export interface HostInfo {
  node: string;
  pveVersion: string;
  kernel: string | null;
  arch: string | null;
  bootMode: string | null;
  secureBoot: boolean | null;
  uptime: number;
  cpu: {
    model: string;
    sockets: number;
    cores: number;
    threads: number;
    virtualization: string | null;
    // Fraction (0-1) of all host threads in use.
    usage: number | null;
    loadAverage: string[];
  };
  memory: { total: number; used: number };
  swap: { total: number; used: number };
  disks: HostDisk[];
  storage: HostStorage[];
  // null when the host could not be reached over SSH.
  hardware: HostHardware | null;
}

function field(block: string, name: string): string | null {
  const match = block.match(new RegExp(`^\\s*${name}:\\s*(.+?)\\s*$`, "m"));
  const value = match?.[1];
  if (!value || /^(unknown|not specified|none)$/i.test(value)) {
    return null;
  }
  return value;
}

// Parses `dmidecode -t memory`. Empty slots are counted but not returned.
export function parseDmidecodeMemory(output: string): MemoryHardware {
  const blocks = output.split(/\n(?=\S)/);
  const array = blocks.find((block) =>
    block.startsWith("Physical Memory Array"),
  );
  const devices = blocks.filter((block) => block.startsWith("Memory Device"));

  const modules: MemoryModule[] = [];
  for (const device of devices) {
    const size = field(device, "Size");
    if (!size || /no module installed/i.test(size)) {
      continue;
    }
    modules.push({
      size,
      type: field(device, "Type"),
      speed: field(device, "Speed"),
      manufacturer: field(device, "Manufacturer"),
      partNumber: field(device, "Part Number"),
    });
  }

  const slots = array ? field(array, "Number Of Devices") : null;
  return {
    modules,
    slots: slots ? Number(slots) : devices.length || null,
    maxCapacity: array ? field(array, "Maximum Capacity") : null,
  };
}

const SECTION = "@@section@@";

async function getHostHardware(): Promise<HostHardware | null> {
  const commands = [
    "dmidecode -s system-manufacturer",
    "dmidecode -s system-product-name",
    "dmidecode -s bios-version",
    "lscpu",
    "dmidecode -t memory",
  ];
  const result = await sshExec(
    requireProxmoxHost(),
    env.PROXMOX_USER,
    commands.map((c) => `${c} 2>/dev/null`).join(`; echo '${SECTION}'; `),
    { nothrow: true },
  );
  const sections = result.stdout.split(SECTION).map((s) => s.trim());
  if (result.exitCode !== 0 && sections.length !== commands.length) {
    return null;
  }

  const [manufacturer, model, bios, lscpu, memory] = sections;
  const maxMHz = lscpu?.match(/^CPU max MHz:\s*([\d.]+)/m)?.[1];
  return {
    manufacturer: manufacturer || null,
    model: model || null,
    bios: bios || null,
    cpuMaxMHz: maxMHz ? Number(maxMHz) : null,
    memory: parseDmidecodeMemory(memory ?? ""),
  };
}

function virtualization(flags: string | undefined): string | null {
  const set = new Set(flags?.split(" "));
  if (set.has("vmx")) {
    return "VT-x";
  }
  if (set.has("svm")) {
    return "AMD-V";
  }
  return null;
}

// Logical CPUs (threads) on the host: the most vCPUs one VM can start with.
export async function getHostCPUCount(): Promise<number> {
  const client = getClient();
  const status = await client.get<NodeStatusResponse>(
    `/nodes/${env.PROXMOX_NODE}/status`,
  );
  return status.data.cpuinfo.cpus;
}

export async function getHostInfo(): Promise<HostInfo> {
  const client = getClient();
  const node = env.PROXMOX_NODE;

  const [status, nodes, disks, storage, hardware] = await Promise.all([
    client.get<NodeStatusResponse>(`/nodes/${node}/status`),
    client.get<NodeListResponse[]>("/nodes"),
    // Listing disks needs extra privileges; the rest is still worth showing.
    client
      .get<DiskResponse[]>(`/nodes/${node}/disks/list`)
      .then((r) => r.data)
      .catch(() => []),
    client.get<StorageResponse[]>(`/nodes/${node}/storage`),
    getHostHardware().catch(() => null),
  ]);

  const s = status.data;
  return {
    node,
    pveVersion: s.pveversion.split("/")[1] ?? s.pveversion,
    kernel: s["current-kernel"]?.release ?? null,
    arch: s["current-kernel"]?.machine ?? null,
    bootMode: s["boot-info"]?.mode ?? null,
    secureBoot:
      s["boot-info"]?.secureboot === undefined
        ? null
        : s["boot-info"].secureboot === 1,
    uptime: s.uptime,
    cpu: {
      model: s.cpuinfo.model,
      sockets: s.cpuinfo.sockets,
      cores: s.cpuinfo.cores,
      threads: s.cpuinfo.cpus,
      virtualization: virtualization(s.cpuinfo.flags),
      usage: nodes.data.find((n) => n.node === node)?.cpu ?? null,
      loadAverage: s.loadavg,
    },
    memory: { total: s.memory.total, used: s.memory.used },
    swap: { total: s.swap.total, used: s.swap.used },
    disks: disks.map((disk) => ({
      device: disk.devpath,
      model: disk.model?.replaceAll("_", " ") ?? null,
      type: disk.type ?? null,
      size: disk.size,
      health: disk.health ?? null,
      wearPercent: typeof disk.wearout === "number" ? 100 - disk.wearout : null,
    })),
    storage: storage.data
      .filter((item) => item.active === 1)
      .map((item) => ({
        name: item.storage,
        type: item.type,
        content: item.content?.split(",").sort() ?? [],
        total: item.total ?? 0,
        used: item.used ?? 0,
      })),
    hardware,
  };
}
