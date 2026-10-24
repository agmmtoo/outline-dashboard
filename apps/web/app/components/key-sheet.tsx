import { formatBytes, formatRelative, GB, gbToBytes } from "@outline-dash/core/format";
import type { KeyView, ServerView } from "@outline-dash/core/types";
import { ArrowRightLeftIcon, Link2Icon, PowerIcon, PowerOffIcon, RefreshCcwIcon, RotateCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { parseGb, splitTags } from "~/lib/actions";
import { maskAccessUrl, shareableLink, shareUrl } from "~/lib/browser";
import { AccessLink } from "./access-link";
import type { KeyActions } from "./keys-panel";
import { StatusBadge, UsageBar } from "./status";
import { Button } from "./ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group";
import { Separator } from "./ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";

const TOP_UPS_GB = [5, 10, 50];

export function KeySheet({
  keyView,
  server,
  actions,
  dynamicKeys,
  otherServers,
  open,
  onOpenChange,
}: {
  keyView: KeyView | undefined;
  server: ServerView;
  actions: KeyActions;
  dynamicKeys: boolean;
  otherServers: Array<{ id: string; name: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-lg">
        {keyView && (
          <KeySheetBody
            k={keyView}
            server={server}
            actions={actions}
            dynamicKeys={dynamicKeys}
            otherServers={otherServers}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function KeySheetBody({
  k,
  server,
  actions,
  dynamicKeys,
  otherServers,
}: {
  k: KeyView;
  server: ServerView;
  actions: KeyActions;
  dynamicKeys: boolean;
  otherServers: Array<{ id: string; name: string }>;
}) {
  const { busy, submit } = actions;
  const [showStatic, setShowStatic] = useState(false);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const moveItems = Object.fromEntries(otherServers.map((s) => [s.id, s.name]));

  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex items-center gap-2 pr-8">
          <SheetTitle className="truncate text-sm">{k.label}</SheetTitle>
          <StatusBadge status={k.status} />
        </div>
        <SheetDescription className="font-mono">
          #{k.id} · port {k.port} · {k.method}
        </SheetDescription>
      </SheetHeader>

      <div className="grid grid-cols-2 border-b sm:grid-cols-4">
        <Stat label="Used · 30 days" value={formatBytes(k.usedBytes)} />
        <Stat label="Limit" value={k.effectiveLimitBytes == null ? "None" : formatBytes(k.effectiveLimitBytes)} />
        <Stat label="Last seen" value={k.lastSeenMs != null ? formatRelative(k.lastSeenMs) : "-"} />
        <Stat label="Peak devices" value={k.peakDevices != null ? String(k.peakDevices) : "-"} />
      </div>

      <div className="space-y-6 p-4">
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
                <AccessLink
                  link={{ url: shareUrl(k.accessUrl, k.label), masked: maskAccessUrl(k.accessUrl), dynamic: false }}
                />
              )}
            </div>
          )}
          {!k.dynamicHandle && dynamicKeys && (
            <Button variant="outline" disabled={busy} onClick={() => actions.resetDynamic(k)}>
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

        <Section
          title="Data limit"
          description={
            k.limitSource === "server"
              ? `Uses the server default (${formatBytes(server.defaultLimitBytes)}). Outline counts usage over a rolling 30 days.`
              : "Outline counts usage over a rolling 30-day window and cannot reset it."
          }
        >
          <UsageBar used={k.usedBytes} limit={k.effectiveLimitBytes} />
          {k.disabled ? (
            <p className="text-xs text-muted-foreground">Enable the key to change its limit.</p>
          ) : (
            <FieldGroup className="gap-4">
              {k.effectiveLimitBytes != null && (
                <Field>
                  <FieldLabel>Top up</FieldLabel>
                  <div className="flex gap-1.5">
                    {TOP_UPS_GB.map((gb) => (
                      <Button
                        key={gb}
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => submit({ intent: "top-up", keyId: k.id, bytes: gbToBytes(gb) })}
                      >
                        +{gb} GB
                      </Button>
                    ))}
                  </div>
                </Field>
              )}
              <GbForm
                key={`limit-${k.limitBytes}`}
                id={`limit-${k.id}`}
                label="Per-key limit"
                description="Leave empty to remove the per-key limit."
                button="Save"
                defaultValue={k.limitBytes != null ? k.limitBytes / GB : ""}
                allowEmpty
                busy={busy}
                onSubmit={(gb) => submit({ intent: "limit", keyId: k.id, bytes: gb == null ? null : gbToBytes(gb) })}
              />
              <GbForm
                id={`renew-${k.id}`}
                label="Renew"
                description="Fresh allowance: sets the limit to current usage plus this amount."
                button="Renew"
                busy={busy}
                onSubmit={(gb) => gb != null && submit({ intent: "renew", keyId: k.id, bytes: gbToBytes(gb) })}
              />
            </FieldGroup>
          )}
        </Section>

        <Section title="Details">
          <form
            key={k.name}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              submit({
                intent: "meta",
                keyId: k.id,
                body: {
                  label: String(f.get("label") ?? ""),
                  tags: splitTags(f.get("tags")),
                  expires: String(f.get("expires") ?? "") || null,
                },
              });
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
                </Field>
                <Field>
                  <FieldLabel htmlFor={`expires-${k.id}`}>Expires</FieldLabel>
                  <Input id={`expires-${k.id}`} name="expires" type="date" defaultValue={k.expires ?? ""} />
                </Field>
              </div>
              <div>
                <Button type="submit" variant="outline" disabled={busy}>
                  Save details
                </Button>
              </div>
            </FieldGroup>
          </form>
        </Section>

        {otherServers.length > 0 && (
          <Section
            title="Move to another server"
            description={
              k.dynamicHandle
                ? "Recreates the key there and removes it here. The dynamic link keeps working."
                : "Recreates the key there and removes it here. The user needs the new ss:// link."
            }
          >
            <div className="flex gap-2">
              <Select items={moveItems} value={moveTo} onValueChange={(v) => setMoveTo(v == null ? null : String(v))}>
                <SelectTrigger className="flex-1">
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
              <Button
                variant="outline"
                disabled={busy || !moveTo}
                onClick={() => {
                  const target = otherServers.find((s) => s.id === moveTo);
                  if (target) actions.move(k, target);
                }}
              >
                <ArrowRightLeftIcon />
                Move
              </Button>
            </div>
          </Section>
        )}

        <Separator />

        <Section title="Access">
          <div className="flex flex-wrap gap-2">
            {k.disabled ? (
              <Button variant="outline" disabled={busy} onClick={() => submit({ intent: "enable", keyId: k.id })}>
                <PowerIcon />
                Enable
              </Button>
            ) : (
              <Button variant="outline" disabled={busy} onClick={() => submit({ intent: "disable", keyId: k.id })}>
                <PowerOffIcon />
                Disable
              </Button>
            )}
            <Button variant="outline" disabled={busy} onClick={() => actions.rotate(k)}>
              <RotateCwIcon />
              Rotate
            </Button>
            {k.dynamicHandle && dynamicKeys && (
              <Button variant="outline" disabled={busy} onClick={() => actions.resetDynamic(k)}>
                <RefreshCcwIcon />
                Reset link
              </Button>
            )}
            <Button variant="destructive" className="ml-auto" disabled={busy} onClick={() => actions.remove(k)}>
              <Trash2Icon />
              Delete
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Disable sets the limit to 0 and is reversible; a disabled dynamic link also stops serving its config.
            Rotate changes the password. Reset link issues a new dynamic link. Delete is permanent.
          </p>
        </Section>
      </div>
    </>
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

function GbForm({
  id,
  label,
  description,
  button,
  defaultValue = "",
  allowEmpty,
  busy,
  onSubmit,
}: {
  id: string;
  label: string;
  description: string;
  button: string;
  defaultValue?: number | string;
  allowEmpty?: boolean;
  busy: boolean;
  onSubmit: (gb: number | null) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const gb = parseGb(new FormData(e.currentTarget).get("gb"));
        if (Number.isNaN(gb) || (gb == null && !allowEmpty)) return;
        onSubmit(gb);
      }}
    >
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <div className="flex gap-2">
          <InputGroup className="flex-1">
            <InputGroupInput
              id={id}
              name="gb"
              type="number"
              min={0}
              step="any"
              defaultValue={defaultValue}
              required={!allowEmpty}
              placeholder={allowEmpty ? "No limit" : "e.g. 20"}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>GB</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <Button type="submit" variant="outline" disabled={busy}>
            {button}
          </Button>
        </div>
        <FieldDescription>{description}</FieldDescription>
      </Field>
    </form>
  );
}
