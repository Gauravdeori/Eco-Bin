import React, { useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import { Navigation } from 'lucide-react';
import { STATUS_META } from '../../lib/telemetry';
import { formatDistance, formatDuration } from '../../services/routing';
import { FitBounds, TruckMarker, depotIcon, markerIcon, useIconCache } from './mapPins';
import { EmptyState, cx } from '../ui/Primitives';

/**
 * The map the Route Planner draws its plan on.
 *
 * Deliberately narrower than the live map: no status filter, no ad-hoc route
 * button, nothing to set up. It shows one thing — the lanes the algorithm
 * chose, numbered in driving order, with the trucks moving along them — because
 * that is the only question this page asks.
 *
 * Every route arrives already normalised and already coloured, so nothing about
 * priority or fleet state is decided twice.
 */
export const RouteSimMap = ({
  routes = [],
  bins = [],
  depot,
  selectedChannelId = null,
  onSelectBin,
  height = 'h-[440px]',
}) => {
  const iconFor = useIconCache();

  const located = useMemo(
    () => bins.filter((bin) => bin.lat !== null && bin.lng !== null),
    [bins],
  );

  /** channelId → its place in the run that covers it, for the pin badges. */
  const sequence = useMemo(() => {
    const map = new Map();
    routes.forEach((route) => {
      route.stops.forEach((channelId, index) => map.set(channelId, index + 1));
    });
    return map;
  }, [routes]);

  /** Bins a crew is standing at this second. */
  const collecting = useMemo(
    () => new Set(routes.map((route) => route.collectingChannelId).filter(Boolean)),
    [routes],
  );

  /** Bins already emptied on this round, so a finished stop reads as finished. */
  const emptied = useMemo(() => {
    const set = new Set();
    routes.forEach((route) => (route.collected ?? []).forEach((id) => set.add(id)));
    return set;
  }, [routes]);

  const lanes = routes.flatMap((route) => route.path ?? []);
  const bounds = lanes.length > 0 ? lanes : located.map((bin) => [bin.lat, bin.lng]);

  if (bounds.length === 0) {
    return (
      <div
        className={cx(
          'flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50',
          'dark:border-slate-700 dark:bg-slate-900/60',
          height,
        )}
      >
        <EmptyState
          icon={Navigation}
          title="Nothing to draw yet"
          description="Bins need coordinates before a route can be planned through them. Set them in Settings."
        />
      </div>
    );
  }

  return (
    <div className={cx('relative overflow-hidden rounded-xl', height)}>
      <MapContainer center={bounds[0]} zoom={14} scrollWheelZoom className="h-full w-full">
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          maxZoom={19}
        />
        <FitBounds points={bounds} />

        {routes.map((route) => (
          <React.Fragment key={route.truckId}>
            {/* Casing under the line keeps it legible over busy streets. */}
            <Polyline positions={route.path} color="#0f172a" weight={7} opacity={0.2} />
            <Polyline
              positions={route.path}
              color={route.colour}
              weight={4}
              opacity={0.92}
              /* A plan nobody has agreed to yet is drawn as a proposal. */
              dashArray={route.live ? undefined : '7 9'}
            />
            {route.live && route.position && (
              <TruckMarker run={route} colour={route.colour}>
                <Popup>
                  <div className="min-w-[190px] p-3">
                    <p className="font-heading text-sm font-extrabold text-slate-900">
                      {route.truckId}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {route.driver} · {route.stopsDone} of {route.stops.length} collected ·{' '}
                      {Math.round(route.progress * 100)}%
                    </p>
                    <p className="mt-1 text-[11px] text-slate-600">
                      {formatDistance(route.distanceM)} · {formatDuration(route.remainingS)} of the
                      round left
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      {route.stopNames
                        .map((name, index) => {
                          const done = route.collected?.includes(route.stops[index]);
                          return `${done ? '✓' : `${index + 1}.`} ${name}`;
                        })
                        .join('  ·  ')}
                    </p>
                  </div>
                </Popup>
              </TruckMarker>
            )}
          </React.Fragment>
        ))}

        {depot && (
          <Marker position={depot} icon={iconFor('depot', depotIcon)}>
            <Popup>
              <div className="p-3">
                <p className="font-heading text-sm font-extrabold text-slate-900">Depot</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Every round starts and ends here.
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {located.map((bin) => {
          const seq = sequence.get(bin.channelId) ?? null;
          const busy = collecting.has(bin.channelId);
          const selected = selectedChannelId === bin.channelId;

          return (
            <Marker
              key={bin.channelId}
              position={[bin.lat, bin.lng]}
              icon={iconFor(
                `${bin.channelId}|${bin.status}|${bin.fill}|${bin.id}|${selected}|${seq}|${busy}`,
                () => markerIcon(bin, selected, seq, busy),
              )}
              eventHandlers={{ click: () => onSelectBin?.(bin.channelId) }}
            >
              <Popup>
                <div className="min-w-[180px] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-heading text-sm font-extrabold text-slate-900">{bin.id}</p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: STATUS_META[bin.status].hex }}
                    >
                      {STATUS_META[bin.status].label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {seq !== null && <b className="text-slate-900">Stop {seq} · </b>}
                    {bin.location}
                  </p>
                  <p className="mt-1.5 text-[11px] text-slate-600">
                    Fill <b className="tabular">{bin.fill === null ? '—' : `${bin.fill}%`}</b>
                    {bin.weight !== null && (
                      <>
                        {' · '}Load <b className="tabular">{bin.weight} kg</b>
                      </>
                    )}
                  </p>
                  {busy && (
                    <p className="mt-1.5 rounded bg-emerald-100 px-1.5 py-1 text-[10px] font-bold text-emerald-800">
                      Crew is emptying this bin now
                    </p>
                  )}
                  {!busy && emptied.has(bin.channelId) && (
                    <p className="mt-1.5 rounded bg-slate-100 px-1.5 py-1 text-[10px] font-bold text-slate-600">
                      Collected on this round
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};
