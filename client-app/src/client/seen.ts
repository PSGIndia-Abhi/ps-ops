import { kvGet, kvSet } from '../crm/secureKv';

/**
 * When this user last opened each complaint, remembered on this phone (the server has no "read"
 * record for complaints). The list shows a reply as new only if BestServe's last message is newer
 * than the last time the complaint was opened here.
 */

const KEY = 'clientPortal.complaintSeen';
const MAX = 300; // keep the most recent entries only

let cache: { scope: string; map: Record<string, number> } | null = null;

async function load(scope: string): Promise<Record<string, number>> {
  if (cache && cache.scope === scope) return cache.map;
  const map = (await kvGet<Record<string, number>>(scope, KEY)) || {};
  cache = { scope, map };
  return map;
}

/** Map of complaint id -> time (ms) it was last opened on this phone. */
export async function getSeenMap(scope: string): Promise<Record<string, number>> {
  if (!scope) return {};
  return { ...(await load(scope)) };
}

/** Record that the complaint was opened now. */
export async function markComplaintSeen(scope: string, complaintId: string): Promise<void> {
  if (!scope || !complaintId) return;
  const map = await load(scope);
  map[complaintId] = Date.now();
  const ids = Object.keys(map);
  if (ids.length > MAX) {
    ids
      .sort((a, b) => map[a] - map[b])
      .slice(0, ids.length - MAX)
      .forEach((id) => delete map[id]);
  }
  await kvSet(scope, KEY, map);
}

/** True when BestServe's last message came after the complaint was last opened here. */
export function isUnread(seen: Record<string, number>, complaintId: string, lastMessageAt: string | null | undefined): boolean {
  const opened = seen[complaintId];
  if (!opened) return true;
  const last = lastMessageAt ? new Date(lastMessageAt).getTime() : 0;
  return last > opened;
}
