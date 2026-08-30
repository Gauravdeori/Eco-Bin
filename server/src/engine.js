import { config } from './config.js';
import {
  STATE_KEYS,
  firestoreEnabled,
  listCommands,
  markCommandHandled,
  readState,
  writeState,
} from './firestore.js';

// The dashboard's own algorithms, imported unchanged. Every one of these
// modules is pure — no React, no DOM, no browser storage — which is why the
// intelligence moves to the server without being rewritten.
import { fetchAllChannels } from '../../src/services/thingspeak.js';
import {
  applyOverlays,
  buildBin,
  binPriority,
  priorityRanking,
} from '../../src/lib/telemetry.js';
import { planFleetRuns, sweepPartition } from '../../src/services/fleet.js';
import { emissionsFor } from '../../src/lib/emissions.js';

const depot = () => [config.depot.lat, config.depot.lng];

/**
 * Pulls every channel and turns the feeds into bins, with operator overlays
 * applied. This is the same pipeline the dashboard runs on each poll.
 */
export const loadBins = async () => {
  if (config.thingspeak.channels.length === 0) return { bins: [], errors: [] };

  const { results, errors } = await fetchAllChannels(config.thingspeak.channels, {
    results: config.thingspeak.historyPoints,
  });

  const telemetry = results.map((result, index) =>
    buildBin(result, {
      index,
      fieldMap: config.fieldMap,
      thresholds: config.thresholds,
      collectionDropPercent: config.collectionDropPercent,
      binMeta: {},
    }),
  );

  const [assignments, maintenance, reports] = await Promise.all([
    readState(STATE_KEYS.assignments, {}),
    readState(STATE_KEYS.maintenance, {}),
    readState(STATE_KEYS.reports, []),
  ]);

  const bins = telemetry.map((bin) =>
    applyOverlays(bin, { assignments, maintenance, reports }),
  );

  return { bins, errors, assignments };
};

/** The ranked fleet, most urgent first. */
export const rank = (bins) => priorityRanking(bins, { thresholds: config.thresholds });

/**
 * Chooses a truck for a bin.
 *
 * Trucks carry no position, so "nearest" is not a question this data can
 * answer. Fit is the honest rule instead: the smallest truck that can still
 * take the load, leaving the larger one free for the next full bin.
 */
const pickTruck = (bin, pool) => {
  const fits = pool.filter(
    (truck) => !truck.capacityKg || bin.weight === null || truck.capacityKg >= bin.weight,
  );
  return [...(fits.length ? fits : pool)].sort(
    (a, b) => (a.capacityKg ?? Infinity) - (b.capacityKg ?? Infinity),
  )[0];
};

/**
 * Assigns one bin to a free truck and records it where the dashboard reads it.
 * Returns what happened so the caller can report rather than guess.
 */
export const dispatchBin = async (channelId, { truckId = null, source = 'api' } = {}) => {
  const { bins } = await loadBins();
  const bin =
    bins.find((item) => item.channelId === String(channelId)) ??
    bins.find((item) => item.id === String(channelId));
  if (!bin) return { ok: false, reason: 'unknown-bin', channelId };

  // A bin already on its way is left alone. A workflow watching ThingSpeak
  // reports a bin as full for as long as it is full, so without this the same
  // bin is dispatched on every reading.
  if (bin.assignment) {
    return { ok: true, reason: 'already-assigned', bin: bin.id, truckId: bin.assignment.truckId };
  }

  const [trucks, assignments] = await Promise.all([
    readState(STATE_KEYS.trucks, []),
    readState(STATE_KEYS.assignments, {}),
  ]);

  const idle = trucks.filter((truck) => truck.status === 'IDLE');
  const truck = truckId
    ? trucks.find((item) => item.id === truckId)
    : idle.length
      ? pickTruck(bin, idle)
      : null;

  if (!truck) return { ok: false, reason: 'no-truck-free', bin: bin.id };

  const at = new Date().toISOString();
  await Promise.all([
    writeState(STATE_KEYS.assignments, {
      ...assignments,
      [bin.channelId]: { truckId: truck.id, driver: truck.driver, at, auto: true, source },
    }),
    writeState(
      STATE_KEYS.trucks,
      trucks.map((item) => (item.id === truck.id ? { ...item, status: 'ON_ROUTE' } : item)),
    ),
  ]);

  return { ok: true, bin: bin.id, channelId: bin.channelId, truckId: truck.id, driver: truck.driver, at };
};

