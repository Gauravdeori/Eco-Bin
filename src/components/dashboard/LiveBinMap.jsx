import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Filter, Navigation, AlertTriangle, Route, Loader2, X, Leaf, Truck } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import {
  PRIORITY,
  PRIORITY_META,
  STATUS,
  STATUS_META,
  binPriority,
  priorityLevel,
  suspiciousCoords,
} from '../../lib/telemetry';
import { planRoute, formatDistance, formatDuration } from '../../services/routing';
import { emissionsFor, emissionsSaved, formatCo2 } from '../../lib/emissions';
import { Card, EmptyState, cx, Button } from '../ui/Primitives';

const LEGEND = [
  STATUS.NORMAL,
  STATUS.FILLING,
  STATUS.FULL,
  STATUS.REPORTED,
  STATUS.ASSIGNED,
  STATUS.MAINTENANCE,
];

/** Bin names are operator-typed, so they cannot go into markup unescaped. */
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

/**
 * Marker built from a div so it can carry the fill number and pulse in its
 * status colour. Offline and maintenance bins are drawn static: a blink would
 * suggest live telemetry that is not arriving.
 */
const markerIcon = (bin, selected, seq = null) => {
  const meta = STATUS_META[bin.status];
  const label = bin.fill === null ? '?' : `${bin.fill}`;
  const live = bin.status !== STATUS.OFFLINE && bin.status !== STATUS.MAINTENANCE;

  return L.divIcon({
    className: 'bin-marker',
    html: `
      <div class="bin-pin${live ? '' : ' static'}" style="--pin:${meta.hex}">
        ${live ? '<span class="halo"></span><span class="halo delayed"></span>' : ''}
        <span class="dot" style="border-color:${selected ? '#0f172a' : '#fff'}">${label}</span>
        ${seq === null ? '' : `<span class="seq">${seq}</span>`}
        <span class="name">${escapeHtml(bin.id)}</span>
      </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
};

/**
 * Route colour is the priority scale, not a per-truck palette.
 *
 * The question an operator asks looking at a map of routes is which one is
 * worst, and a colour that only says "this is truck three" cannot answer it.
 * Runs are coloured on exactly the scale their bins are, so a red lane and a
 * red bin badge mean the same thing. Trucks stay told apart by the ID on the
 * marker rather than by hue.
 */
const ROUTE_ORDER = [PRIORITY.CRITICAL, PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW];

const truckIcon = (label, colour, heading) =>
  L.divIcon({
    className: 'truck-marker',
    html: `<div class="truck-pin" style="--truck:${colour};--heading:${heading}deg">
             <span class="ping"></span>
             <span class="disc">
               <span class="arrow">
                 <svg viewBox="0 0 10 10"><path d="M5 0 L9.5 10 L5 7.6 L0.5 10 Z"/></svg>
               </span>
             </span>
             <span class="plate">${escapeHtml(label)}</span>
           </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -15],
  });

const depotIcon = () =>
  L.divIcon({
    className: 'depot-marker',
    html: '<div class="depot-pin">HQ</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });

/** Keeps every visible bin inside the viewport as coordinates arrive. */
const FitBounds = ({ points }) => {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');

  useEffect(() => {
    // Force Leaflet to re-check container size after DOM updates
    const timer = setTimeout(() => map.invalidateSize(), 100);

    if (points.length === 0) return () => clearTimeout(timer);
    if (points.length === 1) {
      map.setView(points[0], 16);
      return () => clearTimeout(timer);
    }
    map.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 17 });
    
    return () => clearTimeout(timer);
  }, [key, map]);

  return null;
};

/**
 * Live tracking for one truck, in the shape a rider-hailing app uses: who is
 * driving, where they are going, and how long until they get there. An
 * operator who has just pressed dispatch wants those three facts and no others.
 */
