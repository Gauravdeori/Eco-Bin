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
import { useSharedState } from '../hooks/useSharedState';
import { simulatedBins } from '../lib/simulation';
import { headingDeg, planFleetRuns, positionAlong, sweepPartition } from '../services/fleet';
import { collection, onSnapshot } from 'firebase/firestore';
import { LIVE_PATH, firebaseConfigured, firestore } from '../services/firebase';
import {
  STATUS,
  applyOverlays,
  buildBin,
  collectionTrend,
  priorityLevel,
  priorityRanking,
  statusDistribution,
} from '../lib/telemetry';

const EcoBinContext = createContext(null);

const reviveReports = (reports) =>
  reports.map((report) => ({ ...report, at: new Date(report.at) }));

const reviveAlerts = (alerts) =>
  alerts.map((alert) => ({ ...alert, at: new Date(alert.at) }));

const ALERT_LIMIT = 60;

/** How long to leave a truck alone after its route failed to plan. */
const RETRY_AFTER_MS = 60 * 1000;

/**
 * A fleet to start with, so collection runs itself from the first load.
 *
 * Auto-dispatch has nothing to dispatch without trucks, and an operator should
 * not have to discover that by watching bins go red and stay there. Three
 * vehicles of different sizes is enough for the fit rule in `pickTruck` to have
 * a real choice to make.
 *
 * The drivers are deliberately unnamed. Inventing crew is the one thing this
 * app must not do — every other number on screen came from a device — so the
 * vehicles are real enough to route and the people are left for the operator to
 * fill in on the Trucks page.
 */
const STARTER_FLEET = [
  { id: 'TR-01', driver: 'Unassigned', capacityKg: 500, status: 'IDLE' },
  { id: 'TR-02', driver: 'Unassigned', capacityKg: 800, status: 'IDLE' },
  { id: 'TR-03', driver: 'Unassigned', capacityKg: 1200, status: 'IDLE' },
];

/** Set once a browser has been offered the starter fleet, so it is offered once. */
const FLEET_SEEDED_KEY = 'ecobin.fleet.seeded.v1';

