import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, Truck as TruckIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, SectionHeading } from "@/components/eco/primitives";
import { AssignTruckDialog, useAssignDialog } from "@/components/eco/assign-truck";
import { useEco } from "@/store/ecobin-store";
import { DEPOT } from "@/lib/ecobin-config";
import type { TruckStatus } from "@/types/ecobin";

export const Route = createFileRoute("/admin/trucks")({
  head: () => ({
    meta: [
      { title: "Truck Management — EcoBin" },
      {
        name: "description",
        content: "Register collection trucks and manage status, load and bin assignments.",
      },
      { property: "og:title", content: "Truck Management — EcoBin" },
      {
        property: "og:description",
        content: "Manage the municipal collection fleet and bin assignments.",
      },
    ],
  }),
  component: Trucks,
});

const STATUSES: TruckStatus[] = [
  "available",
  "assigned",
  "en-route",
  "collecting",
  "completed",
  "offline",
];

function Trucks() {
  const trucks = useEco((s) => s.trucks);
  const bins = useEco((s) => s.bins);
  const setTruckStatus = useEco((s) => s.setTruckStatus);
  const removeTruck = useEco((s) => s.removeTruck);
  const unassignBin = useEco((s) => s.unassignBin);
  const assign = useAssignDialog();
  const [adding, setAdding] = useState(false);

  const unassignedPriority = bins
    .filter((b) => !b.assignedTruckId && (b.status === "critical" || b.status === "high"))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Truck management"
        description="Your fleet register. Trucks are municipal records, so EcoBin keeps them in this browser rather than reading them from ThingSpeak."
        action={
          <Button className="gap-2" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add truck
          </Button>
        }
      />

      {!trucks.length ? (
        <EmptyState
          title="No trucks registered"
          body="Add your collection vehicles to assign priority bins to them and generate recommended routes."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {trucks.map((truck) => (
            <article key={truck.id} className="eco-panel p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <TruckIcon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="font-display text-base font-bold">{truck.id}</p>
                    <p className="text-xs text-muted-foreground">{truck.driver}</p>
                  </div>
                </div>
                <Badge variant="outline" className="capitalize">
                  {truck.status.replace("-", " ")}
                </Badge>
              </div>

              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Capacity</dt>
                  <dd>{truck.capacity} tonnes</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Current load</dt>
                  <dd>{truck.currentLoad} tonnes</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Base</dt>
                  <dd>{truck.base}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Assigned bins</dt>
                  <dd>{truck.assignedBins.length}</dd>
                </div>
              </dl>

              <Progress
                value={Math.min(100, (truck.currentLoad / Math.max(0.1, truck.capacity)) * 100)}
                className="mt-3"
                aria-label={`${truck.id} load`}
              />

              {truck.assignedBins.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1">
                  {truck.assignedBins.map((binId) => (
                    <li key={binId}>
                      <button
                        className="rounded-md bg-muted px-2 py-0.5 text-xs hover:bg-muted/70"
                        onClick={() => unassignBin(binId)}
                        aria-label={`Unassign ${binId} from ${truck.id}`}
                        title="Click to unassign"
                      >
                        {binId} ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex items-center gap-2">
                <Select
                  value={truck.status}
                  onValueChange={(v) => setTruckStatus(truck.id, v as TruckStatus)}
                >
                  <SelectTrigger className="h-9 flex-1" aria-label={`Set status for ${truck.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s.replace("-", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!unassignedPriority.length}
                  onClick={() => unassignedPriority[0] && assign.openFor(unassignedPriority[0].id)}
                  title={
                    unassignedPriority.length
                      ? `Assign ${unassignedPriority[0]!.id}`
                      : "No unassigned priority bins"
                  }
                >
                  Assign bin
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${truck.id}`}
                  onClick={() => {
                    removeTruck(truck.id);
                    toast.success(`${truck.id} removed from the fleet`);
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <AddTruckDialog open={adding} onOpenChange={setAdding} />
      <AssignTruckDialog
        binId={assign.binId}
        open={assign.open}
        onOpenChange={assign.onOpenChange}
      />
    </div>
  );
}

function AddTruckDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const addTruck = useEco((s) => s.addTruck);
  const trucks = useEco((s) => s.trucks);
  const [form, setForm] = useState({
    id: "",
    driver: "",
    capacity: "2.5",
    base: DEPOT.name,
    latitude: String(DEPOT.lat),
    longitude: String(DEPOT.lng),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = form.id.trim().toUpperCase();
    if (!id) {
      toast.error("Give the truck an ID.");
      return;
    }
    if (trucks.some((t) => t.id === id)) {
      toast.error(`${id} is already registered.`);
      return;
    }
    addTruck({
      id,
      driver: form.driver.trim() || "Unassigned driver",
      capacity: Number(form.capacity) || 1,
      status: "available",
      base: form.base.trim() || DEPOT.name,
      latitude: Number(form.latitude) || DEPOT.lat,
      longitude: Number(form.longitude) || DEPOT.lng,
    });
    toast.success(`${id} added to the fleet`);
    setForm((f) => ({ ...f, id: "", driver: "" }));
    onOpenChange(false);
  };

  const field = (
    key: keyof typeof form,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div>
      <Label htmlFor={`truck-${key}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`truck-${key}`}
        className="mt-1"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...props}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a collection truck</DialogTitle>
          <DialogDescription>
            The starting position is used to rank trucks by distance when assigning a bin.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field("id", "Truck ID", { placeholder: "TRUCK-01", required: true })}
            {field("driver", "Driver", { placeholder: "Driver name" })}
            {field("capacity", "Capacity (tonnes)", { type: "number", step: "0.1", min: "0.1" })}
            {field("base", "Base")}
            {field("latitude", "Latitude", { type: "number", step: "0.000001" })}
            {field("longitude", "Longitude", { type: "number", step: "0.000001" })}
          </div>
          <Button type="submit" className="w-full">
            Add truck
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
