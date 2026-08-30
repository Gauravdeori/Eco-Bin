import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchChannelFeed, feedSignature, mergeFeeds } from '../services/thingspeak';

/**
 * Polls every configured ThingSpeak channel — fast, by fetching almost nothing.
 *
 * The old scheme refetched the full history every interval, which meant the
 * interval had to be long and every request was the slowest possible one. The
 * dashboard could sit up to a device-write plus a whole poll behind reality.
 *
 * Now the full history is fetched once, and steady-state polls ask for only
 * the last few entries and merge them in. That makes each request small enough
 * to run every few seconds, which is what actually cuts the delay: worst-case
 * staleness drops from device-interval + poll-interval to device-interval +
 * a few seconds.
 *
 * The configured poll interval keeps a meaning: it is the cadence of *full*
 * re-syncs (floored at a minute), which heal anything incremental polling can
 * miss — edited entries, channel metadata changes. And when the incremental
 * window comes back entirely fresh, history may have a hole, so that channel is
 * refetched in full rather than served with a gap.
 *
 * Unchanged from before: polling pauses while the tab is hidden and catches up
 * on focus, an in-flight request is aborted before a new one starts, and
 * repeated failures back off up to 4x.
 */

/** Steady-state cadence. An explicit slow setting (> 30s) is respected as-is. */
const FAST_SECONDS = 5;

/**
 * Entries per incremental poll. Devices write at most every 15s, so a 5s poll
 * sees one new entry at a time; eight covers a laptop waking from sleep short
 * of a full gap.
 */
const INCREMENTAL_RESULTS = 8;

export const useThingSpeak = ({ channels, pollSeconds, historyPoints }) => {
  const [data, setData] = useState({ results: [], errors: [] });
  const [status, setStatus] = useState('idle'); // idle | loading | live | error
  const [lastSync, setLastSync] = useState(null);

  const abortRef = useRef(null);
  const failuresRef = useRef(0);
  const timerRef = useRef(null);
  /** channelId → the last good { channel, feeds, source } for that channel. */
  const cacheRef = useRef(new Map());
  const lastFullRef = useRef(0);
  const signatureRef = useRef('');

  // Channels arrive as a fresh array each render; compare by value, not identity.
  const channelKey = JSON.stringify(channels);

  const sync = useCallback(
    async ({ full = false } = {}) => {
      const list = JSON.parse(channelKey);
      if (list.length === 0) {
        setData({ results: [], errors: [] });
        setStatus('idle');
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus((current) => (current === 'live' ? 'live' : 'loading'));

      const fullDue =
        full || Date.now() - lastFullRef.current >= Math.max(pollSeconds, 60) * 1000;
      if (fullDue) lastFullRef.current = Date.now();

      const settled = await Promise.allSettled(
        list.map(async (channel) => {
          const cached = cacheRef.current.get(String(channel.channelId));

          if (fullDue || !cached) {
            const fetched = await fetchChannelFeed(channel, {
              results: historyPoints,
              signal: controller.signal,
            });
            return { ...fetched, source: channel };
          }

          const fetched = await fetchChannelFeed(channel, {
            results: INCREMENTAL_RESULTS,
            signal: controller.signal,
          });
          const { feeds, gapped } = mergeFeeds(cached.feeds, fetched.feeds, {
            limit: historyPoints,
            window: INCREMENTAL_RESULTS,
          });

          if (gapped) {
            // More may have happened than the window shows; take no chances.
            const healed = await fetchChannelFeed(channel, {
              results: historyPoints,
              signal: controller.signal,
            });
            return { ...healed, source: channel };
          }

          return { channel: fetched.channel, feeds, source: channel };
        }),
      );

      if (controller.signal.aborted) return;

      const results = [];
      const errors = [];

      settled.forEach((outcome, index) => {
        const channel = list[index];
        if (outcome.status === 'fulfilled') {
          cacheRef.current.set(String(channel.channelId), outcome.value);
          results.push(outcome.value);
          return;
        }
        if (outcome.reason?.name === 'AbortError') return;

        errors.push({
          channelId: channel.channelId,
          message: outcome.reason?.message ?? 'Unknown ThingSpeak error.',
        });

        // One failed poll should not blank a bin off the map. The cached feed
        // stands in; the bin goes stale on its own clock, not on a hiccup's.
        const cached = cacheRef.current.get(String(channel.channelId));
        if (cached) results.push(cached);
      });

      // A poll that found nothing new must cost nothing: handing React the
      // same data under a fresh identity would recompute every bin, rescore
      // the ranking and re-render every panel, a dozen times a minute, to
      // show the same numbers. lastSync still advances so the interface can
      // say the link is alive.
      const signature = feedSignature(results, errors);
      if (signature !== signatureRef.current) {
        signatureRef.current = signature;
        setData({ results, errors });
      }
      setLastSync(new Date());

      if (results.length === 0 && errors.length > 0) {
        failuresRef.current += 1;
        setStatus('error');
      } else {
        failuresRef.current = 0;
        setStatus('live');
      }
    },
    [channelKey, historyPoints, pollSeconds],
  );

  /** The manual refresh button means "really refetch", so it always goes full. */
  const refresh = useCallback(() => sync({ full: true }), [sync]);

  // A different channel list or history depth invalidates everything cached.
  useEffect(() => {
    cacheRef.current.clear();
    lastFullRef.current = 0;
  }, [channelKey, historyPoints]);

  useEffect(() => {
    let cancelled = false;

    // A deliberately slow setting stays slow; the usual 10-30s settings get
    // the fast incremental cadence that is the point of this hook.
    const cadence = pollSeconds > 30 ? pollSeconds : Math.min(pollSeconds, FAST_SECONDS);

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') await sync();
      if (cancelled) return;

      const backoff = Math.min(2 ** failuresRef.current, 4);
      timerRef.current = setTimeout(tick, cadence * 1000 * backoff);
    };

    tick();

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timerRef.current);
      tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
      abortRef.current?.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync, pollSeconds]);

  return { ...data, status, lastSync, refresh };
};
