import { formatRelative, gbToBytes } from "@outline-dash/core/format";
import { parseKeyName } from "@outline-dash/core/key-meta";
import type { KeyStatus, KeyView, ServerView } from "@outline-dash/core/types";
import {
  CopyIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PlusIcon,
  PowerIcon,
  PowerOffIcon,
  RotateCwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  TicketIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { inverseOf, useAction, type CreatedKey, type Payload } from "~/lib/actions";
import { shareableLink } from "~/lib/browser";
import { usePendingActions } from "~/lib/pending";
import { AccessLink, useCopy } from "./access-link";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { CreateKeyDialog } from "./create-key-dialog";
import { KeySheet } from "./key-sheet";
import { STATUS_ORDER, StatusBadge, StatusDot, statusDotClass, statusLabel, UsageRing } from "./status";
import { cn } from "~/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Sort = "usage" | "last-seen" | "name";
type StatusFilter = KeyStatus | "all";

const SORT_ITEMS: Record<Sort, string> = { usage: "Most usage", "last-seen": "Recently seen", name: "Name" };
const QUICK_TOP_UP_GB = 10;

export type KeyActions = ReturnType<typeof useKeyActions>;

/**
 * Shared by the table row menus and the key panel, so results survive the panel
 * closing. `apply` is for changes that can be undone; the rest are held back for a
 * few seconds after confirming so they can still be cancelled.
 */
function useKeyActions() {
  const action = useAction();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const later = (payload: Payload, title: string, keyId: string) => action.submit(payload, { grace: { title, keyId } });

  return {
    ...action,
    confirm,
    setConfirm,
    apply: (payload: Payload, k: KeyView) => action.submit(payload, { undo: inverseOf(payload, k) }),
    // Callers that already show the consequences (the panel's danger zone) skip the dialog.
    rotate: (k: KeyView, { ask = true } = {}) => {
      const run = () => later({ intent: "rotate", keyId: k.id }, `Rotating "${k.label}"`, k.id);
      if (!ask) return run();
      setConfirm({
        title: `Rotate "${k.label}"?`,
        description: k.dynamicHandle
          ? "A new key with a new password replaces this one. The dynamic link stays the same, so users reconnect without doing anything. The old static ss:// link stops working."
          : "A new key with the same name and limit replaces this one. The current link stops working immediately, so the user needs the new link.",
        action: "Rotate key",
        onConfirm: run,
      });
    },
    move: (k: KeyView, to: { id: string; name: string }, { ask = true } = {}) => {
      const run = () => later({ intent: "move", keyId: k.id, to: to.id }, `Moving "${k.label}" to ${to.name}`, k.id);
      if (!ask) return run();
      setConfirm({
        title: `Move "${k.label}" to ${to.name}?`,
        description: k.dynamicHandle
          ? `The key is recreated on ${to.name} and removed here. Its dynamic link keeps working; usage history starts fresh.`
          : `The key is recreated on ${to.name} and removed here. It has no dynamic link, so the user needs the new ss:// link. Usage history starts fresh.`,
        action: "Move key",
        onConfirm: run,
      });
    },
    resetDynamic: (k: KeyView, { ask = true } = {}) => {
      // Creating a first dynamic link breaks nothing, so it runs straight away.
      if (!k.dynamicHandle) return action.submit({ intent: "dynamic", keyId: k.id });
      const run = () => later({ intent: "dynamic", keyId: k.id }, `Resetting the link for "${k.label}"`, k.id);
      if (!ask) return run();
      setConfirm({
        title: `Reset the dynamic link for "${k.label}"?`,
        description: "A new dynamic link is issued and the current one stops working. Use this if the link leaked.",
        action: "Reset link",
        destructive: true,
        onConfirm: run,
      });
    },
    remove: (k: KeyView, { ask = true } = {}) => {
      const run = () => later({ intent: "delete", keyId: k.id }, `Deleting "${k.label}"`, k.id);
      if (!ask) return run();
      setConfirm({
        title: `Delete "${k.label}"?`,
        description: "The key is removed from the server and its link stops working. This cannot be undone.",
        action: "Delete key",
        destructive: true,
        confirmText: k.label,
        onConfirm: run,
      });
    },
  };
}

export function KeysPanel({
  server,
  keys,
  dynamicKeys,
  otherServers,
}: {
  server: ServerView;
  keys: KeyView[];
  dynamicKeys: boolean;
  otherServers: Array<{ id: string; name: string }>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<Sort>("usage");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [replaced, setReplaced] = useState<{ title: string; key: CreatedKey } | null>(null);
  const actions = useKeyActions();
  const { copy } = useCopy();
  const waiting = new Set(usePendingActions().map((a) => a.keyId));

  const { result, busy } = actions;
  useEffect(() => {
    if (busy || !result?.ok) return;
    const created = result.created?.[0];
    if ((result.intent === "rotate" || result.intent === "move") && created) {
      setSelectedId(null);
      // A dynamic link doesn't change, so there's nothing new to hand out.
      if (!created.dynamicUrl) {
        setReplaced({ title: result.intent === "rotate" ? "Key rotated" : "Key moved", key: created });
      }
    }
    if (result.intent === "delete") setSelectedId(null);
  }, [result, busy]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<KeyStatus, number>;
    for (const k of keys) c[k.status]++;
    return c;
  }, [keys]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return keys
      .filter(
        (k) =>
          (status === "all" || k.status === status) &&
          (!q || k.label.toLowerCase().includes(q) || k.id === q || k.tags.some((t) => t.toLowerCase().includes(q))),
      )
      .sort((a, b) => {
        if (sort === "usage") return b.usedBytes - a.usedBytes;
        if (sort === "last-seen") return (b.lastSeenMs ?? 0) - (a.lastSeenMs ?? 0);
        return a.label.localeCompare(b.label);
      });
  }, [keys, query, status, sort]);

  const statusItems: Record<string, string> = {
    all: `All statuses (${keys.length})`,
    ...Object.fromEntries(STATUS_ORDER.map((s) => [s, `${statusLabel(s)} (${counts[s]})`])),
  };

  const selected = keys.find((k) => k.id === selectedId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search name, tag or #id" value={query} onChange={(e) => setQuery(e.target.value)} />
        </InputGroup>
        <Select items={statusItems} value={status} onValueChange={(v) => setStatus((v ?? "all") as StatusFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(statusItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={SORT_ITEMS} value={sort} onValueChange={(v) => setSort((v ?? "usage") as Sort)}>
          <SelectTrigger className="w-36">
            <SlidersHorizontalIcon />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon />
          New key
        </Button>
      </div>

      <MissingCodes count={keys.filter((k) => !k.lookupCode).length} />

      {keys.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRoundIcon />
            </EmptyMedia>
            <EmptyTitle>No access keys yet</EmptyTitle>
            <EmptyDescription>Create a key to give someone access to this server.</EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            New key
          </Button>
        </Empty>
      ) : (
        <div className="ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-3">Key</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="w-56">Usage · 30 days</TableHead>
                <TableHead className="hidden md:table-cell">Last seen</TableHead>
                <TableHead className="hidden text-right md:table-cell">Devices</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((k) => (
                <TableRow
                  key={k.id}
                  className={cn("cursor-pointer", waiting.has(k.id) && "opacity-50")}
                  onClick={() => setSelectedId(k.id)}
                >
                  <TableCell className="pl-3">
                    <div className="flex items-center gap-1.5 font-medium">
                      <StatusDot className={cn(statusDotClass(k.status), "sm:hidden")} />
                      {k.label}
                      {waiting.has(k.id) && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-destructive">
                          waiting
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-muted-foreground">
                      <span className="font-mono text-[11px]">#{k.id}</span>
                      {k.dynamicHandle && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-primary">
                          dynamic
                        </Badge>
                      )}
                      {k.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="h-4 px-1.5 text-[10px]">
                          {t}
                        </Badge>
                      ))}
                      {k.expires && <span className="text-[11px]">· expires {k.expires}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge status={k.status} />
                  </TableCell>
                  <TableCell>
                    <UsageRing used={k.usedBytes} limit={k.effectiveLimitBytes} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {k.lastSeenMs != null ? formatRelative(k.lastSeenMs) : "-"}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{k.peakDevices ?? "-"}</TableCell>
                  <TableCell className="pr-3" onClick={(e) => e.stopPropagation()}>
                    <RowMenu
                      k={k}
                      actions={actions}
                      onManage={() => setSelectedId(k.id)}
                      onCopy={() => copy(shareableLink(k).url, "Access link copied")}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No keys match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {visible.length} of {keys.length} keys
      </p>

      <KeySheet
        keyView={selected}
        server={server}
        actions={actions}
        dynamicKeys={dynamicKeys}
        otherServers={otherServers}
        open={selectedId != null && selected != null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />

      <CreateKeyDialog server={server} dynamicKeys={dynamicKeys} open={creating} onOpenChange={setCreating} />

      <Dialog open={replaced != null} onOpenChange={(open) => !open && setReplaced(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{replaced?.title}</DialogTitle>
            <DialogDescription>Send this new link to the user. The old one no longer works.</DialogDescription>
          </DialogHeader>
          {replaced && (
            <AccessLink
              link={shareableLink({
                ...replaced.key,
                label: parseKeyName(replaced.key.name).label,
                lookupCode: parseKeyName(replaced.key.name).code,
              })}
              revealed
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog request={actions.confirm} onClose={() => actions.setConfirm(null)} />
    </div>
  );
}

/** Offers to give older keys a usage check code; hidden once every key has one. */
function MissingCodes({ count }: { count: number }) {
  const action = useAction({ silentSuccess: true });
  const result = action.result;
  useEffect(() => {
    if (result?.ok && result.codes) {
      const { updated, remaining } = result.codes;
      toast.success(
        remaining > 0
          ? `Added codes to ${updated} keys. Run it again for the other ${remaining}.`
          : `Added codes to ${updated} keys`,
      );
    }
  }, [result]);
  if (count === 0) return null;
  return (
    <Alert>
      <TicketIcon />
      <AlertTitle>
        {count} {count === 1 ? "key has" : "keys have"} no usage check code
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>Users need a code to look up their own usage on the public check page.</span>
        <Button size="sm" variant="outline" disabled={action.busy} onClick={() => action.submit({ intent: "codes" })}>
          {action.busy ? "Adding…" : "Add codes"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function RowMenu({
  k,
  actions,
  onManage,
  onCopy,
}: {
  k: KeyView;
  actions: KeyActions;
  onManage: () => void;
  onCopy: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${k.label}`} />}>
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onManage}>
          <SlidersHorizontalIcon />
          Manage
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopy}>
          <CopyIcon />
          Copy access link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {!k.disabled && k.effectiveLimitBytes != null && (
          <DropdownMenuItem
            onClick={() => actions.apply({ intent: "top-up", keyId: k.id, bytes: gbToBytes(QUICK_TOP_UP_GB) }, k)}
          >
            <ZapIcon />
            Top up +{QUICK_TOP_UP_GB} GB
          </DropdownMenuItem>
        )}
        {k.disabled ? (
          <DropdownMenuItem onClick={() => actions.apply({ intent: "enable", keyId: k.id }, k)}>
            <PowerIcon />
            Enable
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => actions.apply({ intent: "disable", keyId: k.id }, k)}>
            <PowerOffIcon />
            Disable
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => actions.rotate(k)}>
          <RotateCwIcon />
          Rotate…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => actions.remove(k)}>
          <Trash2Icon />
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
