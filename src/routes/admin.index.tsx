import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Gauge,
  MessageSquareWarning,
  Trash2,
  TrendingUp,
  Truck as TruckIcon,
} from "lucide-react";
import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  KpiCard,
  SectionHeading,
  StatusBadge,
  FillBar,
  InfoHint,
  EmptyState,
} from "@/components/eco/primitives";
import { DataSourceIndicator } from "@/components/eco/admin-chrome";
import { PipelineStrip, RequiresChannel } from "@/components/eco/connection-state";
import { AssignTruckDialog, useAssignDialog } from "@/components/eco/assign-truck";
import { MapPanel } from "@/components/eco/map-panel";
import { useEco } from "@/store/ecobin-store";
import { fmtTime, timeAgo } from "@/lib/ecobin-logic";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Overview — EcoBin Command Center" },
      {
        name: "description",
        content:
          "Live bin map, fill analytics, alerts, truck assignment and priority bins from the ThingSpeak channel.",
      },
      { property: "og:title", content: "EcoBin Overview" },
      { property: "og:description", content: "Live municipal waste KPIs and critical bin alerts." },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  return (
    <div className="space-y-5">
      <SectionHeading
        title="Operations overview"
        description="Every figure on this page comes from the connected ThingSpeak channel."
        action={<DataSourceIndicator />}
      />
      <PipelineStrip />
      <RequiresChannel>
        <Overview />
      </RequiresChannel>
    </div>
  );
}

