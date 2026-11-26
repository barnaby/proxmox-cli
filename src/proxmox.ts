import { basename } from "node:path";
import {
  getClient,
  type NetworkInterface,
  type StorageContentItem,
  type TaskStatusResponse,
  type VMConfigResponse,
  type VMListResponse,
  type VMStatusResponse,
} from "./api";
import { env, requireProxmoxHost } from "./config";
import { sshExec } from "./ssh";

export interface VM {
  id: number;
  name: string;
  status: string;
  mem: number;
  bootdisk: number;
  pid: number | null;
}

export interface VMWithIP extends VM {
  ip: string | null;
}

export async function listVMs(): Promise<VM[]> {
  const client = getClient();
  const result = await client.get<VMListResponse[]>(
    `/nodes/${env.PROXMOX_NODE}/qemu`,
  );

  return result.data
    .filter((vm) => vm.template !== 1) // Exclude templates
    .map((vm) => ({
      id: vm.vmid,
      name: vm.name ?? "",
      status: vm.status,
      mem: vm.maxmem ? Math.round(vm.maxmem / 1024 / 1024) : 0,
      bootdisk: vm.maxdisk ? Math.round(vm.maxdisk / 1024 / 1024 / 1024) : 0,
      pid: vm.pid ?? null,
    }));
}

export async function getVMByName(name: string): Promise<VM | undefined> {
  const vms = await listVMs();
  return vms.find((vm) => vm.name === name);
}

export async function getNextVMId(): Promise<number> {
  const client = getClient();
  const result = await client.get<number>("/cluster/nextid");
  return result.data;
}

export async function getVMStatus(vmId: number): Promise<string> {
  const client = getClient();
  const result = await client.get<VMStatusResponse>(
    `/nodes/${env.PROXMOX_NODE}/qemu/${vmId}/status/current`,
  );
  return result.data.status;
}

export async function getVMIP(vmId: number): Promise<string | null> {
  const client = getClient();

  // Try qemu-guest-agent first (most reliable when available)
  try {
    const result = await client.get<{ result: NetworkInterface[] }>(
      `/nodes/${env.PROXMOX_NODE}/qemu/${vmId}/agent/network-get-interfaces`,
    );

    for (const iface of result.data.result ?? []) {
      if (iface.name === "lo") {
        continue;
      }
      for (const addr of iface["ip-addresses"] ?? []) {
        if (addr["ip-address-type"] === "ipv4") {
          return addr["ip-address"];
        }
      }
    }
  } catch {
    // Guest agent not available, fall back to ARP lookup
  }

  // Fall back to ARP lookup on the Proxmox host
  return getVMIPFromARP(vmId);
}

