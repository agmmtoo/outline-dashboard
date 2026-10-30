import type { InstanceStateView, ServerKeysResponse, ServerSummary } from "@outline-dash/core/types";
import { QueryCache, QueryClient, queryOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "./api";

/**
 * One client for the SPA. Data is shared between routes, so going back to a page
 * renders from cache and repeat visits within `staleTime` don't call the API.
 * The header's Refresh button forces a refetch.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // First loads fail into the route ErrorBoundary. A failed background refetch keeps
    // the old data on screen, so say so instead of failing silently.
    onError: (err, query) => {
      if (query.state.data === undefined || query.meta?.silent) return;
      if (err instanceof ApiError && err.status === 401) {
        const here = window.location.pathname + window.location.search;
        return window.location.assign(`/login?next=${encodeURIComponent(here)}`);
      }
      toast.error(`Refresh failed: ${err.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      // Single user with an explicit Refresh button: don't refetch on every tab switch.
      refetchOnWindowFocus: false,
      // Auth and validation errors won't fix themselves; only retry network or 5xx once.
      retry: (failures, err) => failures < 1 && !(err instanceof ApiError && err.status < 500),
    },
  },
});

export const queryKeys = {
  authStatus: ["auth", "status"] as const,
  servers: ["servers"] as const,
  server: (sid: string) => ["servers", sid] as const,
  instance: (sid: string) => ["servers", sid, "instance"] as const,
};

const serverPath = (sid: string) => `/servers/${encodeURIComponent(sid)}`;

export const authStatusQuery = () =>
  queryOptions({
    queryKey: queryKeys.authStatus,
    queryFn: () => api<{ mode: string }>("/auth/status"),
    // The sign-in mode is deployment config; it doesn't change while the app is open.
    staleTime: Infinity,
  });

export const serversQuery = () =>
  queryOptions({
    queryKey: queryKeys.servers,
    queryFn: () => api<ServerSummary[]>("/servers"),
  });

export const serverQuery = (sid: string) =>
  queryOptions({
    queryKey: queryKeys.server(sid),
    queryFn: () => api<ServerKeysResponse>(serverPath(sid)),
  });

export const instanceQuery = (sid: string) =>
  queryOptions({
    queryKey: queryKeys.instance(sid),
    queryFn: () => api<InstanceStateView>(`${serverPath(sid)}/instance`),
    retry: false,
    // The control shows its own error state; polling during a reboot would spam toasts.
    meta: { silent: true },
  });
