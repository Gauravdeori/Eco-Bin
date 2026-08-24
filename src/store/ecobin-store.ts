import { create } from "zustand";
import type {
  Bin,
  BinProfile,
  BinReading,
  CitizenReport,
  Classification,
  Collection,
  ConnectionState,
  EcoNotification,
  EcoSettings,
  ReportType,
  Truck,
  TruckStatus,
  WasteCategory,
} from "@/types/ecobin";
import { DEFAULT_SETTINGS } from "@/lib/ecobin-config";
import { priorityScore, statusFromFill } from "@/lib/ecobin-logic";
import {
  approximateLocation,
  fetchThingSpeak,
  suggestFieldMap,
} from "@/services/thingspeakService";
import { clearAll, loadJson, saveJson } from "@/lib/persist";

/**
 * EcoBin holds two kinds of state:
 *
 *  - Telemetry (bins, readings, connection) is owned by the ThingSpeak channel.
 *    It is never seeded, never faked, and is empty until a channel is connected.
 *  - Municipal records (settings, bin profiles, fleet, collections, reports,
 *    classifications) are entered by operators and persist in localStorage.
 */

const KEYS = {
  settings: "settings",
  profiles: "bin-profiles",
  trucks: "trucks",
  collections: "collections",
  reports: "reports",
  classifications: "classifications",
} as const;

const PERSIST_KEYS = Object.values(KEYS);

export interface EcoState {
  settings: EcoSettings;
  /** Surveyed metadata per bin ID — the device only sends telemetry. */
  binProfiles: Record<string, BinProfile>;
  bins: Bin[];
  readings: BinReading[];
  trucks: Truck[];
  reports: CitizenReport[];
  collections: Collection[];
  classifications: Classification[];
  notifications: EcoNotification[];
  connection: ConnectionState;
  hydrated: boolean;

  hydrate: () => void;
  updateSettings: (patch: Partial<EcoSettings>) => void;
  resetSettings: () => void;
  refresh: () => Promise<void>;
  /** Re-read the channel's field labels and remap from them. */
  detectFieldMap: () => Promise<boolean>;

  upsertBinProfile: (binId: string, patch: Partial<BinProfile>) => void;
  removeBinProfile: (binId: string) => void;

  addTruck: (truck: Omit<Truck, "assignedBins" | "currentLoad"> & { currentLoad?: number }) => void;
  updateTruck: (id: string, patch: Partial<Truck>) => void;
  setTruckStatus: (id: string, status: TruckStatus) => void;
  removeTruck: (id: string) => void;
  assignTruck: (binId: string, truckId: string) => void;
  unassignBin: (binId: string) => void;

  markCollected: (binId: string, workerName?: string) => void;
  submitReport: (input: {
    binId: string;
    type: ReportType;
    description: string;
    location: string;
    photoName?: string | undefined;
  }) => CitizenReport;
  setReportStatus: (id: string, status: CitizenReport["status"]) => void;
  addClassification: (c: {
    category: WasteCategory;
    confidence: number;
    imageName?: string | undefined;
    binId?: string | undefined;
  }) => Classification;

  pushNotification: (n: Omit<EcoNotification, "id" | "createdAt" | "read">) => void;
  markNotificationsRead: () => void;
  clearNotifications: () => void;
  clearOperationalData: () => void;
}

