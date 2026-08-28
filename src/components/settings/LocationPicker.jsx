import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Search, X, Loader2, MapPin, Crosshair } from 'lucide-react';
import { validCoords } from '../../lib/telemetry';
import { geocode } from '../../services/routing';
import { useEcoBin } from '../../context/EcoBinContext';
import { Button, inputClass, cx } from '../ui/Primitives';

const pinIcon = L.divIcon({
  className: 'bin-marker',
  html: `<div style="
    width:26px;height:26px;border-radius:9999px;
    background:#17a34a;border:3px solid #fff;
    box-shadow:0 4px 12px rgba(15,23,42,.4);
  "></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

/** Drops the pin wherever the map is clicked. */
const ClickToPlace = ({ onPick }) => {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
};

/** Recentres when a search result or geolocation fix comes in. */
const Recenter = ({ position, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, zoom ?? map.getZoom());
  }, [position?.[0], position?.[1], zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

export const LocationPicker = ({ binLabel, lat, lng, onSave, onClose }) => {
  const { settings, bins } = useEcoBin();
  const initial = validCoords(Number(lat), Number(lng)) ? [Number(lat), Number(lng)] : null;

  // Fall back to a bin that is already placed, then to the configured centre.
  const neighbour = bins.find((item) => item.lat !== null && item.lng !== null);
  const fallback = neighbour
    ? { position: [neighbour.lat, neighbour.lng], zoom: 15 }
    : { position: [settings.mapCenter.lat, settings.mapCenter.lng], zoom: settings.mapCenter.zoom };

  const [picked, setPicked] = useState(initial);
  const [center, setCenter] = useState(initial ?? fallback.position);
  const [zoom, setZoom] = useState(initial ? 17 : fallback.zoom);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [state, setState] = useState({ status: 'idle', message: '' });
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runSearch = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'searching', message: '' });

    try {
      const found = await geocode(query, {
        apiKey: settings.orsKey,
        signal: controller.signal,
      });
      setResults(found);
      setState(
        found.length
          ? { status: 'idle', message: '' }
          : { status: 'error', message: 'No place matched that search.' },
      );
    } catch (error) {
      if (error.name === 'AbortError') return;
      setState({ status: 'error', message: error.message });
    }
  };

  const choose = (result) => {
    const next = [result.lat, result.lng];
    setPicked(next);
    setCenter(next);
    setZoom(17);
    setResults([]);
    setQuery(result.label);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setState({ status: 'error', message: 'This browser cannot report a location.' });
      return;
    }
    setState({ status: 'locating', message: '' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = [coords.latitude, coords.longitude];
        setPicked(next);
        setCenter(next);
        setZoom(18);
        setState({ status: 'idle', message: '' });
      },
      (error) => setState({ status: 'error', message: error.message }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Set the position of {binLabel}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search for the road, or click the map where the bin stands.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-5 py-3">
          <form onSubmit={runSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search a road, area or landmark"
                className={cx(inputClass, 'pl-9')}
              />
            </div>
            <Button variant="primary" type="submit" disabled={state.status === 'searching'}>
              {state.status === 'searching' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Search'
              )}
            </Button>
            <Button onClick={useMyLocation} title="Use this device's location">
              <Crosshair className="h-4 w-4" />
            </Button>
          </form>

          {state.message && (
            <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              {state.message}
            </p>
          )}

          {results.length > 0 && (
            <ul className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
              {results.map((result) => (
                <li key={`${result.lat},${result.lng},${result.label}`}>
                  <button
                    type="button"
                    onClick={() => choose(result)}
                    className="block w-full px-3 py-2 text-left text-[11px] text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {result.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mx-5 h-[300px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <MapContainer
            center={center}
            zoom={zoom}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
              maxZoom={19}
            />
            <ClickToPlace
              onPick={(nextLat, nextLng) => setPicked([nextLat, nextLng])}
            />
            <Recenter position={center} zoom={zoom} />
            {picked && <Marker position={picked} icon={pinIcon} />}
          </MapContainer>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            <MapPin className="h-3.5 w-3.5" />
            {picked ? `${picked[0].toFixed(5)}, ${picked[1].toFixed(5)}` : 'Nothing picked yet'}
          </p>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!picked}
              onClick={() => onSave(picked[0].toFixed(6), picked[1].toFixed(6))}
            >
              Save position
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
