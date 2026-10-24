export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Calls the API worker on the same origin. Cloudflare Access cookies ride along automatically. */
export async function api<T = void>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
    // An expired Access session answers with a redirect to the login page.
    redirect: "manual",
  });

  if (res.type === "opaqueredirect") throw new ApiError(401, "Session expired");
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const payload = (await res.json()) as { error?: unknown };
      if (typeof payload.error === "string") message = payload.error;
      // zValidator returns { success: false, error: { issues } }.
      else if (payload.error && typeof payload.error === "object") message = "Invalid input";
    } catch {
      // Non-JSON body (e.g. an Access login redirect page).
    }
    throw new ApiError(res.status, message);
  }

  // 202/204 and other bodiless successes.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
