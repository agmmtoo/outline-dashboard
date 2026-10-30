import { formatBytes } from "@outline-dash/core/format";
import type { KeyCheckView, KeyStatus } from "@outline-dash/core/types";
import { useMutation } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { StatusBadge, UsageRing } from "~/components/status";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { api, ApiError } from "~/lib/api";

export function meta() {
  return [{ title: "Check your key" }, { name: "robots", content: "noindex, nofollow" }];
}

const STATUS_NOTE: Record<KeyStatus, string> = {
  active: "Your key is working.",
  "near-limit": "You've used most of your data. Ask your admin for a top-up if you need more.",
  "over-limit": "You've reached your data limit, so the key won't connect until your admin tops it up.",
  idle: "Your key works, but it hasn't been used recently.",
  expired: "This key has expired. Contact your admin to renew it.",
  disabled: "This key is turned off. Contact your admin.",
};

/**
 * Public page for key holders: enter the lookup code shown next to the key's name
 * in the Outline app (or paste the ss:// link) to see that key's usage and limit.
 * The code is only sent in the request body, never put in the URL.
 */
export default function Check() {
  const check = useMutation({
    mutationFn: (code: string) => api<KeyCheckView>("/public/check", { method: "POST", body: { code } }),
  });
  const key = check.data;

  return (
    <div className="mx-auto max-w-md space-y-4 py-6">
      <div>
        <h1 className="font-heading text-lg font-semibold tracking-tight">Check your key</h1>
        <p className="text-xs text-muted-foreground">See how much data you've used and how much is left.</p>
      </div>

      <Card>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
              if (code) check.mutate(code);
            }}
          >
            <Field>
              <FieldLabel htmlFor="code">Your code</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="code"
                  name="code"
                  placeholder="K7Q2-M9XA-3F"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  className="font-mono tracking-wider"
                />
                <Button type="submit" disabled={check.isPending}>
                  <SearchIcon />
                  {check.isPending ? "Checking…" : "Check"}
                </Button>
              </div>
              <FieldDescription>
                It's in brackets after your key's name in the Outline app. You can also paste your full ss:// link.
              </FieldDescription>
            </Field>
          </form>
        </CardContent>
      </Card>

      {check.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {check.error instanceof ApiError ? check.error.message : "Couldn't check right now. Try again in a moment."}
          </AlertDescription>
        </Alert>
      )}

      {key && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="truncate">{key.label}</span>
              <StatusBadge status={key.status} />
            </CardTitle>
            <CardDescription>{STATUS_NOTE[key.status]}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Keyed so the ring fills again for each lookup. */}
            <UsageRing key={`${key.label}-${key.usedBytes}`} used={key.usedBytes} limit={key.limitBytes} size="lg" />
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Item label="Used" value={formatBytes(key.usedBytes)} />
              <Item label="Limit" value={key.limitBytes == null ? "No limit" : formatBytes(key.limitBytes)} />
              <Item
                label="Left"
                value={key.limitBytes == null ? "Unlimited" : formatBytes(Math.max(0, key.limitBytes - key.usedBytes))}
              />
              <Item label="Expires" value={key.expires ?? "Never"} />
            </dl>
          </CardContent>
          <CardFooter className="border-t">
            <p className="text-xs text-muted-foreground">
              Usage counts the last 30 days, so older use drops off day by day.
            </p>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
