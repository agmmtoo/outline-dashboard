import { AwsClient } from "aws4fetch";

// Minimal Amazon Lightsail client (AWS JSON 1.1 protocol, SigV4 via aws4fetch).
// Only the calls the dashboard needs; runs in Workers, Node and browsers.

export interface LightsailCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface LightsailClientOptions {
  credentials: LightsailCredentials;
  region: string;
  /** Override the service endpoint (local mocks only). */
  endpoint?: string;
  timeoutMs?: number;
}

/** Lightsail instance states, e.g. "pending", "running", "stopping", "stopped". */
export interface InstanceState {
  code: number;
  name: string;
}

export interface Operation {
  id?: string;
  status?: string;
  operationType?: string;
  createdAt?: number;
}

export class LightsailError extends Error {
  constructor(
    readonly status: number,
    /** AWS error type, e.g. "NotFoundException", "AccessDeniedException". */
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LightsailError";
  }
}

export class LightsailClient {
  private readonly aws: AwsClient;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: LightsailClientOptions) {
    this.endpoint = options.endpoint ?? `https://lightsail.${options.region}.amazonaws.com/`;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.aws = new AwsClient({
      ...options.credentials,
      service: "lightsail",
      region: options.region,
      retries: 0,
    });
  }

  private async call<T>(action: string, body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await this.aws.fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-amz-json-1.1",
          "x-amz-target": `Lightsail_20161128.${action}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new LightsailError(0, "NetworkError", `Lightsail unreachable: ${reason}`);
    }

    const text = await res.text();
    let payload: Record<string, unknown> = {};
    try {
      if (text) payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (res.ok) throw new LightsailError(502, "InvalidResponse", "Lightsail returned a non-JSON response");
    }
    if (!res.ok) {
      // "__type" looks like "com.amazonaws...#NotFoundException" or just "AccessDeniedException".
      const code = String(payload.__type ?? payload.code ?? "UnknownError").split("#").pop()!;
      const message = String(payload.message ?? payload.Message ?? res.statusText ?? `HTTP ${res.status}`);
      throw new LightsailError(res.status, code, message);
    }
    return payload as T;
  }

  async getInstanceState(instanceName: string): Promise<InstanceState> {
    const res = await this.call<{ state?: InstanceState }>("GetInstanceState", { instanceName });
    if (!res.state) throw new LightsailError(502, "InvalidResponse", "Lightsail returned no instance state");
    return res.state;
  }

  /** Lightsail only reboots instances in the "running" state. */
  async rebootInstance(instanceName: string): Promise<Operation[]> {
    const res = await this.call<{ operations?: Operation[] }>("RebootInstance", { instanceName });
    return res.operations ?? [];
  }
}
