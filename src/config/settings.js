/**
 * Runtime configuration for the ThingSpeak link.
 *
 * Precedence: values saved from the Settings page (localStorage) override the
 * build-time `.env` values, so a channel can be swapped without a rebuild.
 */

const STORAGE_KEY = 'ecobin.settings.v1';

const env = import.meta.env;

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const csv = (value) =>
  String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/** Channels declared in `.env`, expanded into the shape the app stores. */
const envChannels = () => {
  const ids = csv(env.VITE_THINGSPEAK_CHANNELS);
  const keys = csv(env.VITE_THINGSPEAK_READ_KEYS);
  return ids.map((channelId, index) => ({
    channelId,
    // A single key is treated as "the key for every channel".
    readKey: keys.length === 1 ? keys[0] : keys[index] || '',
  }));
};

export const DEFAULT_SETTINGS = {
  channels: envChannels(),
  pollSeconds: num(env.VITE_THINGSPEAK_POLL_SECONDS, 15),
  historyPoints: num(env.VITE_THINGSPEAK_HISTORY, 100),
  fieldMap: {
    fill: num(env.VITE_FIELD_FILL, 1),
    weight: num(env.VITE_FIELD_WEIGHT, 2),
    battery: num(env.VITE_FIELD_BATTERY, 3),
    lat: num(env.VITE_FIELD_LAT, 4),
    lng: num(env.VITE_FIELD_LNG, 5),
    temperature: num(env.VITE_FIELD_TEMPERATURE, 6),
    humidity: num(env.VITE_FIELD_HUMIDITY, 7),
    lid: num(env.VITE_FIELD_LID, 8),
    // Waste category published by the on-device classifier.
    // 0 disables it; see AI Segregation page for the code the app expects.
    category: num(env.VITE_FIELD_CATEGORY, 0),
  },
  thresholds: {
    full: num(env.VITE_THRESHOLD_FULL, 80),
    filling: num(env.VITE_THRESHOLD_FILLING, 50),
  },
  /** Distance (in fill %) a reading must drop by to count as a collection. */
  collectionDropPercent: 25,
  /** Per-channel labels the operator adds by hand: ward, road name, capacity. */
  binMeta: {},
};

export const loadSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      fieldMap: { ...DEFAULT_SETTINGS.fieldMap, ...(saved.fieldMap || {}) },
      thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(saved.thresholds || {}) },
      binMeta: { ...DEFAULT_SETTINGS.binMeta, ...(saved.binMeta || {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage disabled — the app keeps working with in-memory settings */
  }
};

export const isConfigured = (settings) => settings.channels.length > 0;
