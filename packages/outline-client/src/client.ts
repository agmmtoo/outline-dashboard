import type {
  AccessKey,
  CreateAccessKeyInput,
  ExperimentalMetrics,
  ServerInfo,
  TransferMetrics,
} from "./types";

export interface OutlineClientOptions {
  /** Full management URL including the secret path, e.g. https://outline-sg1.example.com/AbC123 */
  apiUrl: string;
  /** Extra headers sent on every request (Cloudflare Access service token, proxy token). */
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class OutlineApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = "OutlineApiError";
  }
}

/** Thin, runtime-agnostic wrapper around the Outline Server Management API. */
export class OutlineClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OutlineClientOptions) {
    this.baseUrl = options.apiUrl.replace(/\/+$/, "");
    this.headers = options.headers ?? {};
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers: {
          ...this.headers,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // Never include baseUrl in messages: it contains the secret path.
      const reason = err instanceof Error ? err.message : String(err);
      throw new OutlineApiError(0, `Server unreachable: ${reason}`, path);
    }

    if (!res.ok) {
      let message = res.statusText || `HTTP ${res.status}`;
      try {
        const payload = (await res.json()) as { message?: string };
        if (payload.message) message = payload.message;
      } catch {
        // Non-JSON error body.
      }
      throw new OutlineApiError(res.status, message, path);
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // Server

  getServer() {
    return this.request<ServerInfo>("GET", "/server");
  }

  renameServer(name: string) {
    return this.request<void>("PUT", "/name", { name });
  }

  setHostnameForAccessKeys(hostname: string) {
    return this.request<void>("PUT", "/server/hostname-for-access-keys", { hostname });
  }

  setPortForNewAccessKeys(port: number) {
    return this.request<void>("PUT", "/server/port-for-new-access-keys", { port });
  }

  setServerDataLimit(bytes: number) {
    return this.request<void>("PUT", "/server/access-key-data-limit", { limit: { bytes } });
  }

  removeServerDataLimit() {
    return this.request<void>("DELETE", "/server/access-key-data-limit");
  }

  getMetricsEnabled() {
    return this.request<{ metricsEnabled: boolean }>("GET", "/metrics/enabled");
  }

  setMetricsEnabled(metricsEnabled: boolean) {
    return this.request<void>("PUT", "/metrics/enabled", { metricsEnabled });
  }

  // Access keys

  async listAccessKeys() {
    const res = await this.request<{ accessKeys: AccessKey[] }>("GET", "/access-keys");
    return res.accessKeys;
  }

  getAccessKey(id: string) {
    return this.request<AccessKey>("GET", `/access-keys/${encodeURIComponent(id)}`);
  }

  createAccessKey(input: CreateAccessKeyInput = {}) {
    return this.request<AccessKey>("POST", "/access-keys", input);
  }

  deleteAccessKey(id: string) {
    return this.request<void>("DELETE", `/access-keys/${encodeURIComponent(id)}`);
  }

  renameAccessKey(id: string, name: string) {
    return this.request<void>("PUT", `/access-keys/${encodeURIComponent(id)}/name`, { name });
  }

  setAccessKeyDataLimit(id: string, bytes: number) {
    return this.request<void>("PUT", `/access-keys/${encodeURIComponent(id)}/data-limit`, {
      limit: { bytes },
    });
  }

  removeAccessKeyDataLimit(id: string) {
    return this.request<void>("DELETE", `/access-keys/${encodeURIComponent(id)}/data-limit`);
  }

  // Metrics

  /** Bytes per access key over Outline's rolling 30-day window. */
  getTransferMetrics() {
    return this.request<TransferMetrics>("GET", "/metrics/transfer");
  }

  /** Experimental: may change or disappear between Outline versions. */
  getExperimentalMetrics(since = "30d") {
    return this.request<ExperimentalMetrics>(
      "GET",
      `/experimental/server/metrics?since=${encodeURIComponent(since)}`,
    );
  }
}
