import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Sparkles, Cpu } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { CATEGORY_META, segregationBreakdown, formatRelative } from '../../lib/telemetry';
import { Card, CardHeader, EmptyState, Button, cx } from '../ui/Primitives';

/**
 * Reads the waste-category field, if the device publishes one.
 * There is deliberately no fallback data: with no classifier field mapped, the
 * page says so rather than showing an invented split.
 */
export const SegregationPage = () => {
  const { bins, settings, setPage } = useEcoBin();

  const breakdown = useMemo(() => segregationBreakdown(bins), [bins]);
  const mapped = settings.fieldMap.category > 0;

  const perBin = useMemo(
    () =>
      bins
        .filter((bin) => bin.category !== null)
        .map((bin) => ({
          bin,
          meta:
            CATEGORY_META.find((item) => item.code === Math.round(bin.category)) ?? {
              name: `Category ${bin.category}`,
              hex: '#94a3b8',
            },
        })),
    [bins],
  );

  if (!mapped || breakdown.length === 0) {
    return (
      <Card>
        <CardHeader
          title="AI Segregation"
          subtitle="Waste classification published by your devices"
        />
        <EmptyState
          icon={Sparkles}
          title={mapped ? 'No classified readings yet' : 'No classifier field mapped'}
          description={
            mapped
              ? `Field ${settings.fieldMap.category} is mapped for waste category, but no bin has published a value there yet.`
              : 'Publish a category code on one of your ThingSpeak fields (0 = Dry, 1 = Wet, 2 = Mixed, 3 = Hazardous), then map that field here.'
          }
          action={
            <Button variant="primary" onClick={() => setPage('settings')}>
              Map the category field
            </Button>
          }
        />
        <div className="mx-5 mb-5 rounded-xl bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <p className="mb-1.5 flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
            <Cpu className="h-3.5 w-3.5" /> What the device should send
          </p>
          <p>
            Whatever runs your classification on the ESP32 — a moisture and metal sensor pair, or a
            small on-device model — write the resulting class as a number to a spare ThingSpeak
            field on the same update as the fill reading:
          </p>
          <ul className="mt-2 space-y-0.5">
            {CATEGORY_META.map((item) => (
              <li key={item.code} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: item.hex }} />
                <span className="font-mono">{item.code}</span> — {item.name}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    );
  }

  const total = breakdown.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Waste Mix" subtitle={`${total} classified readings`} />
          <div className="h-[190px] px-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={breakdown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={76}
                  paddingAngle={2}
                  stroke="none"
                >
                  {breakdown.map((slice) => (
                    <Cell key={slice.code} fill={slice.hex} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value} readings`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1.5 px-5 pb-5">
            {breakdown.map((slice) => (
              <li key={slice.code} className="flex items-center gap-2 text-[11px]">
                <span className="h-2 w-2 rounded-full" style={{ background: slice.hex }} />
                <span className="flex-1 truncate text-slate-600 dark:text-slate-300">
                  {slice.name}
                </span>
                <span className="font-bold text-slate-900 tabular dark:text-white">
                  {slice.percent}%
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Latest Classification per Bin"
            subtitle={`Field ${settings.fieldMap.category} on each channel`}
          />
          {perBin.length === 0 ? (
            <EmptyState compact title="No bin has published a category in its latest reading" />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {perBin.map(({ bin, meta }) => (
                <li key={bin.channelId} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ background: meta.hex }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                      {bin.id}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {bin.location}
                    </p>
                  </div>
                  <span
                    className={cx('rounded-full px-2.5 py-1 text-[10px] font-bold text-white')}
                    style={{ background: meta.hex }}
                  >
                    {meta.name}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11px] text-slate-400">
                    {formatRelative(bin.lastSeen)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};
