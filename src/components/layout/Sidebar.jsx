import React from 'react';
import {
  LayoutDashboard,
  Trash2,
  Map,
  Truck,
  ClipboardList,
  Sparkles,
  Bell,
  Settings,
  Route,
  Recycle,
  ChevronDown,
  X,
} from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { cx } from '../ui/Primitives';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'bins', label: 'Live Bins', icon: Trash2 },
  { id: 'map', label: 'Map View', icon: Map },
  { id: 'collection', label: 'Collection', icon: Route },
  { id: 'trucks', label: 'Trucks', icon: Truck },
  { id: 'reports', label: 'Reports', icon: ClipboardList },
  { id: 'segregation', label: 'AI Segregation', icon: Sparkles, badge: 'New' },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar = ({ open, onClose }) => {
  const { page, setPage, stats, alerts } = useEcoBin();

  const counts = {
    bins: stats.totalBins || null,
    reports: stats.openReports || null,
    alerts: alerts.length || null,
    trucks: stats.trucksTotal || null,
  };

  const go = (id) => {
    setPage(id);
    onClose?.();
  };

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-[236px] flex-col bg-forest-900 text-emerald-50/90 transition-transform duration-300',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 pt-6 pb-7">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 shadow-lg shadow-emerald-900/40">
              <Recycle className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <p className="font-heading text-lg font-extrabold text-white">EcoBin</p>
              <p className="text-[10px] font-medium tracking-wide text-emerald-200/60">
                Smart Waste Collection
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-1.5 text-emerald-200/70 hover:bg-white/10 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <ul className="space-y-1">
            {NAV_ITEMS.map(({ id, label, icon: Icon, badge }) => {
              const active = page === id;
              const count = counts[id];
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => go(id)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                      active
                        ? 'bg-brand-500 text-white shadow-lg shadow-emerald-900/30'
                        : 'text-emerald-100/70 hover:bg-white/8 hover:text-white',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1 text-left">{label}</span>
                    {badge && (
                      <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-amber-950">
                        {badge}
                      </span>
                    )}
                    {!badge && count ? (
                      <span
                        className={cx(
                          'rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular',
                          active ? 'bg-white/20 text-white' : 'bg-white/10 text-emerald-100/80',
                        )}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Operator card */}
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => go('settings')}
            className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-left transition-colors hover:bg-white/10"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/20 text-sm font-extrabold text-emerald-200">
              A
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-white">Admin</span>
              <span className="block truncate text-[11px] text-emerald-200/60">Municipal Corp.</span>
            </span>
            <ChevronDown className="h-4 w-4 text-emerald-200/60" />
          </button>
        </div>
      </aside>
    </>
  );
};
