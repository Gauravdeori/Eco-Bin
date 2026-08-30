/**
 * Runtime configuration for the ThingSpeak link.
 *
 * Precedence: values saved from the Settings page (localStorage) override the
 * build-time `.env` values, so a channel can be swapped without a rebuild.
 */

import { DEFAULT_KM_PER_LITRE } from '../lib/emissions';

const STORAGE_KEY = 'ecobin.settings.v1';

/**
 * Which shape the saved settings were last written in.
 *
 * Saving anything on the Settings page writes the whole object, so every
 * default that has ever been shown to an operator is frozen into their
 * localStorage — including defaults that later change. Bumping this is how a
 * changed default is allowed to reach a browser that has saved before, without
 * throwing away the settings the operator actually chose.
 *
 * Each step below is guarded by its own version rather than by "older than the
 * current one", so a later bump does not re-run an earlier migration.
 *
 * 2 — auto-dispatch became the default, and the n8n integration was removed.
 * 3 — the device moved to a new ThingSpeak channel, and the saved list had to
 *     stop pinning the old one.
 */
const SCHEMA = 3;

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

  /**
   * Hands-off dispatch.
   *
   * On by default: collection is the job this dashboard exists to do, and an
   * operator watching a bin go red and then pressing a button to say so is
   * work the app can do itself. A truck goes out when a bin is both urgent and
   * genuinely needs emptying — see the ranking in src/lib/telemetry.js — and
   * every dispatch is announced in the alert feed, so nothing happens silently.
   *
   * It can still be switched off on the Settings page, and the manual dispatch
   * buttons keep working alongside it either way.
   */
  autoDispatch: {
    enabled: env.VITE_AUTO_DISPATCH !== 'false',
    /**
     * Priority score a bin must reach before a truck is sent unprompted.
     *
     * Sixty is the score a bin has at exactly the configured full threshold,
     * whatever that threshold is set to — so this default means "dispatch as
     * soon as a bin is full". It used to be seventy, which a bin does not
     * reach until about 90% fill: bins sat marked Full with no truck coming,
     * which is the opposite of what switching automation on is for.
     */
    minScore: 60,
    /** How long a bin is left alone after an operator calls off its dispatch. */
    cooldownMinutes: 30,
  },

  /**
   * Simulated bins, so the dashboard can demonstrate routing and ranking
   * without a shelf of hardware. They sit alongside any real channels rather
   * than replacing them, are flagged `isSimulated`, and are badged everywhere
   * they appear — the rest of this app only ever shows numbers a device sent,
   * and a simulated bin is only allowed to break that because it says so.
   */
  simulation: { enabled: true, speed: 20 },

  /**
   * Where a collection run starts and ends. Falls back to the map centre,
   * which is the closest thing to a depot the app knows about until one is set.
   */
  depot: { lat: null, lng: null },

  /**
   * Fleet fuel economy, used for the fuel and CO₂ figures on a planned route.
   * Refuse trucks are heavy and stop constantly, so this is far lower than a
   * road vehicle: see src/lib/emissions.js for the arithmetic.
   */
  fleet: { kmPerLitre: DEFAULT_KM_PER_LITRE },

  /**
   * Where the location picker opens when a bin has no coordinate yet.
   * Set it to the city you operate in so you are not starting from a world map.
   */
  mapCenter: {
    lat: num(env.VITE_MAP_CENTER_LAT, 26.1445),
    lng: num(env.VITE_MAP_CENTER_LNG, 91.7362),
    zoom: num(env.VITE_MAP_CENTER_ZOOM, 13),
  },

  /**
   * OpenRouteService key, used for address search and driving routes.
   * Optional: without it, address search falls back to OSM Nominatim and the
   * collection route is unavailable. Map tiles never need a key.
   *
   * This is a browser app, so whatever is set here ships in the bundle and can
   * be read by anyone who loads the page. Use a key you are willing to expose.
   */
  orsKey: env.VITE_ORS_API_KEY ?? '',
  /** Per-channel labels the operator adds by hand: ward, road name, capacity. */
  binMeta: {},
  schema: SCHEMA,
};

