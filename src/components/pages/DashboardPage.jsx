import React from 'react';
import { StatCards } from '../dashboard/StatCards';
import { LiveBinMap } from '../dashboard/LiveBinMap';
import { RecentAlerts } from '../dashboard/RecentAlerts';
import { CollectionProgress, CollectionActivity } from '../dashboard/CollectionPanels';
import { BinDetailsPanel } from '../dashboard/BinDetailsPanel';
import { TrucksPanel } from '../dashboard/TrucksPanel';
import { ReadingsChart } from '../dashboard/ReadingsChart';
import { AnalyticsOverview } from '../dashboard/AnalyticsOverview';

export const DashboardPage = () => (
  <div className="space-y-4">
    <StatCards />

    <div className="grid gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-5">
        <LiveBinMap />
        <CollectionActivity />
      </div>

      <div className="space-y-4 xl:col-span-3">
        <RecentAlerts />
        <CollectionProgress />
      </div>

      <div className="xl:col-span-4">
        <BinDetailsPanel />
      </div>
    </div>

    <ReadingsChart />

    <div className="grid gap-4 xl:grid-cols-12">
      <div className="xl:col-span-5">
        <TrucksPanel limit={4} />
      </div>
      <div className="xl:col-span-7">
        <AnalyticsOverview />
      </div>
    </div>
  </div>
);
