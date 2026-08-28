import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Filter, Navigation, AlertTriangle, Route, Loader2, X } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { STATUS, STATUS_META, suspiciousCoords } from '../../lib/telemetry';
import { routeThrough, formatDistance, formatDuration } from '../../services/routing';
import { Card, EmptyState, cx, Button } from '../ui/Primitives';

const LEGEND = [
  STATUS.NORMAL,
  STATUS.FILLING,
  STATUS.FULL,
  STATUS.REPORTED,
  STATUS.ASSIGNED,
  STATUS.MAINTENANCE,
];

/** Marker built from a div so it can carry the fill number and a status colour. */
const markerIcon = (bin, selected) => {
  const meta = STATUS_META[bin.status];
  const label = bin.fill === null ? '?' : `${bin.fill}`;
  return L.divIcon({
    className: 'bin-marker',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center">
        ${
          bin.status === STATUS.FULL
            ? `<span style="position:absolute;width:34px;height:34px;border-radius:9999px;background:${meta.hex};opacity:.28;animation:ping 1.4s cubic-bezier(0,0,.2,1) infinite"></span>`
            : ''
        }
        <span style="
          display:flex;align-items:center;justify-content:center;
          width:30px;height:30px;border-radius:9999px;
          background:${meta.hex};color:#fff;
          font:700 10px/1 Inter,sans-serif;
          border:2.5px solid ${selected ? '#0f172a' : '#fff'};
          box-shadow:0 4px 12px rgba(15,23,42,.35);
        ">${label}</span>
      </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
};

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

const SOURCE_LABEL = {
  device: 'live GPS',
  manual: 'set in Settings',
  channel: 'channel location',
};

export const LiveBinMap = ({ height = 'h-[340px]', scrollZoom = false }) => {
  const { bins, selectedBin, setSelectedChannelId, setPage, assignTruck, settings } = useEcoBin();
  const [filter, setFilter] = useState('ALL');
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

  // Bins that still need emptying, fullest first — the order a truck would drive.
  const queue = bins
    .filter((bin) => bin.status === STATUS.FULL || bin.status === STATUS.ASSIGNED)
    .filter((bin) => bin.lat !== null && bin.lng !== null)
    .sort((a, b) => (b.fill ?? 0) - (a.fill ?? 0));

  const flagged = located
    .map((bin) => ({ bin, warning: suspiciousCoords(bin.lat, bin.lng) }))
    .filter((entry) => entry.warning);

  const drawRoute = async () => {
    routeAbort.current?.abort();
    const controller = new AbortController();
    routeAbort.current = controller;
    setRouteState({ status: 'loading', message: '' });

    try {
      const result = await routeThrough(
        queue.map((bin) => [bin.lat, bin.lng]),
        { apiKey: settings.orsKey, signal: controller.signal },
      );
      setRoute(result);
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

          {queue.length >= 2 &&
            (route ? (
              <Button onClick={clearRoute} title="Hide the collection route">
                <X className="h-3.5 w-3.5" /> {formatDistance(route.distanceM)} ·{' '}
                {formatDuration(route.durationS)}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={drawRoute}
                disabled={routeState.status === 'loading'}
                title={`Driving route through ${queue.length} bins that need emptying`}
              >
                {routeState.status === 'loading' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Route className="h-3.5 w-3.5" />
                )}
                Collection route
              </Button>
            ))}
        </div>
      </div>

      {routeState.message && (
        <p className="mx-4 mb-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {routeState.message}
        </p>
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
            <FitBounds points={route ? route.path : points} />

            {route && (
              <>
                {/* Casing under the line keeps it legible over busy streets. */}
                <Polyline positions={route.path} color="#0f172a" weight={7} opacity={0.25} />
                <Polyline positions={route.path} color="#0ea5e9" weight={4} opacity={0.95} />
              </>
            )}
            {located.map((bin) => (
              <Marker
                key={bin.channelId}
                position={[bin.lat, bin.lng]}
                icon={markerIcon(bin, selectedBin?.channelId === bin.channelId)}
                eventHandlers={{ click: () => setSelectedChannelId(bin.channelId) }}
              >
                <Popup>
                  <div className="min-w-[190px] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-heading text-sm font-extrabold text-slate-900">{bin.id}</p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ background: STATUS_META[bin.status].hex }}
                      >
                        {STATUS_META[bin.status].label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">{bin.location}</p>
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
