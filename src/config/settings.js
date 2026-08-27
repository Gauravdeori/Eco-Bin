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
  /**
   * Which ThingSpeak field carries which measurement. 0 means "my device does
   * not send this" — the dashboard then shows a dash instead of a number.
   *
   * Only fill and weight are on by default. Turn the others on in Settings if
   * and when the device starts publishing them.
   */
  fieldMap: {
    fill: num(env.VITE_FIELD_FILL, 1),
    weight: num(env.VITE_FIELD_WEIGHT, 2),
    battery: num(env.VITE_FIELD_BATTERY, 0),
    lat: num(env.VITE_FIELD_LAT, 0),
    lng: num(env.VITE_FIELD_LNG, 0),
    temperature: num(env.VITE_FIELD_TEMPERATURE, 0),
    humidity: num(env.VITE_FIELD_HUMIDITY, 0),
    // Waste category from an on-device classifier; see the AI Segregation page.
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
