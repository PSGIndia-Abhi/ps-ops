import type React from 'react';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useRawRole } from '../auth/role';
import type { AuthenticatedStackParamList } from '../navigation/types';
import { HelpCircleIcon, LifeBuoyIcon } from './icons';
import { helpdeskBadge, useHelpdeskSummary } from './useHelpdeskSummary';

/** The technical team answers tickets (the server decides; this only picks which row to show first). */
const AGENT_ROLES = ['technical lead', 'technical team'];

export function isHelpdeskAgentRole(role: string | null | undefined): boolean {
  return !!role && AGENT_ROLES.includes(role.toLowerCase().trim());
}

export interface HelpRow {
  label: string;
  hint: string;
  badge: number;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  open: () => void;
}

/**
 * Everything a Profile / More screen needs for its one Helpdesk row: "Help & Support" for everyone,
 * "Helpdesk desk" for the technical team. `from` tells the team where the ticket was raised from.
 */
export function useHelpRow(from: string): HelpRow {
  const navigation = useNavigation<NavigationProp<AuthenticatedStackParamList>>();
  const rawRole = useRawRole();
  const summary = useHelpdeskSummary();
  const badge = helpdeskBadge(summary);
  const agent = summary ? summary.isAgent : isHelpdeskAgentRole(rawRole);

  if (agent) {
    const unassigned = summary?.unassigned ?? 0;
    const needsReply = summary?.needsReply ?? 0;
    const parts = [unassigned ? `${unassigned} unassigned` : '', needsReply ? `${needsReply} need reply` : ''].filter(Boolean);
    return {
      label: 'Helpdesk desk',
      hint: parts.length ? parts.join(' · ') : 'Support tickets from users',
      badge,
      Icon: LifeBuoyIcon,
      open: () => navigation.navigate('HelpdeskDesk'),
    };
  }
  return {
    label: 'Help & Support',
    hint: badge ? `${badge} new ${badge === 1 ? 'reply' : 'replies'}` : 'Report a problem',
    badge,
    Icon: HelpCircleIcon,
    open: () => navigation.navigate('Helpdesk', { from }),
  };
}
