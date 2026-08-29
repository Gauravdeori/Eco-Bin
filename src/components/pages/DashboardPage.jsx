import React from 'react';
import { StatCards } from '../dashboard/StatCards';
import { LiveBinMap } from '../dashboard/LiveBinMap';
import { RecentAlerts } from '../dashboard/RecentAlerts';
import { CollectionProgress, CollectionActivity } from '../dashboard/CollectionPanels';
import { BinDetailsPanel } from '../dashboard/BinDetailsPanel';
import { TrucksPanel } from '../dashboard/TrucksPanel';
import { ReadingsChart } from '../dashboard/ReadingsChart';
import { PriorityList } from '../dashboard/PriorityList';
import { AnalyticsOverview } from '../dashboard/AnalyticsOverview';

/**
 * Grouped by the question each row answers, rather than by what happened to be
 * built when.
 *
 * Breakpoints are picked from the width a panel actually gets, not by habit.
 * The sidebar is sticky from lg and takes 236px of it, so the content area is
 * roughly the viewport less 292px: about 730px at 1024, 990px at 1280.
 *
 * That is why the rows do not all turn two-column at the same size. The panels
 * below the map read fine at ~360px and pair up from lg, but the map carries
 * routes, moving trucks, a tracking card and a legend, and half of 730px is
 * not enough to hold them — so it keeps the full width until xl, where its
 * column is a genuine 640px.
 */
export const DashboardPage = () => (
  <div className="space-y-4">
    <StatCards />

    {/* What is happening, and what to deal with first. */}
    <div className="grid gap-4 xl:grid-cols-12">
      <div className="xl:col-span-8">
        <LiveBinMap height="h-[360px] lg:h-[440px]" />
      </div>
      <div className="xl:col-span-4">
        <PriorityList limit={7} />
      </div>
    </div>

    {/* Everything about the bin currently selected. */}
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-6 xl:col-span-4">
        <BinDetailsPanel />
      </div>
      <div className="space-y-4 lg:col-span-6 xl:col-span-8">
        <ReadingsChart height="h-[240px] lg:h-[280px]" />
        <CollectionActivity />
      </div>
    </div>

    {/* The day's work: what has been raised, how far through it we are, and
        who is out driving. */}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
      <div className="xl:col-span-4">
        <RecentAlerts limit={6} />
      </div>
      <div className="xl:col-span-3">
        <CollectionProgress />
      </div>
      <div className="md:col-span-2 xl:col-span-5">
        <TrucksPanel limit={4} />
      </div>
    </div>

    {/* Trend and impact, which want the full width for their charts. */}
    <AnalyticsOverview />
  </div>
);
