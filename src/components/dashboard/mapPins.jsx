import { useEffect, useMemo, useRef } from 'react';
import { Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { STATUS, STATUS_META } from '../../lib/telemetry';

/**
 * The Leaflet markers every map in this app draws with.
 *
 * Two maps now show the same fleet — the live map and the route simulation —
 * and a pin that means one thing on one of them and something else on the other
 * is worse than no pin at all. They are built here once so a bin, a truck and
 * the depot look and behave identically wherever they appear.
 */

/** Bin names are operator-typed, so they cannot go into markup unescaped. */
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

/**
 * Marker built from a div so it can carry the fill number and pulse in its
 * status colour. Offline and maintenance bins are drawn static: a blink would
 * suggest live telemetry that is not arriving.
 *
 * `seq` is the bin's place in a planned run, and `collecting` means a crew is
 * standing at it right now — the one moment on a route worth drawing louder
 * than everything around it.
 */
export const markerIcon = (bin, selected, seq = null, collecting = false) => {
  const meta = STATUS_META[bin.status];
  const label = bin.fill === null ? '?' : `${bin.fill}`;
  const live = bin.status !== STATUS.OFFLINE && bin.status !== STATUS.MAINTENANCE;

  return L.divIcon({
    className: 'bin-marker',
    html: `
      <div class="bin-pin${live ? '' : ' static'}${collecting ? ' collecting' : ''}" style="--pin:${meta.hex}">
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

export const truckIcon = (label, colour) =>
  L.divIcon({
    className: 'truck-marker',
    html: `<div class="truck-pin" style="--truck:${colour}">
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

export const depotIcon = () =>
  L.divIcon({
    className: 'depot-marker',
    html: '<div class="depot-pin">HQ</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });

/**
 * Marker icons, reused while nothing about them has changed.
 *
 * Handing Leaflet a new divIcon makes it throw the marker's element away and
 * build another. That is fine once, but the map re-renders every second while a
 * truck is driving, and rebuilding every pin at 1Hz restarts each one's pulse
 * animation and costs a DOM churn nobody asked for. Keying on what the icon
 * actually draws means the same object comes back until the pin really differs.
 */
export const useIconCache = () => {
  const cache = useRef(new Map());

  return (key, build) => {
    const store = cache.current;
    if (!store.has(key)) {
      // Fill level moves, so keys accumulate. Nothing here is worth leaking.
      if (store.size > 240) store.clear();
      store.set(key, build());
    }
    return store.get(key);
  };
};

/** Keeps every visible bin inside the viewport as coordinates arrive. */
export const FitBounds = ({ points }) => {
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
 * A truck on the map.
 *
 * The icon deliberately never changes, so Leaflet keeps the same element and
 * `setLatLng` alone moves it — which is what lets the CSS transform transition
 * animate the truck between ticks instead of it jumping. Heading is written
 * straight onto the live element as a custom property for the same reason:
 * rebuilding the icon to turn the arrow would defeat the gliding.
 */
export const TruckMarker = ({ run, colour, children }) => {
  const ref = useRef(null);
  const icon = useMemo(() => truckIcon(run.truckId, colour), [run.truckId, colour]);

  useEffect(() => {
    const pin = ref.current?.getElement()?.querySelector('.truck-pin');
    if (pin) pin.style.setProperty('--heading', `${Math.round(run.heading)}deg`);
  }, [run.heading, icon]);

  /**
   * A truck standing at a bin stops sliding and starts working: the plate says
   * so and the disc pulses, so the pause reads as a pickup rather than as the
   * marker having got stuck.
   */
  useEffect(() => {
    const pin = ref.current?.getElement()?.querySelector('.truck-pin');
    if (pin) pin.classList.toggle('lifting', Boolean(run.collecting));
  }, [run.collecting, icon]);

  return (
    <Marker ref={ref} position={run.position} icon={icon}>
      {children}
    </Marker>
  );
};
