import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import type { Bin, Truck } from "@/types/ecobin";
import { cn } from "@/lib/utils";

const BinMap = lazy(() => import("./bin-map"));

function MapSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid h-full w-full place-items-center rounded-xl bg-muted", className)}>
      <p className="text-sm text-muted-foreground">Loading municipal map…</p>
    </div>
  );
}

export function MapPanel({
  bins,
  trucks,
  onAssign,
  publicMode,
  className,
}: {
  bins: Bin[];
  trucks?: Truck[];
  onAssign?: (binId: string) => void;
  publicMode?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border", className)}>
      <ClientOnly fallback={<MapSkeleton />}>
        <Suspense fallback={<MapSkeleton />}>
          <BinMap
            bins={bins}
            trucks={trucks ?? []}
            {...(onAssign ? { onAssign } : {})}
            publicMode={publicMode ?? false}
          />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
