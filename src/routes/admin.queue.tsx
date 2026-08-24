import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPin, Route as RouteIcon } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, InfoHint, SectionHeading, StatusBadge } from "@/components/eco/primitives";
import { RequiresChannel } from "@/components/eco/connection-state";
import { AssignTruckDialog, useAssignDialog } from "@/components/eco/assign-truck";
import { useEco } from "@/store/ecobin-store";
import { haversineKm, recommendRoute, timeAgo } from "@/lib/ecobin-logic";
import { DEPOT } from "@/lib/ecobin-config";

export const Route = createFileRoute("/admin/queue")({
  head: () => ({
    meta: [
      { title: "Collection Queue — EcoBin" },
      {
        name: "description",
        content:
          "Bins ranked by EcoBin priority score with truck assignment and a recommended collection route.",
      },
      { property: "og:title", content: "Collection Queue — EcoBin" },
      {
        property: "og:description",
        content: "Priority-ranked collection queue and recommended truck route.",
      },
    ],
  }),
  component: QueuePage,
});

function QueuePage() {
  return (
    <div className="space-y-4">
      <SectionHeading
        title="Collection queue"
        description="Sensor alerts and citizen reports enter the same prioritized operational queue."
      />
      <RequiresChannel>
        <Queue />
      </RequiresChannel>
    </div>
  );
}

function Queue() {
  const bins = useEco((s) => s.bins);
  const trucks = useEco((s) => s.trucks);
  const assign = useAssignDialog();

  const queue = bins
    .filter((b) => b.status === "critical" || b.status === "high" || b.reports > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const truck = trucks.find((t) => t.status === "available") ?? trucks[0];
  const routePlan = truck && queue.length ? recommendRoute(queue.slice(0, 4), truck) : null;

  return (
    <div className="space-y-4">
      {!queue.length && (
        <EmptyState
          title="Queue is clear"
          body="No bins currently exceed the high-priority threshold."
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ol className="space-y-2 lg:col-span-2">
          {queue.map((bin, i) => (
            <motion.li
              layout
              key={bin.id}
              className="eco-panel flex flex-wrap items-center gap-3 p-4"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-muted font-display text-sm font-bold">
                {i + 1}
              </span>
              <div className="min-w-40 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    to="/admin/bins/$binId"
                    params={{ binId: bin.id }}
                    className="font-display text-base font-bold hover:underline"
                  >
                    {bin.id}
                  </Link>
                  <StatusBadge status={bin.status} />
                  {bin.reports > 0 && (
                    <Badge variant="outline">{bin.reports} citizen report(s)</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {bin.ward} · waiting {timeAgo(bin.lastCollected ?? bin.lastUpdated)} · ~
                  {haversineKm(
                    { lat: DEPOT.lat, lng: DEPOT.lng },
                    { lat: bin.latitude, lng: bin.longitude },
                  )}{" "}
                  km from depot
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-bold tabular-nums">{bin.priorityScore}</p>
                <p className="text-xs text-muted-foreground">/100</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold tabular-nums">{bin.fillLevel}%</p>
                <p className="text-xs text-muted-foreground">{bin.weight} kg est.</p>
              </div>
              {bin.assignedTruckId ? (
                <Badge variant="secondary">{bin.assignedTruckId}</Badge>
              ) : (
                <Button size="sm" onClick={() => assign.openFor(bin.id)}>
                  Assign truck
                </Button>
              )}
            </motion.li>
          ))}
        </ol>

        <aside className="eco-panel h-fit p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <RouteIcon className="size-4 text-primary" aria-hidden />
            EcoBin Recommended Route
            <InfoHint>
              Simulated nearest-neighbour sequencing from the truck position. Not based on live
              traffic data.
            </InfoHint>
          </h2>
          {routePlan ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">Truck {routePlan.truckId}</p>
              <ol className="mt-3 space-y-1 text-sm">
                <li className="flex items-center gap-2 font-medium">
                  <MapPin className="size-3.5 text-primary" aria-hidden /> START ·{" "}
                  {routePlan.truckId}
                </li>
                {routePlan.stops.map((s) => (
                  <li key={s.binId} className="flex items-center gap-2 pl-1">
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                    {s.binId} · {s.fillLevel}% · {s.distanceKm} km
                  </li>
                ))}
                <li className="flex items-center gap-2 font-medium">
                  <MapPin className="size-3.5 text-primary" aria-hidden /> DEPOT · {DEPOT.name}
                </li>
              </ol>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Total distance</dt>
                  <dd className="font-semibold">{routePlan.totalDistanceKm} km</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Estimated time</dt>
                  <dd className="font-semibold">{routePlan.estimatedMinutes} min</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Expected weight</dt>
                  <dd className="font-semibold">{routePlan.expectedWeightKg} kg</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Bins handled</dt>
                  <dd className="font-semibold">{routePlan.stops.length}</dd>
                </div>
              </dl>
              <Button
                className="mt-4 w-full"
                onClick={() => routePlan.stops.forEach((s) => assign.openFor(s.binId))}
              >
                Assign route bins
              </Button>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {!trucks.length
                ? "Register a truck in Truck management to generate a route."
                : "No route needed — the queue is clear."}
            </p>
          )}
        </aside>
      </div>

      <AssignTruckDialog
        binId={assign.binId}
        open={assign.open}
        onOpenChange={assign.onOpenChange}
      />
    </div>
  );
}
