import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Link } from "@tanstack/react-router";
import type { Bin, Truck } from "@/types/ecobin";
import { DEPOT, STATUS_LABEL } from "@/lib/ecobin-config";
import { Button } from "@/components/ui/button";

const COLORS: Record<string, string> = {
  normal: "oklch(0.62 0.15 152)",
  filling: "oklch(0.79 0.15 90)",
  high: "oklch(0.68 0.17 55)",
  critical: "oklch(0.56 0.21 25)",
  offline: "oklch(0.68 0.01 160)",
};

function binIcon(bin: Bin) {
  const color = COLORS[bin.status] ?? COLORS["normal"];
  // A dashed ring marks a bin whose coordinates have not been surveyed yet.
  const border = bin.locationApproximate ? "3px dashed white" : "3px solid white";
  return L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:${border};box-shadow:0 2px 8px rgba(0,0,0,.35);display:grid;place-items:center;color:white;font:700 10px/1 system-ui">${bin.status === "offline" ? "--" : bin.fillLevel}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function truckIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:8px;background:oklch(0.24 0.04 168);border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);display:grid;place-items:center;color:white;font:700 12px/1 system-ui">🚛</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function BinMap({
  bins,
  trucks = [],
  onAssign,
  publicMode = false,
}: {
  bins: Bin[];
  trucks?: Truck[];
  onAssign?: (binId: string) => void;
  publicMode?: boolean;
}) {
  // Centre on the bins actually on screen, falling back to the depot.
  const center: [number, number] = bins.length
    ? [
        bins.reduce((a, b) => a + b.latitude, 0) / bins.length,
        bins.reduce((a, b) => a + b.longitude, 0) / bins.length,
      ]
    : [DEPOT.lat, DEPOT.lng];
  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom className="size-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {bins.map((bin) => (
        <Marker key={bin.id} position={[bin.latitude, bin.longitude]} icon={binIcon(bin)}>
          <Popup>
            <div className="min-w-44 space-y-1 font-sans">
              <p className="font-display text-sm font-bold">{bin.id}</p>
              <p className="text-xs text-muted-foreground">{bin.name}</p>
              <p className="text-xs">Fill: {bin.fillLevel}%</p>
              <p className="text-xs">Weight: {bin.weight} kg</p>
              <p className="text-xs">Priority: {bin.priorityScore}/100</p>
              <p className="text-xs">Status: {STATUS_LABEL[bin.status]}</p>
              {bin.locationApproximate && (
                <p className="text-xs text-muted-foreground">Location approximate</p>
              )}
              <p className="text-xs">
                Last collection:{" "}
                {bin.lastCollected ? new Date(bin.lastCollected).toLocaleString() : "—"}
              </p>
              {!publicMode && (
                <div className="flex gap-1 pt-1">
                  <Button asChild size="sm" variant="secondary" className="h-7 px-2 text-xs">
                    <Link to="/admin/bins/$binId" params={{ binId: bin.id }}>
                      Details
                    </Link>
                  </Button>
                  {onAssign && (
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => onAssign(bin.id)}>
                      Assign truck
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
      {trucks.map((truck) => (
        <Marker key={truck.id} position={[truck.latitude, truck.longitude]} icon={truckIcon()}>
          <Popup>
            <div className="font-sans text-xs">
              <p className="font-display text-sm font-bold">{truck.id}</p>
              <p>Driver: {truck.driver}</p>
              <p>Status: {truck.status}</p>
              <p>Assigned bins: {truck.assignedBins.length}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