const TrackingCard = ({ run, colour, onCancel, onFocusBin }) => {
  const nextIndex = Math.min(run.stopsDone, run.stops.length - 1);
  const arrived = run.stopsDone >= run.stops.length;
  const band = PRIORITY_META[run.level];

  return (
    <div className="pointer-events-auto w-[268px] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
          style={{ background: colour }}
        >
          {run.driver?.trim()?.[0]?.toUpperCase() ?? 'T'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
            {run.driver || 'Driver'}
          </p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            <span
              className="shrink-0 rounded px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white"
              style={{ background: colour }}
            >
              {arrived ? 'Done' : band.label}
            </span>
            {run.truckId} · {run.loadKg} kg
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-heading text-base font-extrabold tabular text-slate-900 dark:text-white">
            {/* Under a minute reads better as a word than as "0 min". */}
            {arrived ? '—' : run.remainingS < 60 ? 'Now' : formatDuration(run.remainingS)}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            {arrived ? 'returning' : 'away'}
          </p>
        </div>
      </div>

      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <span
          className="block h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.round(run.progress * 100)}%`, background: colour }}
        />
      </div>

      <button
        type="button"
        onClick={() => onFocusBin(run.stops[nextIndex])}
        className="mt-2 flex w-full items-start gap-1.5 text-left"
      >
        <Navigation className="mt-px h-3 w-3 shrink-0" style={{ color: colour }} />
        <span className="min-w-0 flex-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
          {arrived ? (
            'All stops collected — heading back to the depot'
          ) : (
            <>
              Next stop <b className="text-slate-900 dark:text-white">{run.stopNames[nextIndex]}</b>
              {run.stops.length > 1 ? ` · ${run.stopsDone} of ${run.stops.length} done` : ''}
              {run.criticalStops > 0
                ? ` · ${run.criticalStops} critical left`
                : ''}
            </>
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onCancel(run.truckId)}
        className="mt-2 w-full rounded-lg bg-slate-100 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
      >
        Call off {run.truckId}
      </button>
    </div>
  );
};

/** One figure in the route summary bar. */
const Metric = ({ label, value }) => (
  <span className="flex flex-col">
    <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
    <span className="text-xs font-extrabold text-slate-900 tabular dark:text-white">{value}</span>
  </span>
);

const SOURCE_LABEL = {
  device: 'live GPS',
  manual: 'set in Settings',
  channel: 'channel location',
};

export const LiveBinMap = ({ height = 'h-[340px]', scrollZoom = false }) => {
  const {
    bins,
    selectedBin,
    setSelectedChannelId,
    setPage,
    assignTruck,
    settings,
    fleetRuns,
    planRuns,
    planning,
    depotPoint,
    cancelRun,
  } = useEcoBin();
  const [filter, setFilter] = useState('ALL');
  const [scope, setScope] = useState('DUE');
  const [route, setRoute] = useState(null);
  const [routeState, setRouteState] = useState({ status: 'idle', message: '' });
  const routeAbort = useRef(null);

  useEffect(() => () => routeAbort.current?.abort(), []);

  const visible = useMemo(
    () => (filter === 'ALL' ? bins : bins.filter((bin) => bin.status === filter)),
    [bins, filter],
  );

  const located = visible.filter((bin) => bin.lat !== null && bin.lng !== null);
  const points = located.map((bin) => [bin.lat, bin.lng]);
  const missing = visible.length - located.length;

  // Show the coordinate of whichever bin the console is focused on.
  const focused =
    located.find((bin) => bin.channelId === selectedBin?.channelId) ??
    (located.length === 1 ? located[0] : null);

  /**
   * The stops a run would cover, fullest first.
   *
   * That order is the baseline, not the plan: it is what an operator driving
   * "deal with the worst one next" would actually do, and it ignores geography
   * entirely. The optimiser is measured against it.
   */
  const queue = useMemo(() => {
    const positioned = bins.filter((bin) => bin.lat !== null && bin.lng !== null);
    const due = positioned.filter(
      (bin) => bin.status === STATUS.FULL || bin.status === STATUS.ASSIGNED,
    );
    return [...(scope === 'ALL' ? positioned : due)].sort((a, b) => (b.fill ?? 0) - (a.fill ?? 0));
  }, [bins, scope]);

  // The depot is defined once, in context, so the map and the planner agree.
  const depot = depotPoint;

  /** channelId → its position in the planned run, for the pin badges. */
  const sequence = useMemo(() => {
    const map = new Map();
    route?.bins?.forEach((bin, index) => map.set(bin.channelId, index + 1));
    return map;
  }, [route]);

  /** The preview route is banded the same way a live run is. */
  const routeLevel = useMemo(() => {
    if (!route?.bins?.length) return PRIORITY.LOW;
    const scores = route.bins.map(
      (bin) => binPriority(bin, { thresholds: settings.thresholds }).score,
    );
    return priorityLevel(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
  }, [route, settings.thresholds]);

  const savings = route
    ? emissionsSaved(
        route.plannedDistanceM,
        route.unorderedDistanceM,
        settings.fleet?.kmPerLitre,
      )
    : null;
  const runCo2 = route ? emissionsFor(route.distanceM, settings.fleet?.kmPerLitre) : null;

  const flagged = located
    .map((bin) => ({ bin, warning: suspiciousCoords(bin.lat, bin.lng) }))
    .filter((entry) => entry.warning);

  const drawRoute = async () => {
    routeAbort.current?.abort();
    const controller = new AbortController();
    routeAbort.current = controller;
    setRouteState({ status: 'loading', message: '' });

    try {
      const result = await planRoute(
        queue.map((bin) => [bin.lat, bin.lng]),
        { apiKey: settings.orsKey, signal: controller.signal, depot },
      );
      setRoute({ ...result, bins: result.stopOrder.map((index) => queue[index]) });
      setRouteState({ status: 'idle', message: '' });
    } catch (error) {
      if (error.name === 'AbortError') return;
      setRouteState({ status: 'error', message: error.message });
    }
  };

  const clearRoute = () => {
    routeAbort.current?.abort();
    setRoute(null);
    setRouteState({ status: 'idle', message: '' });
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <MapPin className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Live Bin Map</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {located.length} of {bins.length} bins positioned
              {focused && (
                <span className="ml-1 font-mono text-[11px] text-slate-400">
                  · {focused.lat.toFixed(5)}, {focused.lng.toFixed(5)}
                  {focused.positionSource ? ` (${SOURCE_LABEL[focused.positionSource]})` : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter bins by status"
              className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs font-semibold text-slate-700 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="ALL">All statuses</option>
              {LEGEND.map((status) => (
                <option key={status} value={status}>
                  {STATUS_META[status].label}
                </option>
              ))}
              <option value={STATUS.OFFLINE}>Offline</option>
            </select>
          </div>

          <div className="relative">
            <Route className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value);
                clearRoute();
              }}
              aria-label="Which bins to plan a run through"
              className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs font-semibold text-slate-700 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="DUE">Bins due collection</option>
              <option value="ALL">Every positioned bin</option>
            </select>
          </div>

          <Button
            variant="primary"
            onClick={() => planRuns({ scope })}
            disabled={planning}
            title="Split the bins across your trucks and route each one"
          >
            {planning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Truck className="h-3.5 w-3.5" />
            )}
            Dispatch fleet
          </Button>

          {queue.length >= 2 &&
            (route ? (
              <Button onClick={clearRoute} title="Hide the planned run">
                <X className="h-3.5 w-3.5" /> Clear route
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={drawRoute}
                disabled={routeState.status === 'loading'}
                title={`Plan the shortest run through ${queue.length} bins`}
              >
                {routeState.status === 'loading' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Route className="h-3.5 w-3.5" />
                )}
                Plan run ({queue.length})
              </Button>
            ))}
        </div>
      </div>

      {routeState.message && (
        <p className="mx-4 mb-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {routeState.message}
        </p>
      )}

      {route && (
        <div className="mx-4 mb-2 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3.5 py-2.5">
            <Metric label="Stops" value={String(route.bins.length)} />
            <Metric label="Distance" value={formatDistance(route.distanceM)} />
            <Metric label="Drive time" value={formatDuration(route.durationS)} />
            <Metric label="Diesel" value={`${runCo2.litres.toFixed(1)} L`} />
            <Metric label="CO₂ this run" value={formatCo2(runCo2.co2Kg)} />
            {savings.co2Kg > 0.05 && (
              <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 dark:bg-emerald-500/10">
                <Leaf className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  {formatCo2(savings.co2Kg)} CO₂ saved
                  <span className="font-semibold opacity-80">
                    {' '}
                    · {formatDistance(savings.metres)} shorter ({savings.percent}%)
                  </span>
                </span>
              </span>
            )}
          </div>

          <p className="border-t border-slate-200 px-3.5 py-1.5 text-[10px] leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {route.bins.map((bin, index) => `${index + 1}. ${bin.id}`).join('  ·  ')}
            {route.roundTrip ? '  ·  back to depot' : ''}
          </p>

          {/* Straight lines are a fallback, not a route. Say so plainly rather
              than leaving the map looking broken with no explanation. */}
          {!route.followsRoads && (
            <p className="border-t border-slate-200 px-3.5 py-1.5 text-[10px] font-semibold text-amber-700 dark:border-slate-700 dark:text-amber-400">
              Drawn as direct lines — no routing service could be reached. The stop
              order is still correct; only the shape of the lane is approximate.
            </p>
          )}

          <p className="border-t border-slate-200 px-3.5 py-1.5 text-[10px] text-slate-400 dark:border-slate-700">
            {route.source === 'road'
              ? `Ordered on real driving times${
                  route.provider === 'osrm' ? ' (OSRM)' : ' (OpenRouteService)'
                }`
              : 'Ordered on straight-line distance — no routing service could be reached'}
            {`. Saving is against collecting fullest-first. CO₂ at ${(settings.fleet?.kmPerLitre ?? 2.8)} km/L diesel.`}
          </p>
        </div>
      )}

      {flagged.length > 0 && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
              {flagged.length === 1
                ? `${flagged[0].bin.id} looks mispositioned`
                : `${flagged.length} bins look mispositioned`}
            </p>
            <p className="text-[11px] text-amber-700/90 dark:text-amber-300/80">
              {flagged[0].warning}
            </p>
          </div>
          <Button variant="secondary" onClick={() => setPage('settings')}>
            Fix in Settings
          </Button>
        </div>
      )}

      <div className={cx('relative mx-4 overflow-hidden rounded-xl', height)}>
        {/* What the lane colours mean. Only shown when there is a lane. */}
        {(fleetRuns.length > 0 || route) && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-[1000] rounded-xl border border-slate-200 bg-white/95 px-2.5 py-2 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
              Route urgency
            </p>
            <div className="flex flex-col gap-1">
              {ROUTE_ORDER.map((level) => (
                <span key={level} className="flex items-center gap-1.5">
                  <span
                    className="h-1 w-5 shrink-0 rounded-full"
                    style={{ background: PRIORITY_META[level].hex }}
                  />
                  <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    {PRIORITY_META[level].label}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Live tracking, floated over the map like a ride-hailing app. */}
        {fleetRuns.length > 0 && (
          <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex max-h-[calc(100%-24px)] flex-col gap-2 overflow-y-auto">
            {fleetRuns.map((run) => (
              <TrackingCard
                key={run.truckId}
                run={run}
                colour={PRIORITY_META[run.level].hex}
                onCancel={cancelRun}
                onFocusBin={setSelectedChannelId}
              />
            ))}
          </div>
        )}

        {points.length > 0 ? (
          <MapContainer
            center={points[0]}
            zoom={15}
            scrollWheelZoom={scrollZoom}
            className="h-full w-full"
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
              maxZoom={19}
            />
            <FitBounds
              points={
                route
                  ? route.path
                  : fleetRuns.length > 0
                    ? fleetRuns.flatMap((run) => run.path)
                    : points
              }
            />

            {route && (
              <>
                {/* Casing under the line keeps it legible over busy streets. */}
                <Polyline positions={route.path} color="#0f172a" weight={7} opacity={0.25} />
                <Polyline
                  positions={route.path}
                  color={PRIORITY_META[routeLevel].hex}
                  weight={4}
                  opacity={0.95}
                />
              </>
            )}

            {/* Live fleet: each run coloured by how urgent its remaining stops
                are, worst drawn last so it sits on top where lanes overlap. */}
            {[...fleetRuns]
              .sort((a, b) => a.urgency - b.urgency)
              .map((run) => {
              const colour = PRIORITY_META[run.level].hex;
              return (
                <React.Fragment key={run.truckId}>
                  <Polyline positions={run.path} color="#0f172a" weight={7} opacity={0.2} />
                  <Polyline positions={run.path} color={colour} weight={4} opacity={0.9} />
                  {run.position && (
                    <Marker position={run.position} icon={truckIcon(run.truckId, colour, run.heading)}>
                      <Popup>
                        <div className="min-w-[180px] p-3">
                          <p className="font-heading text-sm font-extrabold text-slate-900">
                            {run.truckId}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {run.driver} · {run.stopsDone} of {run.stops.length} stops ·{' '}
                            {Math.round(run.progress * 100)}%
                          </p>
                          <p className="mt-1 text-[11px] text-slate-600">
                            {formatDistance(run.distanceM)} · {formatDuration(run.remainingS)} left
                          </p>
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                            {run.stopNames
                              .map((name, i) => `${run.collected.includes(run.stops[i]) ? '✓' : `${i + 1}.`} ${name}`)
                              .join('  ·  ')}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  )}
                </React.Fragment>
              );
            })}
            {(route || fleetRuns.length > 0) && (
              <Marker position={depot} icon={depotIcon()}>
                <Popup>
                  <div className="p-3">
                    <p className="font-heading text-sm font-extrabold text-slate-900">Depot</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Runs start and end here.
                      {settings.depot?.lat === null || settings.depot?.lat === undefined
                        ? ' Using the map centre — set a depot in Settings.'
                        : ''}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}

            {located.map((bin) => (
              <Marker
                key={bin.channelId}
                position={[bin.lat, bin.lng]}
                icon={markerIcon(
                  bin,
                  selectedBin?.channelId === bin.channelId,
                  sequence.get(bin.channelId) ?? null,
                )}
                eventHandlers={{ click: () => setSelectedChannelId(bin.channelId) }}
              >
                <Popup>
                  <div className="min-w-[190px] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 font-heading text-sm font-extrabold text-slate-900">
                        {bin.id}
                        {bin.isSimulated && (
                          <span className="rounded bg-slate-200 px-1 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-slate-600">
                            Sim
                          </span>
                        )}
                      </p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ background: STATUS_META[bin.status].hex }}
                      >
                        {STATUS_META[bin.status].label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {sequence.has(bin.channelId) && (
                        <b className="text-slate-900">Stop {sequence.get(bin.channelId)} · </b>
                      )}
                      {bin.location}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                      {bin.lat.toFixed(5)}, {bin.lng.toFixed(5)}
                      {bin.positionSource ? ` · ${SOURCE_LABEL[bin.positionSource]}` : ''}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-600">
                      <span>
                        Fill <b className="tabular">{bin.fill === null ? '—' : `${bin.fill}%`}</b>
                      </span>
                      <span>
                        Weight{' '}
                        <b className="tabular">{bin.weight === null ? '—' : `${bin.weight} kg`}</b>
                      </span>
                    </div>
                    {bin.status === STATUS.FULL && (
                      <button
                        type="button"
                        onClick={() => assignTruck(bin.channelId)}
                        className="mt-2.5 w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500"
                      >
                        Assign nearest truck
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
            <EmptyState
              icon={Navigation}
              title={bins.length ? 'No coordinates yet' : 'No bins connected'}
              description={
                bins.length
                  ? 'Set each bin’s latitude and longitude in Settings, or give the channel a location in ThingSpeak.'
                  : 'Add a ThingSpeak channel in Settings and bins will appear here as they report.'
              }
              action={
                <Button variant="primary" onClick={() => setPage('settings')}>
                  Open settings
                </Button>
              }
            />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
        {LEGEND.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter((current) => (current === status ? 'ALL' : status))}
            className={cx(
              'flex items-center gap-1.5 text-[11px] font-medium transition-colors',
              filter === status
                ? 'font-bold text-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <span className={cx('h-2 w-2 rounded-full', STATUS_META[status].dot)} />
            {STATUS_META[status].label}
          </button>
        ))}
        {missing > 0 && (
          <span className="ml-auto text-[11px] text-amber-600 dark:text-amber-400">
            {missing} without coordinates
          </span>
        )}
      </div>
    </Card>
  );
};
