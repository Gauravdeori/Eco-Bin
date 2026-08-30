import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Waypoints,
  Target,
  Split,
  ListOrdered,
  MapPin,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  Truck,
  Leaf,
  CheckCircle2,
  Gauge,
  AlertTriangle,
  Timer,
} from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import {
  PRIORITY_META,
  formatNumber,
  formatTime,
  priorityLevel,
} from '../../lib/telemetry';
import { STOP_DWELL_S, bearingFromDepot } from '../../services/fleet';
import { formatDistance, formatDuration } from '../../services/routing';
import { emissionsFor, emissionsSaved, formatCo2 } from '../../lib/emissions';
import { RouteSimMap } from '../dashboard/RouteSimMap';
import { Button, Card, CardHeader, EmptyState, cx } from '../ui/Primitives';

/** Playback speeds worth offering: real time, brisk, watchable, and a skim. */
const SPEEDS = [1, 5, 20, 60];

const PLAN_PROBLEMS = {
  'no-bins':
    'No bin is waiting for a truck — every one that needs collecting already has one on the way. Switch the scope to every positioned bin to sweep the rest anyway.',
  'no-trucks':
    'Every truck is already out on a round or in maintenance. Call the round off below, or add a truck on the Trucks page.',
  'route-failed': 'The route could not be planned.',
};

const degrees = (radians) => Math.round((radians * 180) / Math.PI);

/**
 * The arc of the city a truck was handed.
 *
 * The sweep gives each truck a contiguous run of the circle, but that run is
 * free to cross zero — so the smallest and largest angles are not the edges of
 * it. The widest gap between neighbouring stops is the part of the circle the
 * truck was *not* given, and the wedge is everything else.
 */
const wedgeOf = (angles) => {
  if (angles.length === 0) return null;
  if (angles.length === 1) return { from: degrees(angles[0]), to: degrees(angles[0]) };

  const sorted = [...angles].sort((a, b) => a - b);
  let gapAt = 0;
  let widest = sorted[0] + 2 * Math.PI - sorted[sorted.length - 1];

  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > widest) {
      widest = gap;
      gapAt = i;
    }
  }

  return {
    from: degrees(sorted[gapAt]),
    to: degrees(sorted[(gapAt - 1 + sorted.length) % sorted.length]),
  };
};

/** One step of the planner, with the code that actually does it named. */
const Stage = ({ index, icon: Icon, title, source, headline, detail, done }) => (
  <div
    className={cx(
      'flex-1 rounded-xl border px-3.5 py-3 transition-colors',
      done
        ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10'
        : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40',
    )}
  >
    <div className="flex items-center gap-2">
      <span
        className={cx(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold',
          done
            ? 'bg-emerald-600 text-white'
            : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
        )}
      >
        {index}
      </span>
      <Icon
        className={cx(
          'h-3.5 w-3.5 shrink-0',
          done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400',
        )}
      />
      <p className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-900 dark:text-white">
        {title}
      </p>
    </div>

    <p className="mt-2 font-heading text-base font-extrabold text-slate-900 tabular dark:text-white">
      {headline}
    </p>
    <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{detail}</p>
    <p className="mt-1.5 truncate font-mono text-[9px] text-slate-400" title={source}>
      {source}
    </p>
  </div>
);

/** One figure in a summary strip. */
const Metric = ({ label, value, tone }) => (
  <span className="flex flex-col">
    <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
    <span
      className={cx(
        'text-xs font-extrabold tabular',
        tone ?? 'text-slate-900 dark:text-white',
      )}
    >
      {value}
    </span>
  </span>
);

/**
 * One truck's run: the stops in driving order, and — once it is out — where the
 * crew has actually got to.
 */
