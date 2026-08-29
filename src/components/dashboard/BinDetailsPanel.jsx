import React from 'react';
import {
  Trash2,
  BatteryMedium,
  Signal,
  SignalLow,
  Cpu,
  Thermometer,
  Droplets,
  Wrench,
  Radio,
} from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import {
  STATUS,
  STATUS_META,
  formatNumber,
  formatRelative,
  formatStamp,
} from '../../lib/telemetry';
import { Card, EmptyState, RadialGauge, Meter, cx, Button } from '../ui/Primitives';

const Spec = ({ label, value, icon: Icon, tone = 'text-white' }) => (
  <div className="min-w-0 px-3 py-2.5">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <p className={cx('mt-1 flex items-center gap-1.5 truncate text-xs font-bold tabular', tone)}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />}
      {value}
    </p>
  </div>
);

/** The last few things this bin actually reported, newest first. */
const buildHistory = (bin) => {
  const events = [];

  bin.collections.slice(-3).forEach((event) => {
    events.push({ at: event.at, label: `Collected — fill dropped to ${event.to}%`, tone: 'bg-emerald-500' });
  });

  // The reading where the bin last crossed into "full".
  for (let i = 1; i < bin.readings.length; i += 1) {
    const before = bin.readings[i - 1].fill;
    const now = bin.readings[i].fill;
    if (before !== null && now !== null && before < 80 && now >= 80) {
      events.push({ at: bin.readings[i].at, label: 'Bin full detected', tone: 'bg-rose-500' });
    }
  }

  if (bin.assignment) {
    events.push({
      at: new Date(bin.assignment.at),
      label: `Truck assigned (${bin.assignment.truckId})`,
      tone: 'bg-sky-500',
    });
  }

  if (bin.openReport) {
    events.push({
      at: new Date(bin.openReport.at),
      label: `Citizen report — ${bin.openReport.issueType}`,
      tone: 'bg-violet-500',
    });
  }

  if (bin.lastSeen) {
    events.push({ at: bin.lastSeen, label: 'Latest telemetry received', tone: 'bg-slate-500' });
  }

  return events.sort((a, b) => b.at - a.at).slice(0, 5);
};

