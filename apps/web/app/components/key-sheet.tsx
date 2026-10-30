import { formatBytes, formatRelative, GB, gbToBytes } from "@outline-dash/core/format";
import type { KeyView, ServerView } from "@outline-dash/core/types";
import { ArrowRightIcon, ArrowRightLeftIcon, Link2Icon, RefreshCcwIcon, RotateCwIcon, Trash2Icon, UndoIcon } from "lucide-react";
import { useState } from "react";
import { parseGb, splitTags, type Payload } from "~/lib/actions";
import { GRACE_MS } from "~/lib/pending";
import { maskAccessUrl, shareableLink, shareUrl } from "~/lib/browser";
import { cn } from "~/lib/utils";
import { AccessLink } from "./access-link";
import type { KeyActions } from "./keys-panel";
import { PendingRow, usePendingFor } from "./pending-bar";
import { StatusBadge, UsageRing } from "./status";
import { Button } from "./ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { Switch } from "./ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const TOP_UPS_GB = [5, 10, 25, 50];
const GRACE_S = GRACE_MS / 1000;

type Props = {
  k: KeyView;
  server: ServerView;
  actions: KeyActions;
  dynamicKeys: boolean;
  otherServers: Array<{ id: string; name: string }>;
};

export function KeySheet({
  keyView,
  open,
  onOpenChange,
  ...rest
}: Omit<Props, "k"> & { keyView: KeyView | undefined; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-2xl">
        {/* Keyed so tabs and drafts reset when another key is opened. */}
        {keyView && <KeySheetBody key={keyView.id} k={keyView} {...rest} />}
      </SheetContent>
    </Sheet>
  );
}

function KeySheetBody(props: Props) {
  const { k, actions } = props;
  const { mine, now } = usePendingFor(k.id);
  const tight = k.status === "near-limit" || k.status === "over-limit";

  return (
    <>
      <SheetHeader className="gap-3 border-b">
        <div className="flex items-start gap-3 pr-8">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <SheetTitle className="truncate text-sm">{k.label}</SheetTitle>
              <StatusBadge status={k.status} />
            </div>
            <SheetDescription className="font-mono">
              #{k.id} · port {k.port} · {k.method}
            </SheetDescription>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs">
            <span className="text-muted-foreground">{k.disabled ? "Access off" : "Access on"}</span>
            <Switch
              checked={!k.disabled}
              disabled={actions.busy || mine.length > 0}
              onCheckedChange={(on) => actions.apply({ intent: on ? "enable" : "disable", keyId: k.id }, k)}
              aria-label="Key access"
            />
          </label>
        </div>
        {mine.map((a) => (
          <PendingRow key={a.id} action={a} now={now} />
        ))}
      </SheetHeader>

      <div className="grid grid-cols-2 border-b sm:grid-cols-4">
        <Stat label="Used · 30 days" value={formatBytes(k.usedBytes)} />
        <Stat label="Limit" value={k.effectiveLimitBytes == null ? "None" : formatBytes(k.effectiveLimitBytes)} />
        <Stat label="Last seen" value={k.lastSeenMs != null ? formatRelative(k.lastSeenMs) : "-"} />
        <Stat label="Peak devices" value={k.peakDevices != null ? String(k.peakDevices) : "-"} />
      </div>

      <Tabs defaultValue={tight ? "limit" : "share"} className="gap-0">
        <TabsList variant="line" className="w-full justify-start border-b px-2 pb-0">
          <TabsTrigger value="share" className="flex-none px-3">
            Share
          </TabsTrigger>
          <TabsTrigger value="limit" className="flex-none px-3">
            Data limit
          </TabsTrigger>
          <TabsTrigger value="details" className="flex-none px-3">
            Details
          </TabsTrigger>
          <TabsTrigger value="danger" className="ml-auto flex-none px-3 text-destructive/80 hover:text-destructive dark:text-destructive/80">
            Danger zone
          </TabsTrigger>
        </TabsList>
        <TabsContent value="share" className="p-4">
          <ShareTab {...props} />
        </TabsContent>
        <TabsContent value="limit" className="p-4">
          <LimitTab {...props} />
        </TabsContent>
        <TabsContent value="details" className="p-4">
          <DetailsTab {...props} />
        </TabsContent>
        <TabsContent value="danger" className="p-4">
          <DangerTab {...props} waiting={mine.length > 0} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ShareTab({ k, actions, dynamicKeys }: Props) {
  const [showStatic, setShowStatic] = useState(false);
  return (
    <Section
      title={k.dynamicUrl ? "Dynamic link" : "Access link"}
      description={
        k.dynamicUrl
          ? "Keeps working when you rotate the key, move it to another server, or change the server's address or port."
          : "Static ss:// link. It stops working if the server's IP or port changes, or the key is rotated or moved."
      }
    >
      <AccessLink key={k.dynamicUrl ?? k.accessUrl} link={shareableLink(k)} />
      {k.dynamicUrl && (
        <div className="space-y-2">
          <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setShowStatic((v) => !v)}>
            {showStatic ? "Hide" : "Show"} static ss:// link
          </Button>
          {showStatic && (
            <AccessLink link={{ url: shareUrl(k.accessUrl, k.label), masked: maskAccessUrl(k.accessUrl), dynamic: false }} />
          )}
        </div>
      )}
      {!k.dynamicHandle && dynamicKeys && (
        <Button variant="outline" disabled={actions.busy} onClick={() => actions.resetDynamic(k)}>
          <Link2Icon />
          Create dynamic link
        </Button>
      )}
      {k.dynamicHandle && !dynamicKeys && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          This key has a dynamic handle, but dynamic keys are not configured on the API (DYNAMIC_KEY_SECRET).
        </p>
      )}
    </Section>
  );
}

