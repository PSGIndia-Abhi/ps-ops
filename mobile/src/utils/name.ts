/**
 * Shared "avatar initials" helper - e.g. "Suptest1" -> "S", "John Smith" ->
 * "JS". Used everywhere a person is shown as a colored initials circle
 * instead of a fake profile photo (AppHeader, ProfileScreen, JobDetail's
 * PersonRow) - was duplicated three times before this extraction.
 */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}
