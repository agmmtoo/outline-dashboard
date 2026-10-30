import { LockKeyholeIcon } from "lucide-react";
import { Form, redirect, useNavigation } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { rememberAdminDevice } from "~/lib/admin-device";
import { api, ApiError } from "~/lib/api";
import { authStatusQuery, queryClient } from "~/lib/query";
import type { Route } from "./+types/login";

export function meta() {
  return [{ title: "Sign in · Outline Admin" }];
}

/** Only allow same-app paths as the post-login destination. */
function safeNext(url: URL) {
  const next = url.searchParams.get("next") ?? "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const { mode } = await queryClient.ensureQueryData(authStatusQuery());
  // Access or local dev handles sign-in elsewhere; try the destination directly.
  if (mode !== "password") {
    try {
      await api("/me");
      return redirect(safeNext(new URL(request.url)));
    } catch {
      return { mode };
    }
  }
  return { mode };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData();
  try {
    await api("/auth/login", { method: "POST", body: { password: String(form.get("password") ?? "") } });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Sign-in failed" };
  }
  // Next time this browser is signed out, send it here rather than to the public check.
  rememberAdminDevice();
  // Drop anything cached from before the session expired.
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
  return redirect(safeNext(new URL(request.url)));
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  return (
    <div className="flex min-h-[60svh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockKeyholeIcon className="size-4" />
            Sign in
          </CardTitle>
          <CardDescription>
            {loaderData.mode === "password"
              ? "Enter the admin password."
              : "Password sign-in is not enabled for this deployment."}
          </CardDescription>
        </CardHeader>
        {loaderData.mode === "password" && (
          <CardContent>
            <Form method="post">
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
                  {actionData?.error && <FieldError>{actionData.error}</FieldError>}
                </Field>
                <Button type="submit" disabled={busy}>
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </FieldGroup>
            </Form>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