type Mode = "top-up" | "renew" | "set";

/**
 * Pick a kind of change and an amount, see the result on the ring, then apply.
 * Nothing is sent until Apply, and every change here can be undone afterwards.
 */
function LimitTab({ k, server, actions }: Props) {
  const current = k.effectiveLimitBytes;
  const perKeyGb = k.limitBytes != null ? String(+(k.limitBytes / GB).toFixed(3)) : "";
  const [mode, setMode] = useState<Mode>(current != null ? "top-up" : "set");
  const [amount, setAmount] = useState(mode === "set" ? perKeyGb : "");

  if (k.disabled) {
    return (
      <Section title="Data limit" description="This key is turned off, so its limit is held at 0. Turn it on to change the limit.">
        <Button variant="outline" disabled={actions.busy} onClick={() => actions.apply({ intent: "enable", keyId: k.id }, k)}>
          Turn access on
        </Button>
      </Section>
    );
  }

  const gb = parseGb(amount);
  const valid = !Number.isNaN(gb);
  let proposed: number | null | undefined; // undefined: nothing to preview yet
  let payload: Payload | null = null;
  if (mode === "top-up" && current != null && valid && gb) {
    proposed = current + gbToBytes(gb);
    payload = { intent: "top-up", keyId: k.id, bytes: gbToBytes(gb) };
  } else if (mode === "renew" && valid && gb) {
    proposed = k.usedBytes + gbToBytes(gb);
    payload = { intent: "renew", keyId: k.id, bytes: gbToBytes(gb) };
  } else if (mode === "set" && valid) {
    const bytes = gb == null ? null : gbToBytes(gb);
    if (bytes !== k.limitBytes) {
      proposed = bytes ?? server.defaultLimitBytes;
      payload = { intent: "limit", keyId: k.id, bytes };
    }
  }

  const left = (limit: number | null) => (limit == null ? "unlimited" : formatBytes(Math.max(0, limit - k.usedBytes)));
  const modes: Array<{ id: Mode; label: string; hint: string; disabled?: boolean }> = [
    { id: "top-up", label: "Top up", hint: "Add data on top of the current limit.", disabled: current == null },
    { id: "renew", label: "Fresh allowance", hint: "Set the limit to what's used now plus an amount." },
    {
      id: "set",
      label: "Set limit",
      hint: `Choose the exact per-key limit. Leave it empty to use the server default (${server.defaultLimitBytes == null ? "no limit" : formatBytes(server.defaultLimitBytes)}).`,
    },
  ];

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Kind of change" className="grid grid-cols-3 border">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            disabled={m.disabled}
            onClick={() => {
              setMode(m.id);
              setAmount(m.id === "set" ? perKeyGb : "");
            }}
            className={cn(
              "border-r px-3 py-2 text-xs font-medium transition-colors last:border-r-0 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40",
              mode === m.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!payload) return;
          actions.apply(payload, k);
          setAmount(mode === "set" ? amount : "");
        }}
      >
        <Field>
          <FieldLabel htmlFor={`amount-${k.id}`}>{mode === "set" ? "Per-key limit" : "Amount"}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {mode !== "set" &&
              TOP_UPS_GB.map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={gb === n ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAmount(String(n))}
                >
                  +{n} GB
                </Button>
              ))}
            <InputGroup className="w-36">
              <InputGroupInput
                id={`amount-${k.id}`}
                type="number"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={mode === "set" ? "Default" : "Custom"}
                aria-invalid={!valid}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>GB</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </div>
          <FieldDescription>{modes.find((m) => m.id === mode)!.hint}</FieldDescription>
        </Field>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Now</p>
            <UsageRing used={k.usedBytes} limit={current} size="lg" />
            <p className="text-xs text-muted-foreground">{left(current)} left</p>
          </div>
          <ArrowRightIcon className={cn("size-4 text-muted-foreground", proposed === undefined && "opacity-30")} />
          <div className={cn("space-y-1.5 transition-opacity", proposed === undefined && "opacity-40")}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">After</p>
            <UsageRing used={k.usedBytes} limit={proposed === undefined ? current : proposed} size="lg" />
            <p className="text-xs text-muted-foreground">
              {proposed === undefined ? "Pick an amount" : `${left(proposed)} left`}
            </p>
          </div>
        </div>
        {mode === "renew" && proposed !== undefined && (
          <p className="text-xs text-muted-foreground">
            Approximate: the server reads usage again when you apply, so the final limit may differ slightly.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!payload || actions.busy}>
            {mode === "top-up" && gb ? `Add ${gb} GB` : mode === "renew" && gb ? `Renew with ${gb} GB` : "Apply"}
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UndoIcon className="size-3.5" />
            You can undo this for 10 seconds.
          </p>
        </div>
      </form>
    </div>
  );
}

