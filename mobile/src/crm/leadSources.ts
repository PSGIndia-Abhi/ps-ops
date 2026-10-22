import { useCallback, useEffect, useState } from 'react';
import { httpClient } from '../api/httpClient';

/**
 * Where a commercial lead came from: the lead source master (crm_lead_sources, kept by the sales
 * manager on the web's Lead Sources page) - GET /api/crm/lead-sources, the same list the web form
 * offers. A lead saves the source's name ("Field Visit").
 *
 * Kept in memory once loaded: LeadsContext loads it when the app opens, so the New Lead form
 * still has the list if the connection drops later.
 */
let cache: string[] | null = null;
let pending: Promise<string[]> | null = null;

export function loadLeadSources(force = false): Promise<string[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (!pending) {
    pending = httpClient
      .get<{ name: unknown }[]>('/api/crm/lead-sources')
      .then(({ data }) => {
        cache = (data || []).map(s => String(s.name)).filter(Boolean);
        return cache;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** The sources loaded so far (null until the first load) - for code that cannot wait. */
export const cachedLeadSources = () => cache;

/** The list for a form: { sources (null while loading), error, retry }. */
export function useLeadSources() {
  const [sources, setSources] = useState<string[] | null>(cache);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback((force: boolean) => {
    setError(null);
    loadLeadSources(force)
      .then(setSources)
      .catch(() => setError('Could not load the lead sources. Check the connection and try again.'));
  }, []);
  useEffect(() => {
    load(false);
  }, [load]);
  const retry = useCallback(() => load(true), [load]);
  return { sources, error, retry };
}

// Codes older app versions saved, as they read on screen.
const OLD_CODES: Record<string, string> = {
  google: 'Google',
  website: 'Website',
  referral: 'Referral',
  social_media: 'Social Media',
  apartment: 'Apartment',
  other: 'Other',
};

/** A stored source as it reads on screen: a name as is, an old code ("social_media") as its label. */
export function leadSourceLabel(stored: string | null | undefined): string {
  const raw = (stored ?? '').trim();
  return OLD_CODES[raw.toLowerCase()] ?? raw;
}

/**
 * A stored source as one of the master's names when it matches one ("google" -> "Google"),
 * otherwise as it reads on screen - so the edit form shows it selected.
 */
export function matchLeadSource(stored: string | null | undefined, names: string[] | null): string | null {
  const label = leadSourceLabel(stored);
  if (!label) return null;
  return names?.find(n => n.toLowerCase() === label.toLowerCase()) ?? label;
}
