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
