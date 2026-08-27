import React, { useState } from 'react';
import {
  ChevronLeft,
  CheckCircle2,
  Home,
  MapPin,
  FileText,
  User,
  Trash2,
  AlertTriangle,
  Wrench,
  MessageSquare,
} from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { STATUS_META, formatRelative } from '../../lib/telemetry';
import { cx } from '../ui/Primitives';

const ISSUE_TYPES = [
  { id: 'Overflowing', label: 'Report Overflow', icon: AlertTriangle, tone: 'bg-brand-500 text-white' },
  { id: 'Damaged Bin', label: 'Report Damaged Bin', icon: Wrench, tone: 'bg-amber-500 text-white' },
  { id: 'Other', label: 'Other Complaint', icon: MessageSquare, tone: 'bg-white text-slate-700 border border-slate-200' },
];

const PhoneFrame = ({ children }) => (
  <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[28px] border-[6px] border-slate-900 bg-white shadow-2xl">
    <div className="flex h-[520px] flex-col">{children}</div>
  </div>
);

const TabBar = ({ tab, setTab }) => (
  <nav className="flex items-center justify-around border-t border-slate-100 bg-white px-2 py-2">
    {[
      { id: 'home', label: 'Home', icon: Home },
      { id: 'bins', label: 'Bins', icon: MapPin },
      { id: 'reports', label: 'Reports', icon: FileText },
      { id: 'profile', label: 'Profile', icon: User },
    ].map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        type="button"
        onClick={() => setTab(id)}
        className={cx(
          'flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[9px] font-bold transition-colors',
          tab === id ? 'text-emerald-600' : 'text-slate-400',
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
      </button>
    ))}
  </nav>
);

