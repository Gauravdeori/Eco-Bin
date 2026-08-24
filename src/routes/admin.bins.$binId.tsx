import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, MapPinOff } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, FillBar, StatusBadge } from "@/components/eco/primitives";
import { AssignTruckButton } from "@/components/eco/assign-truck";
import { MapPanel } from "@/components/eco/map-panel";
import { useEco } from "@/store/ecobin-store";
import { fmtDateTime, fmtTime, timeAgo } from "@/lib/ecobin-logic";

export const Route = createFileRoute("/admin/bins/$binId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.binId} — Bin details | EcoBin` },
      {
        name: "description",
        content: `Fill history, weight trend, collection log, citizen reports and AI waste insights for bin ${params.binId}.`,
      },
      { property: "og:title", content: `${params.binId} — EcoBin bin details` },
      { property: "og:description", content: `Operational detail for smart bin ${params.binId}.` },
    ],
  }),
  component: BinDetails,
  notFoundComponent: () => (
    <EmptyState title="Bin not found" body="This bin is not reporting on the connected channel." />
  ),
});

function BinDetails() {
  const { binId } = useParams({ from: "/admin/bins/$binId" });
  const bin = useEco((s) => s.bins.find((b) => b.id === binId));
  const readings = useEco((s) => s.readings.filter((r) => r.binId === binId));
  const collections = useEco((s) => s.collections.filter((c) => c.binId === binId));
  const reports = useEco((s) => s.reports.filter((r) => r.binId === binId));
  const classifications = useEco((s) => s.classifications.filter((c) => c.binId === binId));
  const markCollected = useEco((s) => s.markCollected);
  const unassignBin = useEco((s) => s.unassignBin);

  if (!bin) {
    return (
      <EmptyState
        title="Bin not found"
        body={`No bin with ID ${binId} is reporting on the connected ThingSpeak channel.`}
      />
    );
  }

  // Real entries from the channel, newest last so the chart reads left to right.
  const history = readings.slice(-40).map((r) => ({
    t: fmtTime(r.timestamp),
    fill: r.fillLevel,
    weight: r.weight,
  }));

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="gap-1">
        <Link to="/admin/bins">
          <ArrowLeft className="size-3.5" aria-hidden /> Back to live bins
        </Link>
      </Button>

      <div className="eco-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">{bin.id}</h1>
            <p className="text-sm text-muted-foreground">
              {bin.name} · {bin.ward}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Updated {timeAgo(bin.lastUpdated)} · ThingSpeak entry #{bin.entryId ?? "—"}
            </p>
            {bin.locationApproximate && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPinOff className="size-3.5" aria-hidden />
                Location is approximate —{" "}
                <Link to="/admin/settings" className="underline">
                  set the coordinates
                </Link>
              </p>
            )}
          </div>
          <StatusBadge status={bin.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric value={`${bin.fillLevel}%`} label="Fill level" />
          <Metric value={`${bin.weight} kg`} label="Weight" />
          <Metric
            value={String(bin.priorityScore)}
            label={bin.priorityFromDevice ? "Priority (from device)" : "Priority (calculated)"}
          />
          <Metric
            value={bin.battery !== undefined ? `${bin.battery}%` : "—"}
            label={bin.battery !== undefined ? "Device battery" : "Battery not published"}
          />
        </div>
        <div className="mt-3">
          <FillBar value={bin.fillLevel} status={bin.status} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {bin.assignedTruckId ? (
            <Button variant="secondary" onClick={() => unassignBin(bin.id)}>
              Unassign {bin.assignedTruckId}
            </Button>
          ) : (
            <AssignTruckButton binId={bin.id} />
          )}
          <Button
            onClick={() => {
              markCollected(bin.id);
              toast.success(`${bin.id} collection recorded`);
            }}
          >
            Mark collected
          </Button>
          <Button asChild variant="outline">
            <Link to="/report" search={{ bin: bin.id }}>
              Report issue
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/admin/history">View history</Link>
          </Button>
        </div>
        {bin.assignedTruckId && (
          <p className="mt-3 text-sm">
            Current assignment: <Badge variant="secondary">{bin.assignedTruckId}</Badge>
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="eco-panel p-4">
          <h2 className="font-display text-base font-semibold">
            Fill level history ({history.length} channel{" "}
            {history.length === 1 ? "entry" : "entries"})
          </h2>
          <div className="mt-3 h-56">
            {history.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="t" fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis domain={[0, 100]} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <RTooltip />
                  <Area
                    dataKey="fill"
                    stroke="var(--color-chart-1)"
                    fill="var(--color-chart-1)"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartPlaceholder />
            )}
          </div>
        </section>

        <section className="eco-panel p-4">
          <h2 className="font-display text-base font-semibold">Weight trend (kg)</h2>
          <div className="mt-3 h-56">
            {history.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="t" fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                  <RTooltip />
                  <Bar dataKey="weight" fill="var(--color-chart-2)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartPlaceholder />
            )}
          </div>
        </section>

        <section className="eco-panel overflow-hidden">
          <h2 className="border-b border-border px-4 py-3 font-display text-base font-semibold">
            Location
          </h2>
          <MapPanel bins={[bin]} className="h-64 rounded-none border-0" />
        </section>

        <section className="eco-panel p-4">
          <h2 className="font-display text-base font-semibold">Collection history</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {collections.slice(0, 5).map((c) => (
              <li key={c.id} className="flex justify-between py-2">
                <span>{fmtDateTime(c.timestamp)}</span>
                <span className="text-muted-foreground">
                  {c.collectedWeight} kg · {c.workerName} · {c.truckId}
                </span>
              </li>
            ))}
            {!collections.length && (
              <li className="py-2 text-muted-foreground">No collections recorded yet.</li>
            )}
          </ul>
        </section>

        <section className="eco-panel p-4">
          <h2 className="font-display text-base font-semibold">Citizen reports</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {reports.map((r) => (
              <li key={r.id} className="py-2">
                <p className="font-medium capitalize">
                  {r.id} · {r.type.replace("-", " ")}{" "}
                  <Badge variant="outline" className="ml-1 capitalize">
                    {r.status}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">{r.description}</p>
              </li>
            ))}
            {!reports.length && (
              <li className="py-2 text-muted-foreground">No citizen reports for this bin.</li>
            )}
          </ul>
        </section>

        <section className="eco-panel p-4">
          <h2 className="font-display text-base font-semibold">AI waste classification history</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {classifications.map((c) => (
              <li key={c.id} className="flex justify-between py-2 capitalize">
                <span>{c.category}</span>
                <span className="text-muted-foreground">
                  {c.confidence}% · {c.recyclable ? "recyclable" : "non-recyclable"}
                </span>
              </li>
            ))}
            {!classifications.length && (
              <li className="py-2 text-muted-foreground">
                No classifications yet. Upload an image on the AI Classification page.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ChartPlaceholder() {
  return (
    <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
      Not enough channel entries for this bin yet.
    </div>
  );
}
