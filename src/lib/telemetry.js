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
  [STATUS.FILLING]: { label: 'Filling', dot: 'bg-sky-500', text: 'text-sky-600', hex: '#0ea5e9' },
  [STATUS.FULL]: { label: 'Full', dot: 'bg-rose-500', text: 'text-rose-600', hex: '#f43f5e' },
  [STATUS.REPORTED]: { label: 'Reported', dot: 'bg-violet-500', text: 'text-violet-600', hex: '#8b5cf6' },
  [STATUS.ASSIGNED]: { label: 'Assigned', dot: 'bg-amber-500', text: 'text-amber-600', hex: '#f59e0b' },
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

/**
 * Validates a coordinate pair.
 *
 * ThingSpeak reports `latitude: "0.0", longitude: "0.0"` for any channel whose
 * location was never set, and a device that has not got a GPS fix often sends
 * the same. Exactly (0, 0) is a spot in the Atlantic, never a real bin, so it
 * is treated as "no position" rather than plotted.
 */
export const validCoords = (lat, lng) => {
  if (lat === null || lng === null) return false;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

/**
 * A coordinate that parses but is almost certainly wrong.
 *
 * Half a coordinate is the common failure: a real latitude with the longitude
 * left blank (or the reverse) reads as 0 and puts the bin in the Atlantic. No
 * municipal bin sits exactly on the equator or the prime meridian, so treat a
 * lone zero as a data-entry mistake and say so rather than plotting it quietly.
 */
export const suspiciousCoords = (lat, lng) => {
  if (!validCoords(lat, lng)) return null;
  if (lat === 0) return 'Latitude is 0 — the longitude may have been entered on its own.';
  if (lng === 0) return 'Longitude is 0 — the latitude may have been entered on its own.';
  return null;
};

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
  { fieldMap, thresholds, collectionDropPercent, binMeta, index = 0, now = Date.now() },
) => {
  const readings = feeds.map((entry) => parseEntry(entry, fieldMap));
  const latest = readings[readings.length - 1] ?? null;
  const meta = binMeta[source.channelId] ?? {};

  const lastSeen = latest?.at ?? null;
  const silentFor = lastSeen ? now - lastSeen.getTime() : null;
  const isOffline = silentFor === null || silentFor > OFFLINE_AFTER_MS;

  // Position, most trusted first: a live fix from the device, then the address
  // the operator typed in Settings, then the channel's own location metadata.
  const fix = [...readings].reverse().find((r) => validCoords(r.lat, r.lng));
  const manual = [toNumber(meta.lat), toNumber(meta.lng)];
  const fromChannel = [toNumber(channel.latitude), toNumber(channel.longitude)];

  let lat = null;
  let lng = null;
  let positionSource = null;

  if (fix) {
    [lat, lng, positionSource] = [fix.lat, fix.lng, 'device'];
  } else if (validCoords(manual[0], manual[1])) {
    [lat, lng, positionSource] = [manual[0], manual[1], 'manual'];
  } else if (validCoords(fromChannel[0], fromChannel[1])) {
    [lat, lng, positionSource] = [fromChannel[0], fromChannel[1], 'channel'];
  }

  // A half-entered coordinate is worse than none: it plots confidently in the
  // ocean. Withhold it from the map and let the UI explain what to fix.
  const positionWarning = suspiciousCoords(lat, lng);
  if (positionWarning) {
    lat = null;
    lng = null;
  }

  const collections = findCollections(readings, collectionDropPercent);
  const capacityKg = toNumber(meta.capacityKg);

  return {
    id: meta.label || channel.name || `Eco Bin ${index + 1}`,
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
    lat,
    lng,
    positionSource: lat === null ? null : positionSource,
    positionWarning,
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

/**
 * Time series for the selected bin, thinned to a chart-friendly length.
 * Keeps any reading that carried a fill level or a weight, so a device that
 * only sends one of the two still charts.
 */
export const readingSeries = (bin, maxPoints = 60) => {
  const points = bin.readings.filter((r) => r.fill !== null || r.weight !== null);
  const step = Math.max(1, Math.ceil(points.length / maxPoints));
  return points
    .filter((_, index) => index % step === 0 || index === points.length - 1)
    .map((r) => ({
      at: r.at,
      label: formatStamp(r.at),
      full: formatDateTime(r.at),
      fill: r.fill,
      weight: r.weight,
    }));
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

/* -- priority ranking ----------------------------------------------------- */

export const PRIORITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

export const PRIORITY_META = {
  [PRIORITY.CRITICAL]: { label: 'Critical', hex: '#f43f5e' },
  [PRIORITY.HIGH]: { label: 'High', hex: '#f97316' },
  [PRIORITY.MEDIUM]: { label: 'Medium', hex: '#f59e0b' },
  [PRIORITY.LOW]: { label: 'Low', hex: '#10b981' },
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * How fast the bin is filling, in percentage points per hour.
 *
 * Only readings taken after the last collection count: an emptying event is a
 * cliff in the series, and averaging across it would report a bin that is
 * filling steadily as one that is losing waste. Returns null when the device
 * has not published enough recent points to extrapolate from honestly.
 */
export const fillRatePerHour = (bin, { windowHours = 6, now = Date.now() } = {}) => {
  const collectedAt = bin.lastCollected ? bin.lastCollected.getTime() : 0;
  const since = Math.max(now - windowHours * HOUR, collectedAt);

  const points = bin.readings.filter((r) => r.fill !== null && r.at.getTime() > since);
  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const hours = (last.at.getTime() - first.at.getTime()) / HOUR;
  // Two readings a minute apart say nothing about the next six hours.
  if (hours < 0.25) return null;

  return (last.fill - first.fill) / hours;
};

/**
 * Scores one bin on how urgently it needs a human, and says why.
 *
 * The score is additive so the reasons stay legible: every term that fires
 * appends a chip the operator can read back, and no single signal can silently
 * dominate. Fill level is the backbone; everything else adjusts around it.
 */
export const binPriority = (bin, { thresholds, now = Date.now() }) => {
  const reasons = [];
  let score = 0;

  if (bin.fill === null) {
    // No number to rank on. Say so rather than scoring it as an empty bin.
    reasons.push('No fill reading');
  } else if (bin.fill >= thresholds.full) {
    score += 60 + ((bin.fill - thresholds.full) / Math.max(1, 100 - thresholds.full)) * 20;
    reasons.push(`${bin.fill}% full`);
  } else if (bin.fill >= thresholds.filling) {
    score +=
      25 +
      ((bin.fill - thresholds.filling) / Math.max(1, thresholds.full - thresholds.filling)) * 30;
    reasons.push(`${bin.fill}% full`);
  } else {
    score += (bin.fill / Math.max(1, thresholds.filling)) * 25;
  }

  // A bin climbing fast outranks a fuller one that has stopped moving: by the
  // time the truck arrives, the fast one is the overflow.
  const fillRate = fillRatePerHour(bin, { now });
  const hoursToFull =
    fillRate !== null && fillRate > 0.5 && bin.fill !== null && bin.fill < thresholds.full
      ? (thresholds.full - bin.fill) / fillRate
      : null;

  if (hoursToFull !== null && hoursToFull <= 6) {
    score += 20 * (1 - hoursToFull / 6);
    reasons.push(hoursToFull < 1 ? 'Full within the hour' : `~${Math.round(hoursToFull)}h to full`);
  }

  // Someone stood in front of it and complained. That beats a clean sensor.
  if (bin.openReport) {
    score += 18;
    reasons.push(`Reported: ${bin.openReport.issueType}`);
  }

  // The load cell catches overflows the ultrasonic sensor misses — light bulky
  // waste reads as full, dense waste reads as empty while the bin is at weight.
  if (bin.capacityKg && bin.weight !== null) {
    const ratio = bin.weight / bin.capacityKg;
    if (ratio >= 1) {
      score += 15;
      reasons.push('Over capacity by weight');
    } else if (ratio >= 0.9) {
      score += 8;
      reasons.push(`${Math.round(ratio * 100)}% of capacity`);
    }
  }

  // A silent bin is an unknown, and an unknown cannot be planned around.
  if (bin.isOffline) {
    score += 35;
    reasons.push(bin.lastSeen ? `Silent ${formatRelative(bin.lastSeen, now)}` : 'Never reported');
  }

  if (bin.battery !== null && bin.battery < 20) {
    score += 10;
    reasons.push(`Battery ${bin.battery}%`);
  }

  // A slow bin still needs a visit eventually; three days is the nudge.
  const sinceCollected = bin.lastCollected ? now - bin.lastCollected.getTime() : null;
  if (sinceCollected !== null && sinceCollected > 3 * DAY) {
    score += Math.min(10, (sinceCollected / DAY - 3) * 2);
    reasons.push(`Uncollected ${Math.floor(sinceCollected / DAY)}d`);
  }

  // A truck is already on its way: keep the bin visible, but stop it sitting at
  // the top of a list of things nobody has dealt with yet.
  if (bin.assignment) {
    score *= 0.25;
    reasons.unshift(`${bin.assignment.truckId} en route`);
  }

  // Parked by the operator, so it is not a collection decision any more.
  if (bin.status === STATUS.MAINTENANCE) {
    score = Math.min(score, 15);
    reasons.unshift('Under maintenance');
  }

  score = Math.round(Math.max(0, Math.min(100, score)));

  const level =
    score >= 70
      ? PRIORITY.CRITICAL
      : score >= 45
        ? PRIORITY.HIGH
        : score >= 22
          ? PRIORITY.MEDIUM
          : PRIORITY.LOW;

  return { score, level, reasons, fillRate, hoursToFull };
};

/** Every bin, most urgent first. Ties break on the fuller bin. */
export const priorityRanking = (bins, options) =>
  bins
    .map((bin) => ({ bin, ...binPriority(bin, options) }))
    .sort((a, b) => b.score - a.score || (b.bin.fill ?? -1) - (a.bin.fill ?? -1));