function Overview() {
  const bins = useEco((s) => s.bins);
  const readings = useEco((s) => s.readings);
  const trucks = useEco((s) => s.trucks);
  const reports = useEco((s) => s.reports);
  const collections = useEco((s) => s.collections);
  const notifications = useEco((s) => s.notifications);
  const live = useEco((s) => s.connection.live);
  const assign = useAssignDialog();

  const count = (s: string) => bins.filter((b) => b.status === s).length;
  const today = collections.filter(
    (c) => new Date(c.timestamp).toDateString() === new Date().toDateString(),
  ).length;
  const pendingReports = reports.filter(
    (r) => r.status === "received" || r.status === "verified" || r.status === "queued",
  ).length;
  const activeTrucks = trucks.filter((t) => t.status !== "offline").length;

  // Priority bins — the ranked list the dispatcher works down.
  const priority = [...bins]
    .filter((b) => b.status !== "offline")
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 6);

  // Fill analytics — the network average across the entries actually read.
  const trend = buildFillTrend(readings);

  const alerts = notifications.slice(0, 5);

  if (!bins.length) {
    return (
      <EmptyState
        title="No bins yet"
        body={
          live
            ? "The channel is reachable but no entry carried a usable fill level. Check the field map in Settings, or start the device."
            : "Waiting for the first successful read from ThingSpeak."
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Total bins"
          value={bins.length}
          icon={<Trash2 className="size-4" />}
          hint="Distinct bin IDs on the channel"
        />
        <KpiCard
          label="Normal"
          value={count("normal")}
          accent="normal"
          icon={<CheckCircle2 className="size-4" />}
        />
        <KpiCard
          label="Filling"
          value={count("filling")}
          accent="filling"
          icon={<Gauge className="size-4" />}
        />
        <KpiCard
          label="High priority"
          value={count("high")}
          accent="high"
          icon={<TrendingUp className="size-4" />}
        />
        <KpiCard
          label="Critical"
          value={count("critical")}
          accent="critical"
          icon={<AlertTriangle className="size-4" />}
        />
        <KpiCard
          label="Active trucks"
          value={activeTrucks}
          icon={<TruckIcon className="size-4" />}
          {...(trucks.length ? {} : { hint: "Add trucks in Truck management" })}
        />
        <KpiCard
          label="Open reports"
          value={pendingReports}
          accent="high"
          icon={<MessageSquareWarning className="size-4" />}
        />
        <KpiCard
          label="Collections today"
          value={today}
          accent="normal"
          icon={<CheckCircle2 className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Priority bins + truck assignment */}
        <section className="eco-panel lg:col-span-3">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              Priority bins
              <InfoHint>
                Ranked by priority. EcoBin uses the device value from field5 when the sketch
                publishes one, and otherwise scores fill level, weight, citizen reports and waiting
                time.
              </InfoHint>
            </h2>
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link to="/admin/queue">
                Full queue <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          </header>
          <ul className="divide-y divide-border">
            {priority.map((bin) => (
              <motion.li
                key={bin.id}
                layout
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-32 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to="/admin/bins/$binId"
                      params={{ binId: bin.id }}
                      className="font-display text-sm font-bold hover:underline"
                    >
                      {bin.id}
                    </Link>
                    <StatusBadge status={bin.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {bin.ward} · updated {timeAgo(bin.lastUpdated)}
                  </p>
                  <div className="mt-2 max-w-64">
                    <FillBar value={bin.fillLevel} status={bin.status} />
                  </div>
                </div>
                <div className="text-right text-xs">
                  <p className="font-display text-lg font-bold tabular-nums">{bin.priorityScore}</p>
                  <p className="text-muted-foreground">priority</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold tabular-nums">{bin.fillLevel}%</p>
                  <p className="text-muted-foreground">{bin.weight} kg</p>
                </div>
                {bin.assignedTruckId ? (
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                    {bin.assignedTruckId}
                  </span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => assign.openFor(bin.id)}>
                    Assign truck
                  </Button>
                )}
              </motion.li>
            ))}
            {!priority.length && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Every reporting bin is offline right now.
              </li>
            )}
          </ul>
        </section>

        {/* Live bin map */}
        <section className="eco-panel flex flex-col overflow-hidden lg:col-span-2">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-display text-base font-semibold">Live bin map</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/map">Expand</Link>
            </Button>
          </header>
          <MapPanel
            bins={bins}
            trucks={trucks}
            className="min-h-96 flex-1 rounded-none border-0"
            onAssign={assign.openFor}
          />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Fill analytics */}
        <section className="eco-panel p-4 lg:col-span-3">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            Fill analytics
            <InfoHint>
              Average fill level across every ThingSpeak entry currently loaded. Increase the
              history depth in Settings to widen the window.
            </InfoHint>
          </h2>
          {trend.length > 1 ? (
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis domain={[0, 100]} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <RTooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="avgFill"
                    name="Average fill %"
                    stroke="var(--color-chart-1)"
                    fill="var(--color-chart-1)"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Two or more channel entries are needed before a trend can be drawn.
            </p>
          )}
          <Button asChild variant="ghost" size="sm" className="mt-2 gap-1">
            <Link to="/admin/analytics">
              Full analytics <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        </section>

        {/* Alerts */}
        <section className="eco-panel p-4 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <BellRing className="size-4 text-primary" aria-hidden />
            Alerts
          </h2>
          {alerts.length ? (
            <ul className="mt-3 space-y-2.5">
              {alerts.map((n) => (
                <li key={n.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No alerts yet. EcoBin raises one when a bin crosses the critical threshold, stops
              reporting, or receives a citizen report.
            </p>
          )}
        </section>
      </div>

      <AssignTruckDialog
        binId={assign.binId}
        open={assign.open}
        onOpenChange={assign.onOpenChange}
      />
    </div>
  );
}

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: "0.6rem",
  fontSize: 12,
} as const;

/**
 * Average fill level per channel entry, bucketed so a long history stays
 * readable. Uses only entries that were actually read from ThingSpeak.
 */
function buildFillTrend(readings: { timestamp: string; fillLevel: number }[]) {
  if (!readings.length) return [];
  const maxPoints = 24;
  const size = Math.ceil(readings.length / maxPoints);
  const points: { label: string; avgFill: number }[] = [];
  for (let i = 0; i < readings.length; i += size) {
    const bucket = readings.slice(i, i + size);
    const last = bucket[bucket.length - 1]!;
    points.push({
      label: fmtTime(last.timestamp),
      avgFill: Math.round(bucket.reduce((a, r) => a + r.fillLevel, 0) / bucket.length),
    });
  }
  return points;
}
