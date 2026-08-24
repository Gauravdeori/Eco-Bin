import type { Bin, BinStatus, RecommendedRoute, Thresholds, Truck } from "@/types/ecobin";
import { DEPOT } from "./ecobin-config";

export function statusFromFill(fill: number, t: Thresholds): BinStatus {
  if (fill >= t.critical) return "critical";
  if (fill >= t.high) return "high";
  if (fill >= t.filling) return "filling";
  return "normal";
}

/**
 * EcoBin operational priority score (0-100).
 * Used only when the device does not publish its own priority on field5.
 * Weighted blend of fill level, weight load, citizen reports and time waiting.
 */
export function priorityScore(
  bin: Pick<Bin, "fillLevel" | "weight" | "reports" | "lastCollected" | "status">,
): number {
  if (bin.status === "offline") return 0;
  const fill = Math.min(bin.fillLevel, 100) * 0.6; // max 60
  const weight = Math.min(bin.weight / 45, 1) * 20; // max 20
  const reports = Math.min(bin.reports, 3) * 4; // max 12
  const hours = bin.lastCollected
    ? (Date.now() - new Date(bin.lastCollected).getTime()) / 3_600_000
    : 24;
  const time = Math.min(hours / 48, 1) * 8; // max 8
  return Math.max(0, Math.min(100, Math.round(fill + weight + reports + time)));
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 100) / 100;
}

/** Nearest-neighbour route sequencing from the truck's position back to the depot. */
export function recommendRoute(bins: Bin[], truck: Truck): RecommendedRoute {
  const remaining = [...bins];
  let cursor = { lat: truck.latitude, lng: truck.longitude };
  const stops = [] as RecommendedRoute["stops"];
  let total = 0;
  while (remaining.length) {
    remaining.sort(
      (a, b) =>
        haversineKm(cursor, { lat: a.latitude, lng: a.longitude }) -
        haversineKm(cursor, { lat: b.latitude, lng: b.longitude }),
    );
    const next = remaining.shift()!;
    const d = haversineKm(cursor, { lat: next.latitude, lng: next.longitude });
    total += d;
    stops.push({
      binId: next.id,
      fillLevel: next.fillLevel,
      weight: next.weight,
      priorityScore: next.priorityScore,
      distanceKm: d,
    });
    cursor = { lat: next.latitude, lng: next.longitude };
  }
  total += haversineKm(cursor, { lat: DEPOT.lat, lng: DEPOT.lng });
  total = Math.round(total * 10) / 10;
  return {
    truckId: truck.id,
    stops,
    totalDistanceKm: total,
    estimatedMinutes: Math.round(total * 3 + stops.length * 6),
    expectedWeightKg: Math.round(stops.reduce((s, x) => s + x.weight, 0) * 10) / 10,
    priorityHandled: stops.reduce((s, x) => s + x.priorityScore, 0),
  };
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} second${s === 1 ? "" : "s"} ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
