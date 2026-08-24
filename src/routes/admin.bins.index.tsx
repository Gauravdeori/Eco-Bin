import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BatteryMedium, MapPinOff, Radio } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, FillBar, SectionHeading, StatusBadge } from "@/components/eco/primitives";
import { RequiresChannel } from "@/components/eco/connection-state";
import { AssignTruckDialog, useAssignDialog } from "@/components/eco/assign-truck";
import { useEco } from "@/store/ecobin-store";
import { timeAgo } from "@/lib/ecobin-logic";
import type { BinStatus } from "@/types/ecobin";

export const Route = createFileRoute("/admin/bins/")({
  head: () => ({
    meta: [
      { title: "Live Bin Monitoring — EcoBin" },
      {
        name: "description",
        content:
          "Live fill level, weight, battery and priority score for every connected EcoBin smart bin.",
      },
      { property: "og:title", content: "Live Bin Monitoring — EcoBin" },
      {
        property: "og:description",
        content: "Live fill level, weight and priority score for every smart bin.",
      },
    ],
  }),
  component: LiveBinsPage,
});

const FILTERS: (BinStatus | "all")[] = ["all", "critical", "high", "filling", "normal", "offline"];

function LiveBinsPage() {
  return (
    <div className="space-y-4">
      <SectionHeading
        title="Live bin monitoring"
        description="Normalized sensor readings from the Wokwi ESP32 to ThingSpeak pipeline."
      />
      <RequiresChannel>
        <LiveBins />
      </RequiresChannel>
    </div>
  );
}

function LiveBins() {
  const bins = useEco((s) => s.bins);
  const [filter, setFilter] = useState<BinStatus | "all">("all");
  const [q, setQ] = useState("");
  const assign = useAssignDialog();

  const list = bins
    .filter((b) => (filter === "all" ? true : b.status === filter))
    .filter((b) =>
      q ? `${b.id} ${b.name} ${b.ward}`.toLowerCase().includes(q.toLowerCase()) : true,
    )
    .sort((a, b) => b.priorityScore - a.priorityScore);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search bin ID, name or ward"
          className="max-w-64"
          aria-label="Search bins"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{list.length} bins</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((bin) => (
          <motion.article layout key={bin.id} className="eco-panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  to="/admin/bins/$binId"
                  params={{ binId: bin.id }}
                  className="font-display text-base font-bold hover:underline"
                >
                  {bin.id}
                </Link>
                <p className="text-xs text-muted-foreground">{bin.name}</p>
              </div>
              <StatusBadge status={bin.status} />
            </div>

            <div className="mt-3 flex items-end gap-4">
              <div>
                <p className="font-display text-3xl font-bold tabular-nums">{bin.fillLevel}%</p>
                <p className="text-xs text-muted-foreground">Fill level</p>
              </div>
              <div>
                <p className="font-display text-xl font-semibold tabular-nums">{bin.weight} kg</p>
                <p className="text-xs text-muted-foreground">Weight</p>
              </div>
              <div className="ml-auto text-right">
                <p className="font-display text-xl font-semibold tabular-nums">
                  {bin.priorityScore}
                </p>
                <p className="text-xs text-muted-foreground">Priority /100</p>
              </div>
            </div>

            <div className="mt-3">
              <FillBar value={bin.fillLevel} status={bin.status} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Radio className="size-3.5" aria-hidden />
                <span className="text-primary">ThingSpeak</span>
              </div>
              {bin.battery !== undefined && (
                <div className="flex items-center gap-1.5">
                  <BatteryMedium className="size-3.5" aria-hidden />
                  {bin.battery}%
                </div>
              )}
              {bin.locationApproximate && (
                <div className="col-span-2 flex items-center gap-1.5">
                  <MapPinOff className="size-3.5" aria-hidden />
                  Approximate location — set it in Settings
                </div>
              )}
              <div className="col-span-2">Updated {timeAgo(bin.lastUpdated)}</div>
              <div className="col-span-2">{bin.ward}</div>
              <div className="col-span-2">
                Collection:{" "}
                {bin.assignedTruckId ? `assigned to ${bin.assignedTruckId}` : "unassigned"}
              </div>
            </dl>

            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => assign.openFor(bin.id)}>
                Assign truck
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/bins/$binId" params={{ binId: bin.id }}>
                  Details
                </Link>
              </Button>
            </div>
          </motion.article>
        ))}
      </div>

      {!list.length && (
        <EmptyState
          title="No bins match"
          body={
            bins.length
              ? "Adjust the search or status filter to see the bins reporting on this channel."
              : "No bin has reported a usable fill level yet. Check the field map in Settings."
          }
        />
      )}

      <AssignTruckDialog
        binId={assign.binId}
        open={assign.open}
        onOpenChange={assign.onOpenChange}
      />
    </div>
  );
}
