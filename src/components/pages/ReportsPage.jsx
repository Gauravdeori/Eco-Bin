import React, { useState } from 'react';
import { ClipboardList, Check } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { formatDateTime } from '../../lib/telemetry';
import { Card, CardHeader, EmptyState, Button, cx } from '../ui/Primitives';

const FILTERS = [
  { id: 'OPEN', label: 'Open' },
  { id: 'RESOLVED', label: 'Resolved' },
  { id: 'ALL', label: 'All' },
];

const STATUS_STYLE = {
  SUBMITTED: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  RESOLVED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
};

export const ReportsPage = () => {
  const { reports, resolveReport, setSelectedChannelId, setPage } = useEcoBin();
  const [filter, setFilter] = useState('OPEN');

  const rows = reports.filter((report) => {
    if (filter === 'ALL') return true;
    if (filter === 'OPEN') return report.status !== 'RESOLVED';
    return report.status === 'RESOLVED';
  });

  const inspect = (report) => {
    setSelectedChannelId(report.channelId);
    setPage('dashboard');
  };

  return (
    <Card>
      <CardHeader
        title="Citizen Reports"
        subtitle="Submitted from the citizen app on this device"
        action={
          <div className="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={cx(
                  'rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors',
                  filter === option.id
                    ? 'bg-brand-500 text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filter === 'RESOLVED' ? 'Nothing resolved yet' : 'No reports yet'}
          description="Reports raised from the citizen app panel appear here, linked to the bin they were filed against."
        />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((report) => (
            <li key={report.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-400">{report.id}</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {report.binId}
                  </span>
                  <span
                    className={cx(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold',
                      STATUS_STYLE[report.status] ?? STATUS_STYLE.SUBMITTED,
                    )}
                  >
                    {report.issueType}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {report.location} · {formatDateTime(report.at)} · {report.reporter}
                </p>
                {report.details && (
                  <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {report.details}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" onClick={() => inspect(report)}>
                  Inspect bin
                </Button>
                {report.status !== 'RESOLVED' && (
                  <Button variant="primary" onClick={() => resolveReport(report.id)}>
                    <Check className="h-3.5 w-3.5" /> Resolve
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