function DetailsTab({ k, actions }: Props) {
  return (
    <form
      key={k.name}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = {
          label: String(f.get("label") ?? "").trim(),
          tags: splitTags(f.get("tags")),
          expires: String(f.get("expires") ?? "") || null,
        };
        actions.apply({ intent: "meta", keyId: k.id, body }, k);
      }}
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={`label-${k.id}`}>Name</FieldLabel>
          <Input id={`label-${k.id}`} name="label" defaultValue={k.label} required maxLength={100} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`tags-${k.id}`}>Tags</FieldLabel>
            <Input id={`tags-${k.id}`} name="tags" defaultValue={k.tags.join(", ")} placeholder="plus, yangon" />
            <FieldDescription>Separate tags with commas.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`expires-${k.id}`}>Expires</FieldLabel>
            <Input id={`expires-${k.id}`} name="expires" type="date" defaultValue={k.expires ?? ""} />
            <FieldDescription>Shown as expired after this date. Leave empty for never.</FieldDescription>
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={actions.busy}>
            Save details
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

/**
 * Everything that can't be undone, each with its consequence spelled out next to
 * the button. Clicking starts an 8-second countdown before anything is sent.
 */
function DangerTab({ k, actions, dynamicKeys, otherServers, waiting }: Props & { waiting: boolean }) {
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const blocked = actions.busy || waiting;
  const target = otherServers.find((s) => s.id === moveTo);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        These can't be undone. After you click, you have {GRACE_S} seconds to cancel before anything is sent.
      </p>
      <div className="divide-y divide-destructive/20 border border-destructive/40">
        <DangerRow
          title="Rotate key"
          description={
            k.dynamicHandle
              ? "Replaces the password. The dynamic link stays the same, so users reconnect on their own. The static ss:// link stops working."
              : "Replaces the key with a new password. The current link stops working and the user needs the new one."
          }
        >
          <Button variant="outline" disabled={blocked} onClick={() => actions.rotate(k, { ask: false })}>
            <RotateCwIcon />
            Rotate
          </Button>
        </DangerRow>

        {k.dynamicHandle && dynamicKeys && (
          <DangerRow
            title="Reset dynamic link"
            description="Issues a new dynamic link. The current one stops working. Use this if the link leaked."
          >
            <Button variant="outline" disabled={blocked} onClick={() => actions.resetDynamic(k, { ask: false })}>
              <RefreshCcwIcon />
              Reset link
            </Button>
          </DangerRow>
        )}

        {otherServers.length > 0 && (
          <DangerRow
            title="Move to another server"
            description={
              k.dynamicHandle
                ? "Recreates the key there and removes it here. The dynamic link keeps working; usage history starts fresh."
                : "Recreates the key there and removes it here. The user needs the new ss:// link; usage history starts fresh."
            }
          >
            <div className="flex gap-2">
              <Select
                items={Object.fromEntries(otherServers.map((s) => [s.id, s.name]))}
                value={moveTo}
                onValueChange={(v) => setMoveTo(v == null ? null : String(v))}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Choose a server" />
                </SelectTrigger>
                <SelectContent>
                  {otherServers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" disabled={blocked || !target} onClick={() => target && actions.move(k, target, { ask: false })}>
                <ArrowRightLeftIcon />
                Move
              </Button>
            </div>
          </DangerRow>
        )}

        <DangerRow
          title="Delete key"
          description="Removes the key from the server. Its link stops working for good."
          stack
        >
          <div className="flex flex-wrap gap-2">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={`Type "${k.label}" to confirm`}
              aria-label={`Type ${k.label} to confirm deleting`}
              autoComplete="off"
              className="min-w-0 flex-1 basis-48"
            />
            <Button
              variant="destructive"
              disabled={blocked || typed.trim() !== k.label}
              onClick={() => {
                actions.remove(k, { ask: false });
                setTyped("");
              }}
            >
              <Trash2Icon />
              Delete
            </Button>
          </div>
        </DangerRow>
      </div>
    </div>
  );
}

function DangerRow({
  title,
  description,
  stack,
  children,
}: {
  title: string;
  description: string;
  stack?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 p-3", !stack && "sm:flex-row sm:items-center")}>
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r px-4 py-3 last:border-r-0 max-sm:[&:nth-child(2)]:border-r-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
