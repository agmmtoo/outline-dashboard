import { GB, gbToBytes } from "@outline-dash/core/format";
import type { ServerView } from "@outline-dash/core/types";
import { useState } from "react";
import { toast } from "sonner";
import { parseGb, useAction, type SettingsBody } from "~/lib/actions";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "./ui/field";
import { Input } from "./ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group";
import { Switch } from "./ui/switch";

export function SettingsPanel({ server }: { server: ServerView }) {
  const action = useAction();
  const [formError, setFormError] = useState<string | null>(null);
  const [metricsEnabled, setMetricsEnabled] = useState(server.metricsEnabled);

  return (
    <form
      // Remount when the server values change so inputs show what was saved.
      key={JSON.stringify(server)}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const limitGb = parseGb(f.get("defaultLimitGb"));
        if (Number.isNaN(limitGb)) return setFormError("Default limit must be a positive number of GB.");

        // Only send what changed: e.g. setting the hostname makes Outline re-validate it.
        const body: SettingsBody = {};
        const name = String(f.get("name") ?? "").trim();
        const hostname = String(f.get("hostname") ?? "").trim();
        const port = Number(f.get("port"));
        const defaultLimitBytes = limitGb == null ? null : gbToBytes(limitGb);
        if (name && name !== server.name) body.name = name;
        if (hostname && hostname !== server.hostnameForAccessKeys) body.hostname = hostname;
        if (port && port !== server.portForNewAccessKeys) body.port = port;
        if (metricsEnabled !== server.metricsEnabled) body.metricsEnabled = metricsEnabled;
        if (defaultLimitBytes !== server.defaultLimitBytes) body.defaultLimitBytes = defaultLimitBytes;

        setFormError(null);
        if (Object.keys(body).length === 0) return void toast.info("Nothing changed");
        action.submit({ intent: "settings", body });
      }}
    >
      <Card className="max-w-2xl">
        <CardHeader className="border-b">
          <CardTitle>Server settings</CardTitle>
          <CardDescription>
            Server ID <span className="font-mono">{server.serverId}</span> · created{" "}
            {new Date(server.createdTimestampMs).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="s-name">Server name</FieldLabel>
              <Input id="s-name" name="name" defaultValue={server.name} maxLength={100} />
              <FieldDescription>Shown in Outline clients.</FieldDescription>
            </Field>

            <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
              <Field>
                <FieldLabel htmlFor="s-host">Hostname for access keys</FieldLabel>
                <Input id="s-host" name="hostname" defaultValue={server.hostnameForAccessKeys} className="font-mono" />
                <FieldDescription>Used in new links only. People who already have a link keep the old address.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="s-port">Port for new keys</FieldLabel>
                <Input id="s-port" name="port" type="number" min={1} max={65535} defaultValue={server.portForNewAccessKeys} />
                <FieldDescription>Existing keys keep their port.</FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="s-limit">Default data limit</FieldLabel>
              <InputGroup className="max-w-64">
                <InputGroupInput
                  id="s-limit"
                  name="defaultLimitGb"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="No limit"
                  defaultValue={server.defaultLimitBytes != null ? server.defaultLimitBytes / GB : ""}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>GB / 30 days</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>Applies to every key without its own limit. Leave empty for none.</FieldDescription>
            </Field>

            <FieldSeparator />

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="s-metrics">Share anonymous metrics with Outline</FieldLabel>
                <FieldDescription>
                  Sends anonymous usage data to the Outline project. It does not affect the usage shown here. Keep it off
                  unless you have a reason to share.
                </FieldDescription>
              </FieldContent>
              <Switch id="s-metrics" checked={metricsEnabled} onCheckedChange={setMetricsEnabled} />
            </Field>

            {formError && <FieldError>{formError}</FieldError>}
          </FieldGroup>
        </CardContent>
        <CardFooter className="border-t">
          <Button type="submit" disabled={action.busy}>
            {action.busy ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
