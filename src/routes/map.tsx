import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EcoLogo, EmptyState, SectionHeading, StatusDot } from "@/components/eco/primitives";
import { MapPanel } from "@/components/eco/map-panel";
import { useEco } from "@/store/ecobin-store";
import { useEcoSync } from "@/hooks/use-eco-sync";
import type { BinStatus } from "@/types/ecobin";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Public Bin Map — EcoBin" },
      {
        name: "description",
        content:
          "See the live status of public waste bins across the city and report a problem bin near you.",
      },
      { property: "og:title", content: "Public Bin Map — EcoBin" },
      {
        property: "og:description",
        content: "Live public map of smart waste bins across the municipality.",
      },
    ],
  }),
  component: PublicMap,
});

const FILTERS: (BinStatus | "all")[] = ["all", "critical", "high", "filling", "normal", "offline"];

function PublicMap() {
  useEcoSync();
  const bins = useEco((s) => s.bins);
  const [filter, setFilter] = useState<BinStatus | "all">("all");
  const filtered = filter === "all" ? bins : bins.filter((b) => b.status === filter);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" aria-label="EcoBin home">
            <EcoLogo />
          </Link>
          <Button asChild size="sm">
            <Link to="/report">Report a bin</Link>
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <SectionHeading
          title="Public bin map"
          description="Live fill status of municipal smart bins. Tap a marker to see details."
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className="gap-2 capitalize"
              onClick={() => setFilter(f)}
            >
              {f !== "all" && <StatusDot status={f} />}
              {f}
            </Button>
          ))}
        </div>
        {bins.length ? (
          <MapPanel bins={filtered} trucks={[]} className="h-[60vh] min-h-96" />
        ) : (
          <EmptyState
            title="No bins are reporting yet"
            body="The public map fills in as soon as the municipality's smart bins publish their first readings."
          />
        )}
      </div>
    </main>
  );
}
