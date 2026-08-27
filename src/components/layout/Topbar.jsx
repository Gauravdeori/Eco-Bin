import React, { useState } from 'react';
import {
  Bell,
  Menu,
  Moon,
  RefreshCw,
  Sun,
  Smartphone,
  CalendarDays,
  AlertTriangle,
} from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { NAV_ITEMS } from './Sidebar';
import { cx, LiveDot } from '../ui/Primitives';
import { formatRelative } from '../../lib/telemetry';

const PAGE_SUBTITLES = {
  dashboard: 'Welcome back, Admin 👋',
  bins: 'Every connected bin and its latest reading',
  map: 'Where each bin is right now',
  collection: 'Today’s pickups and progress',
  trucks: 'Fleet and route assignments',
  reports: 'What citizens have reported',
  segregation: 'Waste classification from your devices',
  alerts: 'Everything the sensors have flagged',
  settings: 'ThingSpeak channels, fields and thresholds',
};

export const Topbar = ({ onOpenNav, onToggleCitizenApp, citizenAppOpen }) => {
  const {
    page,
    setPage,
    theme,
    setTheme,
    linkStatus,
    lastSync,
    linkErrors,
    refresh,
    alerts,
  } = useEcoBin();

  const [refreshing, setRefreshing] = useState(false);

  const title = NAV_ITEMS.find((item) => item.id === page)?.label ?? 'Dashboard';
  const today = new Date().toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    // Keep the spinner visible long enough to read as feedback.
    setTimeout(() => setRefreshing(false), 400);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#f4f6f8]/85 backdrop-blur-md dark:border-slate-800 dark:bg-[#070d16]/85">
      <div className="flex items-center gap-3 px-4 py-3.5 lg:px-7">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-xl font-extrabold text-slate-900 dark:text-white">
            {title}
          </h1>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {PAGE_SUBTITLES[page]}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Link status */}
          <button
            type="button"
            onClick={() => setPage('settings')}
            title={
              linkErrors.length
                ? linkErrors.map((error) => error.message).join('\n')
                : 'ThingSpeak connection status'
            }
            className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 sm:flex dark:border-slate-700 dark:bg-slate-900"
          >
            {linkErrors.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {linkErrors.length} channel issue{linkErrors.length > 1 ? 's' : ''}
              </span>
            ) : (
              <LiveDot
                label={linkStatus === 'live' ? 'ThingSpeak live' : 'Not connected'}
                muted={linkStatus !== 'live'}
              />
            )}
            <span className="text-[10px] font-medium text-slate-400 tabular">
              {lastSync ? formatRelative(lastSync) : '—'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh now"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={cx('h-4 w-4', refreshing && 'animate-spin')} />
          </button>

          <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 md:flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <span className="tabular">{today}</span>
            <CalendarDays className="h-4 w-4 text-slate-400" />
          </div>

          <button
            type="button"
            onClick={onToggleCitizenApp}
            aria-pressed={citizenAppOpen}
            title="Toggle the citizen app panel"
            className={cx(
              'rounded-xl border p-2 transition-colors',
              citizenAppOpen
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
            )}
          >
            <Smartphone className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setTheme()}
            aria-label="Toggle colour theme"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => setPage('alerts')}
            aria-label={`${alerts.length} alerts`}
            className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Bell className="h-4 w-4" />
            {alerts.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white tabular">
                {alerts.length > 99 ? '99+' : alerts.length}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
