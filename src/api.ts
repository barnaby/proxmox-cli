import { basename } from "node:path";
import { requireApiToken, requireProxmoxHost } from "./config";

export interface ProxmoxApiResponse<T> {
  data: T;
}

export interface ProxmoxApiError {
  errors?: Record<string, string>;
  message?: string;
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
    body?: Record<string, unknown> | FormData,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `PVEAPIToken=${this.token}`,
    };

    let fetchBody: string | FormData | undefined;

    if (body instanceof FormData) {
      fetchBody = body;
      // Don't set Content-Type for FormData - fetch will set it with boundary
    } else if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        params.append(k, String(v));
      }
      fetchBody = params.toString();
    }

    const response = await fetch(url, {
      method,
      headers,
      body: fetchBody,
      // Bun supports this option for self-signed certs
      tls: { rejectUnauthorized: false },
    } as RequestInit);

    const text = await response.text();

    if (!response.ok) {
      let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = JSON.parse(text) as ProxmoxApiError;
        if (errorData.errors) {
          const errorDetails = Object.entries(errorData.errors)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          errorMessage = `API error: ${errorDetails}`;
        } else if (errorData.message) {
          errorMessage = `API error: ${errorData.message}`;
        }
      } catch {
        if (text) {
          errorMessage = `API error: ${text}`;
        }
      }
      throw new Error(errorMessage);
    }

    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
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
    const url = `${this.baseUrl}${path}`;
    const filename = basename(filePath);

    // Read file as buffer for Bun's fetch
    const fileBuffer = await Bun.file(filePath).arrayBuffer();
    const blob = new Blob([fileBuffer], { type: "application/octet-stream" });

    const formData = new FormData();
    formData.append("content", contentType);
    formData.append("filename", blob, filename);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `PVEAPIToken=${this.token}`,
      },
      body: formData,
      // Bun supports this option for self-signed certs
      tls: { rejectUnauthorized: false },
    } as RequestInit);

    const text = await response.text();

    if (!response.ok) {
      let errorMessage = `Upload failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = JSON.parse(text) as ProxmoxApiError;
        if (errorData.errors) {
          const errorDetails = Object.entries(errorData.errors)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          errorMessage = `Upload error: ${errorDetails}`;
        } else if (errorData.message) {
          errorMessage = `Upload error: ${errorData.message}`;
        }
      } catch {
        if (text) {
          errorMessage = `Upload error: ${text}`;
        }
      }
      throw new Error(errorMessage);
    }

    return JSON.parse(text) as ProxmoxApiResponse<string>;
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
}

export interface TaskStatusResponse {
  status: string;
  exitstatus?: string;
  type?: string;
  id?: string;
}
