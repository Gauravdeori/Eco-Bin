import { useEffect, useState } from 'react';

/**
 * useState backed by localStorage, so operator-owned records (citizen reports,
 * the truck fleet, dispatch assignments) survive a reload instead of being
 * re-seeded from a hardcoded list.
 */
export const useLocalState = (key, initialValue, { revive } = {}) => {
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

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable (private mode, quota) — keep going in memory */
    }
  }, [key, value]);

  return [value, setValue];
};
