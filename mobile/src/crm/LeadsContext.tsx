import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { ApiError, crmApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { newClientRef } from './leadHelpers';
import {
  LOCAL_ID_PREFIX,
  loadOutbox,
  outboxToLead,
  saveOutbox,
  type OutboxItem,
} from './outbox';
import type { ServiceMasterRow } from './serviceMaster';
import { computeLeadStats, type LeadStats } from './stats';
import {
  isCommercial,
  type Lead,
  type LocalLeadPhoto,
  type NewLeadInput,
} from './types';

const NOTICE_VISIBLE_MS = 3500;
const OUTBOX_RETRY_MS = 30000;

export type NoticeTone = 'success' | 'warning';

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

interface LeadsContextValue {
  /** Consumer leads only - everything about payments is worked out from these. */
  leads: Lead[];
  /** Commercial leads (company enquiries with a quote and photos, no payment). */
  commercialLeads: Lead[];
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
  /**
   * Saves to the backend; rejects with the server's message so the form can show it. With no
   * connection the lead is kept on the phone instead (the returned lead has `pendingSync: true`)
   * and is sent automatically later. `photos` (commercial leads) are uploaded once the lead is on
   * the server; any that can't be sent yet wait on the phone the same way.
   */
  addLead: (input: NewLeadInput, photos?: LocalLeadPhoto[]) => Promise<Lead>;
  /** Removes a queued lead the server refused (or one the user no longer wants sent). */
  discardQueued: (id: string) => void;
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
  const { session } = useAuth();
  const scope = session?.userId ?? 'anon';
  const [serverLeads, setServerLeads] = useState<Lead[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const outboxRef = useRef<OutboxItem[]>([]);
  const outboxLoaded = useRef(false);
  const syncing = useRef(false);
  const [serviceMaster, setServiceMaster] = useState<ServiceMasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<NoticeTone>('success');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateOutbox = useCallback(
    (next: OutboxItem[]) => {
      outboxRef.current = next;
      setOutbox(next);
      saveOutbox(scope, next);
    },
    [scope],
  );

  const showNoticeRef = useRef<(message: string, tone?: NoticeTone) => void>(
    () => undefined,
  );

  /**
   * Uploads a queued item's photos one at a time, dropping each from the outbox as it lands (and
   * the item itself once none are left). `offline` means the connection dropped part-way: what is
   * left stays queued. `failed` counts photos the server refused - those are not retried.
   */
  const sendQueuedPhotos = useCallback(
    async (
      clientRef: string,
      leadId: string,
    ): Promise<{ offline: boolean; failed: number }> => {
      const photos =
        outboxRef.current.find(i => i.clientRef === clientRef)?.photos ?? [];
      let failed = 0;
      for (const photo of photos) {
        try {
          await crmApi.uploadLeadPhoto(leadId, photo);
        } catch (err) {
          if (err instanceof ApiError && err.isNetworkError)
            return { offline: true, failed };
          failed += 1;
        }
        updateOutbox(
          outboxRef.current.map(i =>
            i.clientRef === clientRef
              ? {
                  ...i,
                  photos: (i.photos ?? []).filter(p => p.ref !== photo.ref),
                }
              : i,
          ),
        );
      }
      updateOutbox(outboxRef.current.filter(i => i.clientRef !== clientRef));
      return { offline: false, failed };
    },
    [updateOutbox],
  );

  /** Sends queued leads (and their photos) one by one. Stops quietly at the first connection failure. */
  const syncOutbox = useCallback(async (): Promise<boolean> => {
    if (syncing.current || !outboxLoaded.current) return false;
    const pending = outboxRef.current.filter(i => !i.error);
    if (pending.length === 0) return false;
    syncing.current = true;
    let sent = 0;
    let failedPhotos = 0;
    try {
      for (const item of pending) {
        try {
          let leadId = item.leadId;
          if (!leadId) {
            const lead = await crmApi.createLead(item.input, item.clientRef);
            setServerLeads(prev =>
              prev.some(l => l.id === lead.id) ? prev : [lead, ...prev],
            );
            sent += 1;
            leadId = lead.id;
            // The lead is on the server now; from here only its photos are waiting.
            updateOutbox(
              outboxRef.current.map(i =>
                i.clientRef === item.clientRef ? { ...i, leadId: lead.id } : i,
              ),
            );
          }
          const photos = await sendQueuedPhotos(item.clientRef, leadId);
          failedPhotos += photos.failed;
          if (photos.offline) break;
        } catch (err) {
          if (err instanceof ApiError && err.isNetworkError) break;
          const message =
            err instanceof ApiError
              ? err.message
              : 'The server could not accept this lead.';
          updateOutbox(
            outboxRef.current.map(i =>
              i.clientRef === item.clientRef ? { ...i, error: message } : i,
            ),
          );
        }
      }
    } finally {
      syncing.current = false;
    }
    if (failedPhotos > 0) {
      showNoticeRef.current(
        failedPhotos === 1
          ? '1 photo could not be uploaded'
          : `${failedPhotos} photos could not be uploaded`,
        'warning',
      );
    } else if (sent > 0) {
      showNoticeRef.current(
        sent === 1
          ? 'Saved lead sent to the office'
          : `${sent} saved leads sent to the office`,
      );
    }
    return sent > 0;
  }, [updateOutbox, sendQueuedPhotos]);

  const load = useCallback(async () => {
    try {
      const [nextLeads, nextMaster] = await Promise.all([
        crmApi.listLeads(),
        crmApi.listServiceMaster(),
      ]);
      setServerLeads(nextLeads);
      setServiceMaster(nextMaster);
      setError(null);
    } catch (err) {
      setError(
        messageFrom(err, 'Unable to load your leads. Pull down to try again.'),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Leads saved without a connection survive the app being closed: load them, then try to send.
  useEffect(() => {
    let cancelled = false;
    outboxLoaded.current = false;
    loadOutbox(scope).then(items => {
      if (cancelled) return;
      outboxRef.current = items;
      setOutbox(items);
      outboxLoaded.current = true;
      syncOutbox();
    });
    return () => {
      cancelled = true;
    };
  }, [scope, syncOutbox]);

  useEffect(() => {
    load();
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [load]);

  // Retry when the app comes back to the foreground, and every 30s while something is waiting.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active')
        syncOutbox().then(sent => {
          if (sent) load();
        });
    });
    return () => sub.remove();
  }, [syncOutbox, load]);

  const waiting = outbox.some(i => !i.error);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      syncOutbox().then(sent => {
        if (sent) load();
      });
    }, OUTBOX_RETRY_MS);
    return () => clearInterval(timer);
  }, [waiting, syncOutbox, load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    syncOutbox().finally(load);
  }, [load, syncOutbox]);

  const showNotice = useCallback(
    (message: string, tone: NoticeTone = 'success') => {
      setNotice(message);
      setNoticeTone(tone);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(
        () => setNotice(null),
        NOTICE_VISIBLE_MS,
      );
    },
    [],
  );
  showNoticeRef.current = showNotice;

  const addLead = useCallback(
    async (
      input: NewLeadInput,
      photos: LocalLeadPhoto[] = [],
    ): Promise<Lead> => {
      const clientRef = newClientRef();
      let lead: Lead;
      try {
        lead = await crmApi.createLead(input, clientRef);
      } catch (err) {
        if (!(err instanceof ApiError && err.isNetworkError)) throw err;
        // No connection: keep it on the phone; the same clientRef makes a later retry safe.
        const item: OutboxItem = {
          clientRef,
          input,
          createdAt: new Date().toISOString(),
          photos: photos.length > 0 ? photos : undefined,
        };
        updateOutbox([item, ...outboxRef.current]);
        showNotice(
          `No connection - ${input.customerName} saved on this phone and will be sent automatically`,
          'warning',
        );
        return outboxToLead(item);
      }

      setServerLeads(prev => [lead, ...prev]);
      if (photos.length === 0) {
        showNotice(`Lead saved - ${lead.customerName}`);
        return lead;
      }
      // The lead is safe on the server. Its photos go through the outbox, so a dropped
      // connection only delays them instead of losing them.
      updateOutbox([
        { clientRef, input, createdAt: lead.createdAt, photos, leadId: lead.id },
        ...outboxRef.current,
      ]);
      let result = { offline: true, failed: 0 };
      if (!syncing.current) {
        syncing.current = true;
        try {
          result = await sendQueuedPhotos(clientRef, lead.id);
        } finally {
          syncing.current = false;
        }
      }
      if (result.offline) {
        showNotice(
          'Lead saved. Its photos will be sent as soon as the connection allows',
          'warning',
        );
      } else if (result.failed > 0) {
        showNotice(
          result.failed === 1
            ? 'Lead saved, but 1 photo could not be uploaded'
            : `Lead saved, but ${result.failed} photos could not be uploaded`,
          'warning',
        );
      } else {
        showNotice(`Lead saved - ${lead.customerName}`);
      }
      return lead;
    },
    [showNotice, updateOutbox, sendQueuedPhotos],
  );

  const discardQueued = useCallback(
    (id: string) => {
      if (!id.startsWith(LOCAL_ID_PREFIX)) return;
      const ref = id.slice(LOCAL_ID_PREFIX.length);
      updateOutbox(outboxRef.current.filter(i => i.clientRef !== ref));
    },
    [updateOutbox],
  );

  const replaceLead = useCallback((lead: Lead) => {
    setServerLeads(prev => prev.map(l => (l.id === lead.id ? lead : l)));
  }, []);

  // An outbox item whose lead already reached the server is only waiting on photos - the list
  // shows the server's copy of that lead, not a second "waiting to send" one.
  const allLeads = useMemo(
    () => [...outbox.filter(i => !i.leadId).map(outboxToLead), ...serverLeads],
    [outbox, serverLeads],
  );
  const leads = useMemo(
    () => allLeads.filter(l => !isCommercial(l)),
    [allLeads],
  );
  const commercialLeads = useMemo(
    () => allLeads.filter(isCommercial),
    [allLeads],
  );
  const getLead = useCallback(
    (id: string) => allLeads.find(l => l.id === id),
    [allLeads],
  );
  const dismissNotice = useCallback(() => setNotice(null), []);
  // Money totals are consumer-only (a commercial quote is not a payment); the count of
  // today's leads is everything the rep brought in today.
  const stats = useMemo(() => {
    const consumer = computeLeadStats(leads);
    return {
      ...consumer,
      todaysLeads:
        consumer.todaysLeads + computeLeadStats(commercialLeads).todaysLeads,
    };
  }, [leads, commercialLeads]);

  const value = useMemo(
    () => ({
      leads,
      commercialLeads,
      serviceMaster,
      stats,
      loading,
      refreshing,
      error,
      notice,
      noticeTone,
      refresh,
      addLead,
      discardQueued,
      replaceLead,
      showNotice,
      getLead,
      dismissNotice,
    }),
    [
      leads,
      commercialLeads,
      serviceMaster,
      stats,
      loading,
      refreshing,
      error,
      notice,
      noticeTone,
      refresh,
      addLead,
      discardQueued,
      replaceLead,
      showNotice,
      getLead,
      dismissNotice,
    ],
  );

  return (
    <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>
  );
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error('useLeads must be used within a LeadsProvider');
  return ctx;
}
