import { LogOutIcon, MonitorIcon, MoonIcon, RefreshCwIcon, ShieldCheckIcon, SunIcon } from "lucide-react";
import { QueryClientProvider, useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Navigate,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigate,
  useNavigation,
} from "react-router";

import type { Route } from "./+types/root";
import { PendingBar } from "./components/pending-bar";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { Skeleton } from "./components/ui/skeleton";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { api, ApiError } from "./lib/api";
import { authStatusQuery, queryClient } from "./lib/query";
import { cn } from "./lib/utils";
import "./app.css";

export function meta() {
  return [{ title: "Outline Admin" }, { name: "robots", content: "noindex, nofollow" }];
}

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-svh antialiased">
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster position="bottom-right" />
            <PendingBar />
          </ThemeProvider>
        </QueryClientProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/** Pages for key holders, not admins: no admin links or controls in the header. */
const PUBLIC_PATHS = new Set(["/check"]);

function Shell({ children }: { children: React.ReactNode }) {
  const isPublic = PUBLIC_PATHS.has(useLocation().pathname);
  const brand = (
    <>
      <span className="flex size-6 items-center justify-center bg-primary text-primary-foreground">
        <ShieldCheckIcon className="size-3.5" />
      </span>
      {isPublic ? "Usage check" : "Outline Admin"}
    </>
  );
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-3 px-4">
          {isPublic ? (
            <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">{brand}</span>
          ) : (
            <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              {brand}
            </Link>
          )}
          <div className="ml-auto flex items-center gap-1">
            {!isPublic && <RefreshButton />}
            <ThemeToggle />
            {!isPublic && <SignOutButton />}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

/** Refetches what's on screen; cached data for other pages is only marked stale. */
function RefreshButton() {
  const client = useQueryClient();
  const navigation = useNavigation();
  const busy = useIsFetching({ predicate: (q) => q.queryKey[0] !== "auth" }) > 0 || navigation.state === "loading";
  return (
    <Button variant="ghost" size="sm" onClick={() => void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "auth" })} disabled={busy}>
      <RefreshCwIcon className={cn(busy && "animate-spin")} />
      <span className="hidden sm:inline">Refresh</span>
    </Button>
  );
}

/** Shown only with password sign-in (Access has its own logout). */
function SignOutButton() {
  const { data } = useQuery(authStatusQuery());
  const client = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (data?.mode !== "password" || pathname === "/login") return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Sign out"
      onClick={async () => {
        await api("/auth/logout", { method: "POST" }).catch(() => undefined);
        // Don't leave server data in memory after signing out.
        client.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
        navigate("/login");
      }}
    >
      <LogOutIcon />
    </Button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Theme" />}>
        <SunIcon className="dark:hidden" />
        <MoonIcon className="hidden dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(v) => setTheme(String(v))}>
          <DropdownMenuRadioItem value="light">
            <SunIcon /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-20">
      <Skeleton className="h-6 w-48" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function App() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Not found" : "Error";
    details = error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (error instanceof ApiError) {
    if (error.status === 401) {
      const here = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
      const to = here.startsWith("/login") ? here : `/login?next=${encodeURIComponent(here)}`;
      return <Navigate to={to} replace />;
    }
    const unauth = error.status === 403;
    message = unauth ? "Not signed in" : "API error";
    details = unauth
      ? "You don't have access, or your session expired. Reload the page to sign in again."
      : error.message;
  } else if (error instanceof Error) {
    details = error.message;
  }

  return (
    <Shell>
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>{message}</AlertTitle>
        <AlertDescription>{details}</AlertDescription>
      </Alert>
    </Shell>
  );
}