export const BinDetailsPanel = () => {
  const { selectedBin: bin, assignTruck, clearAssignment, toggleMaintenance, trucks, setPage } =
    useEcoBin();

  if (!bin) {
    return (
      <Card className="flex min-h-[420px] items-center justify-center">
        <EmptyState
          icon={Radio}
          title="No bin selected"
          description="Connect a ThingSpeak channel and pick a bin on the map to see its live telemetry."
          action={
            <Button variant="primary" onClick={() => setPage('settings')}>
              Connect a channel
            </Button>
          }
        />
      </Card>
    );
  }

  const meta = STATUS_META[bin.status];
  const history = buildHistory(bin);
  const capacityPct =
    bin.capacityKg && bin.weight !== null
      ? Math.min(100, Math.round((bin.weight / bin.capacityKg) * 100))
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-slate-950 p-4 text-white shadow-[0_20px_50px_-30px_rgba(2,6,23,0.9)] dark:bg-slate-950/90 dark:ring-1 dark:ring-slate-800">
      {/* Identity */}
      <div className="flex items-start gap-3 rounded-xl bg-white/5 p-3.5">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${meta.hex}22`, color: meta.hex }}
        >
          <Trash2 className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-heading text-xl font-extrabold">{bin.id}</h2>
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-white"
              style={{ background: meta.hex }}
            >
              {meta.label}
            </span>
          </div>
          <p className="truncate text-xs text-slate-300">
            {bin.ward ? `${bin.ward} · ` : ''}
            {bin.location}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
            Last updated {formatRelative(bin.lastSeen)}
            <span
              className={cx(
                'ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                bin.isOffline ? 'bg-slate-700 text-slate-300' : 'bg-emerald-500/15 text-emerald-300',
              )}
            >
              <span
                className={cx(
                  'h-1.5 w-1.5 rounded-full',
                  bin.isOffline ? 'bg-slate-400' : 'bg-emerald-400',
                )}
              />
              {bin.isOffline ? 'Stale' : 'Live'}
            </span>
          </p>
        </div>
      </div>

      {/* Fill + weight */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center justify-center rounded-xl bg-white/5 p-3">
          <p className="mb-1 text-[11px] font-semibold text-slate-300">Fill Level</p>
          <RadialGauge value={bin.fill} size={116} stroke={11} color={meta.hex}>
            <span className="font-heading text-2xl font-extrabold tabular">
              {bin.fill === null ? '—' : `${bin.fill}%`}
            </span>
            <span className="text-[10px] font-bold uppercase" style={{ color: meta.hex }}>
              {meta.label}
            </span>
          </RadialGauge>
        </div>

        <div className="flex flex-col justify-center rounded-xl bg-white/5 p-4">
          <p className="text-[11px] font-semibold text-slate-300">Weight</p>
          <p className="mt-1 font-heading text-3xl font-extrabold tabular">
            {formatNumber(bin.weight, ' kg')}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {bin.capacityKg ? `Capacity: ${bin.capacityKg} kg` : 'Capacity not set'}
          </p>
          {capacityPct !== null && (
            <Meter value={capacityPct} color="bg-emerald-500" className="mt-2.5 bg-white/10" />
          )}
        </div>
      </div>

      {/* Specs */}
      <div className="grid grid-cols-2 divide-x divide-white/10 rounded-xl bg-white/5 sm:grid-cols-4">
        <Spec label="Status" value={meta.label} tone="text-white" />
        <Spec
          label="Battery"
          value={bin.battery === null ? '—' : `${bin.battery}%`}
          icon={BatteryMedium}
          tone={
            bin.battery !== null && bin.battery < 20 ? 'text-rose-400' : 'text-white'
          }
        />
        <Spec
          label="Link"
          value={bin.isOffline ? 'Stale' : 'Strong'}
          icon={bin.isOffline ? SignalLow : Signal}
          tone={bin.isOffline ? 'text-amber-400' : 'text-emerald-400'}
        />
        <Spec
          label={bin.temperature !== null ? 'Temp' : 'Channel'}
          value={
            bin.temperature !== null ? `${formatNumber(bin.temperature, '°C')}` : `#${bin.channelId}`
          }
          icon={bin.temperature !== null ? Thermometer : Cpu}
          tone="text-white"
        />
      </div>

      {bin.humidity !== null && (
        <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300">
          <Droplets className="h-3.5 w-3.5 text-sky-400" />
          Humidity <span className="font-bold text-white tabular">{formatNumber(bin.humidity, '%')}</span>
        </div>
      )}

      {/* History */}
      <div className="rounded-xl bg-white/5 p-3.5">
        <p className="mb-2.5 text-xs font-bold text-white">History</p>
        {history.length === 0 ? (
          <p className="py-2 text-[11px] text-slate-400">
            No events yet — history builds up as the device keeps publishing.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {history.map((event, index) => (
              <li key={`${event.label}-${index}`} className="flex items-start gap-2.5">
                <span className="w-20 shrink-0 pt-0.5 text-[10px] text-slate-400 tabular">
                  {formatStamp(event.at)}
                </span>
                <span className="relative flex flex-col items-center pt-1">
                  <span className={cx('h-2 w-2 rounded-full', event.tone)} />
                  {index < history.length - 1 && <span className="mt-0.5 h-5 w-px bg-white/15" />}
                </span>
                <span className="flex-1 text-[11px] text-slate-200">{event.label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {bin.assignment ? (
          <button
            type="button"
            onClick={() => clearAssignment(bin.channelId)}
            className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/15"
          >
            Cancel {bin.assignment.truckId}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => assignTruck(bin.channelId)}
            disabled={trucks.length === 0}
            title={trucks.length === 0 ? 'Add a truck on the Trucks page first' : undefined}
            className="flex-1 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {trucks.length === 0 ? 'Add a truck to dispatch' : 'Dispatch a Truck'}
          </button>
        )}
        <button
          type="button"
          onClick={() => toggleMaintenance(bin.channelId)}
          aria-label="Toggle maintenance flag"
          className={cx(
            'rounded-xl px-3.5 py-3 transition-colors',
            bin.status === STATUS.MAINTENANCE
              ? 'bg-amber-500 text-amber-950'
              : 'bg-white/10 text-white hover:bg-white/15',
          )}
        >
          <Wrench className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
