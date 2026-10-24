import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/overview.tsx"),
  route("login", "routes/login.tsx"),
  route("servers/:sid", "routes/server.tsx"),
] satisfies RouteConfig;
