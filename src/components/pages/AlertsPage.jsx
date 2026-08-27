import React, { useState } from 'react';
import { BellOff, Trash2 } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { AlertRow } from '../dashboard/RecentAlerts';
import { Card, CardHeader, EmptyState, Button, cx } from '../ui/Primitives';

const KIND_LABELS = {
  FULL: 'Full',
  FILLING: 'Filling',
  COLLECTED: 'Collected',
  REPORT: 'Reports',
  BATTERY: 'Battery',
  DISPATCH: 'Dispatch',
  OFFLINE: 'Offline',
};

export const AlertsPage = () => {
  const { alerts, clearAlerts, setSelectedChannelId, setPage } = useEcoBin();
  const [kind, setKind] = useState('ALL');

  const kinds = [...new Set(alerts.map((alert) => alert.kind))];
  const rows = kind === 'ALL' ? alerts : alerts.filter((alert) => alert.kind === kind);

  const open = (alert) => {
    if (!alert.channelId) return;
    setSelectedChannelId(alert.channelId);
    setPage('dashboard');
  };

  return (
    <Card>
      <CardHeader
        title="Alert Log"
        subtitle={`${alerts.length} event${alerts.length === 1 ? '' : 's'} raised from live telemetry`}
        action={
          alerts.length > 0 && (
            <Button variant="danger" onClick={clearAlerts}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          )
        }
      />

      {alerts.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="No alerts yet"
          description="EcoBin raises an alert when a bin crosses a threshold, gets collected, goes quiet, or runs low on battery."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 px-5 pb-3">
            {['ALL', ...kinds].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={cx(
                  'rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors',
                  kind === option
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                {option === 'ALL' ? 'All' : KIND_LABELS[option] ?? option}
              </button>
            ))}
          </div>

          <div className="space-y-0.5 px-3 pb-4">
            {rows.map((alert) => (
              <AlertRow key={alert.id} alert={alert} onSelect={open} />
            ))}
            {rows.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-500">
                Nothing of that kind yet.
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
};
