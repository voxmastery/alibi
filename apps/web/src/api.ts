import type {
  AlertView, ChainExport, CheckResult, DefenceFile, ImportRequest, ImportResult, JobHealth,
  ModeInfo, NetworkGraph, VendorDetail, VendorRow, VerifyResult,
} from "@alibi/contracts";

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly field?: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const err = (body as { error?: { code?: string; message?: string; field?: string } } | null)?.error;
    throw new ApiClientError(response.status, err?.code ?? "http_error", err?.message ?? `Request failed (${response.status})`, err?.field);
  }
  return body as T;
}

const q = (asOf?: string) => (asOf ? `?as_of=${encodeURIComponent(asOf)}` : "");

export const getMode = () => request<ModeInfo>("/api/mode");
export const postCheck = (gstin: string) => request<CheckResult>("/api/checks", { method: "POST", body: JSON.stringify({ gstin }) });
export const getCheck = (id: string) => request<CheckResult>(`/api/checks/${encodeURIComponent(id)}`);
export const getVendors = (asOf?: string) => request<VendorRow[]>(`/api/vendors${q(asOf)}`);
export const importCsv = (kind: ImportRequest["kind"], csv: string) => request<ImportResult>("/api/vendors/import", { method: "POST", body: JSON.stringify({ kind, csv }) });
export const loadSample = () => request<{ vendors: number; captures: number; transactions: number }>("/api/vendors/sample", { method: "POST" });
export const getVendor = (id: string, asOf?: string) => request<VendorDetail>(`/api/vendors/${encodeURIComponent(id)}${q(asOf)}`);
export const watchVendor = (id: string, on: boolean) => request<{ watched: boolean }>(`/api/vendors/${encodeURIComponent(id)}/watch`, { method: on ? "POST" : "DELETE" });
export const trackVendor = (id: string) => request<{ tracking: "tracked" }>(`/api/vendors/${encodeURIComponent(id)}/track`, { method: "POST" });
export const getChain = (id: string) => request<ChainExport>(`/api/vendors/${encodeURIComponent(id)}/chain`);
export const getDefence = (id: string, asOf?: string) => request<DefenceFile>(`/api/vendors/${encodeURIComponent(id)}/defence${q(asOf)}${asOf ? "&" : "?"}format=json`);
export const defenceHtmlUrl = (id: string, asOf?: string) => `/api/vendors/${encodeURIComponent(id)}/defence${q(asOf)}${asOf ? "&" : "?"}format=html`;
export const getNetwork = (asOf?: string) => request<NetworkGraph>(`/api/network${q(asOf)}`);
export const verifyChainExport = (body: ChainExport) => request<VerifyResult>("/api/verify", { method: "POST", body: JSON.stringify(body) });
export const getAlerts = () => request<{ alerts: AlertView[]; health: JobHealth }>("/api/alerts");
