import React from 'react';
import { AchievementCard as SharedAchievementCard } from '../../components/AchievementCard';
import { formatINR } from '../format';
import type { MonthlyAchievements } from '../stats';

interface AchievementCardProps {
  achievements: MonthlyAchievements;
  /** Month name shown in the corner chip. */
  monthLabel: string;
  /** Change this (e.g. add 1) to play the sweep again - Home does after a refresh and whenever it is shown. */
  replayKey?: number;
}

/** The CRM Home card: how this month's leads are going (share of lead value collected, leads, paid, converted). */
export function AchievementCard({ achievements, monthLabel, replayKey }: AchievementCardProps) {
  const { monthLeads, paidLeads, convertedLeads, collected, totalValue, collectedPercent, paidPercent } = achievements;
  return (
    <SharedAchievementCard
      title="Your Achievements"
      chip={monthLabel}
      percent={collectedPercent}
      centerPrimary={totalValue > 0 ? formatINR(collected) : undefined}
      centerSecondary={totalValue > 0 ? `of ${formatINR(totalValue)}` : undefined}
      centerEmpty={totalValue > 0 ? undefined : 'no leads yet'}
      tiles={[
        { value: monthLeads === 1 ? '1 lead' : `${monthLeads} leads`, label: 'this month' },
        { value: `${paidLeads} paid${monthLeads > 0 ? ` · ${paidPercent}%` : ''}`, label: 'collected' },
        { value: `${convertedLeads} converted`, label: 'won' },
      ]}
      accessibilityLabel={`${collectedPercent} percent of this month's lead value collected`}
      replayKey={replayKey}
    />
  );
}
