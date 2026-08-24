import { useState } from "react";
import { Truck as TruckIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEco } from "@/store/ecobin-store";
import { haversineKm } from "@/lib/ecobin-logic";
import { cn } from "@/lib/utils";

export function AssignTruckDialog({
  binId,
  open,
  onOpenChange,
}: {
  binId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const trucks = useEco((s) => s.trucks);
  const bin = useEco((s) => s.bins.find((b) => b.id === binId));
  const assignTruck = useEco((s) => s.assignTruck);

  const ranked = [...trucks]
    .filter((t) => t.status !== "offline")
    .map((t) => ({
      truck: t,
      distance: bin
        ? haversineKm(
            { lat: bin.latitude, lng: bin.longitude },
            { lat: t.latitude, lng: t.longitude },
          )
        : 0,
    }))
    .sort((a, b) => a.distance - b.distance);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign truck to {binId}</DialogTitle>
          <DialogDescription>
            Ranked by distance to the bin. EcoBin recommends the nearest available truck.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {ranked.map(({ truck, distance }, i) => (
            <li key={truck.id}>
              <button
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted",
                  i === 0 && "border-primary/50 bg-primary/5",
                )}
                onClick={() => {
                  if (!binId) return;
                  assignTruck(binId, truck.id);
                  toast.success(`${truck.id} assigned to ${binId}`);
                  onOpenChange(false);
                }}
              >
                <TruckIcon className="size-4 text-primary" aria-hidden />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">
                    {truck.id}{" "}
                    {i === 0 && <span className="text-xs text-primary">· Recommended</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {truck.driver} · {truck.status} · {distance} km away · load {truck.currentLoad}/
                    {truck.capacity} t
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function useAssignDialog() {
  const [binId, setBinId] = useState<string | null>(null);
  return {
    binId,
    open: binId !== null,
    openFor: (id: string) => setBinId(id),
    onOpenChange: (v: boolean) => {
      if (!v) setBinId(null);
    },
  };
}

export function AssignTruckButton({
  binId,
  size = "sm",
}: {
  binId: string;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant="secondary" onClick={() => setOpen(true)}>
        Assign truck
      </Button>
      <AssignTruckDialog binId={binId} open={open} onOpenChange={setOpen} />
    </>
  );
}

export { DialogTrigger };
