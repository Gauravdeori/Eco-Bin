import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SectionHeading, StatusDot } from "@/components/eco/primitives";
import { RequiresChannel } from "@/components/eco/connection-state";
import { AssignTruckDialog, useAssignDialog } from "@/components/eco/assign-truck";
import { MapPanel } from "@/components/eco/map-panel";
import { useEco } from "@/store/ecobin-store";
import type { BinStatus } from "@/types/ecobin";

export const Route = createFileRoute("/admin/map")({
  head: () => ({
    meta: [
      { title: "Live Bin Map — EcoBin" },
      {
        name: "description",
        content:
          "Interactive OpenStreetMap view of every smart bin and collection truck with status filters.",
      },
      { property: "og:title", content: "Live Bin Map — EcoBin" },
      {
        property: "og:description",
        content: "Every smart bin and truck on one interactive municipal map.",
      },
    ],
  }),
  component: AdminMapPage,
});

const FILTERS: (BinStatus | "all")[] = ["all", "critical", "high", "filling", "normal", "offline"];

function AdminMapPage() {
  return (
    <div className="space-y-4">
      <SectionHeading
        title="Live bin map"
        description="Markers are colour-coded by status and labelled with the fill percentage from ThingSpeak."
      />
      <RequiresChannel>
        <AdminMap />
      </RequiresChannel>
    </div>
  );
}

function AdminMap() {
  const bins = useEco((s) => s.bins);
  const trucks = useEco((s) => s.trucks);
  const [filter, setFilter] = useState<BinStatus | "all">("all");
  const [showTrucks, setShowTrucks] = useState(true);
  const assign = useAssignDialog();

  const filtered = filter === "all" ? bins : bins.filter((b) => b.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            className="gap-2 capitalize"
            onClick={() => setFilter(f)}
          >
            {f !== "all" && <StatusDot status={f} />}
            {f}
          </Button>
        ))}
        <Button
          size="sm"
          variant={showTrucks ? "secondary" : "outline"}
          onClick={() => setShowTrucks((v) => !v)}
        >
          {showTrucks ? "Hide trucks" : "Show trucks"}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} bins shown</span>
      </div>
      <MapPanel
        bins={filtered}
        trucks={showTrucks ? trucks : []}
        onAssign={assign.openFor}
        className="h-[65vh] min-h-96"
      />
      <AssignTruckDialog
        binId={assign.binId}
        open={assign.open}
        onOpenChange={assign.onOpenChange}
      />
    </div>
  );
}
