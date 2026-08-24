import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, InfoHint, KpiCard, SectionHeading } from "@/components/eco/primitives";
import { RequiresChannel } from "@/components/eco/connection-state";
import { useEco } from "@/store/ecobin-store";
import { fmtTime } from "@/lib/ecobin-logic";
import type { BinReading } from "@/types/ecobin";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Fill Analytics — EcoBin" },
      {
        name: "description",
        content:
          "Fill level and weight trends, per-bin averages, status mix and logged collections from the ThingSpeak feed.",
      },
      { property: "og:title", content: "Fill Analytics — EcoBin" },
      {
        property: "og:description",
        content: "Municipal waste analytics from live sensor readings.",
      },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <SectionHeading
        title="Fill analytics"
        description="Derived from the ThingSpeak entries currently loaded. Widen the window with the history depth setting."
      />
      <RequiresChannel>
        <Analytics />
      </RequiresChannel>
    </div>
  );
}

function Analytics() {
  const bins = useEco((s) => s.bins);
  const readings = useEco((s) => s.readings);
  const collections = useEco((s) => s.collections);
  const classifications = useEco((s) => s.classifications);
  const historyDepth = useEco((s) => s.settings.historyDepth);

  if (!readings.length) {
    return (
      <EmptyState
        title="No readings yet"
        body="Once the channel has entries carrying a fill level, the charts on this page fill in automatically."
      />
    );
  }

  const avgFill = Math.round(readings.reduce((a, r) => a + r.fillLevel, 0) / readings.length);
  const peakFill = Math.max(...readings.map((r) => r.fillLevel));
  const avgWeight =
    Math.round((readings.reduce((a, r) => a + r.weight, 0) / readings.length) * 10) / 10;
  const collectedKg = Math.round(collections.reduce((a, c) => a + c.collectedWeight, 0) * 10) / 10;

  const trend = bucketReadings(readings);

  const perBin = bins.map((b) => {
    const own = readings.filter((r) => r.binId === b.id);
    return {
      bin: b.id,
      avgFill: own.length ? Math.round(own.reduce((a, r) => a + r.fillLevel, 0) / own.length) : 0,
      currentFill: b.fillLevel,
      weight: b.weight,
    };
  });

  const statusMix = (["normal", "filling", "high", "critical", "offline"] as const)
    .map((status) => ({ name: status, value: bins.filter((b) => b.status === status).length }))
    .filter((s) => s.value > 0);

  const statusColors: Record<string, string> = {
    normal: "var(--color-normal)",
    filling: "var(--color-filling)",
    high: "var(--color-high)",
    critical: "var(--color-critical)",
    offline: "var(--color-offline)",
  };

  const categoryCounts = (["plastic", "metal", "food", "plant"] as const)
    .map((cat) => ({
      name: cat[0]!.toUpperCase() + cat.slice(1),
      value: classifications.filter((c) => c.category === cat).length,
    }))
    .filter((c) => c.value > 0);
  const pieColors = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
  ];

  const collectionsByDay = groupCollectionsByDay(collections);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Entries analysed"
          value={readings.length}
          hint={`History depth ${historyDepth}`}
        />
        <KpiCard label="Average fill" value={`${avgFill}%`} accent="filling" />
        <KpiCard label="Peak fill" value={`${peakFill}%`} accent="critical" />
        <KpiCard label="Average weight" value={`${avgWeight} kg`} accent="normal" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Fill level over time (%)">
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis domain={[0, 100]} stroke="var(--color-muted-foreground)" fontSize={12} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="avgFill"
              name="Average fill %"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="maxFill"
              name="Peak fill %"
              stroke="var(--color-critical)"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 3"
            />
            <Legend />
          </LineChart>
        </ChartCard>

        <ChartCard title="Weight measured over time (kg)">
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="avgWeight"
              name="Average weight kg"
              stroke="var(--color-chart-2)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartCard>

        <ChartCard
          title="Average vs current fill by bin (%)"
          hint="Current well above average means the bin is filling faster than usual."
        >
          <BarChart data={perBin}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="bin" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis domain={[0, 100]} stroke="var(--color-muted-foreground)" fontSize={12} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar
              dataKey="avgFill"
              name="Average"
              fill="var(--color-muted-foreground)"
              radius={[6, 6, 0, 0]}
            />
            <Bar
              dataKey="currentFill"
              name="Current"
              fill="var(--color-primary)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ChartCard>

        <ChartCard title="Bins by status">
          <PieChart>
            <Pie
              data={statusMix}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={3}
            >
              {statusMix.map((s) => (
                <Cell key={s.name} fill={statusColors[s.name]} />
              ))}
            </Pie>
            <Legend />
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ChartCard>

        <ChartCard
          title="Collections logged per day"
          hint="Recorded when a worker marks a bin collected — not sensor data."
        >
          {collectionsByDay.length ? (
            <BarChart data={collectionsByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar
                dataKey="count"
                name="Collections"
                fill="var(--color-primary)"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="weight"
                name="kg collected"
                fill="var(--color-chart-3)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          ) : null}
        </ChartCard>

        <ChartCard title="Waste by category (AI classifications)">
          {categoryCounts.length ? (
            <PieChart>
              <Pie
                data={categoryCounts}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
              >
                {categoryCounts.map((_, i) => (
                  <Cell key={i} fill={pieColors[i % pieColors.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          ) : null}
        </ChartCard>
      </div>

      <p className="text-xs text-muted-foreground">
        {collectedKg > 0
          ? `${collectedKg} kg logged across ${collections.length} recorded collections.`
          : "No collections recorded yet — log one from the worker app or a bin detail page."}
      </p>
    </div>
  );
}

/** Collapse the reading history into at most 30 points so the axis stays legible. */
function bucketReadings(readings: BinReading[]) {
  const maxPoints = 30;
  const size = Math.ceil(readings.length / maxPoints);
  const out: { label: string; avgFill: number; maxFill: number; avgWeight: number }[] = [];
  for (let i = 0; i < readings.length; i += size) {
    const bucket = readings.slice(i, i + size);
    const last = bucket[bucket.length - 1]!;
    out.push({
      label: fmtTime(last.timestamp),
      avgFill: Math.round(bucket.reduce((a, r) => a + r.fillLevel, 0) / bucket.length),
      maxFill: Math.max(...bucket.map((r) => r.fillLevel)),
      avgWeight: Math.round((bucket.reduce((a, r) => a + r.weight, 0) / bucket.length) * 10) / 10,
    });
  }
  return out;
}

function groupCollectionsByDay(collections: { timestamp: string; collectedWeight: number }[]) {
  const byDay = new Map<string, { count: number; weight: number }>();
  for (const c of collections) {
    const day = new Date(c.timestamp).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
    const cur = byDay.get(day) ?? { count: 0, weight: 0 };
    byDay.set(day, {
      count: cur.count + 1,
      weight: Math.round((cur.weight + c.collectedWeight) * 10) / 10,
    });
  }
  return [...byDay.entries()].map(([day, v]) => ({ day, ...v })).reverse();
}

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: "0.6rem",
  fontSize: 12,
} as const;

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactElement | null;
}) {
  return (
    <section className="eco-panel p-4">
      <h2 className="mb-2 font-display text-sm font-semibold">
        {title}
        {hint && <InfoHint>{hint}</InfoHint>}
      </h2>
      <div className="h-64">
        {children ? (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Nothing recorded yet.
          </div>
        )}
      </div>
    </section>
  );
}
