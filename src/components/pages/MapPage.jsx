import React from 'react';
import { LiveBinMap } from '../dashboard/LiveBinMap';
import { BinDetailsPanel } from '../dashboard/BinDetailsPanel';

export const MapPage = () => (
  <div className="grid gap-4 xl:grid-cols-12">
    <div className="xl:col-span-8">
      <LiveBinMap height="h-[calc(100vh-320px)] min-h-[420px]" />
    </div>
    <div className="xl:col-span-4">
      <BinDetailsPanel />
    </div>
  </div>
);