export const loadSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    // `n8n` was dropped when the integration was removed; a browser that saved
    // while it existed still carries it, and it should not be handed on.
    const { n8n: _gone, ...saved } = JSON.parse(raw);

    const savedSchema = saved.schema ?? 1;

    /**
     * Settings saved before auto-dispatch became the default.
     *
     * Those browsers hold `autoDispatch.enabled: false` — not because anyone
     * chose it, but because it was the default on the day they first opened
     * Settings, and a saved value beats a default. Left alone, changing the
     * default would have reached nobody who had ever used the app. The
     * operator's threshold and cooldown are their own and are kept.
     */
    const savedAuto =
      savedSchema < 2
        ? { ...saved.autoDispatch, enabled: DEFAULT_SETTINGS.autoDispatch.enabled }
        : saved.autoDispatch;

    /**
     * Settings saved while the device was on its previous channel.
     *
     * The saved list beating `.env` is the right rule day to day — it is what
     * lets a channel be swapped from the Settings page without a rebuild — but
     * it also means editing `.env` to point at a new channel reaches nobody who
     * has ever saved. The dashboard would go on polling a channel the device
     * stopped publishing to, showing the last reading it ever got and calling
     * it live. So the environment wins once, here, and the saved list goes back
     * to winning immediately afterwards.
     */
    const adoptEnvChannels = savedSchema < 3 && DEFAULT_SETTINGS.channels.length > 0;
    const savedChannels = adoptEnvChannels ? DEFAULT_SETTINGS.channels : saved.channels;

    /**
     * The bin's own details follow it to the new channel.
     *
     * Ward, road name, capacity and — the one that matters — the sensor
     * calibration are keyed by channel id, so a channel swap would strand all
     * of them and leave the bin reading raw sensor numbers as percentages
     * again. Only the unambiguous case is moved: one channel replaced by one
     * channel is the same bin with a new id behind it. Anything already saved
     * against the new id is the operator's and is left alone.
     */
    const movedMeta = {};
    if (
      adoptEnvChannels &&
      saved.channels?.length === 1 &&
      DEFAULT_SETTINGS.channels.length === 1 &&
      saved.channels[0].channelId !== DEFAULT_SETTINGS.channels[0].channelId
    ) {
      const from = saved.binMeta?.[saved.channels[0].channelId];
      const to = DEFAULT_SETTINGS.channels[0].channelId;
      if (from && !saved.binMeta?.[to]) movedMeta[to] = from;
    }

    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      schema: SCHEMA,
      /**
       * A blank saved key must not hide a configured one.
       *
       * Saving anything on the Settings page writes the whole object, so a
       * visit made before the key was put in `.env` stored `orsKey: ''` — and
       * because saved values win over defaults, that empty string then masked
       * the real key for good. Routes quietly fell back to straight lines with
       * a perfectly valid key sitting in the file.
       */
      orsKey: saved.orsKey?.trim() ? saved.orsKey : DEFAULT_SETTINGS.orsKey,
      /**
       * Same trap as the key above: an empty saved list would hide a channel
       * configured in `.env`, because saved values win over defaults. A list
       * with channels in it is the operator's own choice and is left alone;
       * an empty one is not a configuration anybody wants, so the environment
       * gets to fill it.
       */
      channels: savedChannels?.length ? savedChannels : DEFAULT_SETTINGS.channels,
      fieldMap: { ...DEFAULT_SETTINGS.fieldMap, ...(saved.fieldMap || {}) },
      thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(saved.thresholds || {}) },
      autoDispatch: { ...DEFAULT_SETTINGS.autoDispatch, ...(savedAuto || {}) },
      simulation: { ...DEFAULT_SETTINGS.simulation, ...(saved.simulation || {}) },
      depot: { ...DEFAULT_SETTINGS.depot, ...(saved.depot || {}) },
      fleet: { ...DEFAULT_SETTINGS.fleet, ...(saved.fleet || {}) },
      mapCenter: { ...DEFAULT_SETTINGS.mapCenter, ...(saved.mapCenter || {}) },
      binMeta: { ...DEFAULT_SETTINGS.binMeta, ...(saved.binMeta || {}), ...movedMeta },
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
