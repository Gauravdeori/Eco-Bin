import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { docPath, firestore } from '../services/firebase';

/**
 * useState for records the operator owns — the fleet, assignments, runs,
 * citizen reports — kept wherever this deployment can keep them.
 *
 * With Firebase configured the record is shared: every dashboard watching the
 * same workspace sees a truck dispatched on another machine appear on its own
 * map. Without it, the value falls back to localStorage exactly as before, so
 * the app still runs standalone with no project and no network.
 *
 * The value is stored as a JSON string rather than as document fields. That is
 * deliberate: Firestore cannot hold an array of arrays, and a planned route is
 * a list of [lat, lng] pairs, so a structured write would fail on the one
 * record that matters most. Serialising also keeps dates and the revive step
 * behaving identically in both backends.
 */
export const useSharedState = (key, initialValue, { revive } = {}) => {
  const reviveRef = useRef(revive);
  // Kept fresh in an effect rather than during render. useRef already captured
  // it for the first pass, and this effect is declared before the subscription
  // below, so a snapshot never arrives against a stale reviver.
  useEffect(() => {
    reviveRef.current = revive;
  });

  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initialValue;
      const parsed = JSON.parse(raw);
      return revive ? revive(parsed) : parsed;
    } catch {
      return initialValue;
    }
  });

  /**
   * Nothing is written upstream until the first snapshot has been seen.
   *
   * Otherwise a dashboard opening fresh would push its empty local defaults
   * over a fleet another operator is in the middle of running.
   */
  const [ready, setReady] = useState(() => !firestore);

  /** The last JSON this hook has either written or received, to spot echoes. */
  const settled = useRef(null);

  useEffect(() => {
    if (!firestore) return undefined;

    return onSnapshot(
      doc(firestore, ...docPath(key)),
      (snapshot) => {
        setReady(true);
        const json = snapshot.data()?.json;
        if (json === undefined) return; // nothing stored yet; ours will seed it
        // Our own write arriving back. Adopting it would be harmless but it
        // would also re-render every consumer for no reason.
        if (json === settled.current) return;

        settled.current = json;
        try {
          const parsed = JSON.parse(json);
          setValue(reviveRef.current ? reviveRef.current(parsed) : parsed);
        } catch {
          /* a malformed document is not worth taking the dashboard down for */
        }
      },
      () => {
        // Offline, or rules refused the read. Carry on against localStorage
        // rather than leaving the app frozen waiting for a snapshot.
        setReady(true);
      },
    );
  }, [key]);

  useEffect(() => {
    const json = JSON.stringify(value);

    // Always keep the local copy: it is what makes a reload work offline, and
    // what the app runs on entirely when Firebase is not configured.
    try {
      localStorage.setItem(key, json);
    } catch {
      /* storage unavailable (private mode, quota) — keep going in memory */
    }

    if (!firestore || !ready) return;
    if (json === settled.current) return;

    settled.current = json;
    setDoc(doc(firestore, ...docPath(key)), { json, updatedAt: serverTimestamp() }).catch(
      () => {
        // A refused or offline write must not break the interaction that
        // caused it. The local copy already has the change.
      },
    );
  }, [key, value, ready]);

  return [value, setValue];
};
