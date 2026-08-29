/**
 * OpenRouteService client — address lookup and road routing.
 *
 * ORS does not serve map tiles; the basemap stays OpenStreetMap. This is used
 * for two things the dashboard cannot do on its own: turning a road name into
 * a coordinate, and working out the driving route between bins.
 *
 * Without a key, geocoding falls back to OSM Nominatim and routing is skipped.
 */

const ORS = 'https://api.openrouteservice.org';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export class RoutingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RoutingError';
  }
}

const explain = async (response) => {
  if (response.status === 403 || response.status === 401) {
    return 'OpenRouteService rejected the API key. Check it in Settings.';
  }
  if (response.status === 429) {
    return 'OpenRouteService daily quota reached. It resets at midnight UTC.';
  }
  try {
    const body = await response.json();
    return body?.error?.message ?? `OpenRouteService returned ${response.status}.`;
  } catch {
    return `OpenRouteService returned ${response.status}.`;
  }
};

/** Address search. Returns [{ label, lat, lng }]. */
export const geocode = async (text, { apiKey, signal, limit = 5 } = {}) => {
  const query = text.trim();
  if (!query) return [];

  if (apiKey) {
    const url = new URL(`${ORS}/geocode/search`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('text', query);
    url.searchParams.set('size', String(limit));

    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new RoutingError(await explain(response));

    const body = await response.json();
    return (body.features ?? []).map((feature) => ({
      label: feature.properties.label,
      // GeoJSON is [lng, lat] — the opposite order to everything else here.
      lat: feature.geometry.coordinates[1],
      lng: feature.geometry.coordinates[0],
    }));
  }

  // Keyless fallback. Rate limited to roughly one request a second.
  const url = new URL(NOMINATIM);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new RoutingError('Address lookup failed.');

  const body = await response.json();
  return body.map((result) => ({
    label: result.display_name,
    lat: Number(result.lat),
    lng: Number(result.lon),
  }));
};

/** Maximum stops ORS will route through in one request. */
export const MAX_STOPS = 50;

/**
 * Driving route through a list of [lat, lng] stops, in order.
 * Returns the road geometry plus distance in metres and duration in seconds.
 */
export const routeThrough = async (stops, { apiKey, signal } = {}) => {
  if (!apiKey) throw new RoutingError('Add an OpenRouteService key in Settings to draw routes.');
  if (stops.length < 2) throw new RoutingError('A route needs at least two stops.');
  if (stops.length > MAX_STOPS) {
    throw new RoutingError(`Routes are limited to ${MAX_STOPS} stops.`);
  }

  const response = await fetch(`${ORS}/v2/directions/driving-car/geojson`, {
    method: 'POST',
    signal,
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    // ORS takes coordinates as [lng, lat].
    body: JSON.stringify({ coordinates: stops.map(([lat, lng]) => [lng, lat]) }),
  });

  if (!response.ok) throw new RoutingError(await explain(response));

  const body = await response.json();
  const feature = body.features?.[0];
  if (!feature) throw new RoutingError('No road route found between those stops.');

  return {
    // Back to [lat, lng] for Leaflet.
    path: feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceM: feature.properties.summary?.distance ?? 0,
    durationS: feature.properties.summary?.duration ?? 0,
  };
};

export const formatDistance = (metres) =>
  metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;

export const formatDuration = (seconds) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

/* -- route optimisation --------------------------------------------------- */

/** Great-circle metres between two [lat, lng] points. */
export const haversineM = ([lat1, lng1], [lat2, lng2]) => {
  const R = 6371000;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

/** Average speed assumed for a collection vehicle when no road data is available. */
const FALLBACK_KMH = 25;

/**
 * Travel cost between every pair of stops.
 *
 * Real driving times come from the ORS matrix endpoint, which is what makes the
 * ordering trustworthy: straight-line distance routinely picks the wrong stop
 * order when a river, a railway or a one-way system sits between two bins that
 * look close together. Without a key it falls back to great-circle distance and
 * says so, so the UI can admit the ordering is approximate.
 */
export const costMatrix = async (locations, { apiKey, signal } = {}) => {
  if (apiKey) {
    const response = await fetch(`${ORS}/v2/matrix/driving-car`, {
      method: 'POST',
      signal,
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinates: locations.map(([lat, lng]) => [lng, lat]),
        metrics: ['distance', 'duration'],
        units: 'm',
      }),
    });

    if (response.ok) {
      const body = await response.json();
      if (Array.isArray(body.durations) && Array.isArray(body.distances)) {
        return { durations: body.durations, distances: body.distances, source: 'road' };
      }
    } else if (response.status === 403 || response.status === 401) {
      throw new RoutingError(await explain(response));
    }
    // Any other failure is not worth losing the route over — fall through.
  }

  const distances = locations.map((from) => locations.map((to) => haversineM(from, to)));
  const durations = distances.map((row) => row.map((m) => (m / 1000) * (3600 / FALLBACK_KMH)));
  return { durations, distances, source: 'straight-line' };
};

/** Total cost of visiting `order`, closing back to the start on a round trip. */
export const tourCost = (matrix, order, roundTrip) => {
  let total = 0;
  for (let i = 0; i < order.length - 1; i += 1) total += matrix[order[i]][order[i + 1]] ?? 0;
  if (roundTrip && order.length > 1) {
    total += matrix[order[order.length - 1]][order[0]] ?? 0;
  }
  return total;
};

