import { formatBytes, gbToBytes } from "@outline-dash/core/format";
import { formatLookupCode, parseKeyName } from "@outline-dash/core/key-meta";
import type { ServerView } from "@outline-dash/core/types";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { parseGb, splitTags, useAction } from "~/lib/actions";
import { downloadCsv, shareableLink } from "~/lib/browser";
import { AccessLink, useCopy } from "./access-link";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";

const MAX_BULK = 40;

export function CreateKeyDialog({
  server,
  dynamicKeys,
  open,
  onOpenChange,
}: {
  server: ServerView;
  dynamicKeys: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Remount the body on every open so the form and result start fresh.
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) setSession((n) => n + 1);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <CreateKeyBody key={session} server={server} dynamicKeys={dynamicKeys} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateKeyBody({
  server,
  dynamicKeys,
  onClose,
}: {
  server: ServerView;
  dynamicKeys: boolean;
  onClose: () => void;
}) {
  const action = useAction();
  const { result, busy } = action;
  const [preset, setPreset] = useState("default");
  const [dynamic, setDynamic] = useState(dynamicKeys);
  const [formError, setFormError] = useState<string | null>(null);
  const { copy } = useCopy();

  const limitItems: Record<string, string> = {
    default: server.defaultLimitBytes != null ? `Server default (${formatBytes(server.defaultLimitBytes)})` : "No limit",
    "10": "10 GB",
    "50": "50 GB",
    "100": "100 GB",
    custom: "Custom",
  };

  if (result?.ok && result.created) {
    const rows = result.created.map((k) => {
      const { label, code } = parseKeyName(k.name);
      const link = shareableLink({ ...k, label, lookupCode: code });
      return { id: k.id, label, code: code ? formatLookupCode(code) : "", link: link.url, shareable: link };
    });
    const single = rows.length === 1 ? rows[0] : undefined;
    return (
      <>
        <DialogHeader>
          <DialogTitle>{single ? `Created "${single.label}"` : `Created ${rows.length} keys`}</DialogTitle>
          <DialogDescription>
            {single
              ? "Share the link or QR code privately. Anyone with it can connect."
              : "Download the links now, or copy them from each key later."}
          </DialogDescription>
        </DialogHeader>
        {single ? (
          <AccessLink link={single.shareable} revealed />
        ) : (
          <ul className="max-h-56 divide-y overflow-y-auto ring-1 ring-foreground/10">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-3 py-1.5">
                <span>{r.label}</span>
                <span className="font-mono text-muted-foreground">#{r.id}</span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          {!single && (
            <>
              <Button
                variant="outline"
                onClick={() => copy(rows.map((r) => `${r.label}\t${r.link}`).join("\n"), "Links copied")}
              >
                <CopyIcon />
                Copy all
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  downloadCsv(`${server.name}-keys.csv`, [["id", "name", "check_code", "access_url"], ...rows.map((r) => [r.id, r.label, r.code, r.link])])
                }
              >
                <DownloadIcon />
                Download CSV
              </Button>
            </>
          )}
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const limitGb = preset === "custom" ? parseGb(f.get("customGb")) : preset === "default" ? null : Number(preset);
        const count = Number(f.get("count") || 1);
        const port = String(f.get("port") ?? "").trim();
        if (Number.isNaN(limitGb)) return setFormError("Limit must be a positive number of GB.");
        if (!Number.isInteger(count) || count < 1 || count > MAX_BULK) {
          return setFormError(`Count must be between 1 and ${MAX_BULK}.`);
        }
        setFormError(null);
        action.submit({
          intent: "create",
          body: {
            label: String(f.get("label") ?? "").trim(),
            tags: splitTags(f.get("tags")),
            expires: String(f.get("expires") ?? "") || null,
            limitBytes: limitGb == null ? null : gbToBytes(limitGb),
            count,
            ...(port ? { port: Number(port) } : {}),
            dynamic,
          },
        });
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>New access key</DialogTitle>
        <DialogDescription>On {server.name}. Create one key, or up to {MAX_BULK} at once.</DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="create-label">Name</FieldLabel>
          <Input id="create-label" name="label" required maxLength={100} autoFocus placeholder="Aung" />
          <FieldDescription>
            For several keys, put <code>{"{n}"}</code> where the number goes, e.g. <code>driver-{"{n}"}</code>.
          </FieldDescription>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="create-tags">Tags</FieldLabel>
            <Input id="create-tags" name="tags" placeholder="plus, yangon" />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-expires">Expires</FieldLabel>
            <Input id="create-expires" name="expires" type="date" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Data limit · 30 days</FieldLabel>
            <Select items={limitItems} value={preset} onValueChange={(v) => setPreset(String(v ?? "default"))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(limitItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {preset === "custom" && (
            <Field>
              <FieldLabel htmlFor="create-custom">Custom limit</FieldLabel>
              <InputGroup>
                <InputGroupInput id="create-custom" name="customGb" type="number" min={0} step="any" required />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>GB</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="create-count">How many</FieldLabel>
            <Input id="create-count" name="count" type="number" min={1} max={MAX_BULK} defaultValue={1} />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-port">Port</FieldLabel>
            <Input id="create-port" name="port" type="number" min={1} max={65535} placeholder={String(server.portForNewAccessKeys)} />
          </Field>
        </div>

        {dynamicKeys && (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="create-dynamic">Dynamic link</FieldLabel>
              <FieldDescription>
                Hand out an ssconf:// link that keeps working after rotating, moving or changing the server address.
                Needs Outline app 1.8 or newer.
              </FieldDescription>
            </FieldContent>
            <Switch id="create-dynamic" checked={dynamic} onCheckedChange={setDynamic} />
          </Field>
        )}

        {formError && <FieldError>{formError}</FieldError>}
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}