export const CitizenApp = () => {
  const { bins, reports, submitReport } = useEcoBin();
  const [tab, setTab] = useState('home');
  const [flow, setFlow] = useState(null); // null | { issueType } | 'done'
  const [form, setForm] = useState({ channelId: '', details: '' });
  const [lastId, setLastId] = useState(null);

  const startFlow = (issueType) => {
    setFlow({ issueType });
    setForm({ channelId: bins[0]?.channelId ?? '', details: '' });
  };

  const submit = (event) => {
    event.preventDefault();
    if (!form.channelId) return;
    const report = submitReport({
      channelId: form.channelId,
      issueType: flow.issueType,
      details: form.details,
      reporter: 'Citizen',
    });
    setLastId(report.id);
    setFlow('done');
  };

  /* ── report submitted ─────────────────────────────────────────────────── */
  if (flow === 'done') {
    return (
      <PhoneFrame>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </span>
          <p className="font-heading text-lg font-extrabold text-slate-900">Report Submitted!</p>
          <p className="text-xs text-slate-500">
            Thank you for helping keep our city clean. The operations team can see it now.
          </p>
          <div className="w-full rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-semibold text-slate-500">Report ID</p>
            <p className="font-mono text-sm font-bold text-slate-900">{lastId}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFlow(null);
              setTab('reports');
            }}
            className="w-full rounded-xl bg-brand-500 py-2.5 text-xs font-bold text-white"
          >
            View My Reports
          </button>
        </div>
        <TabBar tab={tab} setTab={(next) => { setFlow(null); setTab(next); }} />
      </PhoneFrame>
    );
  }

  /* ── report form ──────────────────────────────────────────────────────── */
  if (flow) {
    return (
      <PhoneFrame>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <button type="button" onClick={() => setFlow(null)} aria-label="Back">
            <ChevronLeft className="h-4 w-4 text-slate-500" />
          </button>
          <p className="text-sm font-bold text-slate-900">{flow.issueType}</p>
        </div>

        <form onSubmit={submit} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-700">
              Select the bin
            </span>
            <select
              value={form.channelId}
              onChange={(event) => setForm({ ...form, channelId: event.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
            >
              {bins.length === 0 && <option value="">No bins available</option>}
              {bins.map((bin) => (
                <option key={bin.channelId} value={bin.channelId}>
                  {bin.id} — {bin.location}
                </option>
              ))}
            </select>
          </label>

          <label className="block flex-1">
            <span className="mb-1 block text-[11px] font-semibold text-slate-700">
              Description (optional)
            </span>
            <textarea
              value={form.details}
              onChange={(event) => setForm({ ...form, details: event.target.value })}
              rows={4}
              placeholder="Bin has been overflowing for two days."
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={!form.channelId}
            className="w-full rounded-xl bg-brand-500 py-2.5 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
          >
            Submit Report
          </button>
        </form>

        <TabBar tab={tab} setTab={(next) => { setFlow(null); setTab(next); }} />
      </PhoneFrame>
    );
  }

  /* ── tabs ─────────────────────────────────────────────────────────────── */
  return (
    <PhoneFrame>
      <div className="flex-1 overflow-y-auto">
        {tab === 'home' && (
          <div className="px-4 py-5">
            <p className="font-heading text-lg font-extrabold leading-tight text-slate-900">
              Let’s keep
              <br />
              our city clean
            </p>
            <div className="my-4 flex items-center justify-center rounded-2xl bg-emerald-50 py-6">
              <Trash2 className="h-12 w-12 text-emerald-600" />
            </div>
            <div className="space-y-2">
              {ISSUE_TYPES.map(({ id, label, icon: Icon, tone }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => startFlow(id)}
                  disabled={bins.length === 0}
                  className={cx(
                    'flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-opacity disabled:opacity-40',
                    tone,
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            {bins.length === 0 && (
              <p className="mt-3 text-center text-[10px] text-slate-400">
                No bins connected yet — reports need at least one channel.
              </p>
            )}
          </div>
        )}

        {tab === 'bins' && (
          <div className="px-4 py-4">
            <p className="mb-2 text-xs font-bold text-slate-900">Bins near you</p>
            {bins.length === 0 ? (
              <p className="py-8 text-center text-[11px] text-slate-400">No bins connected.</p>
            ) : (
              <ul className="space-y-2">
                {bins.map((bin) => (
                  <li
                    key={bin.channelId}
                    className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2"
                  >
                    <span
                      className="h-7 w-7 shrink-0 rounded-full text-center text-[10px] font-extrabold leading-7 text-white"
                      style={{ background: STATUS_META[bin.status].hex }}
                    >
                      {bin.fill ?? '—'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-bold text-slate-900">
                        {bin.id}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {bin.location}
                      </span>
                    </span>
                    <span className="shrink-0 text-[9px] text-slate-400">
                      {formatRelative(bin.lastSeen)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'reports' && (
          <div className="px-4 py-4">
            <p className="mb-2 text-xs font-bold text-slate-900">My reports</p>
            {reports.length === 0 ? (
              <p className="py-8 text-center text-[11px] text-slate-400">
                You haven’t reported anything yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {reports.map((report) => (
                  <li key={report.id} className="rounded-xl border border-slate-100 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-slate-400">{report.id}</span>
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5 text-[9px] font-bold',
                          report.status === 'RESOLVED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700',
                        )}
                      >
                        {report.status === 'RESOLVED' ? 'Resolved' : 'In progress'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] font-bold text-slate-900">
                      {report.binId} · {report.issueType}
                    </p>
                    <p className="text-[10px] text-slate-500">{formatRelative(report.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'profile' && (
          <div className="flex flex-1 flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-lg font-extrabold text-emerald-700">
              C
            </span>
            <p className="text-sm font-bold text-slate-900">Citizen</p>
            <p className="text-[11px] text-slate-500">
              {reports.length} report{reports.length === 1 ? '' : 's'} filed ·{' '}
              {reports.filter((report) => report.status === 'RESOLVED').length} resolved
            </p>
          </div>
        )}
      </div>

      <TabBar tab={tab} setTab={setTab} />
    </PhoneFrame>
  );
};