async function getVMIPFromARP(vmId: number): Promise<string | null> {
  try {
    const mac = await getVMMAC(vmId);
    if (!mac) {
      return null;
    }

    const host = requireProxmoxHost();
    const macLower = mac.toLowerCase();

    // First check existing ARP cache (fast)
    const cacheResult = await sshExec(host, env.PROXMOX_USER, "ip neigh show");
    if (cacheResult.exitCode === 0) {
      for (const line of cacheResult.stdout.split("\n")) {
        if (line.toLowerCase().includes(macLower)) {
          const match = line.match(/^(\d+\.\d+\.\d+\.\d+)\s/);
          if (match?.[1]) {
            return match[1];
          }
        }
      }
    }

    // Fall back to active scan with arp-scan (slower but reliable)
    // Scan the local network on vmbr0
    const scanResult = await sshExec(
      host,
      env.PROXMOX_USER,
      "arp-scan --interface=vmbr0 --localnet 2>/dev/null || true",
    );
    if (scanResult.exitCode === 0) {
      // Parse: 192.168.1.205\tbc:24:11:4a:f7:cf\t(Unknown)
      for (const line of scanResult.stdout.split("\n")) {
        if (line.toLowerCase().includes(macLower)) {
          const match = line.match(/^(\d+\.\d+\.\d+\.\d+)\s/);
          if (match?.[1]) {
            return match[1];
          }
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function getVMConfig(vmId: number): Promise<VMConfigResponse> {
  const client = getClient();
  const result = await client.get<VMConfigResponse>(
    `/nodes/${env.PROXMOX_NODE}/qemu/${vmId}/config`,
  );
  return result.data;
}

export async function getVMMAC(vmId: number): Promise<string | null> {
  const config = await getVMConfig(vmId);
  if (!config.net0) {
    return null;
  }
  const match = config.net0.match(/virtio=([^,]+)/);
  return match ? (match[1] ?? null) : null;
}

export async function getVMCores(vmId: number): Promise<number | null> {
  const config = await getVMConfig(vmId);
  return config.cores ?? null;
}

// What a VM runs with when its config has no `cpu` entry.
export const PROXMOX_DEFAULT_CPU_TYPE = "kvm64";

// The config value is `[cputype=]<type>[,flags=...][,hidden=1]...`.
export function parseCPUType(cpu: string | undefined): string | null {
  if (!cpu) {
    return null;
  }
  const parts = cpu.split(",").map((part) => part.trim());
  const explicit = parts.find((part) => part.startsWith("cputype="));
  if (explicit) {
    return explicit.slice("cputype=".length) || null;
  }
  return parts.find((part) => part && !part.includes("=")) ?? null;
}

export async function setVMCPUType(
  vmId: number,
  cpuType: string,
): Promise<void> {
  const client = getClient();
  await client.put(`/nodes/${env.PROXMOX_NODE}/qemu/${vmId}/config`, {
    cpu: cpuType,
  });
}

export interface CreateVMOptions {
  name: string;
  iso: string;
  cpu?: number;
  cpuType?: string;
  ram?: number;
  disk?: number;
  storage?: string;
  isoStorage?: string;
}

export async function createVM(options: CreateVMOptions): Promise<number> {
  const client = getClient();
  const vmId = await getNextVMId();

  const cpu = options.cpu ?? env.DEFAULT_VM_CPU;
  const ram = options.ram ?? env.DEFAULT_VM_RAM;
  const disk = options.disk ?? env.DEFAULT_VM_DISK;
  const storage = options.storage ?? env.DEFAULT_VM_STORAGE;
  const isoStorage = options.isoStorage ?? env.DEFAULT_ISO_STORAGE;

  await client.post(`/nodes/${env.PROXMOX_NODE}/qemu`, {
    vmid: vmId,
    name: options.name,
    memory: ram,
    cores: cpu,
    cpu: options.cpuType ?? env.DEFAULT_VM_CPU_TYPE,
    net0: "virtio,bridge=vmbr0",
    scsihw: "virtio-scsi-pci",
    scsi0: `${storage}:${disk}`,
    ide2: `${isoStorage}:iso/${options.iso},media=cdrom`,
    boot: "order=scsi0",
    bootdisk: "scsi0",
    ostype: "l26",
    agent: "enabled=1",
    vga: "std",
    bios: "ovmf",
    efidisk0: `${storage}:1,efitype=4m,pre-enrolled-keys=0`,
  });

  return vmId;
}

export async function startVM(vmId: number): Promise<void> {
  const client = getClient();
  await client.post(`/nodes/${env.PROXMOX_NODE}/qemu/${vmId}/status/start`);
}

export async function stopVM(vmId: number): Promise<void> {
  const client = getClient();
  await client.post(`/nodes/${env.PROXMOX_NODE}/qemu/${vmId}/status/stop`);
}

export async function waitForVMStopped(vmId: number): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const status = await getVMStatus(vmId);
    if (status === "stopped") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Timeout waiting for VM to stop");
}

export async function waitForTask(upid: string): Promise<void> {
  const client = getClient();
  // UPID format: UPID:node:pid:pstart:starttime:type:id:user@realm:
  // We need to poll /nodes/{node}/tasks/{upid}/status
  for (let i = 0; i < 120; i++) {
    const result = await client.get<TaskStatusResponse>(
      `/nodes/${env.PROXMOX_NODE}/tasks/${encodeURIComponent(upid)}/status`,
    );
    if (result.data.status === "stopped") {
      if (result.data.exitstatus !== "OK") {
        throw new Error(`Task failed: ${result.data.exitstatus}`);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timeout waiting for task to complete");
}

export async function destroyVM(vmId: number): Promise<void> {
  const client = getClient();

  // Stop first if running (ignore errors)
  try {
    await client.post(`/nodes/${env.PROXMOX_NODE}/qemu/${vmId}/status/stop`);
  } catch {
    // Ignore - VM might already be stopped
  }

  // Wait for VM to stop
  await waitForVMStopped(vmId);

  // Destroy with purge
  await client.delete(
    `/nodes/${env.PROXMOX_NODE}/qemu/${vmId}?purge=1&destroy-unreferenced-disks=1`,
  );
}

export async function listISOs(): Promise<string[]> {
  const client = getClient();
  const result = await client.get<StorageContentItem[]>(
    `/nodes/${env.PROXMOX_NODE}/storage/${env.DEFAULT_ISO_STORAGE}/content?content=iso`,
  );

  return result.data
    .filter((item) => item.volid.includes(":iso/"))
    .map((item) => {
      // volid format: storage:iso/filename.iso
      const parts = item.volid.split("/");
      return parts[parts.length - 1] ?? "";
    })
    .filter((name) => name.endsWith(".iso"));
}

export async function uploadISO(localPath: string): Promise<string> {
  const client = getClient();
  const filename = basename(localPath);
  if (!filename) {
    throw new Error("Invalid file path");
  }

  await client.upload(
    `/nodes/${env.PROXMOX_NODE}/storage/${env.DEFAULT_ISO_STORAGE}/upload`,
    localPath,
    "iso",
  );

  return filename;
}

export async function deleteISO(filename: string): Promise<void> {
  const client = getClient();
  const volume = `${env.DEFAULT_ISO_STORAGE}:iso/${filename}`;
  await client.delete(
    `/nodes/${env.PROXMOX_NODE}/storage/${env.DEFAULT_ISO_STORAGE}/content/${encodeURIComponent(volume)}`,
  );
}

// USB Passthrough

export interface USBDevice {
  bus: string;
  device: string;
  vendorId: string;
  productId: string;
  description: string;
}

export interface VMUSBDevice {
  slot: string;
  vendorId: string;
  productId: string;
}

// listUSBDevices still uses SSH because there's no API endpoint for lsusb on the host
export async function listUSBDevices(): Promise<USBDevice[]> {
  const host = requireProxmoxHost();
  const result = await sshExec(host, env.PROXMOX_USER, "lsusb");
  if (result.exitCode !== 0) {
    throw new Error(`Failed to list USB devices: ${result.stderr}`);
  }

  // Parse: Bus 001 Device 002: ID 2357:0604 TP-Link TP-Link Bluetooth USB Adapter
  return result.stdout
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const match = line.match(
        /Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+([0-9a-f]+):([0-9a-f]+)\s+(.*)/i,
      );
      if (!match) {
        return null;
      }
      return {
        bus: match[1] ?? "",
        device: match[2] ?? "",
        vendorId: match[3] ?? "",
        productId: match[4] ?? "",
        description: match[5] ?? "",
      };
    })
    .filter((d): d is USBDevice => d !== null);
}

export async function getVMUSBDevices(vmId: number): Promise<VMUSBDevice[]> {
  const config = await getVMConfig(vmId);
  const devices: VMUSBDevice[] = [];

  for (let i = 0; i <= 4; i++) {
    const key = `usb${i}` as keyof VMConfigResponse;
    const value = config[key];
    if (typeof value === "string") {
      const match = value.match(/host=([0-9a-f]+):([0-9a-f]+)/i);
      if (match) {
        devices.push({
          slot: `usb${i}`,
          vendorId: match[1] ?? "",
          productId: match[2] ?? "",
        });
      }
    }
  }

  return devices;
}

export async function getNextUSBSlot(vmId: number): Promise<string> {
  const devices = await getVMUSBDevices(vmId);
  const usedSlots = new Set(devices.map((d) => d.slot));

  for (let i = 0; i <= 4; i++) {
    const slot = `usb${i}`;
    if (!usedSlots.has(slot)) {
      return slot;
    }
  }
  throw new Error("No available USB slots (max 5)");
}

export async function attachUSBToVM(
  vmId: number,
  vendorId: string,
  productId: string,
): Promise<string> {
  const host = requireProxmoxHost();
  const slot = await getNextUSBSlot(vmId);

  // USB passthrough requires root shell access - API tokens cannot configure real USB devices
  const result = await sshExec(
    host,
    env.PROXMOX_USER,
    `qm set ${vmId} -${slot} host=${vendorId}:${productId}`,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to attach USB device: ${result.stderr}`);
  }

  return slot;
}

export async function detachUSBFromVM(
  vmId: number,
  slot: string,
): Promise<void> {
  const host = requireProxmoxHost();

  // USB passthrough requires root shell access - API tokens cannot configure real USB devices
  const result = await sshExec(
    host,
    env.PROXMOX_USER,
    `qm set ${vmId} -delete ${slot}`,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to detach USB device: ${result.stderr}`);
  }
}

export async function findUSBSlotByDevice(
  vmId: number,
  vendorId: string,
  productId: string,
): Promise<string | null> {
  const devices = await getVMUSBDevices(vmId);
  const device = devices.find(
    (d) => d.vendorId === vendorId && d.productId === productId,
  );
  return device?.slot ?? null;
}

// Templates

export interface Template {
  id: number;
  name: string;
  mem: number;
  cores: number;
  disk: number;
}

export async function listTemplates(): Promise<Template[]> {
  const client = getClient();
  const result = await client.get<VMListResponse[]>(
    `/nodes/${env.PROXMOX_NODE}/qemu`,
  );

  const templates: Template[] = [];
  for (const vm of result.data) {
    if (vm.template === 1) {
      const config = await getVMConfig(vm.vmid);
      templates.push({
        id: vm.vmid,
        name: vm.name ?? "",
        mem: vm.maxmem ? Math.round(vm.maxmem / 1024 / 1024) : 0,
        cores: config.cores ?? 0,
        disk: vm.maxdisk ? Math.round(vm.maxdisk / 1024 / 1024 / 1024) : 0,
      });
    }
  }
  return templates;
}

export async function getTemplateByName(
  name: string,
): Promise<Template | undefined> {
  const templates = await listTemplates();
  return templates.find((t) => t.name === name);
}

export async function renameVM(vmId: number, newName: string): Promise<void> {
  const client = getClient();
  await client.put(`/nodes/${env.PROXMOX_NODE}/qemu/${vmId}/config`, {
    name: newName,
  });
}

export async function convertToTemplate(vmId: number): Promise<void> {
  const client = getClient();
  await client.post(`/nodes/${env.PROXMOX_NODE}/qemu/${vmId}/template`);
}

export interface CloneOptions {
  full?: boolean;
  storage?: string;
}

export async function cloneFromTemplate(
  templateId: number,
  name: string,
  options?: CloneOptions,
): Promise<number> {
  const client = getClient();
  const newId = await getNextVMId();

  const params: Record<string, unknown> = {
    newid: newId,
    name,
  };

  if (options?.full) {
    params.full = 1;
  }

  if (options?.storage) {
    params.storage = options.storage;
  }

  // Clone returns a task UPID that we need to wait for
  const result = await client.post<string>(
    `/nodes/${env.PROXMOX_NODE}/qemu/${templateId}/clone`,
    params,
  );

  // Wait for clone task to complete before returning
  await waitForTask(result.data);

  // Proxmox automatically uses the VM name as the cloud-init hostname
  // via the NoCloud datasource (instance-id = VM name)

  return newId;
}

// Cloud-Init

export interface CloudInitConfig {
  hostname?: string;
  user?: string;
  sshkeys?: string;
}

export async function addCloudInitDrive(
  vmId: number,
  storage?: string,
): Promise<void> {
  const client = getClient();
  const targetStorage = storage ?? env.DEFAULT_VM_STORAGE;
  // Use scsi1 for cloud-init (not ide2) because UEFI/OVMF doesn't support IDE CD-ROM well
  await client.put(`/nodes/${env.PROXMOX_NODE}/qemu/${vmId}/config`, {
    scsi1: `${targetStorage}:cloudinit`,
  });
}

export async function setCloudInitConfig(
  vmId: number,
  config: CloudInitConfig,
): Promise<void> {
  const client = getClient();
  const params: Record<string, unknown> = {};

  if (config.hostname) {
    params.cinode = config.hostname;
  }

  if (config.user) {
    params.ciuser = config.user;
  }

  if (config.sshkeys) {
    params.sshkeys = encodeURIComponent(config.sshkeys);
  }

  if (Object.keys(params).length > 0) {
    await client.put(`/nodes/${env.PROXMOX_NODE}/qemu/${vmId}/config`, params);
  }
}

export async function hasCloudInitDrive(vmId: number): Promise<boolean> {
  const config = await getVMConfig(vmId);
  // Check common cloud-init drive locations
  for (const key of ["ide2", "ide0", "scsi1"]) {
    const value = config[key as keyof VMConfigResponse];
    if (typeof value === "string" && value.includes("cloudinit")) {
      return true;
    }
  }
  return false;
}
