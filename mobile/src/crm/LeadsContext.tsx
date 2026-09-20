import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError, crmApi } from '../api';
import type { ServiceMasterRow } from './serviceMaster';
import { computeLeadStats, type LeadStats } from './stats';
import type { Lead, NewLeadInput } from './types';

const NOTICE_VISIBLE_MS = 3500;

export type NoticeTone = 'success' | 'warning';

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

interface LeadsContextValue {
  leads: Lead[];
  /** The price list (service + house type + plan -> price), from the backend. */
  serviceMaster: ServiceMasterRow[];
  stats: LeadStats;
  /** True only for the very first load (drives skeletons); refreshes use `refreshing`. */
  loading: boolean;
  refreshing: boolean;
  /** Last load failure, cleared by the next successful load. */
  error: string | null;
  /** One-line confirmation shown after saving a lead / a payment (auto-clears). */
  notice: string | null;
  noticeTone: NoticeTone;
  refresh: () => void;
  /** Saves to the backend; rejects with the server's message so the form can show it. */
  addLead: (input: NewLeadInput) => Promise<Lead>;
  /** Swaps in an updated copy of a lead (e.g. after it was paid). */
  replaceLead: (lead: Lead) => void;
  showNotice: (message: string, tone?: NoticeTone) => void;
  getLead: (id: string) => Lead | undefined;
  dismissNotice: () => void;
}

const LeadsContext = createContext<LeadsContextValue | undefined>(undefined);

/**
 * The CRM's data layer: leads and the price list come from the backend
 * (/api/crm/*). Screens only talk to `useLeads()`.
 */
export function LeadsProvider({ children }: { children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [serviceMaster, setServiceMaster] = useState<ServiceMasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<NoticeTone>('success');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextLeads, nextMaster] = await Promise.all([crmApi.listLeads(), crmApi.listServiceMaster()]);
      setLeads(nextLeads);
      setServiceMaster(nextMaster);
      setError(null);
    } catch (err) {
      setError(messageFrom(err, 'Unable to load your leads. Pull down to try again.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const showNotice = useCallback((message: string, tone: NoticeTone = 'success') => {
    setNotice(message);
    setNoticeTone(tone);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_VISIBLE_MS);
  }, []);

  const addLead = useCallback(
    async (input: NewLeadInput): Promise<Lead> => {
      const lead = await crmApi.createLead(input);
      setLeads((prev) => [lead, ...prev]);
      showNotice(`Lead saved - ${lead.customerName}`);
      return lead;
    },
    [showNotice],
  );

  const replaceLead = useCallback((lead: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
  }, []);

  const getLead = useCallback((id: string) => leads.find((l) => l.id === id), [leads]);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const stats = useMemo(() => computeLeadStats(leads), [leads]);

  const value = useMemo(
    () => ({
      leads,
      serviceMaster,
      stats,
      loading,
      refreshing,
      error,
      notice,
      noticeTone,
      refresh,
      addLead,
      replaceLead,
      showNotice,
      getLead,
      dismissNotice,
    }),
    [
      leads,
      serviceMaster,
      stats,
      loading,
      refreshing,
      error,
      notice,
      noticeTone,
      refresh,
      addLead,
      replaceLead,
      showNotice,
      getLead,
      dismissNotice,
    ],
  );

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error('useLeads must be used within a LeadsProvider');
  return ctx;
}