/**
 * Orders stops to minimise driving time. Index 0 is held first — it is the
 * depot, and a run that does not start at the depot is not a run.
 *
 * Nearest-neighbour builds a sane first guess, then 2-opt repeatedly reverses
 * any segment that shortens the tour until nothing improves. That is not proven
 * optimal — travelling salesman never is, cheaply — but on the scale a refuse
 * round actually runs at it lands within a few percent, in microseconds, with
 * no solver dependency.
 */
const nearestNeighbour = (cost) => {
  const unvisited = new Set([...Array(cost.length).keys()].slice(1));
  const tour = [0];
  while (unvisited.size > 0) {
    const last = tour[tour.length - 1];
    let best = null;
    let bestCost = Infinity;
    unvisited.forEach((index) => {
      const value = cost[last][index] ?? Infinity;
      if (value < bestCost) {
        bestCost = value;
        best = index;
      }
    });
    tour.push(best);
    unvisited.delete(best);
  }
  return tour;
};

/** Reverses any segment that shortens the tour, until nothing improves. */
const twoOpt = (cost, seed, roundTrip) => {
  let order = seed;
  let orderCost = tourCost(cost, order, roundTrip);
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 1; i < order.length - 1; i += 1) {
      for (let j = i + 1; j < order.length; j += 1) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, j + 1).reverse(),
          ...order.slice(j + 1),
        ];
        const candidateCost = tourCost(cost, candidate, roundTrip);
        // A hair of tolerance, so floating point noise cannot loop for ever.
        if (candidateCost < orderCost - 1e-6) {
          order = candidate;
          orderCost = candidateCost;
          improved = true;
        }
      }
    }
  }

  return { order, cost: orderCost };
};

/**
 * Orders stops to minimise driving time. Index 0 is held first — it is the
 * depot, and a run that does not start at the depot is not a run.
 *
 * Nearest-neighbour builds a first guess and 2-opt refines it. Travelling
 * salesman has no cheap proof of optimality, so this is a good answer rather
 * than the best one — but on the scale a refuse round actually runs at it lands
 * within a few percent, in microseconds, with no solver dependency.
 *
 * The order it was handed is refined as a second seed and kept if it wins.
 * 2-opt only finds a local optimum, so without that it can occasionally return
 * something worse than the order it started from — and a route planner that
 * claims a saving must never quietly cost more than doing nothing.
 */
export const optimiseOrder = (cost, { roundTrip = true } = {}) => {
  const n = cost.length;
  const identity = [...Array(n).keys()];
  if (n <= 3) return identity;

  const fromNearest = twoOpt(cost, nearestNeighbour(cost), roundTrip);
  const fromGiven = twoOpt(cost, identity, roundTrip);

  return fromGiven.cost < fromNearest.cost ? fromGiven.order : fromNearest.order;
};

/**
 * Plans a collection run: what order to drive the bins in, the road geometry
 * for that order, and what it saves against driving them fullest-first.
 *
 * The comparison is measured on one matrix, so optimised and unoptimised are
 * the same kind of number. The headline distance is the real routed one where
 * roads are available, which is a different and better measurement — the UI
 * keeps them apart rather than mixing them into a single figure.
 */
export const planRoute = async (stops, { apiKey, signal, depot = null } = {}) => {
  const locations = depot ? [depot, ...stops] : stops;
  // One stop is a real run when there is a depot to leave from and return to.
  if (locations.length < 2) throw new RoutingError('A route needs at least two stops.');
  if (locations.length > MAX_STOPS) {
    throw new RoutingError(`Routes are limited to ${MAX_STOPS} stops.`);
  }

  const { durations, distances, source } = await costMatrix(locations, { apiKey, signal });
  const roundTrip = Boolean(depot);

  const order = optimiseOrder(durations, { roundTrip });
  const asGiven = [...Array(locations.length).keys()];

  const planned = {
    distanceM: tourCost(distances, order, roundTrip),
    durationS: tourCost(durations, order, roundTrip),
  };
  const asGivenCost = {
    distanceM: tourCost(distances, asGiven, roundTrip),
    durationS: tourCost(durations, asGiven, roundTrip),
  };

  // Real road geometry for the chosen order, when a key allows it.
  const ordered = order.map((index) => locations[index]);
  const waypoints = roundTrip ? [...ordered, locations[0]] : ordered;

  let drawn = null;
  if (apiKey) {
    try {
      drawn = await routeThrough(waypoints, { apiKey, signal });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      // Keep the plan; fall back to drawing straight legs between stops.
    }
  }

  return {
    /** Indices into `stops`, in the order they should be driven. */
    stopOrder: (roundTrip ? order.slice(1) : order).map((index) => (roundTrip ? index - 1 : index)),
    path: drawn?.path ?? waypoints,
    followsRoads: Boolean(drawn),
    distanceM: drawn?.distanceM ?? planned.distanceM,
    durationS: drawn?.durationS ?? planned.durationS,
    /** Both measured on the matrix, so the saving is a like-for-like figure. */
    plannedDistanceM: planned.distanceM,
    plannedDurationS: planned.durationS,
    unorderedDistanceM: asGivenCost.distanceM,
    unorderedDurationS: asGivenCost.durationS,
    source,
    roundTrip,
    depot,
  };
};
