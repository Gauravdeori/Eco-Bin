/**
 * Turns raw ThingSpeak feeds into the shapes the dashboard renders.
 * Nothing in here invents a value: a measurement the device never sent
 * stays `null` so the UI can show "—" instead of a made-up number.
 */

export const STATUS = {
  FULL: 'FULL',
  FILLING: 'FILLING',
  NORMAL: 'NORMAL',
  ASSIGNED: 'ASSIGNED',
  REPORTED: 'REPORTED',
  MAINTENANCE: 'MAINTENANCE',
  OFFLINE: 'OFFLINE',
};

export const STATUS_META = {
  [STATUS.NORMAL]: { label: 'Normal', dot: 'bg-emerald-500', text: 'text-emerald-600', hex: '#10b981' },
  [STATUS.FILLING]: { label: 'Filling', dot: 'bg-amber-500', text: 'text-amber-600', hex: '#f59e0b' },
  [STATUS.FULL]: { label: 'Full', dot: 'bg-rose-500', text: 'text-rose-600', hex: '#f43f5e' },
  [STATUS.REPORTED]: { label: 'Reported', dot: 'bg-violet-500', text: 'text-violet-600', hex: '#8b5cf6' },
  [STATUS.ASSIGNED]: { label: 'Assigned', dot: 'bg-sky-500', text: 'text-sky-600', hex: '#0ea5e9' },
  [STATUS.MAINTENANCE]: { label: 'Under Maintenance', dot: 'bg-slate-400', text: 'text-slate-600', hex: '#94a3b8' },
  [STATUS.OFFLINE]: { label: 'Offline', dot: 'bg-slate-400', text: 'text-slate-500', hex: '#94a3b8' },
};

/** A bin is considered offline once it has been silent for this long. */
export const OFFLINE_AFTER_MS = 30 * 60 * 1000;

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Pulls one mapped measurement out of a raw feed entry (fieldMap.fill = 1 reads entry.field1). */
const readField = (entry, fieldNumber) => {
  if (!fieldNumber) return null;
  return toNumber(entry[`field${fieldNumber}`]);
};

const clampPercent = (value) =>
  value === null ? null : Math.max(0, Math.min(100, Math.round(value)));

/** Maps a raw ThingSpeak entry into a normalised reading. */
export const parseEntry = (entry, fieldMap) => ({
  at: new Date(entry.created_at),
  entryId: entry.entry_id,
  fill: clampPercent(readField(entry, fieldMap.fill)),
  weight: readField(entry, fieldMap.weight),
  battery: clampPercent(readField(entry, fieldMap.battery)),
  lat: readField(entry, fieldMap.lat) ?? toNumber(entry.latitude),
  lng: readField(entry, fieldMap.lng) ?? toNumber(entry.longitude),
  temperature: readField(entry, fieldMap.temperature),
  humidity: readField(entry, fieldMap.humidity),
  category: readField(entry, fieldMap.category),
});

export const deriveStatus = (fill, { thresholds, isOffline }) => {
  if (isOffline) return STATUS.OFFLINE;
  if (fill === null) return STATUS.MAINTENANCE;
  if (fill >= thresholds.full) return STATUS.FULL;
  if (fill >= thresholds.filling) return STATUS.FILLING;
  return STATUS.NORMAL;
};

/**
 * Finds collection events in a channel's history: a sharp drop in fill level
 * is the device telling us the bin was emptied.
 */
export const findCollections = (readings, dropPercent) => {
  const events = [];
  for (let i = 1; i < readings.length; i += 1) {
    const before = readings[i - 1].fill;
    const after = readings[i].fill;
    if (before === null || after === null) continue;
    if (before - after >= dropPercent) {
      events.push({ at: readings[i].at, from: before, to: after });
    }
  }
  return events;
};

/**
 * Builds one bin from one channel's feed.
 * `readings` are ordered oldest to newest, the order ThingSpeak returns them in.
 */
export const buildBin = (
  { channel, feeds, source },
  { fieldMap, thresholds, collectionDropPercent, binMeta, now = Date.now() },
) => {
  const readings = feeds.map((entry) => parseEntry(entry, fieldMap));
  const latest = readings[readings.length - 1] ?? null;
  const meta = binMeta[source.channelId] ?? {};

  const lastSeen = latest?.at ?? null;
  const silentFor = lastSeen ? now - lastSeen.getTime() : null;
  const isOffline = silentFor === null || silentFor > OFFLINE_AFTER_MS;

  // Position: the newest reading that actually carried coordinates, else the
  // channel's own metadata, else whatever the operator typed in Settings.
  const positioned = [...readings].reverse().find((r) => r.lat !== null && r.lng !== null);
  const lat = positioned?.lat ?? toNumber(channel.latitude) ?? toNumber(meta.lat);
  const lng = positioned?.lng ?? toNumber(channel.longitude) ?? toNumber(meta.lng);

  const collections = findCollections(readings, collectionDropPercent);
  const capacityKg = toNumber(meta.capacityKg);

  return {
    id: meta.label || channel.name || `CH-${source.channelId}`,
    channelId: String(source.channelId),
    location: meta.location || channel.metadata || channel.description || 'Location not set',
    ward: meta.ward || '',
    capacityKg,
    fill: latest?.fill ?? null,
    weight: latest?.weight ?? null,
    battery: latest?.battery ?? null,
    temperature: latest?.temperature ?? null,
    humidity: latest?.humidity ?? null,
    category: latest?.category ?? null,
    lat: lat ?? null,
    lng: lng ?? null,
    lastSeen,
    silentFor,
    isOffline,
    telemetryStatus: deriveStatus(latest?.fill ?? null, { thresholds, isOffline }),
    readings,
    collections,
    lastCollected: collections.length ? collections[collections.length - 1].at : null,
    lastEntryId: toNumber(channel.last_entry_id),
  };
};

