import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAllChannels } from '../services/thingspeak';

/**
 * Polls every configured ThingSpeak channel on an interval.
 *
 * Three things keep this cheap on the free API tier:
 *  - polling pauses while the tab is hidden and catches up on focus,
 *  - a request still in flight is aborted before a new one starts,
 *  - repeated failures back off up to 4x the configured interval.
 */
export const useThingSpeak = ({ channels, pollSeconds, historyPoints }) => {
  const [data, setData] = useState({ results: [], errors: [] });
  const [status, setStatus] = useState('idle'); // idle | loading | live | error
  const [lastSync, setLastSync] = useState(null);

  const abortRef = useRef(null);
  const failuresRef = useRef(0);
  const timerRef = useRef(null);

  // Channels arrive as a fresh array each render; compare by value, not identity.
  const channelKey = JSON.stringify(channels);

  const refresh = useCallback(async () => {
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

    const { results, errors } = await fetchAllChannels(list, {
      results: historyPoints,
      signal: controller.signal,
    });

    if (controller.signal.aborted) return;

    setData({ results, errors });
    setLastSync(new Date());

    if (results.length === 0 && errors.length > 0) {
      failuresRef.current += 1;
      setStatus('error');
    } else {
      failuresRef.current = 0;
      setStatus('live');
    }
  }, [channelKey, historyPoints]);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') await refresh();
      if (cancelled) return;

      const backoff = Math.min(2 ** failuresRef.current, 4);
      timerRef.current = setTimeout(tick, pollSeconds * 1000 * backoff);
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
  }, [refresh, pollSeconds]);

  return { ...data, status, lastSync, refresh };
};
