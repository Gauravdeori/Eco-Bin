/**
 * Simulated bins, for demonstrating the dashboard without a shelf of hardware.
 *
 * These are NOT telemetry. Every bin produced here is flagged `isSimulated` and
 * the UI badges it, because the one rule the rest of this codebase keeps is that
 * a number on screen came from a device. A simulated bin is allowed to invent
 * its readings precisely because it is labelled as invented everywhere it shows.
 *
 * The model is a sawtooth: each bin fills at its own steady rate, gets collected
 * near the top, and starts again. That is enough to exercise the parts of the
 * app that need history — fill rate, collection detection, the priority ranking
 * and the collection trend — rather than a flat number that never moves.
 */

import { STATUS, deriveStatus, findCollections } from './telemetry.js';

/** Fixed anchor so a reload shows the same fleet, not a reshuffled one. */
const ANCHOR = Date.UTC(2026, 0, 1);
const HOUR = 60 * 60 * 1000;

/**
 * Five kerbside sites, placed as offsets from the configured map centre so the
 * demo lands on real streets whichever city the operator has set.
 */
const SITES = [
  { id: 'Station Road', ward: 'Ward 3', location: 'Station Road, near the taxi stand', dLat: 0.0135, dLng: -0.0180, cycleHours: 24, phaseHours: 0, capacityKg: 180, battery: 96 },
  { id: 'Market Complex', ward: 'Ward 5', location: 'Municipal market, gate 2', dLat: -0.0092, dLng: 0.0165, cycleHours: 12, phaseHours: 3, capacityKg: 240, battery: 81 },
  { id: 'Riverside Park', ward: 'Ward 7', location: 'Riverside park, main path', dLat: 0.0210, dLng: 0.0088, cycleHours: 24, phaseHours: 8, capacityKg: 120, battery: 63 },
  { id: 'Civil Hospital', ward: 'Ward 2', location: 'Civil hospital, outpatient block', dLat: -0.0175, dLng: -0.0125, cycleHours: 24, phaseHours: 16, capacityKg: 200, battery: 14 },
  { id: 'Bus Terminus', ward: 'Ward 9', location: 'Inter-state bus terminus, bay 4', dLat: 0.0048, dLng: 0.0262, cycleHours: 12, phaseHours: 9, capacityKg: 160, battery: 88 },
];

/** Percentage points a site gains each hour, from its emptying cycle. */
const rateOf = (site) => 95 / site.cycleHours;

/**
 * Fill level this site would be showing at `at`.
 *
 * Every cycle divides evenly into 24 hours, so the fleet repeats a daily
 * pattern with no drift: the sawtooth stays continuous across midnight, and
 * the phases stay spread instead of slowly sliding into step with each other
 * and leaving the whole fleet empty at the same moment.
 *
 * `collectedAt` re-anchors the cycle. When a simulated truck reaches a bin it
 * stamps the time, and from that moment the bin fills from empty again — which
 * puts a genuine cliff in the reading history, so the app's own collection
 * detection notices it exactly as it would on real hardware. Nothing special
 * cases a simulated pickup downstream.
 */
const fillAt = (site, at, collectedAt = null) => {
  const anchor = collectedAt !== null && at >= collectedAt ? collectedAt : ANCHOR;
  const phase = anchor === ANCHOR ? site.phaseHours : 0;
  const hours = (at - anchor) / HOUR + phase;
  const position = ((hours % site.cycleHours) + site.cycleHours) % site.cycleHours;
  return Math.max(2, Math.min(99, Math.round(position * rateOf(site))));
};

/**
 * One simulated bin, in the exact shape `buildBin` returns so that every
 * consumer — overlays, ranking, dispatch, charts — treats it like any other.
 */
const buildSimBin = (site, index, { centre, thresholds, now, collectedAt = null, historyHours = 24, stepMinutes = 15 }) => {
  const readings = [];
  const steps = Math.floor((historyHours * 60) / stepMinutes);

  for (let i = steps; i >= 0; i -= 1) {
    const at = new Date(now - i * stepMinutes * 60 * 1000);
    const fill = fillAt(site, at.getTime(), collectedAt);
    readings.push({
      at,
      entryId: steps - i + 1,
      fill,
      // Denser waste at the bottom, so weight trails fill slightly.
      weight: Math.round(site.capacityKg * (fill / 100) * 0.92 * 10) / 10,
      battery: site.battery,
      lat: null,
      lng: null,
      temperature: null,
      humidity: null,
      category: null,
    });
  }

  const latest = readings[readings.length - 1];
  const collections = findCollections(readings, 25);
  const lat = centre.lat + site.dLat;
  const lng = centre.lng + site.dLng;

  return {
    id: site.id,
    channelId: `sim-${index + 1}`,
    isSimulated: true,
    location: site.location,
    ward: site.ward,
    capacityKg: site.capacityKg,
    fill: latest.fill,
    weight: latest.weight,
    battery: site.battery,
    temperature: null,
    humidity: null,
    category: null,
    lat,
    lng,
    positionSource: 'manual',
    positionWarning: null,
    lastSeen: latest.at,
    silentFor: now - latest.at.getTime(),
    isOffline: false,
    telemetryStatus: deriveStatus(latest.fill, { thresholds, isOffline: false }),
    readings,
    collections,
    lastCollected: collections.length ? collections[collections.length - 1].at : null,
    lastEntryId: latest.entryId,
  };
};

export const SIMULATED_COUNT = SITES.length;

/**
 * The simulated fleet as of `now`.
 *
 * `collections` maps a channel id to when a truck last emptied it, so a bin a
 * simulated truck has reached restarts from empty instead of carrying on up
 * its own curve.
 */
export const simulatedBins = ({ centre, thresholds, now = Date.now(), collections = {} }) =>
  SITES.map((site, index) =>
    buildSimBin(site, index, {
      centre,
      thresholds,
      now,
      collectedAt: collections[`sim-${index + 1}`] ?? null,
    }),
  );

export { STATUS };
