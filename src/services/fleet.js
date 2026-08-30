/**
 * Splitting a round across a fleet.
 *
 * One optimised route is a solved problem (see planRoute). Several trucks is a
 * different question: *which* bins each truck takes, decided before any route
 * is drawn, because the split determines far more of the total distance than
 * the ordering within it does.
 */

import { haversineM, optimiseOrder, planRoute, tourCost } from './routing.js';

/** Angle of a stop around the depot, 0 to 2π, going anticlockwise from east. */
const bearing = ([depotLat, depotLng], [lat, lng]) => {
  const angle = Math.atan2(lat - depotLat, lng - depotLng);
  return angle < 0 ? angle + 2 * Math.PI : angle;
};

/** Fills trucks in order from a given rotation of the sweep. */
const fillFrom = (ordered, trucks) => {
  const groups = trucks.map((truck) => ({ truck, stops: [], loadKg: 0 }));
  const evenShare = Math.ceil(ordered.length / trucks.length);
  const unassigned = [];

  let cursor = 0;
  ordered.forEach((stop) => {
    while (cursor < groups.length) {
      const group = groups[cursor];
      const capacity = group.truck.capacityKg;
      const fits = capacity
        ? group.loadKg + stop.loadKg <= capacity
        : group.stops.length < evenShare;

      if (fits) {
        group.stops.push(stop);
        group.loadKg += stop.loadKg;
        return;
      }
      // This truck is full; the sweep moves on to the next one.
      cursor += 1;
    }
    // Every truck is full. The bin waits for the next round rather than being
    // silently dropped — the caller reports it.
    unassigned.push(stop);
  });

  return { groups: groups.filter((group) => group.stops.length > 0), unassigned };
};

/** Roughly what a split would cost to drive, for comparing two of them. */
const estimateCost = ({ groups, unassigned }, depot) => {
  // A stop nobody can take is worse than any amount of driving, so strand as
  // few as possible before optimising distance at all.
  let total = unassigned.length * 1e9;

  groups.forEach((group) => {
    const points = [depot, ...group.stops.map((stop) => stop.point)];
    const matrix = points.map((from) => points.map((to) => haversineM(from, to)));
    total += tourCost(matrix, optimiseOrder(matrix, { roundTrip: true }), true);
  });

  return total;
};

/**
 * Sweep partitioning: order the bins by angle around the depot, then walk that
 * circle handing contiguous wedges to each truck until it is full.
 *
 * The classic vehicle-routing heuristic, and it holds up because a wedge is
 * naturally compact — every bin in a run lies in roughly the same direction
 * from the depot, so no truck crosses the city for a stop another truck drove
 * straight past. Splitting by fill level or by name gives interleaved routes
 * that each cover the whole map.
 *
 * Where the sweep *starts* matters as much as the order: cutting the circle at
 * a bad angle splits a tight cluster across two trucks. Rather than picking an
 * arbitrary north, every stop is tried as the starting angle and the cheapest
 * split wins. That is one cheap straight-line estimate per rotation, which at
 * the size a real round runs to is nothing.
 *
 * Capacity is respected where it is known. A truck with no stated capacity gets
 * an even share of the stops instead, so an unconfigured fleet still splits.
 */
export const sweepPartition = (stops, trucks, depot) => {
  if (trucks.length === 0 || stops.length === 0) {
    return { groups: [], unassigned: [...stops] };
  }

  const ordered = [...stops].sort(
    (a, b) => bearing(depot, a.point) - bearing(depot, b.point),
  );

  let best = null;
  let bestCost = Infinity;

  for (let start = 0; start < ordered.length; start += 1) {
    const rotated = [...ordered.slice(start), ...ordered.slice(0, start)];
    const candidate = fillFrom(rotated, trucks);
    const cost = estimateCost(candidate, depot);
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  }

  return best;
};

/**
 * Where along a path each stop falls, as a fraction of the whole run.
 *
 * The drawn route is road geometry with no idea which of its hundreds of points
 * are bins, so each stop is matched to its nearest vertex. That is what lets a
 * moving truck know it has arrived rather than guessing from elapsed time.
 */
