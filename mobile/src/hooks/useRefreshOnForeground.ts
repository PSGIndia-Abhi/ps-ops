import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/**
 * Runs `refresh` when the app comes back to the foreground while this screen is showing - so a
 * job reassigned (or deleted) on the web while the phone was in a pocket is right the moment the
 * technician opens the app again, not only after they switch screens. No polling.
 */
export function useRefreshOnForeground(refresh: () => void): void {
  const isFocused = useIsFocused();
  const latest = useRef(refresh);
  latest.current = refresh;
  const focused = useRef(isFocused);
  focused.current = isFocused;

  useEffect(() => {
    let previous = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (previous !== 'active' && next === 'active' && focused.current) latest.current();
      previous = next;
    });
    return () => sub.remove();
  }, []);
}
