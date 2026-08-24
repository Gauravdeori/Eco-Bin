import { useState } from "react";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Brain,
  ClipboardList,
  Gauge,
  History,
  LayoutDashboard,
  Leaf,
  ListOrdered,
  MapPin,
  MessageSquareWarning,
  Settings,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EcoLogo } from "@/components/eco/primitives";
import { AdminTopBar, DataSourceIndicator, MobileNavClose } from "@/components/eco/admin-chrome";
import { useEcoSync } from "@/hooks/use-eco-sync";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "EcoBin Command Center — Municipal Waste Operations" },
      {
        name: "description",
        content:
          "Monitor smart bins, priority scores, collection queues, trucks and citizen reports from the EcoBin municipal command center.",
      },
      { property: "og:title", content: "EcoBin Command Center" },
      {
        property: "og:description",
        content:
          "Real-time IoT bin monitoring, priority scoring and collection dispatch for municipalities.",
      },
    ],
  }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/bins", label: "Live Bins", icon: Gauge },
  { to: "/admin/map", label: "Live Bin Map", icon: MapPin },
  { to: "/admin/queue", label: "Collection Queue", icon: ListOrdered },
  { to: "/admin/trucks", label: "Trucks", icon: Truck },
  { to: "/admin/reports", label: "Citizen Reports", icon: MessageSquareWarning },
  { to: "/admin/ai", label: "Classification", icon: Brain },
  { to: "/admin/analytics", label: "Fill Analytics", icon: BarChart3 },
  { to: "/admin/impact", label: "Impact", icon: Leaf },
  { to: "/admin/history", label: "History", icon: History },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

function AdminLayout() {
  useEcoSync();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Link to="/" aria-label="EcoBin home">
            <EcoLogo tone="sidebar" />
          </Link>
          <span className="lg:hidden">
            <MobileNavClose onClose={() => setNavOpen(false)} />
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Admin navigation">
          {NAV.map(({ to, label, icon: Icon, ...rest }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: "exact" in rest ? Boolean(rest.exact) : false }}
              onClick={() => setNavOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className:
                  "bg-sidebar-accent text-sidebar-primary font-semibold shadow-[inset_3px_0_0_0_var(--sidebar-primary)]",
              }}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3">
          <DataSourceIndicator />
          <Button
            asChild
            variant="ghost"
            className="w-full justify-start gap-2 text-sidebar-foreground/80"
          >
            <Link to="/worker">
              <ClipboardList className="size-4" aria-hidden />
              Worker app
            </Link>
          </Button>
        </div>
      </aside>

      {navOpen && (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar onMenu={() => setNavOpen(true)} />
        <main className="flex-1 space-y-4 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
