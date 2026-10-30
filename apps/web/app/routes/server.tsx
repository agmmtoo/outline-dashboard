import { formatBytes } from "@outline-dash/core/format";
import type { ServerKeysResponse } from "@outline-dash/core/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { InsightsPanel } from "~/components/insights-panel";
import { InstanceControl } from "~/components/instance-control";
import { KeysPanel } from "~/components/keys-panel";
import { SettingsPanel } from "~/components/settings-panel";
import { StatusDot } from "~/components/status";
import { Badge } from "~/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { queryClient, serverQuery } from "~/lib/query";
import type { Route } from "./+types/server";

const TABS = ["keys", "insights", "settings"] as const;
type Tab = (typeof TABS)[number];

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.server.name ?? "Server"} · Outline Admin` }];
}

/** Cached data renders immediately; stale data is refetched in the background. */
export async function clientLoader({ params }: Route.ClientLoaderArgs): Promise<ServerKeysResponse> {
  return queryClient.ensureQueryData({ ...serverQuery(params.sid), revalidateIfStale: true });
}

export default function Server({ params: { sid } }: Route.ComponentProps) {
  // The loader has filled the cache, so this never suspends; it keeps the page in
  // sync with refetches after mutations and Refresh.
  const { data } = useSuspenseQuery(serverQuery(sid));
  const { server, keys, insights, instance } = data;
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t === params.get("tab")) ?? "keys";
  const used = keys.reduce((n, k) => n + k.usedBytes, 0);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/" />}>Servers</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{server.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
            <StatusDot className="size-2 bg-emerald-500" />
            {server.name}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="font-mono">
              {server.hostnameForAccessKeys}
            </Badge>
            <Badge variant="secondary" className="font-mono">
              v{server.version}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            <p className="text-xs text-muted-foreground">
              {keys.length} keys · {formatBytes(used)} in the last 30 days
            </p>
            {instance && <InstanceControl sid={data.id} instance={instance} serverName={server.name} />}
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setParams(value === "keys" ? {} : { tab: String(value) }, { replace: true })}
      >
        <TabsList variant="line" className="w-full justify-start border-b pb-0">
          <TabsTrigger value="keys" className="flex-none px-3">
            Access keys
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex-none px-3">
            Insights
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-none px-3">
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="keys" className="pt-2">
          <KeysPanel
            server={server}
            keys={keys}
            dynamicKeys={data.dynamicKeys}
            otherServers={data.otherServers}
          />
        </TabsContent>
        <TabsContent value="insights" className="pt-2">
          <InsightsPanel keys={keys} insights={insights} />
        </TabsContent>
        <TabsContent value="settings" className="pt-2">
          <SettingsPanel server={server} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
