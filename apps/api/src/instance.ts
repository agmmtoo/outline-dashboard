import type { InstanceStateView } from "@outline-dash/core";
import { LightsailError } from "@outline-dash/lightsail-client";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { lightsailFor, type AppEnv } from "./env";
import { serverOr404 } from "./servers";

function lightsailOr404(env: AppEnv["Bindings"], sid: string) {
  const { server } = serverOr404(env, sid);
  const lightsail = lightsailFor(env, server);
  if (!lightsail || !server.lightsail) {
    throw new HTTPException(404, { message: `No Lightsail instance configured for "${sid}"` });
  }
  return { server, lightsail, instanceName: server.lightsail.instanceName };
}

/** Power actions on the cloud instance behind an Outline server. Mounted under /servers. */
export const instance = new Hono<AppEnv>()
  .get("/:sid/instance", async (c) => {
    const { lightsail, instanceName } = lightsailOr404(c.env, c.req.param("sid"));
    const state = await lightsail.getInstanceState(instanceName);
    return c.json({ state: state.name, checkedAt: Date.now() } satisfies InstanceStateView);
  })

  .post("/:sid/instance/reboot", async (c) => {
    const { server, lightsail, instanceName } = lightsailOr404(c.env, c.req.param("sid"));
    // Audit trail in Workers logs (observability is enabled in wrangler.jsonc).
    console.log(
      JSON.stringify({ event: "instance.reboot", server: server.id, instance: instanceName, by: c.get("userEmail") }),
    );
    await lightsail.rebootInstance(instanceName);
    return c.body(null, 202);
  });

export function lightsailErrorResponse(err: LightsailError) {
  // Map AWS errors to something actionable without leaking request details.
  if (err.code === "AccessDeniedException" || err.code === "UnrecognizedClientException") {
    return { status: 502 as const, error: `AWS denied the request (${err.code}). Check the IAM policy and the instance tag.` };
  }
  if (err.code === "NotFoundException") {
    return { status: 404 as const, error: "Lightsail instance not found. Check the instance name and region." };
  }
  if (err.code === "InvalidInputException" || err.code === "OperationFailureException") {
    return { status: 409 as const, error: `Lightsail: ${err.message}` };
  }
  return { status: 502 as const, error: `Lightsail: ${err.message}` };
}
