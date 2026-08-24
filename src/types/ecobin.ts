export type BinStatus = "normal" | "filling" | "high" | "critical" | "offline";

/** Every bin reading in EcoBin originates from the ThingSpeak channel. */
export type DataSource = "thingspeak";

export interface Bin {
  id: string;
  name: string;
  ward: string;
  fillLevel: number;
  weight: number;
  status: BinStatus;
  latitude: number;
  longitude: number;
  /** True while the bin sits on an auto-placed marker instead of a surveyed location. */
  locationApproximate: boolean;
  priorityScore: number;
  /** Set when field5 carried a priority value from the device. */
  priorityFromDevice: boolean;
  lastUpdated: string;
  lastCollected?: string | undefined;
  battery?: number | undefined;
  reports: number;
  assignedTruckId?: string | undefined;
  source: DataSource;
  entryId?: number | undefined;
}

/** One historical ThingSpeak entry for a bin, used by the fill/weight charts. */
export interface BinReading {
  binId: string;
  entryId: number;
  timestamp: string;
  fillLevel: number;
  weight: number;
  status: BinStatus;
  priorityScore: number;
}

export type TruckStatus =
  "available" | "assigned" | "en-route" | "collecting" | "completed" | "offline";

export interface Truck {
  id: string;
  driver: string;
  /** Tonnes. */
  capacity: number;
  currentLoad: number;
  status: TruckStatus;
  latitude: number;
  longitude: number;
  base: string;
  assignedBins: string[];
}

export type ReportType = "overflowing" | "damaged" | "smell" | "garbage-outside" | "other";

export type ReportStatus = "received" | "verified" | "queued" | "resolved" | "rejected";

export interface CitizenReport {
  id: string;
  binId: string;
  type: ReportType;
  description: string;
  location: string;
  status: ReportStatus;
  severity: "low" | "medium" | "high";
  createdAt: string;
  photoName?: string | undefined;
}

export interface Collection {
  id: string;
  binId: string;
  truckId: string;
  workerName: string;
  collectedWeight: number;
  timestamp: string;
  durationMinutes: number;
  status: "completed";
}

export type WasteCategory = "plastic" | "metal" | "food" | "plant";

export interface Classification {
  id: string;
  binId?: string | undefined;
  category: WasteCategory;
  confidence: number;
  recyclable: boolean;
  createdAt: string;
  imageName?: string | undefined;
}

export interface EcoNotification {
  id: string;
  level: "info" | "warning" | "critical" | "success";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  binId?: string | undefined;
}

export interface Thresholds {
  filling: number;
  high: number;
  critical: number;
}

/**
 * ThingSpeak channel field mapping. Matches the EcoBin device sketch:
 * field1 fill level, field2 weight, field3 status, field4 bin id, field5 priority.
 * `battery` is optional — leave it blank when the device does not publish it.
 */
export interface ThingSpeakFieldMap {
  fillLevel: string;
  weight: string;
  status: string;
  binId: string;
  priority: string;
  battery: string;
}

/** Surveyed metadata for a bin ID, held by the municipality rather than the device. */
export interface BinProfile {
  name: string;
  ward: string;
  latitude: number;
  longitude: number;
  /** False once an operator has confirmed the coordinates. */
  approximate: boolean;
}

export interface EcoSettings {
  thresholds: Thresholds;
  refreshIntervalSec: number;
  /** Feed entries pulled per refresh — also the depth of the history charts. */
  historyDepth: number;
  channelId: string;
  readApiKey: string;
  fieldMap: ThingSpeakFieldMap;
  /**
   * "default" lets EcoBin auto-map from the channel's own field labels on the
   * first successful read. Detecting or hand-editing the map pins it.
   */
  fieldMapSource: "default" | "detected" | "manual";
  /** A bin with no reading for this many minutes is shown as offline. */
  offlineAfterMinutes: number;
  notify: {
    critical: boolean;
    reports: boolean;
    trucks: boolean;
    collections: boolean;
  };
}

export interface RouteStop {
  binId: string;
  fillLevel: number;
  weight: number;
  priorityScore: number;
  distanceKm: number;
}

export interface RecommendedRoute {
  truckId: string;
  stops: RouteStop[];
  totalDistanceKm: number;
  estimatedMinutes: number;
  expectedWeightKg: number;
  priorityHandled: number;
}

export interface ConnectionState {
  live: boolean;
  loading: boolean;
  lastSync: string | null;
  error?: string | undefined;
  channelName?: string | undefined;
  entriesRead: number;
  /** The channel's own fieldN labels, shown next to the field map. */
  fieldLabels: Record<string, string>;
}
