import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { kvGet, kvRemove, kvSet } from '../crm/secureKv';
import { getClientMe, type ClientMe, type ClientOutlet } from './api';

/**
 * Who the signed-in client is and which outlets they may see (GET /api/client-portal/me),
 * plus the outlet the screens are filtered to ("" = all their outlets) - like the web's
 * ClientPortalLayout. The chosen outlet is remembered on this phone per user.
 */
interface ClientPortalValue {
  portal: ClientMe | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  outlets: ClientOutlet[];
  /** Company head (sees every outlet of the company). */
  isCompanyAdmin: boolean;
  companyName: string;
  outletId: string;
  setOutletId: (id: string) => void;
  outletName: (id: string | null | undefined) => string;
}

const ClientPortalContext = createContext<ClientPortalValue | null>(null);
const OUTLET_KEY = 'clientPortal.outletId';

export function ClientPortalProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const scope = String(user?.id ?? session?.userId ?? '');
  const [portal, setPortal] = useState<ClientMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [outletId, setOutletIdState] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getClientMe(), scope ? kvGet<string>(scope, OUTLET_KEY) : Promise.resolve(null)])
      .then(([me, saved]) => {
        if (!alive) return;
        setPortal(me);
        setError(null);
        // Only keep a remembered outlet this login can still see.
        setOutletIdState(saved && me.outlets.some((o) => o.id === saved) ? saved : '');
      })
      .catch((err: Error) => alive && setError(err.message || 'Failed to load your account'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [scope, reloadKey]);

  const setOutletId = useCallback(
    (id: string) => {
      setOutletIdState(id);
      if (!scope) return;
      if (id) kvSet(scope, OUTLET_KEY, id);
      else kvRemove(scope, OUTLET_KEY);
    },
    [scope],
  );

  const value = useMemo<ClientPortalValue>(() => {
    const outlets = portal?.outlets ?? [];
    const company = portal?.companies?.[0];
    return {
      portal,
      loading,
      error,
      reload: () => setReloadKey((n) => n + 1),
      outlets,
      isCompanyAdmin: portal?.access === 'company',
      companyName: company?.display_name || company?.name || 'Client Portal',
      outletId,
      setOutletId,
      outletName: (id) => {
        if (!id) return '';
        const o = outlets.find((x) => x.id === id);
        return o?.name || id;
      },
    };
  }, [portal, loading, error, outletId, setOutletId]);

  return <ClientPortalContext.Provider value={value}>{children}</ClientPortalContext.Provider>;
}

export function useClientPortal(): ClientPortalValue {
  const ctx = useContext(ClientPortalContext);
  if (!ctx) throw new Error('useClientPortal must be used inside ClientPortalProvider');
  return ctx;
}
