import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getDepartments, getEmailTemplates, getMyAccessFull, getQuestions, otherFeedbackEnabled } from './api';
import type { Department, DepartmentKind, EmailTemplate, Question } from './types';

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
  /** The departments a ticket can go to (switched on in Masters). */
  departmentList: Department[];
  /** The departments this user works in (Operations / Accounts team member). */
  myDepartments: DepartmentKind[];
  /** Only a department member: works their department's tickets, no calls. */
  deptOnly: boolean;
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
  const [departmentList, setDepartmentList] = useState<Department[]>([]);
  const [myDepartments, setMyDepartments] = useState<DepartmentKind[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    getMyAccessFull()
      .then((a) => {
        setPermissions(a.permissions);
        setMyDepartments(a.departments);
      })
      .catch(() => setPermissions([]));
  }, []);
  useEffect(() => {
    getQuestions().then(setQuestions).catch(() => {});
    otherFeedbackEnabled().then(setOtherEnabled).catch(() => {});
    getEmailTemplates().then(setEmailTemplates).catch(() => {});
    getDepartments().then(setDepartmentList).catch(() => {});
  }, [tick]);

  const value = useMemo(
    () => ({
      userId,
      permissions,
      can: (p: string) => permissions.includes(p),
      questions,
      otherEnabled,
      emailTemplates,
      departmentList,
      myDepartments,
      // Team members and assigned supervisors / salespeople: their tickets only.
      deptOnly: permissions.length > 0 && permissions.every((p) => ['FEEDBACK_DEPT', 'FEEDBACK_ISSUES', 'FEEDBACK_ASSIGNED', 'FEEDBACK_SCHEDULE'].includes(p)),
      reloadQuestions: () => setTick((n) => n + 1),
    }),
    [userId, permissions, questions, otherEnabled, emailTemplates, departmentList, myDepartments],
  );
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}