/**
 * Operator actions (dispatch, maintenance flags) and open citizen reports sit
 * on top of the telemetry status without overwriting the sensor truth.
 */
export const applyOverlays = (bin, { assignments, maintenance, reports }) => {
  const assignment = assignments[bin.channelId];
  const openReport = reports.find(
    (report) => report.channelId === bin.channelId && report.status !== 'RESOLVED',
  );

  let status = bin.telemetryStatus;
  if (maintenance[bin.channelId]) status = STATUS.MAINTENANCE;
  else if (assignment) status = STATUS.ASSIGNED;
  else if (openReport && status !== STATUS.FULL) status = STATUS.REPORTED;

  return { ...bin, status, assignment: assignment ?? null, openReport: openReport ?? null };
};

/** Fill-level series for the selected bin, thinned to a chart-friendly length. */
export const fillSeries = (bin, maxPoints = 40) => {
  const points = bin.readings.filter((r) => r.fill !== null);
  const step = Math.max(1, Math.ceil(points.length / maxPoints));
  return points
    .filter((_, index) => index % step === 0)
    .map((r) => ({ at: r.at, time: formatTime(r.at), fill: r.fill, weight: r.weight }));
};

/** Collections per day across every bin, for the trend chart. */
export const collectionTrend = (bins, days = 7) => {
  const buckets = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    buckets.push({ day, label: formatDay(day), collected: 0 });
  }

  bins.forEach((bin) => {
    bin.collections.forEach((event) => {
      const stamp = new Date(event.at);
      stamp.setHours(0, 0, 0, 0);
      const bucket = buckets.find((b) => b.day.getTime() === stamp.getTime());
      if (bucket) bucket.collected += 1;
    });
  });

  return buckets.map(({ label, collected }) => ({ label, collected }));
};

/** Waste categories a device can publish on the mapped `category` field. */
export const CATEGORY_META = [
  { code: 0, name: 'Dry / Recyclable', hex: '#0ea5e9' },
  { code: 1, name: 'Wet / Organic', hex: '#22c55e' },
  { code: 2, name: 'Mixed / Reject', hex: '#f59e0b' },
  { code: 3, name: 'Hazardous', hex: '#f43f5e' },
];

/**
 * Counts every classified reading across all bins.
 * Returns an empty array when no device publishes the category field, which is
 * what the AI Segregation page uses to show its setup prompt.
 */
export const segregationBreakdown = (bins) => {
  const counts = new Map();
  bins.forEach((bin) => {
    bin.readings.forEach((reading) => {
      if (reading.category === null) return;
      const code = Math.round(reading.category);
      counts.set(code, (counts.get(code) ?? 0) + 1);
    });
  });

  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (!total) return [];

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, value]) => {
      const meta = CATEGORY_META.find((item) => item.code === code);
      return {
        code,
        name: meta?.name ?? `Category ${code}`,
        hex: meta?.hex ?? '#94a3b8',
        value,
        percent: Math.round((value / total) * 100),
      };
    });
};

export const statusDistribution = (bins) => {
  const counts = new Map();
  bins.forEach((bin) => {
    // Callers may pass raw telemetry bins that have not been through applyOverlays.
    const status = bin.status ?? bin.telemetryStatus ?? STATUS.OFFLINE;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  });

  return [...counts.entries()].map(([status, value]) => {
    const meta = STATUS_META[status] ?? STATUS_META[STATUS.OFFLINE];
    return {
      status,
      name: meta.label,
      value,
      fill: meta.hex,
      percent: bins.length ? Math.round((value / bins.length) * 100) : 0,
    };
  });
};

/* -- formatting helpers -------------------------------------------------- */

export const formatTime = (date) =>
  date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

export const formatDay = (date) =>
  date ? date.toLocaleDateString([], { day: 'numeric', month: 'short' }) : '—';

export const formatDateTime = (date) =>
  date ? `${formatTime(date)}, ${formatDay(date)}` : '—';

const isToday = (date) => {
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
};

/** Clock time for today's events, date + time for anything older. */
export const formatStamp = (date) =>
  !date ? '—' : isToday(date) ? formatTime(date) : `${formatDay(date)} ${formatTime(date)}`;

export const formatRelative = (date, now = Date.now()) => {
  if (!date) return 'never';
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export const formatNumber = (value, unit = '', digits = 1) =>
  value === null || value === undefined
    ? '—'
    : `${Number(value).toFixed(digits).replace(/\.0$/, '')}${unit}`;
