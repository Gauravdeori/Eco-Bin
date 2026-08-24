import type {
  Bin,
  BinProfile,
  BinReading,
  BinStatus,
  EcoSettings,
  Thresholds,
  ThingSpeakFieldMap,
} from "@/types/ecobin";
import { priorityScore, statusFromFill } from "@/lib/ecobin-logic";
import { DEPOT } from "@/lib/ecobin-config";

export interface ThingSpeakFeed {
  created_at: string;
  entry_id: number;
  [key: string]: string | number | null;
}

export interface ThingSpeakChannel {
  id?: number;
  name?: string;
  description?: string;
  last_entry_id?: number;
  [key: string]: unknown;
}

export interface ThingSpeakResponse {
  channel?: ThingSpeakChannel;
  feeds?: ThingSpeakFeed[];
}

export interface FetchResult {
  ok: boolean;
  /** Latest reading per bin ID. */
  bins: Bin[];
  /** Every parsed entry, oldest first — the source for the history charts. */
  readings: BinReading[];
  channelName?: string | undefined;
  /** The channel's own field labels, e.g. { field1: "Weight (kg)" }. */
  fieldLabels: Record<string, string>;
  entriesRead: number;
  error?: string | undefined;
  fetchedAt: string;
}

const BASE = "https://api.thingspeak.com";

/** Fallback bin ID used when the channel does not publish one on field4. */
export const SINGLE_BIN_ID = "BIN-01";

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || String(v).trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const STATUS_CODES: Record<string, BinStatus> = {
  "0": "normal",
  "1": "filling",
  "2": "high",
  "3": "critical",
  "4": "offline",
};

/**
 * field3 may carry either a word ("critical") or the numeric code an ESP32
 * sketch usually publishes (0 normal, 1 filling, 2 high, 3 critical, 4 offline).
 * Anything unrecognised falls back to the threshold engine.
 */
function normalizeStatus(raw: unknown, fill: number, t: Thresholds): BinStatus {
  const s = String(raw ?? "")
    .toLowerCase()
    .trim();
  if (!s) return statusFromFill(fill, t);
  if (["normal", "filling", "high", "critical", "offline"].includes(s)) return s as BinStatus;
  if (s === "ok" || s === "empty") return "normal";
  if (s === "full" || s === "overflow" || s === "overflowing") return "critical";
  return STATUS_CODES[s] ?? statusFromFill(fill, t);
}

/** BIN-7, "7", "bin 7" and "Bin_7" all resolve to the canonical BIN-7. */
export function canonicalBinId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const cleaned = s.replace(/[\s_]+/g, "-").toUpperCase();
  if (cleaned.startsWith("BIN")) {
    const rest = cleaned.slice(3).replace(/^-+/, "");
    return rest ? `BIN-${rest}` : SINGLE_BIN_ID;
  }
  return `BIN-${cleaned}`;
}

/**
 * Spread unsurveyed bins around the depot on a deterministic ring so the map
 * stays readable. These markers stay flagged approximate until an operator
 * enters real coordinates in Settings.
 */
export function approximateLocation(binId: string): { latitude: number; longitude: number } {
  let hash = 0;
  for (let i = 0; i < binId.length; i++) hash = (hash * 31 + binId.charCodeAt(i)) >>> 0;
  const angle = (hash % 360) * (Math.PI / 180);
  const radius = 0.004 + ((hash >>> 9) % 60) / 10_000;
  return {
    latitude: Math.round((DEPOT.lat + Math.sin(angle) * radius) * 1e6) / 1e6,
    longitude: Math.round((DEPOT.lng + Math.cos(angle) * radius) * 1e6) / 1e6,
  };
}

/** Parse one ThingSpeak feed row into a bin reading. Returns null for unusable rows. */
export function feedToReading(feed: ThingSpeakFeed, settings: EcoSettings): BinReading | null {
  const f = settings.fieldMap;
  const fill = num(feed[f.fillLevel]);
  if (fill === undefined) return null;
  const fillLevel = Math.round(Math.max(0, Math.min(100, fill)));
  const weight = Math.round((f.weight ? (num(feed[f.weight]) ?? 0) : 0) * 10) / 10;
  const binId = (f.binId ? canonicalBinId(feed[f.binId]) : null) ?? SINGLE_BIN_ID;
  const status = normalizeStatus(f.status ? feed[f.status] : "", fillLevel, settings.thresholds);
  const devicePriority = f.priority ? num(feed[f.priority]) : undefined;
  return {
    binId,
    entryId: feed.entry_id,
    timestamp: feed.created_at ?? new Date().toISOString(),
    fillLevel,
    weight,
    status,
    priorityScore:
      devicePriority === undefined
        ? priorityScore({ fillLevel, weight, reports: 0, lastCollected: undefined, status })
        : Math.max(0, Math.min(100, Math.round(devicePriority))),
  };
}

/** Combine a bin's newest reading with the municipality's own profile for it. */
export function readingToBin(
  reading: BinReading,
  feed: ThingSpeakFeed | undefined,
  settings: EcoSettings,
  profile: BinProfile | undefined,
): Bin {
  const f = settings.fieldMap;
  const battery = f.battery && feed ? num(feed[f.battery]) : undefined;
  const placed = profile ?? approximateLocation(reading.binId);
  return {
    id: reading.binId,
    name: profile?.name || `${reading.binId} smart bin`,
    ward: profile?.ward || "Unassigned ward",
    fillLevel: reading.fillLevel,
    weight: reading.weight,
    status: reading.status,
    latitude: placed.latitude,
    longitude: placed.longitude,
    locationApproximate: profile ? profile.approximate : true,
    priorityScore: reading.priorityScore,
    priorityFromDevice: Boolean(f.priority && feed && num(feed[f.priority]) !== undefined),
    lastUpdated: reading.timestamp,
    reports: 0,
    source: "thingspeak",
    entryId: reading.entryId,
    ...(battery !== undefined ? { battery } : {}),
  };
}

