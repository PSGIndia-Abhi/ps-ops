// Shared helpers for quotations (the quotation master and the quotation builder).
// A treatment row's Frequency is chosen from the plans (One Time, Daily, Weekly Once, ...):
// a plan is named by how often the service is done, and picking a plan on a quotation sets the
// rows' frequency to that plan's name.

/** Plans in the order the sales manager set in the master (sort order, then name). */
export const sortPlans = (plans) => [...plans].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));

/** The active plan names from a loaded quotation master, in master order: the Frequency choices. */
export const frequencyNames = (master) => sortPlans((master?.plans || []).filter((p) => p.is_active !== false)).map((p) => p.name);

/** A row's dropdown options: the plan names, plus the row's current value if it is not one of them (older data). */
export const frequencyOptions = (names, current) => (current && !names.includes(current) ? [current, ...names] : names);
