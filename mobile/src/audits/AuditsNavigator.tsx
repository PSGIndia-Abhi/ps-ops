import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { ag } from './theme';
import { AuditHomeScreen } from './screens/AuditHomeScreen';
import { StartAuditScreen } from './screens/StartAuditScreen';
import { AuditAreasScreen } from './screens/AuditAreasScreen';
import { AreaInspectScreen } from './screens/AreaInspectScreen';
import { AreaViewScreen } from './screens/AreaViewScreen';
import { WalkthroughScreen } from './screens/WalkthroughScreen';
import { SignoffScreen } from './screens/SignoffScreen';
import { ReviewSubmitScreen } from './screens/ReviewSubmitScreen';

export type AuditsStackParamList = {
  AuditHome: undefined;
  /** With auditId: edit that audit's details instead of starting a new one. */
  StartAudit: { auditId?: string } | undefined;
  AuditAreas: { auditId: string; savedArea?: string };
  AreaInspect: { auditId: string; areaId?: string; savedArea?: string };
  AreaView: { auditId: string; areaId: string };
  Walkthrough: { auditId: string };
  Signoff: { auditId: string };
  ReviewSubmit: { auditId: string };
};

const Stack = createNativeStackNavigator<AuditsStackParamList>();

/** The supervisor's "Audits" tab: start, inspect area by area, sign off, submit. */
export function AuditsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: ag.green,
        headerTitleStyle: { color: colors.textPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="AuditHome" component={AuditHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="StartAudit" component={StartAuditScreen} options={{ title: 'Start new audit' }} />
      <Stack.Screen name="AuditAreas" component={AuditAreasScreen} options={{ title: 'Audit areas' }} />
      <Stack.Screen name="AreaInspect" component={AreaInspectScreen} options={{ title: 'Area inspection' }} />
      <Stack.Screen name="AreaView" component={AreaViewScreen} options={{ title: 'Area' }} />
      <Stack.Screen name="Walkthrough" component={WalkthroughScreen} options={{ title: 'Site walkthrough' }} />
      <Stack.Screen name="Signoff" component={SignoffScreen} options={{ title: 'Sign-off' }} />
      <Stack.Screen name="ReviewSubmit" component={ReviewSubmitScreen} options={{ title: 'Review & submit' }} />
    </Stack.Navigator>
  );
}
