export interface Level {
  name: string;
  /** Completed jobs needed to reach this level. */
  at: number;
}

export const LEVELS: Level[] = [
  { name: 'Rookie', at: 0 },
  { name: 'Rising Star', at: 5 },
  { name: 'Pro', at: 20 },
  { name: 'Expert', at: 50 },
  { name: 'Master', at: 100 },
];

export interface LevelProgress {
  /** 1-based, for "Level 3". */
  number: number;
  name: string;
  next: Level | null;
  /** Jobs still needed for the next level (0 at the top level). */
  toNext: number;
  /** Progress from this level to the next, 0-100 (100 at the top level). */
  percent: number;
}

export function levelFor(completed: number): LevelProgress {
  let index = 0;
  LEVELS.forEach((level, i) => {
    if (completed >= level.at) index = i;
  });
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  if (!next) return { number: index + 1, name: current.name, next: null, toNext: 0, percent: 100 };
  const span = next.at - current.at;
  return {
    number: index + 1,
    name: current.name,
    next,
    toNext: next.at - completed,
    percent: Math.max(0, Math.min(100, Math.round(((completed - current.at) / span) * 100))),
  };
}

export const MILESTONES = [1, 10, 25, 50, 100];

export interface MilestoneBadge {
  target: number;
  label: string;
  earned: boolean;
  /** Jobs still to go (0 once earned). */
  remaining: number;
}

export function milestoneBadges(completed: number): MilestoneBadge[] {
  return MILESTONES.map(target => ({
    target,
    label: target === 1 ? 'First job' : `${target} jobs`,
    earned: completed >= target,
    remaining: Math.max(0, target - completed),
  }));
}