/** Simulation clock granularity — see where simNow is set. */
const SIM_TICK_MS = 15 * 1000;
const quantise = (ms) => Math.floor(ms / SIM_TICK_MS) * SIM_TICK_MS;

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

  /* ── operator-owned records (persisted, and only the fleet is seeded) ───── */
  const [reports, setReports] = useSharedState('ecobin.reports.v1', [], { revive: reviveReports });
  const [alerts, setAlerts] = useSharedState('ecobin.alerts.v1', [], { revive: reviveAlerts });
  const [trucks, setTrucks, trucksReady] = useSharedState('ecobin.trucks.v1', STARTER_FLEET);
  const [assignments, setAssignments] = useSharedState('ecobin.assignments.v1', {});
  const [maintenance, setMaintenance] = useSharedState('ecobin.maintenance.v1', {});
  /** channelId → epoch ms until which auto-dispatch leaves a bin alone. */
  const [dispatchHolds, setDispatchHolds] = useSharedState('ecobin.dispatchholds.v1', {});
  /** truckId → the run it is currently driving. */
  const [runs, setRuns] = useSharedState('ecobin.runs.v1', {});
  /** channelId → when a simulated truck last emptied it. */
  const [simCollections, setSimCollections] = useSharedState('ecobin.simcollections.v1', {});

  /** Read by the collection check, which must not depend on them directly. */
  const runsRef = useRef({});
  const assignmentsRef = useRef({});

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

  /**
   * Simulated bins move with the clock, so they need their own heartbeat: with
   * no real channel connected nothing else re-renders and the demo fleet would
   * sit frozen at whatever it read on load.
   */
  const [simNow, setSimNow] = useState(() => quantise(Date.now()));
  useEffect(() => {
    if (!settings.simulation?.enabled) return undefined;
    // Quantised so that most ticks hand setState the value it already has and
    // React bails, instead of manufacturing a fresh identity for bins that
    // look identical and dragging every memo downstream with them. Fifteen
    // seconds matches what a device is allowed to publish, so nothing visible
    // is lost. Trucks run on their own one-second clock regardless.
    const id = setInterval(() => setSimNow(quantise(Date.now())), 5000);
    return () => clearInterval(id);
  }, [settings.simulation?.enabled]);

  /**
   * The freshest reading per channel, pushed straight into Firestore.
   *
   * ThingSpeak accepts a write every fifteen seconds and is polled besides, so
   * that path can never beat ~20 seconds to the screen. A device that also
   * POSTs its reading to the EcoBin server (or writes this document itself)
   * shows up here on the next tick of the network — about a second.
   */
  const [liveReadings, setLiveReadings] = useState({});

  useEffect(() => {
    if (!firestore) return undefined;
    return onSnapshot(
      collection(firestore, ...LIVE_PATH),
      (snapshot) => {
        const next = {};
        snapshot.forEach((docSnap) => {
          try {
            next[docSnap.id] = JSON.parse(docSnap.data().json);
          } catch {
            /* one malformed reading is not worth losing the rest */
          }
        });
        setLiveReadings(next);
      },
      () => {
        /* offline or refused — polling still covers everything, just slower */
      },
    );
  }, []);

  /* ── raw feeds → bins ───────────────────────────────────────────────────── */
  const telemetryBins = useMemo(() => {
    const live = results.map((result, index) => {
      /**
       * If a pushed reading is newer than the last polled entry, append it, so
       * the whole pipeline — status, ranking, offline detection — treats it as
       * telemetry. Once ThingSpeak catches up, its own entry is newer and the
       * pushed one simply stops mattering; nothing needs de-duplicating.
       */
      const pushed = liveReadings[String(result.source.channelId)];
      let feeds = result.feeds;
      if (pushed?.created_at) {
        const lastAt = feeds.length
          ? Date.parse(feeds[feeds.length - 1].created_at)
          : -Infinity;
        if (Date.parse(pushed.created_at) > lastAt) feeds = [...feeds, pushed];
      }

      return buildBin({ ...result, feeds }, {
        index,
        fieldMap: settings.fieldMap,
        thresholds: settings.thresholds,
        collectionDropPercent: settings.collectionDropPercent,
        binMeta: settings.binMeta,
      });
    });

    if (!settings.simulation?.enabled) return live;

    // Simulated bins sit after the real ones so a live channel always ranks
    // first in the list and keeps index 0 in the map's fallback centring.
    return [
      ...live,
      ...simulatedBins({
        centre: settings.mapCenter,
        thresholds: settings.thresholds,
        /**
         * Never behind a collection that has just happened.
         *
         * The quantised clock can sit a few seconds in the past, and a bin is
         * only emptied for readings at or after the pickup — so a truck
         * arriving between ticks would have its collection ignored until the
         * clock caught up, and the bin would sit full with its job done.
         */
        now: Math.max(simNow, ...Object.values(simCollections), 0),
        collections: simCollections,
      }),
    ];
  }, [
    results,
    simNow,
    liveReadings,
    settings.fieldMap,
    settings.thresholds,
    settings.collectionDropPercent,
    settings.binMeta,
    settings.simulation?.enabled,
    settings.mapCenter,
    simCollections,
  ]);

  /** Bins the active runs have already reached, whatever their sensors say. */
  const arrived = useMemo(() => {
    const set = new Set();
    Object.values(runs).forEach((run) => {
      (run.collected ?? []).forEach((channelId) => set.add(channelId));
    });
    return set;
  }, [runs]);

  const bins = useMemo(
    () =>
      telemetryBins.map((bin) =>
        applyOverlays(bin, { assignments, maintenance, reports, arrived }),
      ),
    [telemetryBins, assignments, maintenance, reports, arrived],
  );

  const selectedBin = useMemo(
    () => bins.find((bin) => bin.channelId === selectedChannelId) ?? bins[0] ?? null,
    [bins, selectedChannelId],
  );

  /**
   * The priority ranking, worked out once per telemetry update.
   *
   * Scoring a bin walks its whole reading history to find its fill rate, and
   * five separate places wanted the answer: the priority list, auto-dispatch,
   * the run planner, the map's route banding and the live run colours. Each
   * recomputed it, and the last of those runs on a one-second clock while a
   * truck is driving, so the same scan was being redone for every stop of
   * every run every second. Doing it here ties the work to the data changing
   * instead of to the clock.
   */
  const ranking = useMemo(
    () => priorityRanking(bins, { thresholds: settings.thresholds }),
    [bins, settings.thresholds],
  );

  /** The same scores, addressable by channel. */
  const priorityByChannel = useMemo(() => {
    const map = new Map();
    ranking.forEach((entry) => map.set(entry.bin.channelId, entry));
    return map;
  }, [ranking]);

  /* ── alerts derived from real telemetry transitions ─────────────────────── */

  /**
   * Synced here, before the effect below, because effects run in declaration
   * order. The collection check reads these refs, and syncing them at the
   * bottom of the component meant it always saw the previous commit's runs —
   * so a truck's arrival was invisible for exactly the tick that mattered,
   * and the collection it enabled was deferred.
   */
  useEffect(() => {
    runsRef.current = runs;
    assignmentsRef.current = assignments;
  });

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

      /**
       * A fill drop while the assigned truck is still on its way was not that
       * truck's doing.
       *
       * Somebody lifting the bag out by hand, or a sensor head getting covered,
       * looks exactly like a pickup to the fill reading. Believing it would
       * close the job, free the truck and clear the bin off the board while a
       * driver is ten minutes out and still needs to make the stop. So the
       * collection is only registered once the truck has actually reached it;
       * until then the run stands and the bin keeps showing what it was
       * dispatched for.
       */
      const pending = assignmentsRef.current[bin.channelId];
      const run = pending ? runsRef.current[pending.truckId] : null;
      /**
       * Only a live run can say a truck has not arrived yet. Without one there
       * is no arrival information to withhold the collection on, so the sensor
       * is trusted — otherwise an assignment whose route failed to plan would
       * block its own collection for ever, stranding the bin and never
       * returning the truck to the pool.
       */
      const stillOnItsWay = Boolean(run) && !(run.collected ?? []).includes(bin.channelId);

      /**
       * A collection deferred because the truck had not arrived yet must be
       * seen again on the next tick. The snapshot above already recorded the
       * new lastCollected, which would make the comparison below pass exactly
       * once — this tick — and never again. Rewinding the snapshot keeps the
       * event alive until the truck gets there and it can be registered.
       */
      if (collectedAt !== null && collectedAt !== before.lastCollectedAt && stillOnItsWay) {
        previous.set(bin.channelId, {
          ...previous.get(bin.channelId),
          lastCollectedAt: before.lastCollectedAt,
        });
      }

      if (collectedAt !== null && collectedAt !== before.lastCollectedAt && !stillOnItsWay) {
        pushAlert({
          kind: 'COLLECTED',
          title: `${bin.id} collected`,
          detail: `Fill dropped to ${bin.fill}%`,
          channelId: bin.channelId,
        });
        setAssignments((current) => {
          const assignment = current[bin.channelId];
          if (!assignment) return current;
          // The run is over, so the truck returns to the idle pool. Without
          // this it stays ON_ROUTE for ever and is never dispatched again.
          setTrucks((fleet) =>
            fleet.map((truck) =>
              truck.id === assignment.truckId ? { ...truck, status: 'IDLE' } : truck,
            ),
          );
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
  }, [telemetryBins, pushAlert, setAssignments, setReports, setTrucks, settings.thresholds.filling]);

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

    // Live load across the fleet. Only bins whose device actually published a
    // weight count towards it, so a fleet where nobody reports weight shows a
    // dash rather than a confident 0 kg.
    const weighed = bins.filter((bin) => bin.weight !== null);
    const totalWeight = weighed.length
      ? weighed.reduce((total, bin) => total + bin.weight, 0)
      : null;
    // Capacity is operator-entered per bin; only sum it when every weighed bin
    // has one, otherwise the percentage would be measured against a part fleet.
    const totalCapacity =
      weighed.length && weighed.every((bin) => bin.capacityKg)
        ? weighed.reduce((total, bin) => total + bin.capacityKg, 0)
        : null;

    return {
      totalBins: bins.length,
      full,
      needsAttention,
      collectedToday,
      pending,
      trucksActive: trucksOnRoute,
      trucksTotal: trucks.length,
      totalWeight,
      totalCapacity,
      weighedBins: weighed.length,
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

  /* -- collection runs ----------------------------------------------------- */

  /** Where runs start and end. The map centre stands in until a depot is set. */
  const depotPoint = useMemo(() => {
    const { lat, lng } = settings.depot ?? {};
    if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) return [lat, lng];
    return [settings.mapCenter.lat, settings.mapCenter.lng];
  }, [settings.depot, settings.mapCenter]);

  const [planning, setPlanning] = useState(false);

  /**
   * Splits the bins that need collecting across the free trucks and plans an
   * optimised run for each. The split happens before any routing, because which
   * truck takes which bin decides far more of the total distance than the order
   * of stops within one run does.
   */
  const planRuns = useCallback(
    async ({ scope = 'DUE' } = {}) => {
      const positioned = bins.filter((bin) => bin.lat !== null && bin.lng !== null);
      const candidates =
        scope === 'ALL'
          ? positioned
          : positioned.filter(
              (bin) => priorityByChannel.get(bin.channelId)?.needsCollection,
            );

      // A truck already driving a run is left alone rather than re-planned out
      // from under its driver.
      const available = trucks.filter(
        (truck) => truck.status !== 'MAINTENANCE' && !runs[truck.id],
      );

      if (candidates.length === 0) return { ok: false, reason: 'no-bins' };
      if (available.length === 0) return { ok: false, reason: 'no-trucks' };

      const stops = candidates.map((bin) => ({
        id: bin.channelId,
        name: bin.id,
        point: [bin.lat, bin.lng],
        loadKg: bin.weight ?? 0,
      }));

      setPlanning(true);
      try {
        const { groups, unassigned } = sweepPartition(stops, available, depotPoint);
        const planned = await planFleetRuns(groups, {
          apiKey: settings.orsKey,
          depot: depotPoint,
          startedAt: Date.now(),
        });

        setRuns((current) => {
          const next = { ...current };
          planned.forEach((run) => {
            next[run.truckId] = run;
          });
          return next;
        });

        setTrucks((fleet) =>
          fleet.map((truck) =>
            planned.some((run) => run.truckId === truck.id)
              ? { ...truck, status: 'ON_ROUTE' }
              : truck,
          ),
        );

        setAssignments((current) => {
          const next = { ...current };
          planned.forEach((run) => {
            run.stops.forEach((channelId) => {
              next[channelId] = {
                truckId: run.truckId,
                driver: run.driver,
                at: new Date().toISOString(),
                auto: true,
              };
            });
          });
          return next;
        });

        planned.forEach((run) => {
          pushAlert({
            kind: 'DISPATCH',
            title: `${run.truckId} routed through ${run.stops.length} bin${run.stops.length === 1 ? '' : 's'}`,
            detail: `${(run.distanceM / 1000).toFixed(1)} km \u00b7 ${run.stopNames.join(' \u2192 ')}`,
          });
        });

        return { ok: true, runs: planned, unassigned };
      } catch (error) {
        return { ok: false, reason: 'route-failed', message: error.message };
      } finally {
        setPlanning(false);
      }
    },
    [
      bins,
      trucks,
      runs,
      depotPoint,
      priorityByChannel,
      settings.orsKey,
      setRuns,
      setTrucks,
      setAssignments,
      pushAlert,
    ],
  );

  /** Abandons a run and frees its truck, leaving the bins for the next plan. */
  const cancelRun = useCallback(
    (truckId) => {
      const run = runs[truckId];
      if (!run) return;

      setRuns((current) => {
        const next = { ...current };
        delete next[truckId];
        return next;
      });
      setTrucks((fleet) =>
        fleet.map((truck) => (truck.id === truckId ? { ...truck, status: 'IDLE' } : truck)),
      );
      setAssignments((current) => {
        const next = { ...current };
        run.stops.forEach((channelId) => {
          if (next[channelId]?.truckId === truckId) delete next[channelId];
        });
        return next;
      });
    },
    [runs, setRuns, setTrucks, setAssignments],
  );

  /**
   * Any truck holding assignments but not yet driving gets a run planned.
   *
   * This is the one place a run is created, so every route into dispatch ends
   * up in the same state: pressing "assign" on a bin, auto-dispatch picking one
   * unprompted, and planning the whole fleet all just write an assignment, and
   * the truck starts moving from here. Without it, a manually assigned truck
   * sat still while a fleet-dispatched one drove.
   */
  const routing = useRef(new Set());
  /**
   * When a truck's route last failed to plan.
   *
   * Bins refresh on every poll, which re-runs this effect. Without a cooldown a
   * route that cannot be planned at all — a rejected API key, say — would be
   * retried every few seconds for as long as the assignment stands, quietly
   * burning the request quota that the retries need.
   */
  const routeFailedAt = useRef(new Map());

  useEffect(() => {
    const pending = new Map();
    Object.entries(assignments).forEach(([channelId, assignment]) => {
      const truckId = assignment?.truckId;
      if (!truckId || runs[truckId] || routing.current.has(truckId)) return;
      const failedAt = routeFailedAt.current.get(truckId);
      if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return;
      const bin = bins.find((item) => item.channelId === channelId);
      if (!bin || bin.lat === null || bin.lng === null) return;
      if (!pending.has(truckId)) pending.set(truckId, []);
      pending.get(truckId).push(bin);
    });

    if (pending.size === 0) return;

    let cancelled = false;
    const truckIds = [...pending.keys()];
    truckIds.forEach((id) => routing.current.add(id));

    (async () => {
      try {
        const groups = truckIds
          .map((truckId) => {
            const truck = trucks.find((item) => item.id === truckId);
            if (!truck) return null;
            const stops = pending.get(truckId).map((bin) => ({
              id: bin.channelId,
              name: bin.id,
              point: [bin.lat, bin.lng],
              loadKg: bin.weight ?? 0,
            }));
            return { truck, stops, loadKg: stops.reduce((sum, stop) => sum + stop.loadKg, 0) };
          })
          .filter(Boolean);

        if (groups.length === 0) return;

        const planned = await planFleetRuns(groups, {
          apiKey: settings.orsKey,
          depot: depotPoint,
          startedAt: Date.now(),
        });
        if (cancelled) return;

        setRuns((current) => {
          const next = { ...current };
          planned.forEach((run) => {
            if (!next[run.truckId]) next[run.truckId] = run;
          });
          return next;
        });
        setTrucks((fleet) =>
          fleet.map((truck) =>
            planned.some((run) => run.truckId === truck.id)
              ? { ...truck, status: 'ON_ROUTE' }
              : truck,
          ),
        );
      } catch {
        // A route that cannot be fetched leaves the assignment standing. The
        // bin is still assigned and the operator still sees it; only the
        // on-map tracking is missing, which is better than dropping the job.
        truckIds.forEach((id) => routeFailedAt.current.set(id, Date.now()));
      } finally {
        truckIds.forEach((id) => routing.current.delete(id));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assignments, runs, bins, trucks, depotPoint, settings.orsKey, setRuns, setTrucks]);

  /* -- driving the runs ---------------------------------------------------- */

  /** Ticks only while something is actually moving. */
  const [clock, setClock] = useState(() => Date.now());
  const anyRuns = Object.keys(runs).length > 0;

  useEffect(() => {
    if (!anyRuns) return undefined;
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyRuns]);

  /**
   * Where each truck is right now.
   *
   * A real round takes most of an hour, which is unwatchable, so simulated time
   * runs faster than the clock by `simulation.speed`. The distance, the stop
   * order and the fuel figures are all real -- only the playback is sped up.
   */
  const fleetRuns = useMemo(() => {
    const speed = Math.max(1, settings.simulation?.speed ?? 20);
    return Object.values(runs).map((run) => {
      const elapsedS = ((clock - run.startedAt) / 1000) * speed;
      const progress = run.durationS > 0 ? Math.min(1, elapsedS / run.durationS) : 1;
      const position = positionAlong(run.path, progress);
      // Sample a little further along to work out which way it is pointing.
      const ahead = positionAlong(run.path, Math.min(1, progress + 0.008));

      /**
       * How urgent the rest of this run is, on the same scale as a single bin.
       *
       * Measured over the stops still to be collected, not every stop on the
       * route: a run's urgency is the work it has left, so it cools from red
       * towards green as the truck empties its way round rather than staying
       * red all the way back to the depot.
       *
       * The average is the base, because the question a route colour answers is
       * how bad this run is overall. A single critical bin among four quiet
       * ones is not a red route, so the count of critical stops is carried
       * separately rather than being allowed to swing the whole line.
       *
       * How many of the stops are actually over the full threshold then lifts
       * it. Averaging alone is too forgiving at the top: a run where every bin
       * sits in the eighties averages just under the critical band and draws
       * orange, when a route made entirely of full bins is the exact thing an
       * operator needs to see in red. The share of full stops is what closes
       * that gap, and it cannot rescue a run that is mostly empty.
       */
      const remaining = run.stops
        .filter((channelId) => !run.collected.includes(channelId))
        .map((channelId) => priorityByChannel.get(channelId))
        .filter(Boolean);

      const fullShare = remaining.length
        ? remaining.filter(
            (entry) => entry.bin.fill !== null && entry.bin.fill >= settings.thresholds.full,
          ).length / remaining.length
        : 0;

      const urgency = remaining.length
        ? Math.min(
            100,
            Math.round(
              remaining.reduce((total, item) => total + item.score, 0) / remaining.length +
                fullShare * 15,
            ),
          )
        : 0;

      return {
        urgency,
        level: priorityLevel(urgency),
        criticalStops: remaining.filter((item) => item.score >= 70).length,
        stopsLeft: remaining.length,
        ...run,
        progress,
        position,
        heading: headingDeg(position, ahead),
        /**
         * Journey time left, not wall-clock time left.
         *
         * Sped-up playback finishes an eleven minute run in thirty seconds, and
         * an ETA counting down in real seconds would read "0 min" almost at
         * once. The driver's remaining journey is the honest number and the one
         * anybody tracking a vehicle expects to see.
         */
        remainingS: Math.max(0, run.durationS - elapsedS),
        stopsDone: run.fractions.filter((fraction) => progress >= fraction).length,
        finished: progress >= 1,
      };
    });
  }, [runs, clock, priorityByChannel, settings.simulation?.speed, settings.thresholds]);

  /** Arrivals, and runs that have made it back to the depot. */
  useEffect(() => {
    if (fleetRuns.length === 0) return;

    const arrived = [];
    const finished = [];

    fleetRuns.forEach((run) => {
      run.fractions.forEach((fraction, index) => {
        const channelId = run.stops[index];
        if (run.progress >= fraction && !run.collected.includes(channelId)) {
          arrived.push({ truckId: run.truckId, channelId });
        }
      });
      if (run.finished) finished.push(run);
    });

    if (arrived.length === 0 && finished.length === 0) return;

    if (arrived.length > 0) {
      const at = Date.now();
      // Only a simulated bin can be emptied from here. A real one is emptied by
      // a real crew, and its own telemetry is what says so.
      const simulated = arrived.filter(({ channelId }) => String(channelId).startsWith('sim-'));
      if (simulated.length > 0) {
        setSimCollections((current) => {
          const next = { ...current };
          simulated.forEach(({ channelId }) => {
            next[channelId] = at;
          });
          return next;
        });
      }

      setRuns((current) => {
        const next = { ...current };
        arrived.forEach(({ truckId, channelId }) => {
          const run = next[truckId];
          if (!run || run.collected.includes(channelId)) return;
          next[truckId] = { ...run, collected: [...run.collected, channelId] };
        });
        return next;
      });
    }

    if (finished.length > 0) {
      setRuns((current) => {
        const next = { ...current };
        finished.forEach((run) => delete next[run.truckId]);
        return next;
      });
      setTrucks((fleet) =>
        fleet.map((truck) =>
          finished.some((run) => run.truckId === truck.id)
            ? { ...truck, status: 'IDLE' }
            : truck,
        ),
      );

      // Release any stop still marked as this truck's.
      //
      // Emptying a bin normally clears its own assignment, because the fill
      // drop registers as a collection. A bin that was nearly empty when the
      // truck reached it never drops far enough to count, so without this it
      // would sit marked ASSIGNED to a truck that finished and went home.
      setAssignments((current) => {
        const next = { ...current };
        finished.forEach((run) => {
          run.stops.forEach((channelId) => {
            if (next[channelId]?.truckId === run.truckId) delete next[channelId];
          });
        });
        return next;
      });

      finished.forEach((run) => {
        pushAlert({
          kind: 'COLLECTED',
          title: `${run.truckId} completed its run`,
          detail: `${run.stops.length} bins \u00b7 ${(run.distanceM / 1000).toFixed(1)} km`,
        });
      });
    }
  }, [fleetRuns, setRuns, setTrucks, setAssignments, setSimCollections, pushAlert]);

  /* ── hands-off dispatch ─────────────────────────────────────────────────── */

  /**
   * Puts the starter fleet in place, once per browser.
   *
   * A fresh install gets it from the shared state's initial value, but an
   * install that predates it already has an empty fleet written to storage —
   * and a saved value beats an initial one, so those browsers would have
   * auto-dispatch switched on with nothing to send.
   *
   * It waits for `trucksReady` because until the first Firestore snapshot lands
   * an empty fleet means "not arrived yet", not "there are no trucks", and
   * seeding on that would write over a fleet a moment before it turns up. An
   * operator who deliberately empties the fleet keeps it empty: the flag is
   * already set by then, and the check below never replaces trucks that exist.
   */
  useEffect(() => {
    if (!trucksReady) return;
    try {
      if (localStorage.getItem(FLEET_SEEDED_KEY)) return;
      localStorage.setItem(FLEET_SEEDED_KEY, '1');
    } catch {
      return; // storage disabled — the initial value already covers this session
    }
    setTrucks((current) => (current.length ? current : STARTER_FLEET));
  }, [trucksReady, setTrucks]);

  /**
   * Trucks carry no position, so "nearest" is not a question this data can
   * answer and pretending otherwise would be a lie in the UI. Fit is the
   * honest rule instead: the smallest truck that can still take the load, so
   * the big one stays free for the next full bin.
   */
  const pickTruck = (bin, pool) => {
    const fits = pool.filter(
      (truck) => !truck.capacityKg || bin.weight === null || truck.capacityKg >= bin.weight,
    );
    return [...(fits.length ? fits : pool)].sort(
      (a, b) => (a.capacityKg ?? Infinity) - (b.capacityKg ?? Infinity),
    )[0];
  };

  const autoDispatch = settings.autoDispatch;

  useEffect(() => {
    if (!autoDispatch?.enabled) return;

    const now = Date.now();
    const idle = trucks.filter((truck) => truck.status === 'IDLE');
    if (idle.length === 0) return;

    const candidates = ranking.filter(
      (entry) =>
        entry.score >= autoDispatch.minScore &&
        // Urgent AND actually a collection job — see binPriority.
        entry.needsCollection &&
        !entry.bin.assignment &&
        // An operator who called off a dispatch is not overruled on the next poll.
        !(dispatchHolds[entry.bin.channelId] > now),
    );
    if (candidates.length === 0) return;

    // Pair up front rather than calling assignTruck in a loop: that reads the
    // fleet from a stale closure and would hand the same truck to every bin.
    const pool = [...idle];
    const pairs = [];
    candidates.forEach((entry) => {
      if (pool.length === 0) return;
      const truck = pickTruck(entry.bin, pool);
      pool.splice(pool.indexOf(truck), 1);
      pairs.push({ entry, truck });
    });
    if (pairs.length === 0) return;

    setAssignments((current) => {
      const next = { ...current };
      pairs.forEach(({ entry, truck }) => {
        // Re-check under the updater: a manual assignment may have landed first.
        if (next[entry.bin.channelId]) return;
        next[entry.bin.channelId] = {
          truckId: truck.id,
          driver: truck.driver,
          at: new Date().toISOString(),
          auto: true,
        };
      });
      return next;
    });

    setTrucks((fleet) =>
      fleet.map((truck) =>
        pairs.some((pair) => pair.truck.id === truck.id)
          ? { ...truck, status: 'ON_ROUTE' }
          : truck,
      ),
    );

    pairs.forEach(({ entry, truck }) => {
      pushAlert({
        kind: 'DISPATCH',
        title: `${truck.id} auto-assigned to ${entry.bin.id}`,
        detail: `Priority ${entry.score} · ${entry.reasons[0] ?? entry.bin.location}`,
        channelId: entry.bin.channelId,
      });
    });
  }, [
    ranking,
    trucks,
    dispatchHolds,
    autoDispatch,
    setAssignments,
    setTrucks,
    pushAlert,
  ]);

  /* ── actions ────────────────────────────────────────────────────────────── */
  const assignTruck = useCallback(
    (channelId, truckId) => {
      const bin = bins.find((item) => item.channelId === channelId);
      // Named truck first; otherwise the best-fitting free one, by the same
      // rule auto-dispatch uses. It used to take whichever idle truck happened
      // to be first in the list, which sent the biggest vehicle to the lightest
      // bin as often as not.
      const idle = trucks.filter((item) => item.status === 'IDLE');
      const truck =
        trucks.find((item) => item.id === truckId) ??
        (idle.length ? pickTruck(bin, idle) : null) ??
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

      // Calling off a dispatch is a decision, and auto-dispatch would otherwise
      // undo it on the very next poll. Hold this bin back for a while, and drop
      // holds that have already lapsed rather than letting the map grow.
      const until = Date.now() + (settings.autoDispatch?.cooldownMinutes ?? 30) * 60 * 1000;
      setDispatchHolds((current) => {
        const next = { [channelId]: until };
        Object.entries(current).forEach(([id, expires]) => {
          if (expires > Date.now() && id !== channelId) next[id] = expires;
        });
        return next;
      });
    },
    [setAssignments, setTrucks, setDispatchHolds, settings.autoDispatch],
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
    dispatchHolds,
    runs,
    sharedBackend: firebaseConfigured ? 'firebase' : 'local',
    ranking,
    priorityByChannel,
    fleetRuns,
    planRuns,
    cancelRun,
    planning,
    depotPoint,
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
