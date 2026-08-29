import React from 'react';
import { Trash2, AlertTriangle, ShieldAlert, Truck, Scale } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { formatNumber } from '../../lib/telemetry';
import { Card, cx } from '../ui/Primitives';

const Stat = ({ label, value, sub, icon: Icon, tone }) => (
  <Card className="p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={cx('text-xs font-semibold', tone.label)}>{label}</p>
        <p className={cx('mt-2 font-heading text-3xl font-extrabold tabular', tone.value)}>
          {value}
        </p>
        <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>
      </div>
      <span className={cx('rounded-xl p-2.5', tone.iconBg)}>
        <Icon className={cx('h-5 w-5', tone.icon)} />
      </span>
    </div>
  </Card>
);

const TONES = {
  neutral: {
    label: 'text-slate-500 dark:text-slate-400',
    value: 'text-slate-900 dark:text-white',
    iconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  danger: {
    label: 'text-rose-600 dark:text-rose-400',
    value: 'text-rose-600 dark:text-rose-400',
    iconBg: 'bg-rose-50 dark:bg-rose-500/10',
    icon: 'text-rose-600 dark:text-rose-400',
  },
  warning: {
    label: 'text-amber-600 dark:text-amber-400',
    value: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-50 dark:bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    label: 'text-sky-600 dark:text-sky-400',
    value: 'text-sky-600 dark:text-sky-400',
    iconBg: 'bg-sky-50 dark:bg-sky-500/10',
    icon: 'text-sky-600 dark:text-sky-400',
  },
};

export const StatCards = () => {
  const { stats, bins, settings } = useEcoBin();

  const online = bins.filter((bin) => !bin.isOffline).length;

  // What the load reading is measured against: capacity when every weighed bin
  // has one, otherwise just how many bins are on the scale.
  const weightSub = (() => {
    if (stats.totalWeight === null) return 'No device is publishing weight';
    if (stats.totalCapacity)
      return `${Math.min(100, Math.round((stats.totalWeight / stats.totalCapacity) * 100))}% of ${formatNumber(stats.totalCapacity, ' kg')} capacity`;
    return `${stats.weighedBins} of ${stats.totalBins} bin${stats.totalBins === 1 ? '' : 's'} on the scale`;
  })();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <Stat
        label="Total Bins"
        value={stats.totalBins}
        sub={`${online} reporting · ${settings.channels.length} channel${settings.channels.length === 1 ? '' : 's'}`}
        icon={Trash2}
        tone={TONES.neutral}
      />
      <Stat
        label="Live Weight"
        value={formatNumber(stats.totalWeight, ' kg')}
        sub={weightSub}
        icon={Scale}
        tone={TONES.info}
      />
      <Stat
        label="Full Bins"
        value={stats.full}
        sub={`At or above ${settings.thresholds.full}% fill`}
        icon={AlertTriangle}
        tone={TONES.danger}
      />
      <Stat
        label="Bins Needing Attention"
        value={stats.needsAttention}
        sub="Offline, low battery or reported"
        icon={ShieldAlert}
        tone={TONES.warning}
      />
      <Stat
        label="Trucks Active"
        value={stats.trucksActive}
        sub={stats.trucksTotal ? `of ${stats.trucksTotal} in fleet` : 'No trucks added yet'}
        icon={Truck}
        tone={TONES.info}
      />
    </div>
  );
};
