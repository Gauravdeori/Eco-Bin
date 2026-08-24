import type { EcoSettings, ThingSpeakFieldMap } from "@/types/ecobin";

/**
 * Central EcoBin configuration.
 *
 * The default field map mirrors the EcoBin device pipeline:
 *   Wokwi ESP32 (ultrasonic + load cell + LED/buzzer)
 *     -> Wi-Fi / HTTP -> ThingSpeak channel
 *        field1 Fill Level (%)
 *        field2 Weight (kg)
 *        field3 Status
 *        field4 Bin ID
 *        field5 Priority
 *     -> EcoBin dashboard
 *
 * Field names live here and nowhere else; operators can remap them in Settings
 * when their sketch publishes in a different order.
 */
export const DEFAULT_FIELD_MAP: ThingSpeakFieldMap = {
  fillLevel: "field1",
  weight: "field2",
  status: "field3",
  binId: "field4",
  priority: "field5",
  // Optional — blank means "the device does not publish battery".
  battery: "",
};

export const MUNICIPALITY = "Dibrugarh Municipal Board";
export const DEPOT = { name: "Central Depot, Dibrugarh", lat: 27.4728, lng: 94.912 };

export const DEFAULT_SETTINGS: EcoSettings = {
  thresholds: { filling: 50, high: 75, critical: 90 },
  refreshIntervalSec: 15,
  historyDepth: 100,
  // Optional build-time defaults; both stay blank when the vars are unset.
  channelId: (import.meta.env?.["VITE_THINGSPEAK_CHANNEL_ID"] as string | undefined) ?? "",
  readApiKey: (import.meta.env?.["VITE_THINGSPEAK_READ_API_KEY"] as string | undefined) ?? "",
  fieldMap: DEFAULT_FIELD_MAP,
  fieldMapSource: "default",
  offlineAfterMinutes: 30,
  notify: { critical: true, reports: true, trucks: true, collections: true },
};

export const STATUS_LABEL: Record<string, string> = {
  normal: "Normal",
  filling: "Filling",
  high: "High Priority",
  critical: "Critical",
  offline: "Offline",
};

/** Human-readable description of each mappable ThingSpeak field. */
export const FIELD_DOCS: {
  key: keyof ThingSpeakFieldMap;
  label: string;
  hint: string;
  required: boolean;
}[] = [
  {
    key: "fillLevel",
    label: "Fill level (%)",
    hint: "Ultrasonic sensor reading, 0–100.",
    required: true,
  },
  { key: "weight", label: "Weight (kg)", hint: "Load cell reading in kilograms.", required: false },
  {
    key: "status",
    label: "Status",
    hint: "0/1/2/3 or normal/filling/high/critical. Blank derives status from fill level.",
    required: false,
  },
  {
    key: "binId",
    label: "Bin ID",
    hint: "Identifies the bin. Blank groups every entry into one bin.",
    required: false,
  },
  {
    key: "priority",
    label: "Priority",
    hint: "0–100 from the device. Blank makes EcoBin compute it.",
    required: false,
  },
  {
    key: "battery",
    label: "Battery (%)",
    hint: "Optional. Leave blank if unused.",
    required: false,
  },
];