export const stopFractions = (path, stopPoints) => {
  if (!path || path.length < 2) return stopPoints.map((_, i) => (i + 1) / stopPoints.length);

  const cumulative = [0];
  for (let i = 1; i < path.length; i += 1) {
    cumulative.push(cumulative[i - 1] + haversineM(path[i - 1], path[i]));
  }
  const total = cumulative[cumulative.length - 1];
  if (total === 0) return stopPoints.map((_, i) => (i + 1) / stopPoints.length);

  // Stops are visited in order, so each search starts where the last one ended.
  // Without that, a route that doubles back matches a stop to the wrong pass.
  let from = 0;
  return stopPoints.map((point) => {
    let bestIndex = from;
    let bestDistance = Infinity;
    for (let i = from; i < path.length; i += 1) {
      const distance = haversineM(path[i], point);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    from = bestIndex;
    return cumulative[bestIndex] / total;
  });
};

/**
 * Thins a road geometry for storage. ORS returns a point every few metres,
 * which is more shape than a moving marker needs and more than localStorage
 * should carry for a whole fleet.
 */
export const decimatePath = (path, max = 200) => {
  if (!path || path.length <= max) return path;
  const step = (path.length - 1) / (max - 1);
  const thinned = [];
  for (let i = 0; i < max; i += 1) thinned.push(path[Math.round(i * step)]);
  return thinned;
};

/** A point `fraction` of the way along a path, by distance rather than by index. */
export const positionAlong = (path, fraction) => {
  if (!path || path.length === 0) return null;
  if (path.length === 1) return path[0];

  const clamped = Math.max(0, Math.min(1, fraction));
  const legs = [];
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const leg = haversineM(path[i - 1], path[i]);
    legs.push(leg);
    total += leg;
  }
  if (total === 0) return path[0];

  let remaining = clamped * total;
  for (let i = 0; i < legs.length; i += 1) {
    if (remaining <= legs[i]) {
      const t = legs[i] === 0 ? 0 : remaining / legs[i];
      const [aLat, aLng] = path[i];
      const [bLat, bLng] = path[i + 1];
      return [aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t];
    }
    remaining -= legs[i];
  }
  return path[path.length - 1];
};

/**
 * Plans one optimised run per truck.
 *
 * Routes are fetched one at a time rather than in parallel: OpenRouteService
 * rate-limits per second, and a fleet of six firing at once trips it.
 */
export const planFleetRuns = async (groups, { apiKey, signal, depot, startedAt }) => {
  const runs = [];

  for (const group of groups) {
    const plan = await planRoute(
      group.stops.map((stop) => stop.point),
      { apiKey, signal, depot },
    );

    // planRoute returns the driving order; re-seat the stops into it.
    const ordered = plan.stopOrder.map((index) => group.stops[index]);
    // Thin first, then measure against the thinned path: a marker moving along
    // one geometry while its arrival points were measured on another drifts.
    const path = decimatePath(plan.path);

    runs.push({
      truckId: group.truck.id,
      driver: group.truck.driver,
      stops: ordered.map((stop) => stop.id),
      stopNames: ordered.map((stop) => stop.name),
      loadKg: Math.round(group.loadKg),
      path,
      fractions: stopFractions(path, ordered.map((stop) => stop.point)),
      distanceM: plan.distanceM,
      durationS: plan.durationS,
      plannedDistanceM: plan.plannedDistanceM,
      unorderedDistanceM: plan.unorderedDistanceM,
      followsRoads: plan.followsRoads,
      source: plan.source,
      depot,
      startedAt,
      collected: [],
    });
  }

  return runs;
};

/**
 * Screen bearing from one point to the next, in degrees clockwise from north.
 * Used to point a moving marker along its route rather than leaving it fixed.
 */
export const headingDeg = (from, to) => {
  if (!from || !to) return 0;
  const dLat = to[0] - from[0];
  const dLng = to[1] - from[1];
  if (dLat === 0 && dLng === 0) return 0;
  return (Math.atan2(dLng, dLat) * 180) / Math.PI;
};
