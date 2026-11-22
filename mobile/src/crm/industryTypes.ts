import { useEffect, useState } from 'react';
import { httpClient } from '../api/httpClient';
import { INDUSTRY_TYPES, type Option } from './types';

/**
 * A commercial lead's industry: the Industry Types master (crm_industry_types, kept by the sales
 * manager / Managing Director / Personal Assistant / admin on the web's Industry Types page) -
 * GET /api/crm/industry-types. A lead saves the type's code ("restaurant").
 *
 * The seven built-in types (INDUSTRY_TYPES) are used until the master has loaded, and whenever it
 * cannot be read (offline, or a backend from before the master existed).
 * Kept in memory once loaded: LeadsContext loads it when the app opens.
 */
interface IndustryRow {
  value: string;
  label: string;
  active: boolean;
}

const BUILT_IN: IndustryRow[] = INDUSTRY_TYPES.map(o => ({ ...o, active: true }));
let cache: IndustryRow[] | null = null;
let pending: Promise<IndustryRow[]> | null = null;
const listeners = new Set<(rows: IndustryRow[]) => void>();

export function loadIndustryTypes(force = false): Promise<IndustryRow[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (!pending) {
    pending = httpClient
      .get<{ code: unknown; name: unknown; is_active?: unknown }[]>('/api/crm/industry-types')
      .then(({ data }) => {
        const rows = (data || [])
          .map(r => ({ value: String(r.code ?? ''), label: String(r.name ?? ''), active: r.is_active !== false }))
          .filter(r => r.value && r.label);
        if (rows.length) {
          cache = rows;
          listeners.forEach(l => l(rows));
        }
        return cache ?? BUILT_IN;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

const current = () => cache ?? BUILT_IN;

/** What a form offers: the active types, plus `selected` when a lead already has a switched-off one. */
export function industryOptions(selected?: string | null): Option<string>[] {
  return current()
    .filter(r => r.active || r.value === selected)
    .map(({ value, label }) => ({ value, label }));
}

/** A type's name for its code ('' when unknown). */
export function industryLabel(code: string | null | undefined): string {
  if (!code) return '';
  return current().find(r => r.value === code)?.label ?? '';
}

/** Whether the code is an active type now - e.g. to reuse the one picked last time. */
export function isActiveIndustry(code: string | null | undefined): boolean {
  return !!code && current().some(r => r.value === code && r.active);
}

/** Re-renders the screen when the master loads, so dropdowns and labels show its names. */
export function useIndustryTypes() {
  const [, setRows] = useState<IndustryRow[]>(current());
  useEffect(() => {
    listeners.add(setRows);
    loadIndustryTypes().catch(() => undefined);
    return () => {
      listeners.delete(setRows);
    };
  }, []);
}
