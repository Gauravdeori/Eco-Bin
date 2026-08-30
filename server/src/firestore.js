import { config } from './config.js';

/**
 * Firestore over its REST API.
 *
 * Deliberately not firebase-admin. The dashboard and this service have to agree
 * byte for byte on how a record is stored, and that format is already fixed: a
 * single `json` string field per document, because Firestore cannot hold an
 * array of arrays and a planned route is a list of [lat, lng] pairs. Speaking
 * REST keeps that contract in one obvious place instead of behind an SDK's
 * serialiser, and it drops a heavyweight dependency the service does not
 * otherwise need.
 *
 * Requests are unauthenticated, which works because the project's rules are
 * currently open. Tightening those rules is the point at which this file grows
 * a service-account token — see the note in the README.
 */

const BASE = 'https://firestore.googleapis.com/v1';

export const firestoreEnabled = Boolean(config.firebase.projectId);

const root = () =>
  `${BASE}/projects/${config.firebase.projectId}/databases/(default)/documents`;

const stateDoc = (key) =>
  `${root()}/ecobin/${config.firebase.workspace}/state/${encodeURIComponent(key)}`;

const commandsCollection = () =>
  `${root()}/ecobin/${config.firebase.workspace}/commands`;

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Firestore ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
};

/** Reads one shared record. Returns `fallback` when it has never been written. */
export const readState = async (key, fallback) => {
  if (!firestoreEnabled) return fallback;
  const doc = await request(stateDoc(key));
  const raw = doc?.fields?.json?.stringValue;
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

/** Writes one shared record in the shape the dashboard reads. */
export const writeState = async (key, value) => {
  if (!firestoreEnabled) return;
  await request(stateDoc(key), {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        json: { stringValue: JSON.stringify(value) },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });
};

/** Every dispatch command n8n has written, oldest first. */
export const listCommands = async () => {
  if (!firestoreEnabled) return [];
  const body = await request(commandsCollection());
  return (body?.documents ?? []).map((doc) => {
    const f = doc.fields ?? {};
    const plain = {};
    Object.entries(f).forEach(([k, v]) => {
      plain[k] = v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.timestampValue ?? null;
    });
    return { id: doc.name.split('/').pop(), ...plain };
  });
};

/** Marks a command dealt with so no other worker repeats it. */
export const markCommandHandled = async (id, by = 'server') => {
  if (!firestoreEnabled) return;
  await request(`${commandsCollection()}/${encodeURIComponent(id)}?updateMask.fieldPaths=handledAt&updateMask.fieldPaths=handledBy`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        handledAt: { timestampValue: new Date().toISOString() },
        handledBy: { stringValue: by },
      },
    }),
  });
};

/** Writes a command, which is what the POST /api/dispatch endpoint does. */
export const writeCommand = async (id, fields) => {
  if (!firestoreEnabled) return null;
  return request(`${commandsCollection()}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, { stringValue: String(v) }]),
      ),
    }),
  });
};

export const STATE_KEYS = {
  trucks: 'ecobin.trucks.v1',
  assignments: 'ecobin.assignments.v1',
  runs: 'ecobin.runs.v1',
  alerts: 'ecobin.alerts.v1',
  maintenance: 'ecobin.maintenance.v1',
  reports: 'ecobin.reports.v1',
};

/**
 * Publishes the freshest reading for one channel, where the dashboard's live
 * subscription picks it up within about a second. One document per bin,
 * overwritten in place — this is a "now" value, not a history.
 */
export const writeLiveReading = async (channelId, entry) => {
  if (!firestoreEnabled) return;
  await request(
    `${root()}/ecobin/${config.firebase.workspace}/live/${encodeURIComponent(channelId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          json: { stringValue: JSON.stringify(entry) },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      }),
    },
  );
};
