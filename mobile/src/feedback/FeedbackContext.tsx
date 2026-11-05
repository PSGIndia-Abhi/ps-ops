import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getEmailTemplates, getMyAccess, getQuestions, otherFeedbackEnabled } from './api';
import type { EmailTemplate, Question } from './types';

/**
 * What every Customer Feedback screen needs once: who is signed in, their FEEDBACK_* permissions
 * (from GET /api/feedback/me - the backend decides), and the questions from Masters > Questions.
 */
interface FeedbackContextValue {
  userId: number;
  permissions: string[];
  can: (permission: string) => boolean;
  questions: Question[];
  otherEnabled: boolean;
  /** The customer email templates (Masters > Email templates). */
  emailTemplates: EmailTemplate[];
  /** Reloads the questions (e.g. pull-to-refresh after a change in Masters). */
  reloadQuestions: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const userId = Number(user?.id ?? session?.userId ?? 0);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [otherEnabled, setOtherEnabled] = useState(true);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    getMyAccess().then(setPermissions).catch(() => setPermissions([]));
  }, []);
  useEffect(() => {
    getQuestions().then(setQuestions).catch(() => {});
    otherFeedbackEnabled().then(setOtherEnabled).catch(() => {});
    getEmailTemplates().then(setEmailTemplates).catch(() => {});
  }, [tick]);

  const value = useMemo(
    () => ({
      userId,
      permissions,
      can: (p: string) => permissions.includes(p),
      questions,
      otherEnabled,
      emailTemplates,
      reloadQuestions: () => setTick((n) => n + 1),
    }),
    [userId, permissions, questions, otherEnabled, emailTemplates],
  );
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}
