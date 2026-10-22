import { useCallback, useEffect, useState } from 'react';
import { httpClient } from '../api/httpClient';

/**
 * The services a commercial lead can ask for: the Quotation Master's active services
 * (GET /api/crm/quote-master, the same list the quotation builder uses). A lead saves their ids,
 * so "Create quotation" can start with them ticked.
 *
 * Kept in memory once loaded: LeadsContext loads it when the app opens, so the New Lead form
 * still has the list if the connection drops later (a lead saved offline is sent when it is back).
 */
export type QuoteServiceOption = { id: string; name: string };

let cache: QuoteServiceOption[] | null = null;
let pending: Promise<QuoteServiceOption[]> | null = null;

export function loadQuoteServices(force = false): Promise<QuoteServiceOption[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (!pending) {
    pending = httpClient
      .get<{ services: { id: unknown; name: unknown }[] }>('/api/crm/quote-master')
      .then(({ data }) => {
        cache = (data.services || []).map(s => ({ id: String(s.id), name: String(s.name) }));
        return cache;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** The list for a form: { services (null while loading), error, retry }. */
export function useQuoteServices() {
  const [services, setServices] = useState<QuoteServiceOption[] | null>(cache);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback((force: boolean) => {
    setError(null);
    loadQuoteServices(force)
      .then(setServices)
      .catch(() => setError('Could not load the services. Check the connection and try again.'));
  }, []);
  useEffect(() => {
    load(false);
  }, [load]);
  const retry = useCallback(() => load(true), [load]);
  return { services, error, retry };
}
