import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { Card, CardHeader, EmptyState } from '../ui/Primitives';

/**
 * Impact figures, every one of them measured from the feed history.
 */
const useImpact = () => {
  const { bins, settings, lastSync } = useEcoBin();

  return useMemo(() => {
    // Anchored to the last poll so the window is stable between renders.
    const anchor = lastSync ? lastSync.getTime() : 0;
    const since = anchor - 7 * 24 * 60 * 60 * 1000;
    const fullThreshold = settings.thresholds.full;

    let responseTotalMs = 0;
    let responseCount = 0;
    let collections = 0;
    let fillAtCollectionTotal = 0;

    bins.forEach((bin) => {
      bin.collections
        .filter((event) => event.at.getTime() >= since)
        .forEach((event) => {
          collections += 1;
          fillAtCollectionTotal += event.from;

          // Walk back to the reading where this bin became full before the pickup.
          let becameFullAt = null;
          for (let i = 1; i < bin.readings.length; i += 1) {
            const reading = bin.readings[i];
            if (reading.at >= event.at) break;
            const before = bin.readings[i - 1].fill;
            if (
              before !== null &&
              reading.fill !== null &&
              before < fullThreshold &&
              reading.fill >= fullThreshold
            ) {
              becameFullAt = reading.at;
            }
          }

          if (becameFullAt) {
            responseTotalMs += event.at - becameFullAt;
            responseCount += 1;
          }
        });
    });

    // Baseline: a fixed daily round empties every bin whether it needs it or not.
    // Only bins that actually reported in this window count — a silent channel is
    // missing data, not a trip we successfully avoided.
    const reporting = bins.filter((bin) =>
      bin.readings.some((reading) => reading.at.getTime() >= since),
    ).length;
    const baselineTrips = reporting * 7;
    const tripsSaved = Math.max(0, baselineTrips - collections);
    const tripsSavedPct = baselineTrips ? Math.round((tripsSaved / baselineTrips) * 100) : null;

    return {
      baselineTrips,
      tripsSaved,
      tripsSavedPct,
      collections,
      responseHours: responseCount ? responseTotalMs / responseCount / 3_600_000 : null,
      // How full bins actually were when emptied: low numbers mean early pickups.
      avgFillAtCollection: collections ? Math.round(fillAtCollectionTotal / collections) : null,
    };
  }, [bins, settings.thresholds.full, lastSync]);
};

const Kpi = ({ label, value, sub }) => (
  <div className="px-4 py-3">
    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 font-heading text-2xl font-extrabold text-slate-900 tabular dark:text-white">
      {value}
    </p>
    <p className="mt-0.5 text-[10px] text-slate-400">{sub}</p>
  </div>
);

const chartTooltip = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.3)',
    fontSize: 12,
    padding: '8px 10px',
    boxShadow: '0 12px 24px -14px rgba(15,23,42,0.5)',
  },
};

export const AnalyticsOverview = () => {
  const { analytics, bins, stats } = useEcoBin();
  const impact = useImpact();

  const hasBins = bins.length > 0;
  const trendMax = Math.max(1, ...analytics.trend.map((point) => point.collected));

  return (
    <Card>
      <CardHeader
        title="Analytics Overview"
        subtitle="Last 7 days, computed from your ThingSpeak history"
        action={
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            This Week
          </span>
        }
      />

      {!hasBins ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics yet"
          description="Connect a channel — trend, distribution and impact figures are all computed from the feed history."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-y border-slate-100 lg:grid-cols-4 lg:divide-y-0 dark:divide-slate-800 dark:border-slate-800">
            <Kpi
              label="Unnecessary Trips Avoided"
              value={impact.tripsSavedPct === null ? '—' : `${impact.tripsSavedPct}%`}
              sub={
                impact.tripsSavedPct === null
                  ? 'No bin reported in the last 7 days'
                  : `${impact.tripsSaved} of ${impact.baselineTrips} baseline trips`
              }
            />
            <Kpi
              label="Avg Response Time"
              value={impact.responseHours === null ? '—' : `${impact.responseHours.toFixed(1)} hrs`}
              sub={impact.responseHours === null ? 'No full-to-collected pairs yet' : 'Full detected to collected'}
            />
            <Kpi
              label="Collections This Week"
              value={impact.collections}
              sub={`${stats.collectedToday} today`}
            />
            <Kpi
              label="Avg Fill at Collection"
              value={impact.avgFillAtCollection === null ? '—' : `${impact.avgFillAtCollection}%`}
              sub={
                impact.avgFillAtCollection === null
                  ? 'No collections in the window'
                  : 'Fill level when bins were emptied'
              }
            />
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-2">
            {/* Distribution */}
            <div className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
              <p className="mb-1 text-xs font-bold text-slate-900 dark:text-white">
                Bin Status Distribution
              </p>
              <div className="flex items-center gap-3">
                <div className="h-[150px] w-[150px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.distribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={42}
                        outerRadius={68}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {analytics.distribution.map((slice) => (
                          <Cell key={slice.status} fill={slice.fill} />
                        ))}
                      </Pie>
                      <Tooltip {...chartTooltip} formatter={(value, name) => [`${value} bins`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <ul className="min-w-0 flex-1 space-y-1.5">
                  {analytics.distribution.map((slice) => (
                    <li key={slice.status} className="flex items-center gap-2 text-[11px]">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: slice.fill }}
                      />
                      <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                        {slice.name}
                      </span>
                      <span className="font-bold text-slate-900 tabular dark:text-white">
                        {slice.value}
                      </span>
                      <span className="w-9 text-right text-slate-400 tabular">{slice.percent}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Trend */}
            <div className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
              <p className="text-xs font-bold text-slate-900 dark:text-white">Collection Trend</p>
              <p className="mb-2 text-[10px] text-slate-400">
                Collections detected per day · {stats.collectedToday} today
              </p>
              <div className="h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.trend} margin={{ top: 6, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      domain={[0, trendMax]}
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      width={34}
                    />
                    <Tooltip {...chartTooltip} formatter={(value) => [`${value} collections`, '']} />
                    <Line
                      type="monotone"
                      dataKey="collected"
                      stroke="#17a34a"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#17a34a', strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
};
