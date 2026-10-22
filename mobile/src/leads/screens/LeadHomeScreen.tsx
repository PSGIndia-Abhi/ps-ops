import React from 'react';
import { useMe } from '../ui';
import { SalesExecHome, SalesManagerHome } from './SalesHomes';
import { TelecallerHome } from './TelecallerHome';

/**
 * Home for the Lead Management roles - each built around that person's day:
 *  - telecaller: a calling desk (who to call next) - TelecallerHome.tsx;
 *  - commercial sales executive: the next visit first (Directions / Open visit) - SalesHomes.tsx;
 *  - sales manager: verified leads waiting for a meeting and the team's visits today - SalesHomes.tsx.
 */
export function LeadHomeScreen() {
  const { persona } = useMe();
  if (persona === 'telecaller') return <TelecallerHome />;
  if (persona === 'sales') return <SalesExecHome />;
  return <SalesManagerHome />;
}