const RunCard = ({ route, bins, kmPerLitre, onCancel, onSelectBin }) => {
  const binFor = (channelId) => bins.find((bin) => bin.channelId === channelId) ?? null;
  const fuel = emissionsFor(route.distanceM, kmPerLitre);
  const saving = emissionsSaved(route.plannedDistanceM, route.unorderedDistanceM, kmPerLitre);

  /**
   * Journey seconds until the crew reaches a stop: the driving to get there,
   * plus a pickup at every bin before it. The same timeline the truck is
   * moving on, so the countdown and the marker never disagree.
   */
  const etaFor = (index) =>
    Math.max(
      0,
      (route.fractions?.[index] ?? 0) * route.durationS +
        index * STOP_DWELL_S -
        (route.elapsedS ?? 0),
    );

  const wedge = wedgeOf(
    route.stops
      .map((channelId) => binFor(channelId))
      .filter((bin) => bin && bin.lat !== null && bin.lng !== null)
      .map((bin) => bearingFromDepot(route.depot, [bin.lat, bin.lng])),
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center gap-2.5 px-3.5 pt-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: route.colour }}
        >
          <Truck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
            {route.truckId}
            <span className="ml-1.5 font-semibold text-slate-400">{route.driver}</span>
          </p>
          <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
            {route.stops.length} stop{route.stops.length === 1 ? '' : 's'} ·{' '}
            {formatDistance(route.distanceM)} · {formatDuration(route.durationS)} driving
            {route.loadKg > 0 ? ` · ${formatNumber(route.loadKg, ' kg', 0)}` : ''}
          </p>
        </div>
        <span
          className="shrink-0 rounded-lg px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white"
          style={{ background: route.colour }}
        >
          {route.live ? `${Math.round(route.progress * 100)}%` : 'Planned'}
        </span>
      </div>

      {route.live && (
        <div className="mt-2 px-3.5">
          <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <span
              className="block h-full rounded-full transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.round(route.progress * 100)}%`, background: route.colour }}
            />
          </div>
        </div>
      )}

      <ol className="mt-2 space-y-0.5 px-3.5 pb-1">
        {route.stops.map((channelId, index) => {
          const bin = binFor(channelId);
          const done = route.collected?.includes(channelId);
          const busy = route.collectingChannelId === channelId;

          return (
            <li key={channelId}>
              <button
                type="button"
                onClick={() => onSelectBin(channelId)}
                className={cx(
                  'flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors',
                  busy
                    ? 'bg-emerald-50 dark:bg-emerald-500/10'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                )}
              >
                <span
                  className={cx(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold',
                    done
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200',
                  )}
                >
                  {done ? '✓' : index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                  {route.stopNames[index]}
                </span>
                <span className="shrink-0 text-[10px] tabular text-slate-400">
                  {bin?.fill === null || bin === null ? '—' : `${bin.fill}%`}
                </span>
                <span
                  className={cx(
                    'w-[74px] shrink-0 text-right text-[10px] font-semibold tabular',
                    busy
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : done
                        ? 'text-slate-400'
                        : 'text-slate-500 dark:text-slate-400',
                  )}
                >
                  {busy
                    ? 'emptying…'
                    : done
                      ? 'collected'
                      : route.live
                        ? formatDuration(etaFor(index))
                        : `+${formatDuration(etaFor(index))}`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-3.5 py-2 dark:border-slate-800">
        <span className="text-[10px] text-slate-400">
          {wedge ? `Sweep wedge ${wedge.from}°–${wedge.to}°` : 'Single stop'}
        </span>
        <span className="text-[10px] text-slate-400">
          {fuel.litres.toFixed(1)} L · {formatCo2(fuel.co2Kg)}
        </span>
        {saving.metres > 20 && (
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            {formatDistance(saving.metres)} saved ({saving.percent}%)
          </span>
        )}
        {route.live && (
          <button
            type="button"
            onClick={() => onCancel(route.truckId)}
            className="ml-auto text-[10px] font-bold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
          >
            Call off
          </button>
        )}
      </div>
    </div>
  );
};

export const RoutesPage = () => {
  const {
    bins,
    ranking,
    priorityByChannel,
    trucks,
    assignments,
    fleetRuns,
    previewRuns,
    commitRuns,
    cancelRun,
    cancelAllRuns,
    planning,
    depotPoint,
    settings,
    setPage,
    setSelectedChannelId,
    selectedChannelId,
    simPaused,
    toggleSim,
    simSpeed,
    setSimSpeed,
  } = useEcoBin();

  const [scope, setScope] = useState('DUE');
  const [plan, setPlan] = useState(null);
  const [problem, setProblem] = useState('');
  const [log, setLog] = useState([]);

  const live = fleetRuns.length > 0;
  const kmPerLitre = settings.fleet?.kmPerLitre;

  /**
   * A plan is on offer only until something takes its bins.
   *
   * Hands-off dispatch can send a truck to the very bins sitting in a preview
   * on screen, and a plan that has been overtaken is not a plan any more — it
   * is a proposal to collect bins a truck is already on its way to. Deriving it
   * from the assignments rather than clearing it when the fleet moves means it
   * also cannot come back when the round that superseded it finishes.
   */
  const superseded =
    plan?.runs.some((run) => run.stops.some((channelId) => assignments[channelId])) ?? false;
  const activePlan = superseded ? null : plan;

  const positioned = useMemo(
    () => bins.filter((bin) => bin.lat !== null && bin.lng !== null),
    [bins],
  );

  /**
   * The bins asking for a truck that has not already been sent, worst first.
   *
   * This is the ranking the rest of the app dispatches on, not a second opinion
   * computed for display — `needsCollection` is the same gate hands-off
   * dispatch uses, and bins already spoken for drop out here exactly as they do
   * in the planner, so this count is what a round would actually cover.
   */
  const attention = useMemo(
    () =>
      ranking.filter(
        (entry) =>
          entry.bin.lat !== null &&
          entry.bin.lng !== null &&
          !entry.bin.assignment &&
          (scope === 'ALL' || entry.needsCollection),
      ),
    [ranking, scope],
  );

  /** Live runs when there are any; otherwise whatever has been planned. */
  const routes = useMemo(() => {
    if (live) {
      return fleetRuns.map((run) => ({
        ...run,
        live: true,
        colour: PRIORITY_META[run.level].hex,
      }));
    }

    return (activePlan?.runs ?? []).map((run) => {
      const scores = run.stops
        .map((channelId) => priorityByChannel.get(channelId)?.score)
        .filter((score) => score !== undefined);
      const level = priorityLevel(
        scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      );

      return {
        ...run,
        live: false,
        level,
        colour: PRIORITY_META[level].hex,
        collected: [],
        collectingChannelId: null,
        stopsDone: 0,
        progress: 0,
        elapsedS: 0,
      };
    });
  }, [live, fleetRuns, activePlan, priorityByChannel]);

  const totals = useMemo(() => {
    const sum = routes.reduce(
      (acc, route) => ({
        stops: acc.stops + route.stops.length,
        distanceM: acc.distanceM + route.distanceM,
        durationS: Math.max(acc.durationS, route.durationS),
        loadKg: acc.loadKg + (route.loadKg ?? 0),
        plannedM: acc.plannedM + (route.plannedDistanceM ?? 0),
        unorderedM: acc.unorderedM + (route.unorderedDistanceM ?? 0),
        collected: acc.collected + (route.collected?.length ?? 0),
      }),
      { stops: 0, distanceM: 0, durationS: 0, loadKg: 0, plannedM: 0, unorderedM: 0, collected: 0 },
    );

    return {
      ...sum,
      fuel: emissionsFor(sum.distanceM, kmPerLitre),
      saving: emissionsSaved(sum.plannedM, sum.unorderedM, kmPerLitre),
    };
  }, [routes, kmPerLitre]);

  /* -- the run log --------------------------------------------------------- */

  /**
   * Read inside the effects below, which must not re-run every time a reading
   * lands. Synced here, before them, because effects run in declaration order —
   * so an arrival is always matched against the bin as it is now.
   */
  const binsRef = useRef(bins);
  useEffect(() => {
    binsRef.current = bins;
  }, [bins]);

  /** What a bin was holding when the crew pulled up, before it was emptied. */
  const loadOnArrival = useRef(new Map());
  const logged = useRef(new Set());
  const wasRunning = useRef(new Map());

  const addLog = useCallback((entry) => {
    setLog((current) => [{ at: new Date(), ...entry }, ...current].slice(0, 60));
  }, []);

  useEffect(() => {
    fleetRuns.forEach((route) => {
      const channelId = route.collectingChannelId;
      if (channelId && !loadOnArrival.current.has(channelId)) {
        const bin = binsRef.current.find((item) => item.channelId === channelId);
        loadOnArrival.current.set(channelId, bin?.weight ?? null);
        addLog({
          tone: 'sky',
          title: `${route.truckId} arrived at ${bin?.id ?? channelId}`,
          detail:
            bin?.fill === null || !bin
              ? 'Emptying the bin'
              : `Bin reading ${bin.fill}% — emptying it now`,
        });
      }
    });
  }, [fleetRuns, addLog]);

  useEffect(() => {
    fleetRuns.forEach((route) => {
      (route.collected ?? []).forEach((channelId) => {
        const key = `${route.runId ?? route.truckId}:${channelId}`;
        if (logged.current.has(key)) return;
        logged.current.add(key);

        const name = route.stopNames[route.stops.indexOf(channelId)] ?? channelId;
        const kg = loadOnArrival.current.get(channelId);
        loadOnArrival.current.delete(channelId);

        addLog({
          tone: 'emerald',
          title: `${name} collected`,
          detail:
            kg === null || kg === undefined
              ? `${route.truckId} · stop ${route.stops.indexOf(channelId) + 1} of ${route.stops.length}`
              : `${route.truckId} picked up about ${formatNumber(kg, ' kg', 0)}`,
        });
      });
    });
  }, [fleetRuns, addLog]);

  /** Runs that have gone out, and runs that have come home. */
  useEffect(() => {
    const running = new Map(fleetRuns.map((route) => [route.truckId, route]));

    running.forEach((route, truckId) => {
      if (wasRunning.current.has(truckId)) return;
      addLog({
        tone: 'slate',
        title: `${truckId} left the depot`,
        detail: `${route.stops.length} stops · ${formatDistance(route.distanceM)} · ${route.stopNames.join(' → ')}`,
      });
    });

    wasRunning.current.forEach((route, truckId) => {
      if (running.has(truckId)) return;
      addLog({
        tone: 'emerald',
        title: `${truckId} back at the depot`,
        detail: `Round complete · ${route.stops.length} bins · ${formatDistance(route.distanceM)}`,
      });
    });

    wasRunning.current = running;
  }, [fleetRuns, addLog]);

  /* -- actions ------------------------------------------------------------- */

  const makePlan = async () => {
    setProblem('');
    const result = await previewRuns({ scope });

    if (!result.ok) {
      setPlan(null);
      if (result.reason === 'aborted') return;
      setProblem(
        result.reason === 'route-failed' && result.message
          ? `${PLAN_PROBLEMS['route-failed']} ${result.message}`
          : (PLAN_PROBLEMS[result.reason] ?? 'The round could not be planned.'),
      );
      return;
    }

    setPlan({ ...result, at: new Date() });
  };

  const dispatch = () => {
    if (!activePlan) return;
    const result = commitRuns(activePlan.runs);
    setPlan(null);
    if (!result.ok) setProblem('Those trucks were sent out from somewhere else in the meantime.');
  };

  const callOff = (truckId) => {
    cancelRun(truckId);
    addLog({ tone: 'rose', title: `${truckId} called off`, detail: 'Its bins go back in the queue' });
  };

  const callOffAll = () => {
    cancelAllRuns();
    addLog({ tone: 'rose', title: 'Round called off', detail: 'Every truck is back in the fleet' });
  };

  const freeTrucks = trucks.filter((truck) => truck.status === 'IDLE').length;
  const provider = routes[0]?.followsRoads
    ? routes[0].source === 'road'
      ? 'Real roads'
      : 'Roads, rough order'
    : routes.length > 0
      ? 'Straight lines'
      : '—';

  return (
    <div className="space-y-4">
      {/* ── controls ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Route Planner"
          subtitle="Rank the bins that need attention, split them across the fleet, and watch the round run"
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value);
                  setPlan(null);
                  setProblem('');
                }}
                aria-label="Which bins to plan through"
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="DUE">Bins wanting attention</option>
                <option value="ALL">Every positioned bin</option>
              </select>

              <Button
                variant={activePlan ? 'secondary' : 'primary'}
                onClick={makePlan}
                disabled={planning || live}
                title={
                  live
                    ? 'The fleet is out. Call the round off to plan a new one.'
                    : 'Work out the round without sending anyone'
                }
              >
                {planning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Waypoints className="h-3.5 w-3.5" />
                )}
                {activePlan ? 'Re-plan' : `Plan the round (${attention.length})`}
              </Button>

              {activePlan && (
                <Button variant="primary" onClick={dispatch}>
                  <Play className="h-3.5 w-3.5" /> Dispatch &amp; simulate
                </Button>
              )}
            </div>
          }
        />

        {problem && (
          <p className="mx-5 mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            {problem}
          </p>
        )}

        {/* The algorithm, stage by stage, with the code that does each one. */}
        <div className="flex flex-col gap-2 px-5 pb-4 md:flex-row">
          <Stage
            index={1}
            icon={Target}
            title="Rank what needs attention"
            source="lib/telemetry.js · binPriority()"
            headline={`${attention.length} of ${positioned.length} bins`}
            detail="Fill level, how fast it is climbing, weight against capacity, citizen reports and silence each add to a 0–100 score. Only bins that score as a collection job make the list."
            done={attention.length > 0}
          />
          <Stage
            index={2}
            icon={Split}
            title="Split across the fleet"
            source="services/fleet.js · sweepPartition()"
            headline={
              routes.length > 0 ? `${routes.length} truck${routes.length === 1 ? '' : 's'}` : '—'
            }
            detail="Stops are sorted by their angle around the depot and the circle is cut into one wedge per truck, respecting capacity. Every starting angle is tried and the cheapest split wins."
            done={routes.length > 0}
          />
          <Stage
            index={3}
            icon={ListOrdered}
            title="Order each run"
            source="services/routing.js · optimiseOrder()"
            headline={
              routes.length > 0 && totals.saving.percent > 0
                ? `${totals.saving.percent}% shorter`
                : routes.length > 0
                  ? 'Ordered'
                  : '—'
            }
            detail="Nearest-neighbour builds a first guess, then 2-opt reverses any segment that shortens the tour until nothing improves. Measured against collecting fullest-first."
            done={routes.length > 0}
          />
          <Stage
            index={4}
            icon={MapPin}
            title="Draw it on the roads"
            source="services/routing.js · roadRoute()"
            headline={provider}
            detail="The chosen order is sent to a routing service for real driving geometry, so the lane on the map is a road a truck can actually take rather than a line between two pins."
            done={Boolean(routes[0]?.followsRoads)}
          />
        </div>
      </Card>

      {/* ── the round ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <Metric label="Stops" value={`${totals.collected}/${totals.stops}`} />
                <Metric label="Distance" value={formatDistance(totals.distanceM)} />
                <Metric label="Longest run" value={formatDuration(totals.durationS)} />
                <Metric label="Diesel" value={`${totals.fuel.litres.toFixed(1)} L`} />
                <Metric label="CO₂" value={formatCo2(totals.fuel.co2Kg)} />
                {totals.saving.co2Kg > 0.05 && (
                  <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 dark:bg-emerald-500/10">
                    <Leaf className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      {formatCo2(totals.saving.co2Kg)} saved
                    </span>
                  </span>
                )}
              </div>

              {/* Playback. Only meaningful once something is moving. */}
              {live && (
                <div className="flex items-center gap-1.5">
                  <Button onClick={toggleSim} title={simPaused ? 'Resume the round' : 'Hold the fleet where it is'}>
                    {simPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    {simPaused ? 'Resume' : 'Pause'}
                  </Button>

                  <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    {SPEEDS.map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setSimSpeed(speed)}
                        title={`Play the round at ${speed}× real time`}
                        className={cx(
                          'px-2 py-2 text-[11px] font-bold tabular transition-colors',
                          simSpeed === speed
                            ? 'bg-brand-500 text-white'
                            : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800',
                        )}
                      >
                        {speed}×
                      </button>
                    ))}
                  </div>

                  <Button variant="danger" onClick={callOffAll} title="Bring every truck back">
                    <RotateCcw className="h-3.5 w-3.5" /> Call off
                  </Button>
                </div>
              )}
            </div>

            {live && simPaused && (
              <p className="mx-5 mb-2 flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Pause className="h-3 w-3" /> Held — every truck is standing still
              </p>
            )}

            <div className="px-4 pb-4">
              <RouteSimMap
                routes={routes}
                bins={bins}
                depot={depotPoint}
                selectedChannelId={selectedChannelId}
                onSelectBin={setSelectedChannelId}
                height="h-[clamp(360px,calc(100vh-460px),620px)]"
              />
            </div>

            <p className="border-t border-slate-100 px-5 py-2 text-[10px] leading-relaxed text-slate-400 dark:border-slate-800">
              {live
                ? `Playing at ${simSpeed}× real time. Distances, stop order and fuel are the real planned figures — only the playback is sped up. Each pickup takes ${STOP_DWELL_S} seconds of journey time at the kerb.`
                : activePlan
                  ? `Planned ${formatTime(activePlan.at)} — dashed lanes are a proposal. Nothing is dispatched until you say so.`
                  : 'Plan a round to draw it here, then dispatch it to watch the trucks run it.'}
            </p>
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-5">
          {/* Runs, planned or under way. */}
          <Card>
            <CardHeader
              title={live ? 'Out on the round' : 'Planned runs'}
              subtitle={
                routes.length > 0
                  ? `${routes.length} run${routes.length === 1 ? '' : 's'} · ${totals.stops} stops · ${freeTrucks} truck${freeTrucks === 1 ? '' : 's'} still free`
                  : `${freeTrucks} of ${trucks.length} trucks free`
              }
            />

            {routes.length === 0 ? (
              <EmptyState
                compact
                icon={Waypoints}
                title={attention.length === 0 ? 'Nothing is asking for a truck' : 'No round planned yet'}
                description={
                  attention.length === 0
                    ? 'Every bin that needs collecting already has a truck on the way. Switch the scope to every positioned bin to sweep the rest anyway.'
                    : `${attention.length} bin${attention.length === 1 ? '' : 's'} would be collected. Plan the round to see the split and the driving order.`
                }
                action={
                  trucks.length === 0 ? (
                    <Button variant="primary" onClick={() => setPage('trucks')}>
                      Add a truck
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={makePlan} disabled={planning}>
                      <Waypoints className="h-3.5 w-3.5" /> Plan the round
                    </Button>
                  )
                }
              />
            ) : (
              <div className="space-y-2 px-4 pb-4">
                {routes.map((route) => (
                  <RunCard
                    key={route.truckId}
                    route={route}
                    bins={bins}
                    kmPerLitre={kmPerLitre}
                    onCancel={callOff}
                    onSelectBin={setSelectedChannelId}
                  />
                ))}

                {activePlan?.unassigned?.length > 0 && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    {activePlan.unassigned.length} bin
                    {activePlan.unassigned.length === 1 ? '' : 's'} would not fit in this round —{' '}
                    {activePlan.unassigned.map((stop) => stop.name).join(', ')}. They
                    wait for the next one.
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Why these bins. */}
          <Card>
            <CardHeader
              title="Bins wanting attention"
              subtitle={
                scope === 'ALL'
                  ? 'Every positioned bin without a truck, worst first'
                  : 'The ranking a truck is actually sent on, worst first'
              }
            />
            {attention.length === 0 ? (
              <EmptyState
                compact
                icon={CheckCircle2}
                title="Queue is clear"
                description="No positioned bin currently scores as a collection job."
              />
            ) : (
              <ul className="divide-y divide-slate-100 px-1 pb-2 dark:divide-slate-800">
                {attention.slice(0, 8).map((entry) => (
                  <li key={entry.bin.channelId}>
                    <button
                      type="button"
                      onClick={() => setSelectedChannelId(entry.bin.channelId)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold text-white tabular"
                        style={{ background: PRIORITY_META[entry.level].hex }}
                      >
                        {entry.score}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-bold text-slate-900 dark:text-white">
                          {entry.bin.id}
                        </span>
                        <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                          {entry.reasons.slice(0, 2).join(' · ') || entry.bin.location}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold tabular text-slate-400">
                        {entry.bin.fill === null ? '—' : `${entry.bin.fill}%`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* What the round has actually done. */}
          <Card>
            <CardHeader
              title="Run log"
              subtitle="Every arrival and pickup as it happens"
              action={
                log.length > 0 && (
                  <Button variant="ghost" onClick={() => setLog([])}>
                    Clear
                  </Button>
                )
              }
            />
            {log.length === 0 ? (
              <EmptyState
                compact
                icon={Timer}
                title="Nothing has happened yet"
                description="Dispatch a round and every arrival, pickup and return is recorded here."
              />
            ) : (
              <ul className="max-h-[320px] space-y-1 overflow-y-auto px-4 pb-4">
                {log.map((entry, index) => (
                  <li
                    key={`${entry.at.getTime()}-${index}`}
                    className="flex items-start gap-2.5 rounded-lg px-1.5 py-1.5"
                  >
                    <span
                      className={cx(
                        'mt-1 h-2 w-2 shrink-0 rounded-full',
                        entry.tone === 'emerald'
                          ? 'bg-emerald-500'
                          : entry.tone === 'sky'
                            ? 'bg-sky-500'
                            : entry.tone === 'rose'
                              ? 'bg-rose-500'
                              : 'bg-slate-400',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-bold text-slate-900 dark:text-white">
                        {entry.title}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                        {entry.detail}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] tabular text-slate-400">
                      {formatTime(entry.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* A quiet footnote, because the numbers above are only as real as this. */}
      <p className="flex items-center gap-1.5 px-1 text-[10px] text-slate-400">
        <Gauge className="h-3 w-3 shrink-0" />
        Routes are planned on live driving times where a routing service answers, and on
        straight-line distance when none does. The truck positions are simulated playback of a real
        planned route — the bins, the ranking and the distances are not.
        {settings.autoDispatch?.enabled
          ? ' Hands-off dispatch is on, so an urgent bin may be sent out before you get to plan a round for it.'
          : ''}
      </p>
    </div>
  );
};
