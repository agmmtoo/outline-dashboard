import type { InstanceRef, InstanceStateView } from "@outline-dash/core/types";
import { PowerIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";
import { api, ApiError } from "~/lib/api";
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
 * Lightsail instance state and a confirmed reboot action. State is fetched when
 * shown; after a reboot it is polled until the instance is running again.
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
  const [state, setState] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [rebootingSince, setRebootingSince] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const revalidator = useRevalidator();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const path = `/servers/${encodeURIComponent(sid)}/instance`;

  const load = useCallback(async () => {
    try {
      const view = await api<InstanceStateView>(path);
      setState(view.state);
      setError(null);
      return view.state;
    } catch (err) {
      setState(null);
      setError(err instanceof ApiError ? err.message : "Could not read instance state");
      return null;
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-read the state whenever the page's Refresh (revalidation) finishes.
  const revalidating = revalidator.state === "loading";
  const wasRevalidating = useRef(false);
  useEffect(() => {
    if (wasRevalidating.current && !revalidating) void load();
    wasRevalidating.current = revalidating;
  }, [revalidating, load]);

  // Poll while a reboot is in progress.
  useEffect(() => {
    if (rebootingSince == null) return;
    let cancelled = false;
    const tick = async () => {
      const current = await load();
      if (cancelled) return;
      const elapsed = Date.now() - rebootingSince;
      if (current === "running" && elapsed >= MIN_REBOOT_MS) {
        setRebootingSince(null);
        toast.success(`${instance.name} is running again`);
        void revalidator.revalidate();
        return;
      }
      if (elapsed >= POLL_MAX_MS) {
        setRebootingSince(null);
        toast.warning(`${instance.name} is still "${current ?? "unknown"}". Check the Lightsail console.`);
        return;
      }
      timer.current = setTimeout(tick, POLL_MS);
    };
    timer.current = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // revalidator is left out on purpose: including it would restart the loop on every render.
  }, [rebootingSince, load, instance.name]);

  const reboot = async () => {
    try {
      await api(`${path}/reboot`, { method: "POST" });
      toast.info(`Reboot requested for ${instance.name}. Users reconnect in about 1 to 2 minutes.`);
      setState("rebooting");
      setRebootingSince(Date.now());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reboot failed");
    }
  };

  const busy = rebootingSince != null;
  const label = busy ? "rebooting" : state === undefined ? "checking" : (state ?? "unknown");
  const canReboot = state === "running" && !busy;

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
            onConfirm: () => void reboot(),
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
