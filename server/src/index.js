import express from 'express';
import cors from 'cors';

import { config, configured } from './config.js';
import { firestoreEnabled, writeCommand } from './firestore.js';
import { dispatchBin, loadBins, planFleet, rank, tick } from './engine.js';
import { emissionsFor } from '../../src/lib/emissions.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

/**
 * Shared-secret check on anything that moves a truck.
 *
 * Reads stay open because they expose nothing an operator would mind; writes do
 * not, because a stranger who can reach this port should not be able to send a
 * vehicle across the city. With no token configured the check is skipped, which
 * keeps local development friction-free and is called out in the README.
 */
const authorised = (req, res, next) => {
  if (!config.apiToken) return next();
  const supplied = req.get('x-api-token') ?? req.query.token;
  if (supplied === config.apiToken) return next();
  return res.status(401).json({ ok: false, error: 'Bad or missing API token.' });
};

const wrap = (handler) => (req, res) => {
  handler(req, res).catch((error) => {
    res.status(500).json({ ok: false, error: error.message });
  });
};

/* ── status ─────────────────────────────────────────────────────────────── */

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ecobin-server',
    channels: config.thingspeak.channels.length,
    firestore: firestoreEnabled ? config.firebase.projectId : 'not configured',
    autoDispatch: config.autoDispatch.enabled
      ? `on at score >= ${config.autoDispatch.minScore}`
      : 'off',
    tickSeconds: config.tickSeconds,
  });
});

/* ── reading the fleet ──────────────────────────────────────────────────── */

app.get(
  '/api/bins',
  wrap(async (_req, res) => {
    const { bins, errors } = await loadBins();
    res.json({
      ok: true,
      errors,
      bins: rank(bins).map((entry) => ({
        channelId: entry.bin.channelId,
        name: entry.bin.id,
        fill: entry.bin.fill,
        weight: entry.bin.weight,
        weightHeld: entry.bin.weightHeld,
        status: entry.bin.status,
        score: entry.score,
        level: entry.level,
        needsCollection: entry.needsCollection,
        reasons: entry.reasons,
        assignedTo: entry.bin.assignment?.truckId ?? null,
      })),
    });
  }),
);

/* ── dispatch ───────────────────────────────────────────────────────────── */

/**
 * The webhook n8n has been looking for.
 *
 * POST a bin and a truck goes out — the whole decision runs here, so it works
 * whether or not anybody has the dashboard open.
 */
app.post(
  '/api/dispatch',
  authorised,
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const ref = body.channelId ?? body.channel_id ?? body.binId ?? body.bin_id ?? body.bin;
    if (!ref) {
      return res.status(400).json({
        ok: false,
        error: 'Name a bin: send { "channelId": "2345678" }.',
      });
    }

    const action = String(body.action ?? body.status ?? 'DISPATCH').toUpperCase();
    if (!['DISPATCH', 'ASSIGN', 'COLLECT', 'FULL'].includes(action)) {
      return res.json({ ok: true, ignored: true, reason: `action ${action} is not a dispatch` });
    }

    const result = await dispatchBin(ref, { truckId: body.truckId ?? null, source: 'api' });

    // Mirror it into Firestore so an open dashboard shows the same history.
    if (firestoreEnabled && result.ok && !result.reason) {
      const id = body.commandId ?? `api-${Date.now()}`;
      await writeCommand(id, {
        channelId: String(ref),
        action: 'DISPATCH',
        handledAt: new Date().toISOString(),
        handledBy: 'server',
      }).catch(() => {});
    }

    res.status(result.ok ? 200 : 409).json(result);
  }),
);

/** Plans a run for every free truck across everything that needs collecting. */
app.post(
  '/api/plan',
  authorised,
  wrap(async (req, res) => {
    const result = await planFleet({ scope: req.body?.scope ?? 'DUE' });
    res.status(result.ok ? 200 : 409).json(result);
  }),
);

/** Runs one engine pass immediately, instead of waiting for the next tick. */
app.post(
  '/api/tick',
  authorised,
  wrap(async (_req, res) => {
    res.json({ ok: true, acted: await tick() });
  }),
);

/* ── impact ─────────────────────────────────────────────────────────────── */

app.get(
  '/api/emissions',
  wrap(async (req, res) => {
    const km = Number(req.query.km);
    if (!Number.isFinite(km)) {
      return res.status(400).json({ ok: false, error: 'Pass ?km=<distance>.' });
    }
    const e = emissionsFor(km * 1000, config.fleet.kmPerLitre);
    res.json({
      ok: true,
      km: e.km,
      litres: Number(e.litres.toFixed(2)),
      co2Kg: Number(e.co2Kg.toFixed(2)),
      assumes: `${config.fleet.kmPerLitre} km/L diesel at 2.68 kg CO2 per litre`,
    });
  }),
);

app.use((_req, res) => res.status(404).json({ ok: false, error: 'No such endpoint.' }));

/* ── start ──────────────────────────────────────────────────────────────── */

app.listen(config.port, () => {
  console.log(`ecobin-server listening on http://localhost:${config.port}`);
  console.log(`  channels     ${config.thingspeak.channels.length}`);
  console.log(`  firestore    ${firestoreEnabled ? config.firebase.projectId : 'not configured'}`);
  console.log(`  auto-dispatch ${config.autoDispatch.enabled ? `on at >= ${config.autoDispatch.minScore}` : 'off'}`);
  if (!configured) {
    console.log('  note: no ThingSpeak channels set — /api/bins will be empty.');
  }
  if (!config.apiToken) {
    console.log('  note: API_TOKEN is unset, so write endpoints are unauthenticated.');
  }
});

/**
 * The heartbeat. This is the part that makes the service worth running: the
 * engine wakes on its own, so a bin that fills at four in the morning is
 * collected without anybody having a browser tab open.
 */
setInterval(() => {
  tick()
    .then((acted) => {
      if (acted.length) console.log(`[tick] ${acted.length} dispatched`, acted);
    })
    .catch((error) => console.error('[tick] failed:', error.message));
}, Math.max(10, config.tickSeconds) * 1000);
