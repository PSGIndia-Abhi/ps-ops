/**
 * Helpers over the price list the backend serves (GET /api/crm/services,
 * from the crm_services + crm_service_prices tables). Pure functions over the
 * fetched rows - nothing here is hard-coded, so a price-list change in the
 * database shows up in the app without a release.
 */
export interface ServiceMasterRow {
  service: string;
  houseType: string;
  plan: string;
  price: number;
}

function unique(values: string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) === i);
}

export function getServices(rows: ServiceMasterRow[]): string[] {
  return unique(rows.map((r) => r.service));
}

/** House types offered across the price list, in the order the master lists them. */
export function getHouseTypes(rows: ServiceMasterRow[]): string[] {
  return unique(rows.map((r) => r.houseType));
}

/** Plans depend on the selected service. */
export function getPlans(rows: ServiceMasterRow[], service: string | null): string[] {
  if (!service) return [];
  return unique(rows.filter((r) => r.service === service).map((r) => r.plan));
}

/** Standard price for a service + house type + plan, or null if that combination isn't priced. */
export function getPrice(
  rows: ServiceMasterRow[],
  service: string | null,
  houseType: string | null,
  plan: string | null,
): number | null {
  if (!service || !houseType || !plan) return null;
  const row = rows.find((r) => r.service === service && r.houseType === houseType && r.plan === plan);
  return row ? row.price : null;
}
