import React, { useMemo } from 'react';
import { ArrowRight, Activity } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { STATUS, formatTime } from '../../lib/telemetry';
import { Card, EmptyState, RadialGauge, cx } from '../ui/Primitives';

/** Donut showing how much of today's workload is already cleared. */
export const CollectionProgress = () => {
  const { stats, setPage } = useEcoBin();
  const done = stats.collectedToday;
  const total = done + stats.pending;

  return (
    <Card className="flex flex-col">
      <div className="px-5 pt-4 pb-1">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Collection Progress</h2>
      </div>

      <div className="flex items-center gap-4 px-5 py-3">
        <RadialGauge
          value={stats.completion}
          size={104}
          stroke={11}
          color="#17a34a"
          track="rgba(148,163,184,0.2)"
        >
          <span className="font-heading text-xl font-extrabold text-slate-900 tabular dark:text-white">
            {total === 0 ? '—' : `${stats.completion}%`}
          </span>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Today</span>
        </RadialGauge>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Bins Collected</p>
            <p className="font-heading text-lg font-extrabold text-slate-900 tabular dark:text-white">
              {done}
              <span className="text-sm font-bold text-slate-400"> / {total}</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Pending</p>
            <p className="font-heading text-lg font-extrabold text-slate-900 tabular dark:text-white">
              {stats.pending}
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setPage('collection')}
        className="flex items-center gap-1.5 border-t border-slate-100 px-5 py-3 text-[11px] font-bold text-emerald-600 hover:underline dark:border-slate-800 dark:text-emerald-400"
      >
        View Collection Schedule <ArrowRight className="h-3 w-3" />
      </button>
    </Card>
  );
};

/**
 * The day's pipeline for one bin, built from real timestamps:
 * detection → alert → dispatch → collection.
 */
export const CollectionActivity = () => {
  const { selectedBin: bin, alerts } = useEcoBin();

  const steps = useMemo(() => {
    if (!bin) return [];

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // When the bin first crossed the full threshold today.
    let detectedAt = null;
    for (let i = 1; i < bin.readings.length; i += 1) {
      const before = bin.readings[i - 1].fill;
      const now = bin.readings[i].fill;
      if (before !== null && now !== null && before < 80 && now >= 80 && bin.readings[i].at >= startOfDay) {
        detectedAt = bin.readings[i].at;
        break;
      }
    }

    const alertAt =
      alerts.find((alert) => alert.channelId === bin.channelId && alert.kind === 'FULL')?.at ?? null;
    const assignedAt = bin.assignment ? new Date(bin.assignment.at) : null;
    const collectedAt =
      bin.collections.filter((event) => event.at >= startOfDay).at(-1)?.at ?? null;

    return [
      { label: 'Detected', at: detectedAt, tone: 'bg-rose-500' },
      { label: 'Alert Sent', at: alertAt, tone: 'bg-amber-500' },
      { label: 'Truck Assigned', at: assignedAt, tone: 'bg-sky-500' },
      { label: 'In Route', at: assignedAt, tone: 'bg-violet-500' },
      { label: 'Collected', at: collectedAt, tone: 'bg-emerald-500' },
    ];
  }, [bin, alerts]);

  const reached = steps.filter((step) => step.at).length;

  return (
    <Card>
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          Collection Activity (Today)
        </h2>
        {bin && (
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {bin.id}
          </span>
        )}
      </div>

      {!bin ? (
        <EmptyState
          compact
          icon={Activity}
          title="Nothing to track yet"
          description="Once a bin reports, its detection-to-collection timeline appears here."
        />
      ) : (
        <div className="px-5 pb-5 pt-4">
          <div className="relative flex items-start justify-between">
            {/* Track */}
            <div className="absolute left-[6%] right-[6%] top-[18px] h-[3px] rounded-full bg-slate-200 dark:bg-slate-800" />
            <div
              className="absolute left-[6%] top-[18px] h-[3px] rounded-full bg-emerald-500 transition-[width] duration-500"
              style={{
                width: reached > 1 ? `${((reached - 1) / (steps.length - 1)) * 88}%` : '0%',
              }}
            />

            {steps.map((step) => (
              <div key={step.label} className="relative z-10 flex flex-1 flex-col items-center gap-1.5">
                <span
                  className={cx(
                    'flex h-9 w-9 items-center justify-center rounded-full border-4 border-white transition-colors dark:border-slate-900',
                    step.at ? step.tone : 'bg-slate-300 dark:bg-slate-700',
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-white/90" />
                </span>
                <span
                  className={cx(
                    'text-center text-[10px] font-bold',
                    step.at ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400',
                  )}
                >
                  {step.label}
                </span>
                <span className="text-[10px] text-slate-400 tabular">
                  {step.at ? formatTime(step.at) : '—'}
                </span>
              </div>
            ))}
          </div>

          {reached === 0 && (
            <p className="mt-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
              {bin.status === STATUS.NORMAL
                ? `${bin.id} has not crossed the full threshold today.`
                : 'Waiting on the next reading from this bin.'}
            </p>
          )}
        </div>
      )}
    </Card>
  );
};
