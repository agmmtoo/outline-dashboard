import type { InstanceRef } from "@outline-dash/core/types";
import { PowerIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "~/lib/api";
import { instanceQuery, queryKeys } from "~/lib/query";
import { cn } from "~/lib/utils";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { StatusDot } from "./status";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const POLL_MS = 5_000;
const POLL_MAX_MS = 4 * 60_000;
// A reboot first leaves "running"; don't call it done until it has had time to.
const MIN_REBOOT_MS = 30_000;

function stateDot(state: string | null) {
  if (state === "running") return "bg-emerald-500";
  if (state === "stopped") return "bg-muted-foreground";
  if (state == null) return "bg-destructive";
  return "bg-amber-500 animate-pulse";
}

/**
 * Lightsail instance state and a confirmed reboot action. State is cached per server
 * and shared by every place the control is shown; after a reboot it is polled until
 * the instance is running again.
 */
export function InstanceControl({
  sid,
  instance,
  serverName,
  prominent = false,
}: {
  sid: string;
  instance: InstanceRef;
  serverName: string;
  prominent?: boolean;
}) {
  const [rebootingSince, setRebootingSince] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const client = useQueryClient();

  const query = useQuery({
    ...instanceQuery(sid),
    // Interval refetches ignore staleTime, so polling sees every state change.
    refetchInterval: rebootingSince == null ? false : POLL_MS,
  });
  const state = query.isPending ? undefined : query.isError ? null : query.data.state;
  const error = query.error ? (query.error instanceof ApiError ? query.error.message : "Could not read instance state") : null;

  // Stop polling once the instance is back, or give up after POLL_MAX_MS.
  useEffect(() => {
    if (rebootingSince == null) return;
    const elapsed = Date.now() - rebootingSince;
    if (state === "running" && elapsed >= MIN_REBOOT_MS) {
      setRebootingSince(null);
      toast.success(`${instance.name} is running again`);
      // Outline is back: refetch the server's data (and the overview) now.
      void client.invalidateQueries({ queryKey: queryKeys.server(sid), exact: true });
      void client.invalidateQueries({ queryKey: queryKeys.servers, exact: true });
    } else if (elapsed >= POLL_MAX_MS) {
      setRebootingSince(null);
      toast.warning(`${instance.name} is still "${state ?? "unknown"}". Check the Lightsail console.`);
    }
  }, [query.dataUpdatedAt, query.errorUpdatedAt, rebootingSince, state, instance.name, sid, client]);

  const reboot = useMutation({
    mutationFn: () => api(`/servers/${encodeURIComponent(sid)}/instance/reboot`, { method: "POST" }),
    onSuccess: () => {
      toast.info(`Reboot requested for ${instance.name}. Users reconnect in about 1 to 2 minutes.`);
      client.setQueryData(queryKeys.instance(sid), (v) => (v ? { ...v, state: "rebooting" } : v));
      setRebootingSince(Date.now());
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Reboot failed"),
  });

  const busy = rebootingSince != null;
  const label = busy ? "rebooting" : state === undefined ? "checking" : (state ?? "unknown");
  const canReboot = state === "running" && !busy && !reboot.isPending;

  return (
    <div className="relative z-10 flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge variant="outline" className={cn(state === null && !busy && "text-destructive")}>
              <StatusDot className={stateDot(busy ? "rebooting" : state === undefined ? "pending" : state)} />
              {label}
            </Badge>
          }
        />
        <TooltipContent>
          {error ?? `Lightsail instance ${instance.name} (${instance.region})`}
        </TooltipContent>
      </Tooltip>
      <Button
        variant={prominent ? "default" : "outline"}
        size="sm"
        disabled={!canReboot}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirm({
            title: `Reboot ${instance.name}?`,
            description: `This restarts the Lightsail instance behind "${serverName}". Everyone connected is dropped for about 1 to 2 minutes. Access keys and data are kept.`,
            action: "Reboot instance",
            destructive: true,
            onConfirm: () => reboot.mutate(),
          });
        }}
      >
        <PowerIcon />
        Reboot
      </Button>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
