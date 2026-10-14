import React from 'react';
import { AchievementCard as SharedAchievementCard } from '../../components/AchievementCard';
import { formatINR } from '../format';
import type { CommercialAchievements, MonthlyAchievements } from '../stats';

interface AchievementCardProps {
  achievements: CommercialAchievements;
  /** Month name shown in the corner chip. */
  monthLabel: string;
  /** Change this (e.g. add 1) to play the sweep again - Home does after a refresh and whenever it is shown. */
  replayKey?: number;
}

/**
 * The CRM Home card: how this month's commercial leads are going. A commercial lead has no
 * payment, so the ring is the share of leads converted and the centre is the value quoted.
 */
export function AchievementCard({ achievements, monthLabel, replayKey }: AchievementCardProps) {
  const { monthLeads, convertedLeads, newLeads, quoted, convertedPercent } = achievements;
  return (
    <SharedAchievementCard
      title="Your Achievements"
      chip={monthLabel}
      percent={convertedPercent}
      centerPrimary={monthLeads > 0 ? formatINR(quoted) : undefined}
      centerSecondary={monthLeads > 0 ? 'quoted' : undefined}
      centerEmpty={monthLeads > 0 ? undefined : 'no leads yet'}
      tiles={[
        { value: monthLeads === 1 ? '1 lead' : `${monthLeads} leads`, label: 'this month' },
        { value: `${convertedLeads} converted${monthLeads > 0 ? ` · ${convertedPercent}%` : ''}`, label: 'won' },
        { value: `${newLeads} new`, label: 'to follow up' },
      ]}
      accessibilityLabel={`${convertedPercent} percent of this month's commercial leads converted`}
      replayKey={replayKey}
    />
  );
}

interface ResidentialAchievementCardProps extends Omit<AchievementCardProps, 'achievements'> {
  achievements: MonthlyAchievements;
}

/**
 * The residential sales roles' Home card, as the CRM had it before commercial leads: how this
 * month's leads are going (share of lead value collected, leads, paid, converted).
 */
export function ResidentialAchievementCard({ achievements, monthLabel, replayKey }: ResidentialAchievementCardProps) {
  const { monthLeads, paidLeads, convertedLeads, collected, totalValue, collectedPercent, paidPercent } = achievements;
  return (
    <SharedAchievementCard
      title="Your Achievements"
      chip={monthLabel}
      percent={collectedPercent}
      centerPrimary={totalValue > 0 ? formatINR(collected) : undefined}
      centerSecondary={totalValue > 0 ? `of ${formatINR(totalValue)}` : undefined}
      centerEmpty={totalValue > 0 ? undefined : monthLeads > 0 ? 'no payments yet' : 'no leads yet'}
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
