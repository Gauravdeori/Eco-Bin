import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../config/settings';
import { useThingSpeak } from '../hooks/useThingSpeak';
import { useLocalState } from '../hooks/useLocalState';
import {
  STATUS,
  applyOverlays,
  buildBin,
  collectionTrend,
  statusDistribution,
} from '../lib/telemetry';

const EcoBinContext = createContext(null);

const reviveReports = (reports) =>
  reports.map((report) => ({ ...report, at: new Date(report.at) }));

const reviveAlerts = (alerts) =>
  alerts.map((alert) => ({ ...alert, at: new Date(alert.at) }));

const ALERT_LIMIT = 60;

export const EcoBinProvider = ({ children }) => {
  /* ── configuration ──────────────────────────────────────────────────────── */
  const [settings, setSettings] = useState(loadSettings);

  const updateSettings = useCallback((patch) => {
    setSettings((current) => {
      const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  /* ── theme ──────────────────────────────────────────────────────────────── */
  const [theme, setThemeState] = useState(() => localStorage.getItem('ecobin.theme') || 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('ecobin.theme', theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState((current) => next || (current === 'dark' ? 'light' : 'dark'));
  }, []);

  /* ── live telemetry ─────────────────────────────────────────────────────── */
  const { results, errors, status: linkStatus, lastSync, refresh } = useThingSpeak({
    channels: settings.channels,
    pollSeconds: settings.pollSeconds,
    historyPoints: settings.historyPoints,
  });

  /* ── operator-owned records (persisted locally, never seeded) ───────────── */
  const [reports, setReports] = useLocalState('ecobin.reports.v1', [], { revive: reviveReports });
  const [alerts, setAlerts] = useLocalState('ecobin.alerts.v1', [], { revive: reviveAlerts });
  const [trucks, setTrucks] = useLocalState('ecobin.trucks.v1', []);
  const [assignments, setAssignments] = useLocalState('ecobin.assignments.v1', {});
  const [maintenance, setMaintenance] = useLocalState('ecobin.maintenance.v1', {});

  /* ── UI state ───────────────────────────────────────────────────────────── */
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [page, setPage] = useState('dashboard');

  const pushAlert = useCallback(
    (alert) => {
      setAlerts((current) =>
        [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date(), ...alert }, ...current].slice(
          0,
          ALERT_LIMIT,
        ),
      );
    },
    [setAlerts],
  );

  /* ── raw feeds → bins ───────────────────────────────────────────────────── */
  const telemetryBins = useMemo(
    () =>
      results.map((result) =>
        buildBin(result, {
          fieldMap: settings.fieldMap,
          thresholds: settings.thresholds,
          collectionDropPercent: settings.collectionDropPercent,
          binMeta: settings.binMeta,
        }),
      ),
    [results, settings.fieldMap, settings.thresholds, settings.collectionDropPercent, settings.binMeta],
  );

  const bins = useMemo(
    () => telemetryBins.map((bin) => applyOverlays(bin, { assignments, maintenance, reports })),
    [telemetryBins, assignments, maintenance, reports],
  );

  const selectedBin = useMemo(
    () => bins.find((bin) => bin.channelId === selectedChannelId) ?? bins[0] ?? null,
    [bins, selectedChannelId],
  );

  /* ── alerts derived from real telemetry transitions ─────────────────────── */
  const previousRef = useRef(new Map());

  useEffect(() => {
    if (telemetryBins.length === 0) return;
    const previous = previousRef.current;

    telemetryBins.forEach((bin) => {
      const before = previous.get(bin.channelId);
      previous.set(bin.channelId, {
        status: bin.telemetryStatus,
        entryId: bin.readings.at(-1)?.entryId ?? null,
        lastCollectedAt: bin.lastCollected?.getTime() ?? null,
        battery: bin.battery,
      });

      if (!before) return; // first sighting of a channel is not an event

      if (before.status !== bin.telemetryStatus) {
        if (bin.telemetryStatus === STATUS.FULL) {
          pushAlert({
            kind: 'FULL',
            title: `${bin.id} is full`,
            detail: `${bin.fill}% · ${bin.location}`,
            channelId: bin.channelId,
          });
        } else if (bin.telemetryStatus === STATUS.FILLING && before.status === STATUS.NORMAL) {
          pushAlert({
            kind: 'FILLING',
            title: `${bin.id} crossed ${settings.thresholds.filling}%`,
            detail: `${bin.fill}% · ${bin.location}`,
            channelId: bin.channelId,
          });
        } else if (bin.telemetryStatus === STATUS.OFFLINE) {
          pushAlert({
            kind: 'OFFLINE',
            title: `${bin.id} stopped reporting`,
            detail: `No data from channel ${bin.channelId}`,
            channelId: bin.channelId,
          });
        }
      }

      // A collection newer than the one we last saw: the bin was emptied.
      const collectedAt = bin.lastCollected?.getTime() ?? null;
      if (collectedAt !== null && collectedAt !== before.lastCollectedAt) {
        pushAlert({
          kind: 'COLLECTED',
          title: `${bin.id} collected`,
          detail: `Fill dropped to ${bin.fill}%`,
          channelId: bin.channelId,
        });
        setAssignments((current) => {
          if (!current[bin.channelId]) return current;
          const next = { ...current };
          delete next[bin.channelId];
          return next;
        });
        setReports((current) =>
          current.map((report) =>
            report.channelId === bin.channelId && report.status !== 'RESOLVED'
              ? { ...report, status: 'RESOLVED' }
              : report,
          ),
        );
      }

      if (before.battery !== null && bin.battery !== null && before.battery >= 20 && bin.battery < 20) {
        pushAlert({
          kind: 'BATTERY',
          title: `${bin.id} battery low`,
          detail: `${bin.battery}% remaining`,
          channelId: bin.channelId,
        });
      }
    });
  }, [telemetryBins, pushAlert, setAssignments, setReports, settings.thresholds.filling]);

  /* ── aggregate stats, all computed from live readings ───────────────────── */
  const stats = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const collectedToday = bins.reduce(
      (total, bin) => total + bin.collections.filter((event) => event.at >= startOfDay).length,
      0,
    );

    const full = bins.filter((bin) => bin.status === STATUS.FULL).length;
    const needsAttention = bins.filter(
      (bin) =>
        bin.status === STATUS.OFFLINE ||
        bin.status === STATUS.MAINTENANCE ||
        bin.status === STATUS.REPORTED ||
        (bin.battery !== null && bin.battery < 20),
    ).length;

    const pending = bins.filter(
      (bin) => bin.status === STATUS.FULL || bin.status === STATUS.ASSIGNED,
    ).length;

    const trucksOnRoute = trucks.filter((truck) => truck.status === 'ON_ROUTE').length;

    return {
      totalBins: bins.length,
      full,
      needsAttention,
      collectedToday,
      pending,
      trucksActive: trucksOnRoute,
      trucksTotal: trucks.length,
      openReports: reports.filter((report) => report.status !== 'RESOLVED').length,
      completion: collectedToday + pending > 0
        ? Math.round((collectedToday / (collectedToday + pending)) * 100)
        : 0,
    };
  }, [bins, trucks, reports]);

  const analytics = useMemo(
    () => ({
      trend: collectionTrend(bins, 7),
      distribution: statusDistribution(bins),
    }),
    [bins],
  );

  /* ── actions ────────────────────────────────────────────────────────────── */
  const assignTruck = useCallback(
    (channelId, truckId) => {
      const bin = bins.find((item) => item.channelId === channelId);
      const truck =
        trucks.find((item) => item.id === truckId) ??
        trucks.find((item) => item.status === 'IDLE') ??
        trucks[0];
      if (!bin || !truck) return { ok: false, reason: 'no-truck' };

      setAssignments((current) => ({
        ...current,
        [channelId]: { truckId: truck.id, driver: truck.driver, at: new Date().toISOString() },
      }));
      setTrucks((current) =>
        current.map((item) => (item.id === truck.id ? { ...item, status: 'ON_ROUTE' } : item)),
      );
      pushAlert({
        kind: 'DISPATCH',
        title: `${truck.id} assigned to ${bin.id}`,
        detail: bin.location,
        channelId,
      });
      return { ok: true, truck };
    },
    [bins, trucks, setAssignments, setTrucks, pushAlert],
  );

  const clearAssignment = useCallback(
    (channelId) => {
      setAssignments((current) => {
        const assignment = current[channelId];
        if (!assignment) return current;
        setTrucks((fleet) =>
          fleet.map((truck) =>
            truck.id === assignment.truckId ? { ...truck, status: 'IDLE' } : truck,
          ),
        );
        const next = { ...current };
        delete next[channelId];
        return next;
      });
    },
    [setAssignments, setTrucks],
  );

  const toggleMaintenance = useCallback(
    (channelId) => {
      setMaintenance((current) => {
        const next = { ...current };
        if (next[channelId]) delete next[channelId];
        else next[channelId] = { since: new Date().toISOString() };
        return next;
      });
    },
    [setMaintenance],
  );

  const submitReport = useCallback(
    ({ channelId, issueType, details, reporter }) => {
      const bin = bins.find((item) => item.channelId === channelId);
      const report = {
        id: `CR-${Date.now().toString().slice(-6)}`,
        channelId,
        binId: bin?.id ?? channelId,
        location: bin?.location ?? 'Unknown location',
        issueType,
        details: details?.trim() || '',
        reporter: reporter || 'Citizen',
        status: 'SUBMITTED',
        at: new Date(),
      };
      setReports((current) => [report, ...current]);
      pushAlert({
        kind: 'REPORT',
        title: `Reported by citizen`,
        detail: `${report.binId} · ${issueType}`,
        channelId,
      });
      return report;
    },
    [bins, setReports, pushAlert],
  );

  const resolveReport = useCallback(
    (reportId) => {
      setReports((current) =>
        current.map((report) =>
          report.id === reportId ? { ...report, status: 'RESOLVED' } : report,
        ),
      );
    },
    [setReports],
  );

  const addTruck = useCallback(
    ({ id, driver, capacityKg }) => {
      const truck = {
        id: id?.trim() || `TR-${String(trucks.length + 1).padStart(2, '0')}`,
        driver: driver?.trim() || 'Unassigned',
        capacityKg: Number(capacityKg) || null,
        status: 'IDLE',
      };
      setTrucks((current) => [...current, truck]);
      return truck;
    },
    [trucks.length, setTrucks],
  );

  const removeTruck = useCallback(
    (truckId) => setTrucks((current) => current.filter((truck) => truck.id !== truckId)),
    [setTrucks],
  );

  const setTruckStatus = useCallback(
    (truckId, status) =>
      setTrucks((current) =>
        current.map((truck) => (truck.id === truckId ? { ...truck, status } : truck)),
      ),
    [setTrucks],
  );

  const clearAlerts = useCallback(() => setAlerts([]), [setAlerts]);

  const value = {
    theme,
    setTheme,
    page,
    setPage,
    settings,
    updateSettings,
    resetSettings,
    linkStatus,
    lastSync,
    linkErrors: errors,
    refresh,
    bins,
    selectedBin,
    selectedChannelId,
    setSelectedChannelId,
    reports,
    alerts,
    trucks,
    assignments,
    maintenance,
    stats,
    analytics,
    assignTruck,
    clearAssignment,
    toggleMaintenance,
    submitReport,
    resolveReport,
    addTruck,
    removeTruck,
    setTruckStatus,
    clearAlerts,
  };

  return <EcoBinContext.Provider value={value}>{children}</EcoBinContext.Provider>;
};

export const useEcoBin = () => {
  const context = useContext(EcoBinContext);
  if (!context) throw new Error('useEcoBin must be used inside <EcoBinProvider>');
  return context;
};
