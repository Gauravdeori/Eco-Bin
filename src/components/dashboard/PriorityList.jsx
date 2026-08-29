import React from 'react';
import { ListOrdered, Inbox, Zap } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { PRIORITY_META } from '../../lib/telemetry';
import { Card, CardHeader, EmptyState, cx } from '../ui/Primitives';

/** One "why" chip. The ranking is only useful if the operator can audit it. */
const Reason = ({ children }) => (
  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
    {children}
  </span>
);

const Row = ({ rank, entry, selected, onSelect }) => {
  const { bin, score, level, reasons } = entry;
  const meta = PRIORITY_META[level];

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(bin.channelId)}
        className={cx(
          'flex w-full items-center gap-3 px-5 py-3 text-left transition-colors',
          selected ? 'bg-slate-50 dark:bg-slate-800/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
        )}
      >
        <span className="w-4 shrink-0 text-[11px] font-bold text-slate-400 tabular">{rank}</span>

        {/* Fill reading, tinted by how urgent the bin is overall. */}
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold tabular"
          style={{ background: `${meta.hex}1f`, color: meta.hex }}
        >
          {bin.fill === null ? '—' : `${bin.fill}%`}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
              {bin.id}
            </span>
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white"
              style={{ background: meta.hex }}
            >
              {meta.label}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {reasons.length === 0 ? (
              <Reason>Nothing outstanding</Reason>
            ) : (
              reasons.slice(0, 3).map((reason) => <Reason key={reason}>{reason}</Reason>)
            )}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block font-heading text-base font-extrabold tabular" style={{ color: meta.hex }}>
            {score}
          </span>
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            score
          </span>
        </span>
      </button>
    </li>
  );
};

/**
 * The fleet ordered by how urgently each bin needs a human.
 *
 * Ranking lives in `binPriority`; this only draws it. Every row carries the
 * reasons that produced its score so the order can be argued with rather than
 * taken on faith.
 */
export const PriorityList = ({ limit = 6 }) => {
  const {
    bins,
    settings,
    trucks,
    ranking: ranked,
    selectedChannelId,
    setSelectedChannelId,
    setPage,
  } = useEcoBin();
  const auto = settings.autoDispatch;

  const urgent = ranked.filter((entry) => entry.score >= 45).length;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Priority List"
        subtitle={
          bins.length === 0
            ? 'Ranked by fill, fill rate, reports and silence'
            : `${urgent} of ${bins.length} bin${bins.length === 1 ? '' : 's'} need attention now`
        }
        action={
          auto?.enabled ? (
            <button
              type="button"
              onClick={() => setPage('settings')}
              title={`Trucks are dispatched automatically at priority ${auto.minScore} and above`}
              className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
            >
              <Zap className="h-3 w-3" />
              Auto ≥{auto.minScore}
            </button>
          ) : bins.length > limit ? (
            <button
              type="button"
              onClick={() => setPage('bins')}
              className="text-[11px] font-bold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              View All
            </button>
          ) : null
        }
      />

      {ranked.length === 0 ? (
        <EmptyState
          compact
          icon={Inbox}
          title="No bins to rank"
          description="Connect a ThingSpeak channel and the fleet appears here in priority order."
        />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {ranked.slice(0, limit).map((entry, index) => (
            <Row
              key={entry.bin.channelId}
              rank={index + 1}
              entry={entry}
              selected={entry.bin.channelId === selectedChannelId}
              onSelect={setSelectedChannelId}
            />
          ))}
        </ul>
      )}

      <p className="mt-auto flex items-center gap-1.5 border-t border-slate-100 px-5 py-2.5 text-[10px] text-slate-400 dark:border-slate-800">
        <ListOrdered className="h-3 w-3 shrink-0" />
        {auto?.enabled && trucks.length === 0
          ? 'Auto-dispatch is on but the fleet is empty — add a truck to enable it.'
          : 'Fullest and fastest-filling first; dispatched bins drop down the list.'}
      </p>
    </Card>
  );
};