/** Pull the fieldN labels a channel owner set in ThingSpeak. */
export function channelFieldLabels(channel: ThingSpeakChannel | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!channel) return out;
  for (let i = 1; i <= 8; i++) {
    const label = channel[`field${i}`];
    if (typeof label === "string" && label.trim()) out[`field${i}`] = label.trim();
  }
  return out;
}

/**
 * ThingSpeak channels rarely publish in the same order, so map them by the
 * labels the channel owner gave each field rather than by position.
 *
 * Order matters: "Fill Status" must land on fill level, not status, so the
 * fill-level patterns are tested before the status ones.
 */
const LABEL_PATTERNS: { key: keyof ThingSpeakFieldMap; test: RegExp }[] = [
  { key: "fillLevel", test: /fill|level|percent|ultrason|distance|capacit/i },
  { key: "weight", test: /weight|load|mass|\bkgs?\b|gram/i },
  { key: "binId", test: /bin[\s_-]*(id|no|num)|(device|node)[\s_-]*id|\bid\b/i },
  { key: "priority", test: /priorit|urgen|score|rank/i },
  { key: "battery", test: /batter|\bvolt|charge|\bpower\b/i },
  { key: "status", test: /status|state|condition/i },
];

/**
 * Suggest a field map from a channel's labels. Fields whose meaning is not
 * recognised are left unmapped rather than guessed at — an unmapped field is
 * ignored, which is safer than reading the wrong column.
 */
export function suggestFieldMap(labels: Record<string, string>): ThingSpeakFieldMap {
  const suggestion: ThingSpeakFieldMap = {
    fillLevel: "",
    weight: "",
    status: "",
    binId: "",
    priority: "",
    battery: "",
  };
  const taken = new Set<string>();
  for (const { key, test } of LABEL_PATTERNS) {
    for (const [field, label] of Object.entries(labels)) {
      if (taken.has(field) || suggestion[key]) continue;
      if (test.test(label)) {
        suggestion[key] = field;
        taken.add(field);
      }
    }
  }
  return suggestion;
}

/** Fetch the channel feed and normalize it into bins plus reading history. */
export async function fetchThingSpeak(
  settings: EcoSettings,
  profiles: Record<string, BinProfile> = {},
): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();
  const empty = { bins: [], readings: [], entriesRead: 0, fieldLabels: {}, fetchedAt };

  const channelId = settings.channelId.trim();
  if (!channelId) {
    return { ok: false, ...empty, error: "No ThingSpeak channel configured." };
  }
  if (!/^\d+$/.test(channelId)) {
    return { ok: false, ...empty, error: "Channel ID must be numeric, for example 2345678." };
  }

  const results = Math.max(1, Math.min(8000, settings.historyDepth));
  const params = new URLSearchParams({ results: String(results) });
  if (settings.readApiKey.trim()) params.set("api_key", settings.readApiKey.trim());
  const url = `${BASE}/channels/${channelId}/feeds.json?${params}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (res.status === 400 || res.status === 401 || res.status === 404) {
      return {
        ok: false,
        ...empty,
        error: "ThingSpeak rejected the request — check the channel ID and read API key.",
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        ...empty,
        error: "ThingSpeak rate limit reached — increase the refresh interval.",
      };
    }
    if (!res.ok) {
      return { ok: false, ...empty, error: `ThingSpeak responded with HTTP ${res.status}.` };
    }

    const json = (await res.json()) as ThingSpeakResponse;
    const fieldLabels = channelFieldLabels(json.channel);
    const feeds = Array.isArray(json.feeds) ? json.feeds : [];
    if (!feeds.length) {
      return {
        ok: false,
        ...empty,
        channelName: json.channel?.name,
        fieldLabels,
        error: "The channel has no entries yet — start the device or Wokwi simulation.",
      };
    }

    // ThingSpeak returns oldest first; sort defensively so "latest wins" holds.
    const ordered = [...feeds].sort((a, b) => a.entry_id - b.entry_id);
    const readings: BinReading[] = [];
    const latestFeed = new Map<string, ThingSpeakFeed>();
    for (const feed of ordered) {
      const reading = feedToReading(feed, settings);
      if (!reading) continue;
      readings.push(reading);
      latestFeed.set(reading.binId, feed);
    }

    if (!readings.length) {
      return {
        ok: false,
        ...empty,
        entriesRead: feeds.length,
        channelName: json.channel?.name,
        fieldLabels,
        error: `Read ${feeds.length} entries, but ${settings.fieldMap.fillLevel} held no numeric fill level — check the field map.`,
      };
    }

    const latestReading = new Map<string, BinReading>();
    for (const r of readings) latestReading.set(r.binId, r);

    const bins = [...latestReading.values()]
      .map((r) => readingToBin(r, latestFeed.get(r.binId), settings, profiles[r.binId]))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    return {
      ok: true,
      bins,
      readings,
      entriesRead: feeds.length,
      channelName: json.channel?.name,
      fieldLabels,
      fetchedAt,
    };
  } catch (err) {
    const msg =
      err instanceof DOMException && err.name === "AbortError"
        ? "ThingSpeak request timed out after 10 seconds."
        : "Network error reaching ThingSpeak — check the connection.";
    return { ok: false, ...empty, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
