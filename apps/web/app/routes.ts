import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/overview.tsx"),
  route("login", "routes/login.tsx"),
  // Public: key holders check their own usage with a lookup code.
  route("check", "routes/check.tsx"),
  route("servers/:sid", "routes/server.tsx"),
] satisfies RouteConfig;
