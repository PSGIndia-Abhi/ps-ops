import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** true while the app is on screen. Used to stop polling in the background (saves battery and data). */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}
