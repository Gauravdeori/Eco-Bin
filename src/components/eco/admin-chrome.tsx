import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Menu, RefreshCw, Search, Wifi, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEco } from "@/store/ecobin-store";
import { timeAgo } from "@/lib/ecobin-logic";
import { MUNICIPALITY } from "@/lib/ecobin-config";
import { EcoLogo, StatusDot } from "./primitives";
import { cn } from "@/lib/utils";

/** Reports the real state of the ThingSpeak link — there is no demo fallback. */
export function DataSourceIndicator({ compact = false }: { compact?: boolean }) {
  const connection = useEco((s) => s.connection);
  const channelId = useEco((s) => s.settings.channelId);
  const configured = channelId.trim().length > 0;
  const live = connection.live;

  const label = !configured
    ? "No channel configured"
    : live
      ? "ThingSpeak connected"
      : connection.loading
        ? "Connecting…"
        : "ThingSpeak offline";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
      {live ? (
        <Wifi className="size-3.5 text-normal" aria-hidden />
      ) : (
        <WifiOff className="size-3.5 text-muted-foreground" aria-hidden />
      )}
      <div className="leading-tight">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <StatusDot status={live ? "normal" : configured ? "critical" : "offline"} />
          {label}
        </p>
        {!compact && (
          <p className="text-[11px] text-muted-foreground">
            {live
              ? `${connection.channelName ? `${connection.channelName} · ` : ""}synced ${timeAgo(connection.lastSync)}`
              : configured
                ? (connection.error ?? "Waiting for the first successful read.")
                : "Add a channel ID in Settings to start."}
          </p>
        )}
      </div>
    </div>
  );
}

export function RefreshButton() {
  const refresh = useEco((s) => s.refresh);
  const loading = useEco((s) => s.connection.loading);
  const lastSync = useEco((s) => s.connection.lastSync);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void refresh()}
      aria-label="Refresh sensor data from ThingSpeak"
      className="gap-2"
    >
      <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden />
      <span className="hidden text-xs sm:inline">
        {lastSync ? `Synced ${timeAgo(lastSync)}` : "Sync now"}
      </span>
    </Button>
  );
}

export function NotificationBell() {
  const notifications = useEco((s) => s.notifications);
  const markRead = useEco((s) => s.markNotificationsRead);
  const clear = useEco((s) => s.clearNotifications);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <Popover onOpenChange={(o) => o && markRead()}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label={`Notifications (${unread} unread)`}
        >
          <Bell className="size-4" aria-hidden />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid size-4.5 min-w-4.5 place-items-center rounded-full bg-critical px-1 text-[10px] font-bold text-critical-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Alerts</p>
          {notifications.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clear}>
              Clear
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No alerts yet. Critical fill levels, offline devices and citizen reports appear here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id} className="px-3 py-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <StatusDot
                      status={
                        n.level === "critical"
                          ? "critical"
                          : n.level === "warning"
                            ? "high"
                            : n.level === "success"
                              ? "normal"
                              : "filling"
                      }
                    />
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const bins = useEco((s) => s.bins);
  const trucks = useEco((s) => s.trucks);
  const reports = useEco((s) => s.reports);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const out: { label: string; sub: string; go: () => void }[] = [];
    bins
      .filter(
        (b) =>
          b.id.toLowerCase().includes(term) ||
          b.name.toLowerCase().includes(term) ||
          b.ward.toLowerCase().includes(term),
      )
      .slice(0, 6)
      .forEach((b) =>
        out.push({
          label: b.id,
          sub: `${b.name} · ${b.ward} · ${b.fillLevel}%`,
          go: () => navigate({ to: "/admin/bins/$binId", params: { binId: b.id } }),
        }),
      );
    trucks
      .filter((t) => t.id.toLowerCase().includes(term) || t.driver.toLowerCase().includes(term))
      .slice(0, 4)
      .forEach((t) =>
        out.push({
          label: t.id,
          sub: `Truck · ${t.driver}`,
          go: () => navigate({ to: "/admin/trucks" }),
        }),
      );
    reports
      .filter((r) => r.id.toLowerCase().includes(term) || r.location.toLowerCase().includes(term))
      .slice(0, 4)
      .forEach((r) =>
        out.push({
          label: r.id,
          sub: `Report · ${r.binId}`,
          go: () => navigate({ to: "/admin/reports" }),
        }),
      );
    return out;
  }, [q, bins, trucks, reports, navigate]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="hidden text-xs md:inline">Search bins, trucks, reports…</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Global search</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Bin ID, truck, report, ward or worker…"
            aria-label="Search query"
          />
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {results.map((r, i) => (
              <li key={`${r.label}-${i}`}>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                  onClick={() => {
                    r.go();
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <span className="text-sm font-semibold">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.sub}</span>
                </button>
              </li>
            ))}
            {q && !results.length && (
              <li className="px-3 py-2 text-sm text-muted-foreground">No matches found.</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminTopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <Menu className="size-4" aria-hidden />
      </Button>
      <Link to="/" className="lg:hidden">
        <EcoLogo showText={false} />
      </Link>
      <div className="hidden flex-col leading-tight lg:flex">
        <span className="text-sm font-semibold">Command Center</span>
        <span className="text-xs text-muted-foreground">{MUNICIPALITY}</span>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <GlobalSearch />
        <DataSourceIndicator compact />
        <RefreshButton />
        <NotificationBell />
        <Badge variant="secondary" className="hidden gap-2 py-1.5 sm:flex">
          <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            AD
          </span>
          Admin
        </Badge>
      </div>
    </header>
  );
}

export function MobileNavClose({ onClose }: { onClose: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close navigation">
      <X className="size-4" aria-hidden />
    </Button>
  );
}
