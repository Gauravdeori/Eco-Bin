import React, { useMemo } from 'react';
import { CheckCircle2, PackageOpen } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { STATUS, STATUS_META, formatDateTime, formatNumber } from '../../lib/telemetry';
import { CollectionProgress, CollectionActivity } from '../dashboard/CollectionPanels';
import { Card, CardHeader, EmptyState, StatusPill, Button, cx } from '../ui/Primitives';

export const CollectionPage = () => {
  const { bins, assignTruck, clearAssignment, trucks, setSelectedChannelId } = useEcoBin();

  const queue = useMemo(
    () =>
      bins
        .filter((bin) => bin.status === STATUS.FULL || bin.status === STATUS.ASSIGNED)
        .sort((a, b) => (b.fill ?? 0) - (a.fill ?? 0)),
    [bins],
  );

  /** Every collection the sensors detected, newest first. */
  const log = useMemo(
    () =>
      bins
        .flatMap((bin) =>
          bin.collections.map((event) => ({
            key: `${bin.channelId}-${event.at.getTime()}`,
            bin,
            ...event,
          })),
        )
        .sort((a, b) => b.at - a.at)
        .slice(0, 25),
    [bins],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <CollectionProgress />
        <div className="lg:col-span-2">
          <CollectionActivity />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Pickup Queue"
            subtitle={`${queue.length} bin${queue.length === 1 ? '' : 's'} at or above the full threshold`}
          />
          {queue.length === 0 ? (
            <EmptyState
              compact
              icon={CheckCircle2}
              title="Queue is clear"
              description="No connected bin is currently reporting a full load."
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {queue.map((bin) => (
                <li key={bin.channelId} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold text-white tabular"
                    style={{ background: STATUS_META[bin.status].hex }}
                  >
                    {bin.fill ?? '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedChannelId(bin.channelId)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                      {bin.id}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {bin.ward ? `${bin.ward} · ` : ''}
                      {bin.location}
                    </p>
                  </button>
                  {bin.assignment ? (
                    <Button variant="secondary" onClick={() => clearAssignment(bin.channelId)}>
                      {bin.assignment.truckId} · cancel
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      disabled={trucks.length === 0}
                      onClick={() => assignTruck(bin.channelId)}
                    >
                      Assign
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Collection Log"
            subtitle="Detected from sharp drops in reported fill level"
          />
          {log.length === 0 ? (
            <EmptyState
              compact
              icon={PackageOpen}
              title="No collections detected yet"
              description="A collection is recorded when a bin's fill level drops sharply between two readings."
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {log.map((entry) => (
                <li key={entry.key} className="flex items-center gap-3 px-5 py-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                      {entry.bin.id}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {entry.from}% → {entry.to}%
                      {entry.bin.capacityKg
                        ? ` · about ${formatNumber(
                            ((entry.from - entry.to) / 100) * entry.bin.capacityKg,
                            ' kg',
                          )} removed`
                        : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400 tabular">
                    {formatDateTime(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="All Bins" subtitle="Current state of every connected channel" />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {bins.map((bin) => (
            <button
              key={bin.channelId}
              type="button"
              onClick={() => setSelectedChannelId(bin.channelId)}
              className={cx(
                'rounded-xl border border-slate-100 p-3 text-left transition-colors hover:border-slate-300',
                'dark:border-slate-800 dark:hover:border-slate-600',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                  {bin.id}
                </span>
                <StatusPill status={bin.status} />
              </div>
              <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                {bin.location}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${bin.fill ?? 0}%`,
                    background: STATUS_META[bin.status].hex,
                  }}
                />
              </div>
            </button>
          ))}
          {bins.length === 0 && (
            <p className="col-span-full py-6 text-center text-xs text-slate-500">
              No channels connected yet.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};