/**
 * Splits everything that needs collecting across the free trucks and plans an
 * optimised run for each.
 */
export const planFleet = async ({ scope = 'DUE' } = {}) => {
  const { bins } = await loadBins();
  const positioned = bins.filter((bin) => bin.lat !== null && bin.lng !== null);

  const candidates =
    scope === 'ALL'
      ? positioned
      : positioned.filter(
          (bin) => binPriority(bin, { thresholds: config.thresholds }).needsCollection,
        );

  if (candidates.length === 0) return { ok: false, reason: 'nothing-due' };

  const [trucks, runs, assignments] = await Promise.all([
    readState(STATE_KEYS.trucks, []),
    readState(STATE_KEYS.runs, {}),
    readState(STATE_KEYS.assignments, {}),
  ]);

  const available = trucks.filter(
    (truck) => truck.status !== 'MAINTENANCE' && !runs[truck.id],
  );
  if (available.length === 0) return { ok: false, reason: 'no-trucks-free' };

  const stops = candidates.map((bin) => ({
    id: bin.channelId,
    name: bin.id,
    point: [bin.lat, bin.lng],
    loadKg: bin.weight ?? 0,
  }));

  const { groups, unassigned } = sweepPartition(stops, available, depot());
  const planned = await planFleetRuns(groups, {
    apiKey: config.routing.orsKey,
    depot: depot(),
    startedAt: Date.now(),
  });

  const nextRuns = { ...runs };
  const nextAssignments = { ...assignments };
  const at = new Date().toISOString();

  planned.forEach((run) => {
    nextRuns[run.truckId] = run;
    run.stops.forEach((channelId) => {
      nextAssignments[channelId] = {
        truckId: run.truckId,
        driver: run.driver,
        at,
        auto: true,
        source: 'server',
      };
    });
  });

  await Promise.all([
    writeState(STATE_KEYS.runs, nextRuns),
    writeState(STATE_KEYS.assignments, nextAssignments),
    writeState(
      STATE_KEYS.trucks,
      trucks.map((truck) =>
        planned.some((run) => run.truckId === truck.id)
          ? { ...truck, status: 'ON_ROUTE' }
          : truck,
      ),
    ),
  ]);

  return {
    ok: true,
    runs: planned.map((run) => ({
      truckId: run.truckId,
      driver: run.driver,
      stops: run.stopNames,
      loadKg: run.loadKg,
      distanceKm: Number((run.distanceM / 1000).toFixed(2)),
      minutes: Math.round(run.durationS / 60),
      co2Kg: Number(emissionsFor(run.distanceM, config.fleet.kmPerLitre).co2Kg.toFixed(1)),
      followsRoads: run.followsRoads,
      source: run.source,
    })),
    unassigned: unassigned.map((stop) => stop.name),
  };
};

/**
 * One pass of the engine: act on anything n8n has queued, then dispatch on the
 * fleet's own ranking if that has been switched on.
 *
 * This is what runs with nobody watching. The dashboard does the same work when
 * it is open; the two agree because they share the code and the record format.
 */
export const tick = async () => {
  const acted = [];

  if (firestoreEnabled) {
    const commands = await listCommands();
    for (const command of commands) {
      if (command.handledAt) continue;
      const ref = command.channelId ?? command.binId ?? command.bin;
      if (!ref) continue;

      const result = await dispatchBin(ref, {
        truckId: command.truckId ?? null,
        source: 'n8n',
      });
      await markCommandHandled(command.id, 'server');
      acted.push({ command: command.id, ...result });
    }
  }

  if (config.autoDispatch.enabled) {
    const { bins } = await loadBins();
    const due = rank(bins).filter(
      (entry) => entry.score >= config.autoDispatch.minScore && entry.needsCollection,
    );
    for (const entry of due) {
      if (entry.bin.assignment) continue;
      const result = await dispatchBin(entry.bin.channelId, { source: 'auto' });
      if (result.ok && !result.reason) acted.push({ auto: true, ...result });
    }
  }

  return acted;
};
