import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { StatusBadge } from '../../components/StatusBadge';
import { Banner, type BannerVariant } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { ReassignSheet } from '../../components/ReassignSheet';
import { RescheduleVisitSheet } from '../../components/RescheduleVisitSheet';
import { TechnicianPickerSheet } from '../../components/TechnicianPickerSheet';
import { CommentComposer, type ComposerPhoto } from '../../components/CommentComposer';
import { AttachmentImage } from '../../components/AttachmentImage';
import { BriefcaseIcon, CheckCircleIcon, ClockIcon, PinIcon } from '../../components/icons';
import { jobsApi, visitsApi, ApiError } from '../../api';
import type { ReassignScope } from '../../api/jobs';
import { useAuth } from '../../auth/AuthContext';
import { useUserRole } from '../../auth/role';
import { getCurrentLocation, LocationError, type DeviceLocation } from '../../utils/location';
import { formatDate, formatTime } from '../../utils/date';
import { colors, radii, spacing, typography } from '../../theme';
import type { JobDetail, JobHistoryEntry, JobStatus } from '../../types/job';
import { JOB_STATUS_TRANSITIONS } from '../../types/job';
import type { JobVisit, VisitStatus } from '../../types/visit';
import type { AuthenticatedStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthenticatedStackParamList, 'JobDetail'>;

interface Feedback {
  message: string;
  variant: BannerVariant;
}

/** Turns any thrown error into the right Banner variant + a safe, short message. */
function feedbackFromError(err: unknown, fallback: string): Feedback {
  if (err instanceof ApiError) {
    if (err.isNetworkError) {
      return { message: 'Unable to connect. Check your connection and try again.', variant: 'network' };
    }
    if (err.status === 403) {
      return { message: "You don't have permission to perform this action.", variant: 'permission' };
    }
    if (err.status === 400) {
      return { message: err.message, variant: 'validation' };
    }
    return { message: err.message, variant: 'error' };
  }
  return { message: fallback, variant: 'error' };
}

/** Above this, a GPS fix is imprecise enough to be worth mentioning alongside a geofence rejection. */
const GOOD_ACCURACY_HINT_METERS = 50;

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} metres`;
}

/**
 * Read-only in Phase 3; genuinely operational now. Job status changes and
 * reassignment go through the admin/supervisor role (mirrors the existing
 * web app's JobPage.jsx exactly: !isTechnician gates those actions). A
 * technician's own "start/complete work" happens at the VISIT level
 * instead - starting their visit bumps the job to IN_PROGRESS as a
 * side effect on the backend, so there is deliberately no separate
 * "Start Job" button shown to a technician (the real web app doesn't
 * show one either - see the Phase 4 report).
 */
export function JobDetailScreen({ route }: Props) {
  const { jobId } = route.params;
  const { user } = useAuth();
  const role = useUserRole();
  const isTechnician = role === 'technician';
  const canManageStatus = !isTechnician;
  const canReassign = !isTechnician;

  const [job, setJob] = useState<JobDetail | null>(null);
  const [visits, setVisits] = useState<JobVisit[] | null>(null);
  const [history, setHistory] = useState<JobHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [statusActionKey, setStatusActionKey] = useState<JobStatus | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);

  const [visitActionId, setVisitActionId] = useState<string | null>(null);

  const [reassignVisible, setReassignVisible] = useState(false);
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const [rescheduleTarget, setRescheduleTarget] = useState<JobVisit | null>(null);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const [technicianPickerTarget, setTechnicianPickerTarget] = useState<JobVisit | null>(null);
  const [technicianPickerSubmitting, setTechnicianPickerSubmitting] = useState(false);
  const [technicianPickerError, setTechnicianPickerError] = useState<string | null>(null);

  const [cancelVisitTarget, setCancelVisitTarget] = useState<JobVisit | null>(null);
  const [cancelVisitSubmitting, setCancelVisitSubmitting] = useState(false);

  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      setError(null);
      try {
        const [jobData, historyData] = await Promise.all([
          jobsApi.getJob(jobId),
          jobsApi.getJobHistory(jobId),
        ]);
        setJob(jobData);
        setHistory(historyData);

        // Visits require VIEW_VISIT, which not every role/deployment may
        // grant - a failure here just means the Visits section is omitted,
        // not that the whole screen fails to load.
        try {
          setVisits(await visitsApi.getJobVisits(jobId));
        } catch {
          setVisits([]);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      } finally {
        setRefreshing(false);
      }
    },
    [jobId],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(newStatus: JobStatus, successMessage: string) {
    if (statusActionKey) return; // prevent double-tap
    setStatusActionKey(newStatus);
    setFeedback(null);
    try {
      await jobsApi.updateJobStatus(jobId, newStatus);
      setFeedback({ message: successMessage, variant: 'success' });
      await load();
    } catch (err) {
      setFeedback(feedbackFromError(err, 'Unable to update this job right now.'));
    } finally {
      setStatusActionKey(null);
      setConfirmComplete(false);
    }
  }

  async function handleStartVisit(visit: JobVisit) {
    if (visitActionId) return;
    setVisitActionId(visit.id);
    setFeedback(null);
    // Hoisted (not `const` inside the try) so the catch block below can
    // reference the accuracy of whatever fix we actually sent, to explain a
    // geofence rejection honestly rather than just stating the distance -
    // see utils/location.ts's doc comment on why a "you're far away" result
    // can come from a genuinely imprecise fix, not a wrong geofence.
    let location: DeviceLocation | null = null;
    try {
      location = await getCurrentLocation();
      const isMissed = visit.status === 'MISSED';
      await (isMissed
        ? visitsApi.startVisitAnyway(visit.id, location)
        : visitsApi.startVisit(visit.id, location));
      setFeedback({ message: 'Visit started successfully', variant: 'success' });
      await load();
    } catch (err) {
      if (err instanceof LocationError) {
        setFeedback({ message: err.message, variant: 'validation' });
      } else if (err instanceof ApiError && err.code === 'OUTSIDE_GEOFENCE') {
        const distance = Number(err.details?.distanceMeters ?? 0);
        const radius = Number(err.details?.radiusMeters ?? 0);
        const accuracy = location?.accuracy ?? null;
        // A poor GPS fix (large accuracy radius) can make a technician who
        // really is on-site look far away - say so plainly instead of just
        // repeating the distance, without ever loosening the actual check.
        const accuracyNote =
          accuracy != null && accuracy > GOOD_ACCURACY_HINT_METERS
            ? ` Your GPS accuracy was low (±${Math.round(accuracy)}m) - try moving to an open area and start again.`
            : '';
        setFeedback({
          message: `You are ${formatDistance(distance)} away from the job location. You must be within ${radius} metres to start this visit.${accuracyNote}`,
          variant: 'validation',
        });
      } else {
        setFeedback(feedbackFromError(err, 'Unable to start this visit.'));
      }
    } finally {
      setVisitActionId(null);
    }
  }

  async function handleSubmitVisit(visit: JobVisit) {
    if (visitActionId) return;
    setVisitActionId(visit.id);
    setFeedback(null);
    try {
      await visitsApi.submitVisit(visit.id);
      setFeedback({ message: 'Visit submitted for approval', variant: 'success' });
      await load();
    } catch (err) {
      setFeedback(feedbackFromError(err, 'Unable to submit this visit.'));
    } finally {
      setVisitActionId(null);
    }
  }

  async function handleApproveVisit(visit: JobVisit) {
    if (visitActionId) return;
    setVisitActionId(visit.id);
    setFeedback(null);
    try {
      await visitsApi.approveVisit(visit.id);
      setFeedback({ message: 'Visit approved successfully', variant: 'success' });
      await load();
    } catch (err) {
      setFeedback(feedbackFromError(err, 'Unable to approve this visit.'));
    } finally {
      setVisitActionId(null);
    }
  }

  async function handleReassign(
    supervisorId: string | number,
    technicianIds: Array<string | number>,
    scope: ReassignScope,
    range?: { start: string; end: string },
  ) {
    setReassignSubmitting(true);
    setReassignError(null);
    try {
      await jobsApi.reassignJob(jobId, supervisorId, technicianIds, scope, range);
      setReassignVisible(false);
      setFeedback({ message: 'Job reassigned successfully', variant: 'success' });
      await load();
    } catch (err) {
      setReassignError(feedbackFromError(err, 'Unable to reassign this job.').message);
    } finally {
      setReassignSubmitting(false);
    }
  }

  async function handleReschedule(date: string, time: string) {
    if (!rescheduleTarget) return;
    setRescheduleSubmitting(true);
    setRescheduleError(null);
    try {
      await visitsApi.rescheduleVisit(rescheduleTarget.id, date, time);
      setRescheduleTarget(null);
      setFeedback({ message: 'Visit rescheduled successfully', variant: 'success' });
      await load();
    } catch (err) {
      setRescheduleError(feedbackFromError(err, 'Unable to reschedule this visit.').message);
    } finally {
      setRescheduleSubmitting(false);
    }
  }

  async function handleUpdateVisitTechnicians(technicianIds: Array<string | number>) {
    if (!technicianPickerTarget) return;
    setTechnicianPickerSubmitting(true);
    setTechnicianPickerError(null);
    try {
      await visitsApi.updateVisitTechnicians(technicianPickerTarget.id, technicianIds);
      setTechnicianPickerTarget(null);
      setFeedback({ message: 'Visit technicians updated successfully', variant: 'success' });
      await load();
    } catch (err) {
      setTechnicianPickerError(feedbackFromError(err, 'Unable to update technicians.').message);
    } finally {
      setTechnicianPickerSubmitting(false);
    }
  }

  async function handleCancelVisit() {
    if (!cancelVisitTarget) return;
    setCancelVisitSubmitting(true);
    try {
      await visitsApi.cancelVisit(cancelVisitTarget.id);
      setFeedback({ message: 'Visit canceled successfully', variant: 'success' });
      await load();
    } catch (err) {
      setFeedback(feedbackFromError(err, 'Unable to cancel this visit.'));
    } finally {
      setCancelVisitSubmitting(false);
      setCancelVisitTarget(null);
    }
  }

  async function handleAddComment(input: { message: string; photo: ComposerPhoto | null }) {
    setCommentSubmitting(true);
    setFeedback(null);
    try {
      const { history_id } = await jobsApi.addJobComment(jobId, input.message);
      if (input.photo) {
        await jobsApi.uploadJobAttachment(jobId, history_id, input.photo);
      }
      setFeedback({ message: 'Update posted successfully', variant: 'success' });
      const historyData = await jobsApi.getJobHistory(jobId);
      setHistory(historyData);
    } catch (err) {
      setFeedback(feedbackFromError(err, 'Unable to post your update.'));
    } finally {
      setCommentSubmitting(false);
    }
  }

  if (!job && !error) {
    return (
      <ScreenContainer edges={['bottom']}>
        <Skeleton height={28} width="60%" style={styles.skeletonGap} />
        <Skeleton height={18} width="40%" style={styles.skeletonGap} />
        <Skeleton height={140} radius={16} style={styles.skeletonGap} />
      </ScreenContainer>
    );
  }

  const company = job?.requestedBy?.company;
  const allowedNext = job ? JOB_STATUS_TRANSITIONS[job.status] : [];

  // The technician's single "what do I do next" visit for this job, if any -
  // a docked bottom action mirroring whichever inline visit button already
  // applies, not a new capability. Admin/Supervisor never see this bar (they
  // already have their own status-management card above); a technician with
  // no visit on this job at all sees no bar rather than a dead one.
  const myVisits = isTechnician
    ? (visits ?? []).filter((v) => v.technicians.some((t) => String(t.id) === String(user?.id)))
    : [];
  const primaryVisit =
    myVisits.find((v) => (['SCHEDULED', 'MISSED', 'IN_PROGRESS'] as VisitStatus[]).includes(v.status)) ??
    myVisits.find((v) => v.status === 'AWAITING_APPROVAL') ??
    myVisits.find((v) => v.status === 'COMPLETED') ??
    null;

  return (
    <View style={styles.screenFlex}>
    <ScreenContainer
      onRefresh={() => load(true)}
      refreshing={refreshing}
      edges={primaryVisit ? [] : ['bottom']}
    >
      {!!error && <Banner message={error} variant="error" />}
      {!!feedback && <Banner message={feedback.message} variant={feedback.variant} />}

      {job && (
        <>
          <View style={styles.headerRow}>
            <Text style={styles.code}>{job.code}</Text>
            <StatusBadge status={job.display_status || job.status} />
          </View>
          <View style={styles.heroTitleRow}>
            <BriefcaseIcon size={20} color={colors.textMuted} />
            <Text style={styles.title}>{job.title}</Text>
          </View>
          <Text style={styles.serviceType}>{job.service_type}</Text>

          {/* Job status actions - admin/supervisor/branch_admin only */}
          {canManageStatus && allowedNext.length > 0 && (
            <View style={styles.actionsCard}>
              {job.status === 'NOT_STARTED' && (
                <Button
                  label="Start Job"
                  onPress={() => handleStatusChange('IN_PROGRESS', 'Job started successfully')}
                  loading={statusActionKey === 'IN_PROGRESS'}
                  disabled={!!statusActionKey}
                />
              )}
              {job.status === 'IN_PROGRESS' && (
                <View style={styles.actionRow}>
                  <Button
                    label="Pause"
                    variant="secondary"
                    style={styles.actionButton}
                    onPress={() => handleStatusChange('PAUSED', 'Job paused')}
                    loading={statusActionKey === 'PAUSED'}
                    disabled={!!statusActionKey}
                  />
                  <Button
                    label="Complete"
                    style={styles.actionButton}
                    onPress={() => setConfirmComplete(true)}
                    disabled={!!statusActionKey}
                  />
                </View>
              )}
              {job.status === 'PAUSED' && (
                <View style={styles.actionRow}>
                  <Button
                    label="Resume"
                    variant="secondary"
                    style={styles.actionButton}
                    onPress={() => handleStatusChange('IN_PROGRESS', 'Job resumed')}
                    loading={statusActionKey === 'IN_PROGRESS'}
                    disabled={!!statusActionKey}
                  />
                  <Button
                    label="Complete"
                    style={styles.actionButton}
                    onPress={() => setConfirmComplete(true)}
                    disabled={!!statusActionKey}
                  />
                </View>
              )}
            </View>
          )}

          <Section title="Schedule">
            <Row label="Start date" value={formatDate(job.start_date)} />
            <Row label="Due date" value={formatDate(job.dueDate)} />
          </Section>

          {(company?.site || company?.address || company?.name) && (
            <Section title="Location">
              {!!company?.name && <Row label="Company" value={company.name} />}
              {!!company?.site && <Row label="Site" value={company.site} />}
              {!!company?.address && <Row label="Address" value={company.address} />}
              {company?.latitude != null && company?.longitude != null && (
                <Pressable
                  style={styles.viewLocationButton}
                  onPress={() =>
                    Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${company.latitude},${company.longitude}`,
                    )
                  }
                  accessibilityRole="button"
                >
                  <PinIcon size={16} color={colors.primary} />
                  <Text style={styles.viewLocationText}>View Location</Text>
                </Pressable>
              )}
            </Section>
          )}

          {!!job.supervisor && (
            <Section title="Supervisor">
              <Row label="Name" value={job.supervisor.name} />
              {!!job.supervisor.phone && <Row label="Phone" value={job.supervisor.phone} />}
            </Section>
          )}

          <Section
            title="Assigned team"
            action={
              canReassign
                ? { label: 'Change', onPress: () => setReassignVisible(true) }
                : undefined
            }
          >
            {job.team.length > 0 ? (
              job.team.map((member) => <Row key={member.id} label={member.name} value="" />)
            ) : (
              <Text style={styles.emptyText}>No technicians assigned yet.</Text>
            )}
          </Section>

          {!!job.requestedBy && (
            <Section title="Requested by">
              <Row label="Name" value={job.requestedBy.name} />
              {!!job.requestedBy.phone && <Row label="Phone" value={job.requestedBy.phone} />}
            </Section>
          )}

          {!!job.notes && (
            <Section title="Notes">
              <Text style={styles.notes}>{job.notes}</Text>
            </Section>
          )}

          {!!visits && visits.length > 0 && (
            <Section title="Visits">
              {visits.map((visit) => (
                <VisitRow
                  key={visit.id}
                  visit={visit}
                  isTechnician={isTechnician}
                  canManage={canReassign}
                  isMine={visit.technicians.some((t) => String(t.id) === String(user?.id))}
                  actionLoading={visitActionId === visit.id}
                  anyActionLoading={!!visitActionId}
                  onStart={() => handleStartVisit(visit)}
                  onSubmit={() => handleSubmitVisit(visit)}
                  onApprove={() => handleApproveVisit(visit)}
                  onReschedule={() => setRescheduleTarget(visit)}
                  onChangeTechnicians={() => setTechnicianPickerTarget(visit)}
                  onCancel={() => setCancelVisitTarget(visit)}
                />
              ))}
            </Section>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activity</Text>
            <CommentComposer onSubmit={handleAddComment} submitting={commentSubmitting} />

            <View style={styles.timeline}>
              {history === null ? (
                <Skeleton height={60} radius={12} style={styles.skeletonGap} />
              ) : history.length === 0 ? (
                <Text style={styles.emptyText}>No activity yet.</Text>
              ) : (
                history.map((entry) => <HistoryRow key={entry.id} entry={entry} />)
              )}
            </View>
          </View>
        </>
      )}

      <ConfirmSheet
        visible={confirmComplete}
        title="Complete this job?"
        description="This marks the job as completed and cannot be undone. Make sure all visits are finished first."
        confirmLabel="Complete Job"
        onConfirm={() => handleStatusChange('COMPLETED', 'Job completed successfully')}
        onCancel={() => setConfirmComplete(false)}
        loading={statusActionKey === 'COMPLETED'}
      />

      {job && (
        <ReassignSheet
          visible={reassignVisible}
          currentTechnicianIds={job.team.map((t) => t.id)}
          currentSupervisorId={job.supervisor?.id ?? null}
          isAdmin={role === 'admin' || role === 'branch_admin'}
          supportsRecurringScope={job.has_recurring}
          onConfirm={handleReassign}
          onClose={() => setReassignVisible(false)}
          submitting={reassignSubmitting}
          error={reassignError}
        />
      )}

      <RescheduleVisitSheet
        visible={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onConfirm={handleReschedule}
        submitting={rescheduleSubmitting}
        error={rescheduleError}
      />

      <TechnicianPickerSheet
        visible={!!technicianPickerTarget}
        title="Change visit technicians"
        currentTechnicianIds={technicianPickerTarget?.technicians.map((t) => t.id) ?? []}
        onClose={() => setTechnicianPickerTarget(null)}
        onConfirm={handleUpdateVisitTechnicians}
        submitting={technicianPickerSubmitting}
        error={technicianPickerError}
      />

      <ConfirmSheet
        visible={!!cancelVisitTarget}
        title="Cancel this visit?"
        description="This cancels the visit. It cannot be undone."
        confirmLabel="Cancel Visit"
        destructive
        onConfirm={handleCancelVisit}
        onCancel={() => setCancelVisitTarget(null)}
        loading={cancelVisitSubmitting}
      />
    </ScreenContainer>

    {!!primaryVisit && (
      <TechnicianActionBar
        visit={primaryVisit}
        loading={visitActionId === primaryVisit.id}
        onStart={() => handleStartVisit(primaryVisit)}
        onSubmit={() => handleSubmitVisit(primaryVisit)}
      />
    )}
    </View>
  );
}

