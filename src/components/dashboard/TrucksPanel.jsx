import React from 'react';
import { Truck, MapPin } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { PRIORITY_META, STATUS, STATUS_META } from '../../lib/telemetry';
import { formatDistance, formatDuration } from '../../services/routing';
import { Card, EmptyState, Button, cx } from '../ui/Primitives';

const TRUCK_STATUS = {
  ON_ROUTE: { label: 'On Route', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  IDLE: { label: 'Idle', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  MAINTENANCE: { label: 'Maintenance', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
};

export const TrucksPanel = ({ limit }) => {
  const { trucks, bins, assignments, setPage, fleetRuns, cancelRun } = useEcoBin();

  const runFor = (truckId) => fleetRuns.find((run) => run.truckId === truckId) ?? null;

  const rows = limit ? trucks.slice(0, limit) : trucks;

  // Which bin each truck is currently headed to, from the live assignment map.
  const targetFor = (truckId) => {
    const entry = Object.entries(assignments).find(([, value]) => value.truckId === truckId);
    if (!entry) return null;
    return bins.find((bin) => bin.channelId === entry[0]) ?? null;
  };

  const queue = bins
    .filter((bin) => bin.status === STATUS.FULL || bin.status === STATUS.ASSIGNED)
    .sort((a, b) => (b.fill ?? 0) - (a.fill ?? 0));

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Trucks &amp; Routes</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {trucks.filter((truck) => truck.status === 'ON_ROUTE').length} on route · {queue.length} stop
            {queue.length === 1 ? '' : 's'} queued
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPage('trucks')}
          className="text-[11px] font-bold text-emerald-600 hover:underline dark:text-emerald-400"
        >
          View All
        </button>
      </div>

      {trucks.length === 0 ? (
        <EmptyState
          compact
          icon={Truck}
          title="No trucks in the fleet"
          description="Add your collection vehicles so full bins can be dispatched to a driver."
          action={
            <Button variant="primary" onClick={() => setPage('trucks')}>
              Add a truck
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
          {/* Fleet */}
          <ul className="space-y-2">
            {rows.map((truck) => {
              const target = targetFor(truck.id);
              const run = runFor(truck.id);
              const style = TRUCK_STATUS[truck.status] ?? TRUCK_STATUS.IDLE;
              return (
                <li
                  key={truck.id}
                  className="rounded-xl border border-slate-100 px-3 py-2.5 dark:border-slate-800"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-sm font-extrabold text-slate-900 dark:text-white">
                      {truck.id}
                    </span>
                    <span
                      className={cx(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold',
                        style.className,
                      )}
                    >
                      {style.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Driver: {truck.driver}
                  </p>
                  {run ? (
                    <>
                      <p className="mt-1 truncate text-[11px] text-slate-600 dark:text-slate-300">
                        <MapPin className="mr-1 inline h-3 w-3" />
                        Stop {Math.min(run.stopsDone + 1, run.stops.length)} of {run.stops.length}
                        {run.stopNames[Math.min(run.stopsDone, run.stops.length - 1)]
                          ? ` · ${run.stopNames[Math.min(run.stopsDone, run.stops.length - 1)]}`
                          : ''}
                      </p>
                      {/* Same scale as the lane on the map, so a red bar here
                          and a red route there are the same fact. */}
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <span
                          className="block h-full rounded-full transition-[width] duration-1000 ease-linear"
                          style={{
                            width: `${Math.round(run.progress * 100)}%`,
                            background: PRIORITY_META[run.level].hex,
                          }}
                        />
                      </div>
                      <p className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                        <span className="tabular">
                          <span
                            className="mr-1 font-bold"
                            style={{ color: PRIORITY_META[run.level].hex }}
                          >
                            {PRIORITY_META[run.level].label}
                          </span>
                          {formatDistance(run.distanceM)} · {run.loadKg} kg
                        </span>
                        <span className="tabular">{formatDuration(run.remainingS)} left</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => cancelRun(truck.id)}
                        className="mt-1.5 text-[10px] font-bold text-rose-600 hover:underline dark:text-rose-400"
                      >
                        Call off run
                      </button>
                    </>
                  ) : (
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {target ? (
                        <>
                          <MapPin className="mr-1 inline h-3 w-3" />
                          Heading to {target.id}
                        </>
                      ) : (
                        'No stop assigned'
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Queue */}
          <div className="rounded-xl bg-slate-950 p-3 text-white">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold">Pickup Queue</p>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold">
                {queue.length} stop{queue.length === 1 ? '' : 's'}
              </span>
            </div>
            {queue.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-slate-400">
                Nothing needs collecting right now.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {queue.slice(0, 5).map((bin) => (
                  <li
                    key={bin.channelId}
                    className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: STATUS_META[bin.status].hex }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-bold">{bin.id}</span>
                      <span className="block truncate text-[10px] text-slate-400">
                        {bin.ward || bin.location}
                      </span>
                    </span>
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular"
                      style={{
                        background: `${STATUS_META[bin.status].hex}22`,
                        color: STATUS_META[bin.status].hex,
                      }}
                    >
                      {bin.fill === null ? '—' : `${bin.fill}%`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
