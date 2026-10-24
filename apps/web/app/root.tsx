import { LogOutIcon, MonitorIcon, MoonIcon, RefreshCwIcon, ShieldCheckIcon, SunIcon } from "lucide-react";
import { useEffect, useState } from "react";
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
  useRevalidator,
} from "react-router";

import type { Route } from "./+types/root";
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
import { cn } from "./lib/utils";
import "./app.css";

export function meta() {
  return [{ title: "Outline Admin" }, { name: "robots", content: "noindex, nofollow" }];
}

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
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="flex size-6 items-center justify-center bg-primary text-primary-foreground">
              <ShieldCheckIcon className="size-3.5" />
            </span>
            Outline Admin
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <RefreshButton />
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

function RefreshButton() {
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const busy = revalidator.state === "loading" || navigation.state === "loading";
  return (
    <Button variant="ghost" size="sm" onClick={() => revalidator.revalidate()} disabled={busy}>
      <RefreshCwIcon className={cn(busy && "animate-spin")} />
      <span className="hidden sm:inline">Refresh</span>
    </Button>
  );
}

/** Shown only with password sign-in (Access has its own logout). */
function SignOutButton() {
  const [mode, setMode] = useState<string | null>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    api<{ mode: string }>("/auth/status")
      .then((s) => setMode(s.mode))
      .catch(() => setMode(null));
  }, []);
  if (mode !== "password" || pathname === "/login") return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Sign out"
      onClick={async () => {
        await api("/auth/logout", { method: "POST" }).catch(() => undefined);
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
