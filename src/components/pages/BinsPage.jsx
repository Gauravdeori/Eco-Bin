import React, { useMemo, useState } from 'react';
import { Search, Trash2, ArrowUpDown } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { ReadingsChart } from '../dashboard/ReadingsChart';
import { STATUS_META, formatNumber, formatRelative } from '../../lib/telemetry';
import { Card, EmptyState, StatusPill, Button, inputClass, cx } from '../ui/Primitives';

const SORTS = {
  fill: { label: 'Fill level', compare: (a, b) => (b.fill ?? -1) - (a.fill ?? -1) },
  recent: { label: 'Last seen', compare: (a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0) },
  name: { label: 'Name', compare: (a, b) => a.id.localeCompare(b.id) },
};

export const BinsPage = () => {
  const { bins, selectedBin, setSelectedChannelId, setPage } = useEcoBin();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('fill');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return bins
      .filter(
        (bin) =>
          !needle ||
          bin.id.toLowerCase().includes(needle) ||
          bin.location.toLowerCase().includes(needle) ||
          bin.ward.toLowerCase().includes(needle) ||
          bin.channelId.includes(needle),
      )
      .sort(SORTS[sort].compare);
  }, [bins, query, sort]);

  if (bins.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Trash2}
          title="No bins connected"
          description="Every bin on this page is one ThingSpeak channel. Add your channel IDs in Settings to start receiving telemetry."
          action={
            <Button variant="primary" onClick={() => setPage('settings')}>
              Open settings
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by bin, ward, location or channel id"
              className={cx(inputClass, 'pl-9')}
            />
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-slate-400" />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label="Sort bins"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {Object.entries(SORTS).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-y border-slate-100 text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-5 py-2.5 font-bold">Bin</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 font-bold">Fill</th>
                <th className="px-3 py-2.5 font-bold">Weight</th>
                <th className="px-3 py-2.5 font-bold">Battery</th>
                <th className="px-3 py-2.5 font-bold">Last seen</th>
                <th className="px-5 py-2.5 font-bold">Channel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((bin) => {
                const meta = STATUS_META[bin.status];
                const active = selectedBin?.channelId === bin.channelId;
                return (
                  <tr
                    key={bin.channelId}
                    onClick={() => setSelectedChannelId(bin.channelId)}
                    className={cx(
                      'cursor-pointer text-xs transition-colors',
                      active
                        ? 'bg-emerald-50/70 dark:bg-emerald-500/5'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    )}
                  >
                    <td className="px-5 py-3">
                      <p className="font-bold text-slate-900 dark:text-white">{bin.id}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {bin.ward ? `${bin.ward} · ` : ''}
                        {bin.location}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={bin.status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-9 font-bold tabular text-slate-900 dark:text-white">
                          {bin.fill === null ? '—' : `${bin.fill}%`}
                        </span>
                        <span className="h-2 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <span
                            className="block h-full rounded-full transition-[width] duration-500"
                            style={{ width: `${bin.fill ?? 0}%`, background: meta.hex }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular text-slate-700 dark:text-slate-300">
                      {formatNumber(bin.weight, ' kg')}
                    </td>
                    <td
                      className={cx(
                        'px-3 py-3 tabular',
                        bin.battery !== null && bin.battery < 20
                          ? 'font-bold text-rose-600 dark:text-rose-400'
                          : 'text-slate-700 dark:text-slate-300',
                      )}
                    >
                      {bin.battery === null ? '—' : `${bin.battery}%`}
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                      {formatRelative(bin.lastSeen)}
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-400">
                      #{bin.channelId}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <EmptyState compact icon={Search} title="No bins match that search" />
        )}
      </Card>

      <ReadingsChart height="h-[280px]" />
    </div>
  );
};
