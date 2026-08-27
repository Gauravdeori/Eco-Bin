import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { Activity } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { readingSeries, formatNumber, formatRelative } from '../../lib/telemetry';
import { Card, EmptyState, cx } from '../ui/Primitives';

const FILL_COLOR = '#17a34a';
const WEIGHT_COLOR = '#0ea5e9';

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{point.full}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
        <span className="h-2 w-2 rounded-full" style={{ background: FILL_COLOR }} />
        Fill <span className="tabular">{point.fill === null ? '—' : `${point.fill}%`}</span>
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
        <span className="h-2 w-2 rounded-full" style={{ background: WEIGHT_COLOR }} />
        Weight <span className="tabular">{formatNumber(point.weight, ' kg')}</span>
      </p>
    </div>
  );
};

const Legend = ({ color, label, value }) => (
  <span className="flex items-center gap-1.5">
    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
    <span className="text-[11px] font-bold text-slate-900 tabular dark:text-white">{value}</span>
  </span>
);

/** Fill level and weight for the selected bin, plotted against time. */
export const ReadingsChart = ({ height = 'h-[260px]' }) => {
  const { selectedBin: bin, settings } = useEcoBin();

  const series = useMemo(() => (bin ? readingSeries(bin) : []), [bin]);

  const hasWeight = series.some((point) => point.weight !== null);

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Live Readings</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {bin
                ? `${bin.id} · ${series.length} readings · last ${formatRelative(bin.lastSeen)}`
                : 'No bin selected'}
            </p>
          </div>
        </div>

        {bin && (
          <div className="flex items-center gap-4">
            <Legend
              color={FILL_COLOR}
              label="Fill"
              value={bin.fill === null ? '—' : `${bin.fill}%`}
            />
            <Legend
              color={WEIGHT_COLOR}
              label="Weight"
              value={formatNumber(bin.weight, ' kg')}
            />
          </div>
        )}
      </div>

      <div className={cx('px-2 pb-4', height)}>
        {series.length === 0 ? (
          <EmptyState
            compact
            icon={Activity}
            title={bin ? 'No readings yet' : 'No bin selected'}
            description={
              bin
                ? 'This channel has not published a fill level or weight yet.'
                : 'Connect a ThingSpeak channel to plot its readings over time.'
            }
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 12, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="readingsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={FILL_COLOR} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={FILL_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="rgba(148,163,184,0.2)" vertical={false} />

              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />

              <YAxis
                yAxisId="fill"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                width={46}
                tickFormatter={(value) => `${value}%`}
              />

              {hasWeight && (
                <YAxis
                  yAxisId="weight"
                  orientation="right"
                  domain={[0, 'dataMax + 5']}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(value) => `${Math.round(value)} kg`}
                />
              )}

              <Tooltip content={<ChartTooltip />} />

              {/* The threshold that flips a bin to Full. */}
              <ReferenceLine
                yAxisId="fill"
                y={settings.thresholds.full}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
                label={{
                  value: `Full ${settings.thresholds.full}%`,
                  position: 'insideBottomRight',
                  fill: '#f43f5e',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />

              <Area
                yAxisId="fill"
                type="monotone"
                dataKey="fill"
                stroke={FILL_COLOR}
                strokeWidth={2.5}
                fill="url(#readingsFill)"
                connectNulls
                dot={false}
                activeDot={{ r: 4, fill: FILL_COLOR, strokeWidth: 0 }}
                name="Fill"
              />

              {hasWeight && (
                <Line
                  yAxisId="weight"
                  type="monotone"
                  dataKey="weight"
                  stroke={WEIGHT_COLOR}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  connectNulls
                  dot={false}
                  activeDot={{ r: 4, fill: WEIGHT_COLOR, strokeWidth: 0 }}
                  name="Weight"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
};
