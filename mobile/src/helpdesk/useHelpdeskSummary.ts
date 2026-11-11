import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getSummary, type HelpdeskSummary } from './api';

/**
 * Helpdesk counts for the "Help & Support" / "Helpdesk desk" row on the Profile screens. Loaded when
 * the screen comes into view and every minute while it stays in view. Never throws - with the
 * server unreachable (or the helpdesk not deployed yet) it is just null and the row has no badge.
 */
export function useHelpdeskSummary(): HelpdeskSummary | null {
  const [summary, setSummary] = useState<HelpdeskSummary | null>(null);
  const alive = useRef(true);
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      const load = () =>
        getSummary()
          .then((s) => alive.current && setSummary(s))
          .catch(() => alive.current && setSummary(null));
      load();
      const timer = setInterval(load, 60000);
      return () => {
        alive.current = false;
        clearInterval(timer);
      };
    }, []),
  );
  return summary;
}

/** The number on the row: the team counts new + unassigned tickets, everyone else unread replies. */
export function helpdeskBadge(summary: HelpdeskSummary | null): number {
  if (!summary) return 0;
  if (summary.isAgent) return Math.max(summary.unread || 0, summary.unassigned || 0);
  return summary.unread || 0;
}
