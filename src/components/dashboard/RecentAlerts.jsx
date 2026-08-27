import React from 'react';
import {
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  MessageSquareWarning,
  BatteryLow,
  Truck,
  WifiOff,
  BellOff,
} from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { formatRelative } from '../../lib/telemetry';
import { Card, EmptyState, cx } from '../ui/Primitives';

export const ALERT_STYLES = {
  FULL: { icon: AlertTriangle, tone: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10' },
  FILLING: { icon: TrendingUp, tone: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  COLLECTED: { icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  REPORT: { icon: MessageSquareWarning, tone: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10' },
  BATTERY: { icon: BatteryLow, tone: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10' },
  DISPATCH: { icon: Truck, tone: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10' },
  OFFLINE: { icon: WifiOff, tone: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800' },
};

export const AlertRow = ({ alert, onSelect }) => {
  const style = ALERT_STYLES[alert.kind] ?? ALERT_STYLES.OFFLINE;
  const Icon = style.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(alert)}
      className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
    >
      <span className={cx('mt-0.5 shrink-0 rounded-lg p-1.5', style.bg)}>
        <Icon className={cx('h-3.5 w-3.5', style.tone)} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate text-xs font-bold', style.tone)}>{alert.title}</span>
        <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
          {alert.detail}
        </span>
      </span>
      <span className="shrink-0 pt-0.5 text-[10px] text-slate-400 tabular">
        {formatRelative(alert.at)}
      </span>
    </button>
  );
};

export const RecentAlerts = ({ limit = 5 }) => {
  const { alerts, setPage, setSelectedChannelId } = useEcoBin();

  const open = (alert) => {
    if (!alert.channelId) return;
    setSelectedChannelId(alert.channelId);
    setPage('dashboard');
  };

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent Alerts</h2>
        <button
          type="button"
          onClick={() => setPage('alerts')}
          className="text-[11px] font-bold text-emerald-600 hover:underline dark:text-emerald-400"
        >
          View All
        </button>
      </div>

      <div className="px-3 pb-3">
        {alerts.length === 0 ? (
          <EmptyState
            compact
            icon={BellOff}
            title="No alerts yet"
            description="Threshold crossings, collections and battery warnings show up here as your bins report."
          />
        ) : (
          <div className="space-y-0.5">
            {alerts.slice(0, limit).map((alert) => (
              <AlertRow key={alert.id} alert={alert} onSelect={open} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};
