import React from 'react';
import { LiveBinMap } from '../dashboard/LiveBinMap';
import { BinDetailsPanel } from '../dashboard/BinDetailsPanel';

/**
 * Two-column only from xl. The sidebar takes 236px from lg onwards, so at 1024
 * the map column would be about 480px — too little for the routes, the moving
 * trucks and the tracking card it now carries. Below xl the map takes the full
 * width and the details panel sits under it.
 */
export const MapPage = () => (
  <div className="grid gap-4 xl:grid-cols-12">
    <div className="xl:col-span-8">
      <LiveBinMap height="h-[calc(100vh-320px)] min-h-[420px]" scrollZoom />
    </div>
    <div className="xl:col-span-4">
      <BinDetailsPanel />
    </div>
  </div>
);
