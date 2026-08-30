import 'dotenv/config';

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const csv = (value) =>
  String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Channels are given the same way the dashboard takes them: ids and keys as
 * parallel lists, with a single key meaning "the key for every channel".
 */
const channels = () => {
  const ids = csv(process.env.THINGSPEAK_CHANNELS);
  const keys = csv(process.env.THINGSPEAK_READ_KEYS);
  return ids.map((channelId, index) => ({
    channelId,
    readKey: keys.length === 1 ? keys[0] : keys[index] || '',
  }));
};

export const config = {
  port: num(process.env.PORT, 8787),

  thingspeak: {
    channels: channels(),
    historyPoints: num(process.env.THINGSPEAK_HISTORY, 100),
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    workspace: process.env.FIREBASE_WORKSPACE || 'default',
  },

  /**
   * Field mapping. 0 means "the device does not send this", matching the
   * dashboard, so a measurement nobody publishes stays null rather than zero.
   */
  fieldMap: {
    fill: num(process.env.FIELD_FILL, 1),
    weight: num(process.env.FIELD_WEIGHT, 2),
    battery: num(process.env.FIELD_BATTERY, 0),
    lat: num(process.env.FIELD_LAT, 0),
    lng: num(process.env.FIELD_LNG, 0),
    temperature: num(process.env.FIELD_TEMPERATURE, 0),
    humidity: num(process.env.FIELD_HUMIDITY, 0),
    category: num(process.env.FIELD_CATEGORY, 0),
  },

  thresholds: {
    full: num(process.env.THRESHOLD_FULL, 80),
    filling: num(process.env.THRESHOLD_FILLING, 50),
  },

  collectionDropPercent: num(process.env.COLLECTION_DROP_PERCENT, 25),

  depot: {
    lat: num(process.env.DEPOT_LAT, 26.1445),
    lng: num(process.env.DEPOT_LNG, 91.7362),
  },

  fleet: {
    kmPerLitre: num(process.env.FLEET_KM_PER_LITRE, 2.8),
  },

  routing: {
    orsKey: process.env.ORS_API_KEY || '',
  },

  /** How often the engine wakes on its own, with nobody asking it to. */
  tickSeconds: num(process.env.TICK_SECONDS, 60),

  /** Score a bin must reach before the engine sends a truck unprompted. */
  autoDispatch: {
    enabled: process.env.AUTO_DISPATCH === 'true',
    minScore: num(process.env.AUTO_DISPATCH_MIN_SCORE, 70),
  },

  /** Shared secret for the write endpoints. Empty disables the check. */
  apiToken: process.env.API_TOKEN || '',
};

export const configured = config.thingspeak.channels.length > 0;