interface VisitRowProps {
  visit: JobVisit;
  isTechnician: boolean;
  canManage: boolean;
  isMine: boolean;
  actionLoading: boolean;
  anyActionLoading: boolean;
  onStart: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReschedule: () => void;
  onChangeTechnicians: () => void;
  onCancel: () => void;
}

const TERMINAL_VISIT_STATUSES: VisitStatus[] = ['COMPLETED', 'CANCELED'];

function VisitRow({
  visit,
  isTechnician,
  canManage,
  isMine,
  actionLoading,
  anyActionLoading,
  onStart,
  onSubmit,
  onApprove,
  onReschedule,
  onChangeTechnicians,
  onCancel,
}: VisitRowProps) {
  const canAct = !isTechnician || isMine;
  const showStart = canAct && (['SCHEDULED', 'MISSED'] as VisitStatus[]).includes(visit.status);
  const showSubmit = canAct && visit.status === 'IN_PROGRESS';
  const showApprove = !isTechnician && visit.status === 'AWAITING_APPROVAL';
  const showManageRow = canManage && !TERMINAL_VISIT_STATUSES.includes(visit.status);

  return (
    <View style={styles.visitRow}>
      <View style={styles.visitHeader}>
        <Text style={styles.visitTitle}>Visit #{visit.visit_number}</Text>
        <StatusBadge status={visit.status} />
      </View>
      <Text style={styles.visitMeta}>
        {formatDate(visit.scheduled_date)} · {formatTime(visit.scheduled_date)}
      </Text>
      {visit.technicians.length > 0 && (
        <Text style={styles.visitMeta}>{visit.technicians.map((t) => t.name).join(', ')}</Text>
      )}

      {!TERMINAL_VISIT_STATUSES.includes(visit.status) && visit.status !== 'MISSED' && (
        <VisitProgress visit={visit} />
      )}

      {(showStart || showSubmit || showApprove) && (
        <View style={styles.visitActions}>
          {showStart && (
            <Button
              label={visit.status === 'MISSED' ? 'Start Anyway' : 'Start Visit'}
              variant="secondary"
              onPress={onStart}
              loading={actionLoading}
              disabled={anyActionLoading}
              style={styles.visitActionButton}
            />
          )}
          {showSubmit && (
            <Button
              label="Submit for Approval"
              variant="secondary"
              onPress={onSubmit}
              loading={actionLoading}
              disabled={anyActionLoading}
              style={styles.visitActionButton}
            />
          )}
          {showApprove && (
            <Button
              label="Approve"
              onPress={onApprove}
              loading={actionLoading}
              disabled={anyActionLoading}
              style={styles.visitActionButton}
            />
          )}
        </View>
      )}

      {showManageRow && (
        <View style={styles.visitManageRow}>
          <Pressable onPress={onReschedule} hitSlop={6} disabled={anyActionLoading}>
            <Text style={styles.visitManageLink}>Reschedule</Text>
          </Pressable>
          <Pressable onPress={onChangeTechnicians} hitSlop={6} disabled={anyActionLoading}>
            <Text style={styles.visitManageLink}>Reassign</Text>
          </Pressable>
          <Pressable onPress={onCancel} hitSlop={6} disabled={anyActionLoading}>
            <Text style={[styles.visitManageLink, styles.visitManageLinkDanger]}>Cancel</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

interface TechnicianActionBarProps {
  visit: JobVisit;
  loading: boolean;
  onStart: () => void;
  onSubmit: () => void;
}

/**
 * The docked bottom "what do I do next" action for a technician - the exact
 * same handlers/endpoints as the inline per-visit buttons in the Visits
 * section (this is a UI convenience, not a second code path). Non-actionable
 * states (awaiting approval / completed) render as a plain status strip, not
 * a disabled-looking dead button.
 */
function TechnicianActionBar({ visit, loading, onStart, onSubmit }: TechnicianActionBarProps) {
  const insets = useSafeAreaInsets();
  const containerStyle = [styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }];

  if (visit.status === 'AWAITING_APPROVAL') {
    return (
      <View style={containerStyle}>
        <View style={styles.bottomBarStatus}>
          <ClockIcon size={16} color={colors.warningText} />
          <Text style={styles.bottomBarStatusText}>Waiting for supervisor approval</Text>
        </View>
      </View>
    );
  }

  if (visit.status === 'COMPLETED') {
    return (
      <View style={containerStyle}>
        <View style={[styles.bottomBarStatus, styles.bottomBarStatusSuccess]}>
          <CheckCircleIcon size={16} color={colors.successText} />
          <Text style={[styles.bottomBarStatusText, styles.bottomBarStatusTextSuccess]}>
            Visit completed
          </Text>
        </View>
      </View>
    );
  }

  const isMissed = visit.status === 'MISSED';

  return (
    <View style={containerStyle}>
      <Button
        label={
          visit.status === 'IN_PROGRESS'
            ? 'Submit for Approval'
            : isMissed
              ? 'Start Anyway'
              : 'Start Visit'
        }
        onPress={visit.status === 'IN_PROGRESS' ? onSubmit : onStart}
        loading={loading}
        disabled={loading}
        style={styles.bottomBarButton}
      />
    </View>
  );
}

interface ProgressStep {
  key: string;
  label: string;
  done: boolean;
  time: string | null;
}

/**
 * A compact 4-step visual of a visit's real progress - Assigned, Started,
 * Submitted, Approved. Only "Started" and "Approved" have an actual backend
 * timestamp (`started_at`/`completed_at`); "Assigned" and "Submitted" are
 * derived purely from the visit's current/passed-through status, so no time
 * is shown for those two rather than inventing one. Never shown for
 * CANCELED/MISSED visits - those are terminal/exceptional states already
 * communicated by the StatusBadge above, not points on a linear progress
 * bar.
 */
function VisitProgress({ visit }: { visit: JobVisit }) {
  const reachedStarted =
    !!visit.started_at || (['IN_PROGRESS', 'AWAITING_APPROVAL', 'COMPLETED'] as VisitStatus[]).includes(visit.status);
  const reachedSubmitted = (['AWAITING_APPROVAL', 'COMPLETED'] as VisitStatus[]).includes(visit.status);
  const reachedApproved = visit.status === 'COMPLETED';

  const steps: ProgressStep[] = [
    { key: 'assigned', label: 'Assigned', done: true, time: null },
    { key: 'started', label: 'Started', done: reachedStarted, time: visit.started_at },
    { key: 'submitted', label: 'Submitted', done: reachedSubmitted, time: null },
    { key: 'approved', label: 'Approved', done: reachedApproved, time: visit.completed_at },
  ];

  return (
    <View style={styles.progressWrap}>
      {steps.map((step, index) => (
        <React.Fragment key={step.key}>
          {index > 0 && (
            <View style={[styles.progressLine, step.done && styles.progressLineDone]} />
          )}
          <View style={styles.progressStep}>
            <View style={[styles.progressDot, step.done && styles.progressDotDone]}>
              {step.done && <CheckCircleIcon size={11} color={colors.textOnPrimary} />}
            </View>
            <Text style={styles.progressLabel} numberOfLines={1}>
              {step.label}
            </Text>
            {!!step.time && (
              <Text style={styles.progressTime} numberOfLines={1}>
                {formatTime(step.time)}
              </Text>
            )}
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function HistoryRow({ entry }: { entry: JobHistoryEntry }) {
  const label =
    entry.action === 'STATUS_CHANGED'
      ? entry.message
      : entry.action === 'COMMENT'
        ? entry.message
        : entry.action.replace(/_/g, ' ').toLowerCase();

  return (
    <View style={styles.historyRow}>
      <View style={styles.historyHeaderRow}>
        <Text style={styles.historyAuthor}>{entry.created_by || 'System'}</Text>
        <Text style={styles.historyTime}>{formatDate(entry.created_at)} · {formatTime(entry.created_at)}</Text>
      </View>
      {!!label && <Text style={styles.historyMessage}>{label}</Text>}
      {entry.attachments.length > 0 && (
        <View style={styles.historyAttachments}>
          {entry.attachments.map((a) => (
            <AttachmentImage key={a.id} attachmentId={a.id} size={64} />
          ))}
        </View>
      )}
    </View>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!action && (
          <Pressable onPress={action.onPress} hitSlop={8}>
            <Text style={styles.sectionAction}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {!!value && (
        <Text style={styles.rowValue} numberOfLines={2}>
          {value}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenFlex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  bottomBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  bottomBarButton: {
    width: '100%',
    minHeight: 52,
  },
  bottomBarStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  bottomBarStatusSuccess: {
    backgroundColor: colors.successBg,
  },
  bottomBarStatusText: {
    ...typography.bodyMedium,
    color: colors.warningText,
  },
  bottomBarStatusTextSuccess: {
    color: colors.successText,
  },
  skeletonGap: {
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxs,
  },
  code: {
    ...typography.overline,
    color: colors.textMuted,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  serviceType: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  actionsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionAction: {
    ...typography.captionMedium,
    color: colors.primary,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xxs,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  rowValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flexShrink: 1,
    marginLeft: spacing.md,
    textAlign: 'right',
  },
  notes: {
    ...typography.body,
    color: colors.textSecondary,
  },
  viewLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  viewLocationText: {
    ...typography.captionMedium,
    color: colors.primary,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  visitRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  visitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  visitTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  visitMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  visitActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  visitActionButton: {
    flex: 1,
    minHeight: 48,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  progressStep: {
    alignItems: 'center',
    width: 64,
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginTop: 9,
    marginHorizontal: -6,
  },
  progressLineDone: {
    backgroundColor: colors.success,
  },
  progressDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  progressLabel: {
    ...typography.overline,
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  progressTime: {
    ...typography.overline,
    fontSize: 9,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  visitManageRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  visitManageLink: {
    ...typography.caption,
    color: colors.primary,
  },
  visitManageLinkDanger: {
    color: colors.danger,
  },
  timeline: {
    marginTop: spacing.md,
  },
  historyRow: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyAuthor: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  historyTime: {
    ...typography.caption,
    color: colors.textMuted,
  },
  historyMessage: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  historyAttachments: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});
