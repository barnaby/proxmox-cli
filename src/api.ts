import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { ClientRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { basename } from "node:path";
import { requireApiToken, requireProxmoxHost } from "./config";

export interface ProxmoxApiResponse<T> {
  data: T;
}

export interface ProxmoxApiError {
  errors?: Record<string, string>;
  message?: string;
}

interface RawResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
}

// Proxmox ships with a self-signed certificate, so verification is disabled.
// This goes through node:https rather than fetch because fetch has no portable
// way to do that: Bun's `tls` option is ignored by Node, which runs the build.
function send(
  method: string,
  url: string,
  headers: Record<string, string | number>,
  writeBody?: (req: ClientRequest) => void | Promise<void>,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      { method, headers, rejectUnauthorized: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: res.statusMessage ?? "",
            text: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      },
    );
    req.on("error", (error: NodeJS.ErrnoException) => {
      const { host } = new URL(url);
      reject(
        new Error(
          `Could not reach Proxmox at ${host}: ${error.code ?? error.message}`,
        ),
      );
    });
    Promise.resolve(writeBody?.(req)).then(() => req.end(), reject);
  });
}

function assertOk(response: RawResponse, label: string): void {
  if (response.ok) {
    return;
  }
  let errorMessage = `${label} failed: ${response.status} ${response.statusText}`;
  const prefix = label === "API request" ? "API" : label;
  try {
    const errorData = JSON.parse(response.text) as ProxmoxApiError;
    if (errorData.errors) {
      const errorDetails = Object.entries(errorData.errors)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      errorMessage = `${prefix} error: ${errorDetails}`;
    } else if (errorData.message) {
      errorMessage = `${prefix} error: ${errorData.message}`;
    }
  } catch {
    if (response.text) {
      errorMessage = `${prefix} error: ${response.text}`;
    }
  }
  throw new Error(errorMessage);
}

class ProxmoxClient {
  private baseUrl: string;
  private token: string;

  constructor(host: string, token: string) {
    this.baseUrl = `https://${host}:8006/api2/json`;
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string | number> = {
      Authorization: `PVEAPIToken=${this.token}`,
    };

    let payload: Buffer | undefined;
    if (body) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        params.append(k, String(v));
      }
      payload = Buffer.from(params.toString(), "utf-8");
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = payload.length;
    }

    const response = await send(
      method,
      `${this.baseUrl}${path}`,
      headers,
      (req) => {
        if (payload) {
          req.write(payload);
        }
      },
    );

    assertOk(response, "API request");

    if (!response.text) {
      return {} as T;
    }

    return JSON.parse(response.text) as T;
  }

  get<T>(path: string): Promise<ProxmoxApiResponse<T>> {
    return this.request<ProxmoxApiResponse<T>>("GET", path);
  }

  post<T>(
    path: string,
    data?: Record<string, unknown>,
  ): Promise<ProxmoxApiResponse<T>> {
    return this.request<ProxmoxApiResponse<T>>("POST", path, data);
  }

  put<T>(
    path: string,
    data?: Record<string, unknown>,
  ): Promise<ProxmoxApiResponse<T>> {
    return this.request<ProxmoxApiResponse<T>>("PUT", path, data);
  }

  delete<T>(path: string): Promise<ProxmoxApiResponse<T>> {
    return this.request<ProxmoxApiResponse<T>>("DELETE", path);
  }

  async upload(
    path: string,
    filePath: string,
    contentType: string,
  ): Promise<ProxmoxApiResponse<string>> {
    // Multipart body written by hand so the file is streamed from disk
    // instead of being buffered in memory (ISOs run to several GB).
    const boundary = `----proxmox-cli-${randomUUID()}`;
    const filename = basename(filePath).replace(/"/g, "%22");
    const head = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="content"\r\n\r\n` +
        `${contentType}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="filename"; filename="${filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
      "utf-8",
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");
    const { size } = await stat(filePath);

    const response = await send(
      "POST",
      `${this.baseUrl}${path}`,
      {
        Authorization: `PVEAPIToken=${this.token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": head.length + size + tail.length,
      },
      async (req) => {
        req.write(head);
        for await (const chunk of createReadStream(filePath)) {
          if (!req.write(chunk)) {
            await once(req, "drain");
          }
        }
        req.write(tail);
      },
    );

    assertOk(response, "Upload");

    return JSON.parse(response.text) as ProxmoxApiResponse<string>;
  }
}

let clientInstance: ProxmoxClient | null = null;

export function getClient(): ProxmoxClient {
  if (!clientInstance) {
    const host = requireProxmoxHost();
    const token = requireApiToken();
    clientInstance = new ProxmoxClient(host, token);
  }
  return clientInstance;
}

// API response types

export interface VMListResponse {
  vmid: number;
  name?: string;
  status: string;
  // Fraction (0-1) of the VM's allocated vCPUs in use.
  cpu?: number;
  mem?: number;
  maxmem?: number;
  maxdisk?: number;
  uptime?: number;
  pid?: number;
  cpus?: number;
  template?: 1;
}

export interface VMStatusResponse {
  status: string;
  vmid: number;
  name?: string;
  qmpstatus?: string;
  uptime?: number;
  pid?: number;
  mem?: number;
  maxmem?: number;
}

export interface VMConfigResponse {
  name?: string;
  memory?: number;
  cores?: number;
  sockets?: number;
  cpu?: string;
  net0?: string;
  scsi0?: string;
  ide2?: string;
  usb0?: string;
  usb1?: string;
  usb2?: string;
  usb3?: string;
  usb4?: string;
  [key: string]: unknown;
}

export interface NetworkInterface {
  name: string;
  "hardware-address"?: string;
  "ip-addresses"?: Array<{
    "ip-address": string;
    "ip-address-type": "ipv4" | "ipv6";
    prefix?: number;
  }>;
}

export interface StorageContentItem {
  volid: string;
  format: string;
  size: number;
  ctime?: number;
  content?: string;
  // Set on backups
  vmid?: number;
  subtype?: string;
  notes?: string;
}

export interface TaskStatusResponse {
  status: string;
  exitstatus?: string;
  type?: string;
  id?: string;
}