let seq = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${(++seq).toString(36).toUpperCase()}`;

/** Status changes we have already alerted on, so refreshes do not spam. */
const alerted = new Map<string, string>();

const emptyConnection: ConnectionState = {
  live: false,
  loading: false,
  lastSync: null,
  entriesRead: 0,
  fieldLabels: {},
};

/**
 * Fold the municipality's own records into the live telemetry: citizen report
 * counts, the last recorded collection, the current truck assignment and the
 * offline grace period. Device-supplied priority (field5) is preserved as-is.
 */
function enrichBins(
  liveBins: Bin[],
  state: Pick<EcoState, "settings" | "collections" | "reports" | "trucks" | "binProfiles">,
): Bin[] {
  const { settings } = state;
  const offlineAfterMs = Math.max(1, settings.offlineAfterMinutes) * 60_000;
  const now = Date.now();

  const openReports = new Map<string, number>();
  for (const r of state.reports) {
    if (r.status === "resolved" || r.status === "rejected") continue;
    openReports.set(r.binId, (openReports.get(r.binId) ?? 0) + 1);
  }

  const lastCollected = new Map<string, string>();
  for (const c of state.collections) {
    const current = lastCollected.get(c.binId);
    if (!current || c.timestamp > current) lastCollected.set(c.binId, c.timestamp);
  }

  const assignedTo = new Map<string, string>();
  for (const t of state.trucks) {
    for (const binId of t.assignedBins) assignedTo.set(binId, t.id);
  }

  return liveBins.map((live) => {
    const profile = state.binProfiles[live.id];
    const stale = now - new Date(live.lastUpdated).getTime() > offlineAfterMs;
    const reports = openReports.get(live.id) ?? 0;
    const collected = lastCollected.get(live.id);

    const bin: Bin = {
      ...live,
      ...(profile
        ? {
            name: profile.name || live.name,
            ward: profile.ward || live.ward,
            latitude: profile.latitude,
            longitude: profile.longitude,
            locationApproximate: profile.approximate,
          }
        : {}),
      reports,
      ...(collected !== undefined ? { lastCollected: collected } : {}),
      ...(assignedTo.has(live.id) ? { assignedTruckId: assignedTo.get(live.id)! } : {}),
      status: stale ? "offline" : live.status,
    };

    if (bin.status === "offline") return { ...bin, priorityScore: 0 };
    // Trust the device's own priority when it publishes one; otherwise score it
    // here so citizen reports and waiting time still count.
    return bin.priorityFromDevice ? bin : { ...bin, priorityScore: priorityScore(bin) };
  });
}

/** Field maps are equal when every mapped field points at the same channel field. */
function sameFieldMap(a: EcoState["settings"]["fieldMap"], b: EcoState["settings"]["fieldMap"]) {
  return (Object.keys(a) as (keyof typeof a)[]).every((k) => a[k] === b[k]);
}

function persistAll(s: EcoState) {
  saveJson(KEYS.settings, s.settings);
  saveJson(KEYS.profiles, s.binProfiles);
  saveJson(KEYS.trucks, s.trucks);
  saveJson(KEYS.collections, s.collections);
  saveJson(KEYS.reports, s.reports);
  saveJson(KEYS.classifications, s.classifications);
}

export const useEco = create<EcoState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  binProfiles: {},
  bins: [],
  readings: [],
  trucks: [],
  reports: [],
  collections: [],
  classifications: [],
  notifications: [],
  connection: emptyConnection,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const stored = loadJson<Partial<EcoSettings>>(KEYS.settings, {});
    set((s) => ({
      hydrated: true,
      settings: {
        ...s.settings,
        ...stored,
        thresholds: { ...s.settings.thresholds, ...(stored.thresholds ?? {}) },
        fieldMap: { ...s.settings.fieldMap, ...(stored.fieldMap ?? {}) },
        notify: { ...s.settings.notify, ...(stored.notify ?? {}) },
      },
      binProfiles: loadJson<Record<string, BinProfile>>(KEYS.profiles, {}),
      trucks: loadJson<Truck[]>(KEYS.trucks, []),
      collections: loadJson<Collection[]>(KEYS.collections, []),
      reports: loadJson<CitizenReport[]>(KEYS.reports, []),
      classifications: loadJson<Classification[]>(KEYS.classifications, []),
    }));
  },

  updateSettings: (patch) => {
    set((s) => {
      const settings = { ...s.settings, ...patch };
      saveJson(KEYS.settings, settings);
      return { settings, bins: enrichBins(s.bins, { ...s, settings }) };
    });
  },

  resetSettings: () => {
    set((s) => {
      saveJson(KEYS.settings, DEFAULT_SETTINGS);
      return {
        settings: DEFAULT_SETTINGS,
        bins: enrichBins(s.bins, { ...s, settings: DEFAULT_SETTINGS }),
      };
    });
  },

  refresh: async () => {
    const { settings, binProfiles } = get();
    if (!settings.channelId.trim()) {
      set({
        connection: {
          ...emptyConnection,
          error: "No ThingSpeak channel configured.",
          lastSync: get().connection.lastSync,
        },
      });
      return;
    }

    set((s) => ({ connection: { ...s.connection, loading: true } }));
    let active = settings;
    let result = await fetchThingSpeak(active, binProfiles);

    // Channels rarely publish in the documented order. While the map is still
    // the untouched default, re-map from the channel's own field labels and
    // read again, so mis-attributed values are never shown even once.
    if (active.fieldMapSource === "default" && Object.keys(result.fieldLabels).length) {
      const suggested = suggestFieldMap(result.fieldLabels);
      if (suggested.fillLevel) {
        const changed = !sameFieldMap(suggested, active.fieldMap);
        active = { ...active, fieldMap: suggested, fieldMapSource: "detected" };
        saveJson(KEYS.settings, active);
        set({ settings: active });
        // Only pay for a second request when the map actually moved.
        if (changed) result = await fetchThingSpeak(active, binProfiles);
      }
    }

    if (!result.ok) {
      set((s) => ({
        connection: {
          live: false,
          loading: false,
          lastSync: s.connection.lastSync,
          error: result.error,
          channelName: result.channelName,
          entriesRead: result.entriesRead,
          fieldLabels: result.fieldLabels,
        },
      }));
      return;
    }

    set((s) => {
      // Register any bin ID seen for the first time so it gets a map marker and
      // an editable profile straight away.
      const profiles = { ...s.binProfiles };
      let profilesChanged = false;
      for (const bin of result.bins) {
        if (profiles[bin.id]) continue;
        const at = approximateLocation(bin.id);
        profiles[bin.id] = {
          name: `${bin.id} smart bin`,
          ward: "Unassigned ward",
          latitude: at.latitude,
          longitude: at.longitude,
          approximate: true,
        };
        profilesChanged = true;
      }
      if (profilesChanged) saveJson(KEYS.profiles, profiles);

      const bins = enrichBins(result.bins, { ...s, binProfiles: profiles });
      return {
        bins,
        readings: result.readings,
        binProfiles: profiles,
        connection: {
          live: true,
          loading: false,
          lastSync: result.fetchedAt,
          error: undefined,
          channelName: result.channelName,
          entriesRead: result.entriesRead,
          fieldLabels: result.fieldLabels,
        },
      };
    });

    // Alert once per bin per status change, after the state is settled.
    if (get().settings.notify.critical) {
      for (const bin of get().bins) {
        const previous = alerted.get(bin.id);
        if (previous === bin.status) continue;
        alerted.set(bin.id, bin.status);
        if (previous === undefined) continue; // First sighting is not an alert.
        if (bin.status === "critical") {
          get().pushNotification({
            level: "critical",
            title: `${bin.id} reached ${bin.fillLevel}%`,
            body: `Critical fill level on the ThingSpeak feed. Priority ${bin.priorityScore}/100 — added to the collection queue.`,
            binId: bin.id,
          });
        } else if (bin.status === "offline") {
          get().pushNotification({
            level: "warning",
            title: `${bin.id} stopped reporting`,
            body: `No entry for over ${get().settings.offlineAfterMinutes} minutes. Check the device or the Wi-Fi link.`,
            binId: bin.id,
          });
        }
      }
    }
  },

  detectFieldMap: async () => {
    const { settings, binProfiles } = get();
    if (!settings.channelId.trim()) return false;
    set((s) => ({ connection: { ...s.connection, loading: true } }));
    const probe = await fetchThingSpeak(settings, binProfiles);
    const labels = probe.fieldLabels;
    if (!Object.keys(labels).length) {
      set((s) => ({
        connection: {
          ...s.connection,
          loading: false,
          error: probe.error ?? "The channel does not name its fields, so they cannot be detected.",
          fieldLabels: labels,
        },
      }));
      return false;
    }
    const suggested = suggestFieldMap(labels);
    if (!suggested.fillLevel) {
      set((s) => ({
        connection: {
          ...s.connection,
          loading: false,
          error: "No field label looks like a fill level — map it by hand below.",
          fieldLabels: labels,
        },
      }));
      return false;
    }
    const next = { ...settings, fieldMap: suggested, fieldMapSource: "detected" as const };
    saveJson(KEYS.settings, next);
    set({ settings: next });
    await get().refresh();
    return true;
  },

  upsertBinProfile: (binId, patch) => {
    set((s) => {
      const existing = s.binProfiles[binId];
      const fallback = approximateLocation(binId);
      const profile: BinProfile = {
        name: patch.name ?? existing?.name ?? `${binId} smart bin`,
        ward: patch.ward ?? existing?.ward ?? "Unassigned ward",
        latitude: patch.latitude ?? existing?.latitude ?? fallback.latitude,
        longitude: patch.longitude ?? existing?.longitude ?? fallback.longitude,
        // Entering coordinates by hand is what makes a location authoritative.
        approximate:
          patch.approximate ??
          (patch.latitude !== undefined || patch.longitude !== undefined
            ? false
            : (existing?.approximate ?? true)),
      };
      const binProfiles = { ...s.binProfiles, [binId]: profile };
      saveJson(KEYS.profiles, binProfiles);
      return { binProfiles, bins: enrichBins(s.bins, { ...s, binProfiles }) };
    });
  },

  removeBinProfile: (binId) => {
    set((s) => {
      const binProfiles = { ...s.binProfiles };
      delete binProfiles[binId];
      saveJson(KEYS.profiles, binProfiles);
      return { binProfiles, bins: enrichBins(s.bins, { ...s, binProfiles }) };
    });
  },

  addTruck: (input) => {
    set((s) => {
      if (s.trucks.some((t) => t.id === input.id)) return s;
      const truck: Truck = { ...input, currentLoad: input.currentLoad ?? 0, assignedBins: [] };
      const trucks = [...s.trucks, truck];
      saveJson(KEYS.trucks, trucks);
      return { trucks };
    });
  },

  updateTruck: (id, patch) => {
    set((s) => {
      const trucks = s.trucks.map((t) => (t.id === id ? { ...t, ...patch } : t));
      saveJson(KEYS.trucks, trucks);
      return { trucks, bins: enrichBins(s.bins, { ...s, trucks }) };
    });
  },

  setTruckStatus: (id, status) => get().updateTruck(id, { status }),

  removeTruck: (id) => {
    set((s) => {
      const trucks = s.trucks.filter((t) => t.id !== id);
      saveJson(KEYS.trucks, trucks);
      return { trucks, bins: enrichBins(s.bins, { ...s, trucks }) };
    });
  },

  assignTruck: (binId, truckId) => {
    set((s) => {
      const trucks = s.trucks.map((t) => {
        if (t.id === truckId) {
          return {
            ...t,
            status: t.status === "offline" ? t.status : ("assigned" as TruckStatus),
            assignedBins: t.assignedBins.includes(binId)
              ? t.assignedBins
              : [...t.assignedBins, binId],
          };
        }
        // A bin belongs to exactly one truck.
        if (!t.assignedBins.includes(binId)) return t;
        return { ...t, assignedBins: t.assignedBins.filter((id) => id !== binId) };
      });
      saveJson(KEYS.trucks, trucks);
      return { trucks, bins: enrichBins(s.bins, { ...s, trucks }) };
    });
    get().pushNotification({
      level: "info",
      title: `${truckId} assigned to ${binId}`,
      body: "Assignment is visible in the worker app.",
      binId,
    });
  },

  unassignBin: (binId) => {
    set((s) => {
      const trucks = s.trucks.map((t) =>
        t.assignedBins.includes(binId)
          ? { ...t, assignedBins: t.assignedBins.filter((id) => id !== binId) }
          : t,
      );
      saveJson(KEYS.trucks, trucks);
      return { trucks, bins: enrichBins(s.bins, { ...s, trucks }) };
    });
  },

  markCollected: (binId, workerName) => {
    const bin = get().bins.find((b) => b.id === binId);
    if (!bin) return;
    const truck = get().trucks.find((t) => t.assignedBins.includes(binId));
    const now = new Date().toISOString();
    const collection: Collection = {
      id: nextId("COL"),
      binId,
      truckId: truck?.id ?? "unassigned",
      workerName: workerName ?? truck?.driver ?? "Field worker",
      collectedWeight: bin.weight,
      timestamp: now,
      durationMinutes: 0,
      status: "completed",
    };

    set((s) => {
      const collections = [collection, ...s.collections];
      const reports = s.reports.map((r) =>
        r.binId === binId && r.status !== "rejected" && r.status !== "resolved"
          ? { ...r, status: "resolved" as const }
          : r,
      );
      const trucks = s.trucks.map((t) =>
        t.id === truck?.id
          ? {
              ...t,
              assignedBins: t.assignedBins.filter((id) => id !== binId),
              currentLoad: Math.round((t.currentLoad + bin.weight / 1000) * 1000) / 1000,
              status:
                t.assignedBins.filter((id) => id !== binId).length > 0
                  ? ("collecting" as TruckStatus)
                  : ("available" as TruckStatus),
            }
          : t,
      );
      saveJson(KEYS.collections, collections);
      saveJson(KEYS.reports, reports);
      saveJson(KEYS.trucks, trucks);
      // Fill level is not reset here: the next ThingSpeak entry reports the
      // emptied bin. Inventing a 0% reading would be fabricated telemetry.
      return {
        collections,
        reports,
        trucks,
        bins: enrichBins(s.bins, { ...s, collections, reports, trucks }),
      };
    });

    if (get().settings.notify.collections) {
      get().pushNotification({
        level: "success",
        title: `${binId} marked collected`,
        body: `${bin.weight} kg logged by ${collection.workerName}. The next sensor entry will confirm the new fill level.`,
        binId,
      });
    }
  },

  submitReport: ({ binId, type, description, location, photoName }) => {
    const report: CitizenReport = {
      id: nextId("RPT"),
      binId: binId || "Unknown",
      type,
      description,
      location,
      status: "received",
      severity: type === "overflowing" ? "high" : type === "damaged" ? "medium" : "low",
      createdAt: new Date().toISOString(),
      photoName,
    };
    set((s) => {
      const reports = [report, ...s.reports];
      saveJson(KEYS.reports, reports);
      return { reports, bins: enrichBins(s.bins, { ...s, reports }) };
    });
    if (get().settings.notify.reports) {
      get().pushNotification({
        level: "warning",
        title: `${report.binId} received a citizen report`,
        body: `${report.id} — ${type.replace("-", " ")}. Added to the municipal workflow.`,
        binId: report.binId,
      });
    }
    return report;
  },

  setReportStatus: (id, status) => {
    set((s) => {
      const reports = s.reports.map((r) => (r.id === id ? { ...r, status } : r));
      saveJson(KEYS.reports, reports);
      return { reports, bins: enrichBins(s.bins, { ...s, reports }) };
    });
  },

  addClassification: ({ category, confidence, imageName, binId }) => {
    const c: Classification = {
      id: nextId("CLS"),
      category,
      confidence,
      recyclable: category === "plastic" || category === "metal",
      createdAt: new Date().toISOString(),
      imageName,
      binId,
    };
    set((s) => {
      const classifications = [c, ...s.classifications];
      saveJson(KEYS.classifications, classifications);
      return { classifications };
    });
    return c;
  },

  pushNotification: (n) =>
    set((s) => ({
      notifications: [
        { ...n, id: nextId("NTF"), createdAt: new Date().toISOString(), read: false },
        ...s.notifications,
      ].slice(0, 50),
    })),

  markNotificationsRead: () =>
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),

  clearNotifications: () => set({ notifications: [] }),

  clearOperationalData: () => {
    alerted.clear();
    set((s) => {
      const next = {
        collections: [],
        reports: [],
        classifications: [],
        notifications: [],
        trucks: s.trucks.map((t) => ({ ...t, assignedBins: [], currentLoad: 0 })),
      };
      persistAll({ ...s, ...next } as EcoState);
      return { ...next, bins: enrichBins(s.bins, { ...s, ...next }) };
    });
  },
}));

/** Wipe every persisted record, including settings. Used by the Settings page. */
export function resetEcoBin() {
  clearAll(PERSIST_KEYS);
  alerted.clear();
  useEco.setState({
    settings: DEFAULT_SETTINGS,
    binProfiles: {},
    bins: [],
    readings: [],
    trucks: [],
    reports: [],
    collections: [],
    classifications: [],
    notifications: [],
    connection: emptyConnection,
  });
}

/** Recompute a bin status preview without touching the store (Settings page). */
export const previewStatus = statusFromFill;
