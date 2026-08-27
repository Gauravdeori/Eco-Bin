import React, { useState } from 'react';
import { X, Radio, ArrowRight } from 'lucide-react';
import { EcoBinProvider, useEcoBin } from './context/EcoBinContext';
import { isConfigured } from './config/settings';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { CitizenApp } from './components/citizen/CitizenApp';
import { DashboardPage } from './components/pages/DashboardPage';
import { BinsPage } from './components/pages/BinsPage';
import { MapPage } from './components/pages/MapPage';
import { CollectionPage } from './components/pages/CollectionPage';
import { TrucksPage } from './components/pages/TrucksPage';
import { ReportsPage } from './components/pages/ReportsPage';
import { SegregationPage } from './components/pages/SegregationPage';
import { AlertsPage } from './components/pages/AlertsPage';
import { SettingsPage } from './components/pages/SettingsPage';

const PAGES = {
  dashboard: DashboardPage,
  bins: BinsPage,
  map: MapPage,
  collection: CollectionPage,
  trucks: TrucksPage,
  reports: ReportsPage,
  segregation: SegregationPage,
  alerts: AlertsPage,
  settings: SettingsPage,
};

/** Shown until at least one ThingSpeak channel is connected. */
const SetupBanner = () => {
  const { setPage } = useEcoBin();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <span className="rounded-xl bg-white p-2 text-emerald-600 dark:bg-emerald-500/20">
        <Radio className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
          No ThingSpeak channel connected
        </p>
        <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
          Every number on this dashboard comes from your own device feeds. Add a channel ID to start
          receiving live telemetry.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setPage('settings')}
        className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-brand-400"
      >
        Connect a channel <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const Shell = () => {
  const { page, settings } = useEcoBin();
  const [navOpen, setNavOpen] = useState(false);
  const [citizenOpen, setCitizenOpen] = useState(false);

  const Page = PAGES[page] ?? DashboardPage;
  const configured = isConfigured(settings);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenNav={() => setNavOpen(true)}
          onToggleCitizenApp={() => setCitizenOpen((open) => !open)}
          citizenAppOpen={citizenOpen}
        />

        <main className="flex-1 px-4 pb-8 pt-4 lg:px-7">
          <div className="space-y-4">
            {!configured && page !== 'settings' && <SetupBanner />}

            <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
              <div key={page} className="min-w-0 flex-1 animate-fade-in">
                <Page />
              </div>

              {citizenOpen && (
                <aside className="w-full shrink-0 xl:w-[340px]">
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Citizen App
                        </p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          Public reporting
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCitizenOpen(false)}
                        aria-label="Close citizen app"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <CitizenApp />
                  </div>
                </aside>
              )}
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-200 px-4 py-3 text-[11px] text-slate-500 lg:px-7 dark:border-slate-800 dark:text-slate-400">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>EcoBin · Smart waste collection, powered by ThingSpeak telemetry</span>
            <span className="tabular">
              {settings.channels.length} channel{settings.channels.length === 1 ? '' : 's'} · polling
              every {settings.pollSeconds}s
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <EcoBinProvider>
      <Shell />
    </EcoBinProvider>
  );
}
