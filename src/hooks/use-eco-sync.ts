import { useEffect } from "react";
import { useEco } from "@/store/ecobin-store";

/**
 * Loads persisted municipal records on the client and drives the ThingSpeak
 * polling loop. Safe to call from several routes at once — hydration is
 * idempotent and each mounted route keeps its own interval.
 */
export function useEcoSync() {
  const hydrate = useEco((s) => s.hydrate);
  const refresh = useEco((s) => s.refresh);
  const interval = useEco((s) => s.settings.refreshIntervalSec);
  const channelId = useEco((s) => s.settings.channelId);

  useEffect(() => {
    hydrate();
    void refresh();
  }, [hydrate, refresh]);

  useEffect(() => {
    if (!channelId.trim()) return;
    // ThingSpeak's free tier accepts a read roughly every 15 seconds.
    const ms = Math.max(10, interval) * 1000;
    const id = setInterval(() => void refresh(), ms);
    return () => clearInterval(id);
  }, [interval, channelId, refresh]);
}
