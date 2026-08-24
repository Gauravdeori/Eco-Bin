import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Navigation, PlayCircle } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EcoLogo, EmptyState, FillBar, StatusBadge } from "@/components/eco/primitives";
import { useEco } from "@/store/ecobin-store";
import { useEcoSync } from "@/hooks/use-eco-sync";
import { timeAgo } from "@/lib/ecobin-logic";
import { loadJson, saveJson } from "@/lib/persist";

export const Route = createFileRoute("/worker")({
  head: () => ({
    meta: [
      { title: "Worker Dashboard — EcoBin" },
      {
        name: "description",
        content:
          "Mobile-friendly collection worker view: assigned bins, navigation, start collection and log a completed pickup.",
      },
      { property: "og:title", content: "Worker Dashboard — EcoBin" },
      { property: "og:description", content: "Field collection app for municipal waste workers." },
    ],
  }),
  component: WorkerPage,
});

const TRUCK_KEY = "worker-truck";

function WorkerPage() {
  useEcoSync();
  const bins = useEco((s) => s.bins);
  const trucks = useEco((s) => s.trucks);
  const collections = useEco((s) => s.collections);
  const markCollected = useEco((s) => s.markCollected);
  const [truckId, setTruckId] = useState("");
  const [inProgress, setInProgress] = useState<string[]>([]);

  // Remember which truck this device belongs to.
  useEffect(() => {
    setTruckId(loadJson<string>(TRUCK_KEY, ""));
  }, []);

  const truck = trucks.find((t) => t.id === truckId);
  const pickTruck = (id: string) => {
    setTruckId(id);
    saveJson(TRUCK_KEY, id);
  };

  // Without a selected truck, show every assigned bin rather than nothing.
  const assigned = bins.filter((b) =>
    truck ? b.assignedTruckId === truck.id : Boolean(b.assignedTruckId),
  );
  const pending = assigned.filter((b) => !inProgress.includes(b.id));
  const today = collections.filter(
    (c) =>
      new Date(c.timestamp).toDateString() === new Date().toDateString() &&
      (!truck || c.truckId === truck.id),
  ).length;

  return (
    <main className="min-h-screen bg-muted/30 pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" aria-label="EcoBin home">
            <EcoLogo />
          </Link>
          {trucks.length ? (
            <div className="text-right">
              <Select value={truckId} onValueChange={pickTruck}>
                <SelectTrigger className="h-9 w-44" aria-label="Select your truck">
                  <SelectValue placeholder="Select your truck" />
                </SelectTrigger>
                <SelectContent>
                  {trucks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.id} · {t.driver}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {truck && <p className="mt-1 text-xs text-muted-foreground">{truck.driver}</p>}
            </div>
          ) : (
            <p className="text-right text-xs text-muted-foreground">No trucks registered</p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        <section className="grid grid-cols-3 gap-2">
          <Stat label="Pending" value={pending.length} />
          <Stat label="In progress" value={inProgress.length} />
          <Stat label="Collected today" value={today} />
        </section>

        <h1 className="font-display text-lg font-bold">
          {truck ? `${truck.id} collections` : "Assigned collections"}
        </h1>

        {!assigned.length && (
          <EmptyState
            title="No assignments yet"
            body={
              trucks.length
                ? "Bins assigned by the control room appear here."
                : "Register a truck in the admin Truck management page, then assign bins to it."
            }
          />
        )}

        <ul className="space-y-3">
          {assigned.map((bin) => {
            const active = inProgress.includes(bin.id);
            return (
              <motion.li layout key={bin.id} className="eco-panel space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-bold">{bin.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {bin.name} · {bin.ward}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={bin.status} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Updated {timeAgo(bin.lastUpdated)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <FillBar value={bin.fillLevel} status={bin.status} />
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{bin.fillLevel}%</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {bin.weight} kg
                  </span>
                </div>
                {active && <Badge variant="secondary">Collection in progress</Badge>}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-2" asChild>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${bin.latitude}&mlon=${bin.longitude}#map=17/${bin.latitude}/${bin.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation className="size-4" aria-hidden /> Open navigation
                    </a>
                  </Button>
                  {active ? (
                    <Button
                      className="gap-2"
                      onClick={() => {
                        markCollected(bin.id, truck?.driver);
                        setInProgress((p) => p.filter((id) => id !== bin.id));
                        toast.success(`${bin.id} collection logged`);
                      }}
                    >
                      <CheckCircle2 className="size-4" aria-hidden /> Mark bin empty
                    </Button>
                  ) : (
                    <Button className="gap-2" onClick={() => setInProgress((p) => [...p, bin.id])}>
                      <PlayCircle className="size-4" aria-hidden /> Start collection
                    </Button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="eco-panel p-3 text-center">
      <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
