import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { StatusBadge } from '../../components/StatusBadge';
import { GradientCard } from '../../components/GradientCard';
import { Card } from '../../components/Card';
import { ArrowButton } from '../../components/ArrowButton';
import { Banner, type BannerVariant } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { ReassignSheet } from '../../components/ReassignSheet';
import { RescheduleVisitSheet } from '../../components/RescheduleVisitSheet';
import { TechnicianPickerSheet } from '../../components/TechnicianPickerSheet';
import { CommentComposer, type ComposerPhoto } from '../../components/CommentComposer';
import { AttachmentImage } from '../../components/AttachmentImage';
import {
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ClockIcon,
  ExternalLinkIcon,
  PersonIcon,
  PhoneIcon,
  PinIcon,
  PlayIcon,
  TagIcon,
  UsersIcon,
} from '../../components/icons';
import { jobsApi, visitsApi, ApiError } from '../../api';
import type { ReassignScope } from '../../api/jobs';
import { useAuth } from '../../auth/AuthContext';
import { useUserRole } from '../../auth/role';
import {
  getCurrentLocation,
  LocationError,
  LocationServicesDisabledError,
  type DeviceLocation,
} from '../../utils/location';
import { formatDate, formatTime } from '../../utils/date';
import { initialsFor } from '../../utils/name';
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
export function JobDetailScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { user } = useAuth();
  const role = useUserRole();
  const insets = useSafeAreaInsets();
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
  // Narrates what "Start Visit" is actually doing right now instead of just
  // a spinner - 'locating' while the device acquires a GPS fix (up to ~8s,
  // see utils/location.ts), 'verifying' while the one backend call that does
  // both geofence-check-and-start is in flight. Deliberately never claims
  // "location verified" before the server actually confirms it (the geofence
  // check happens server-side, inside that same call) - narrating an
  // unconfirmed success would be exactly the kind of fake-good-news state
  // this app avoids elsewhere.
  const [locationPhase, setLocationPhase] = useState<'locating' | 'verifying' | null>(null);

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
    setLocationPhase('locating');
    try {
      location = await getCurrentLocation();
      setLocationPhase('verifying');
      const isMissed = visit.status === 'MISSED';
      await (isMissed
        ? visitsApi.startVisitAnyway(visit.id, location)
        : visitsApi.startVisit(visit.id, location));
      setFeedback({ message: 'Visit started successfully', variant: 'success' });
      await load();
    } catch (err) {
      if (err instanceof LocationServicesDisabledError) {
        // An actual "ask" (per the reference this was built against), not
        // just red text the technician has to already know to act on -
        // "Open Settings" jumps straight to the Location toggle, no manual
        // hunting through the OS Settings app required.
        Alert.alert(err.message, 'You can turn it on now without leaving this screen.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'android') {
                Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
              } else {
                Linking.openURL('app-settings:');
              }
            },
          },
        ]);
      } else if (err instanceof LocationError) {
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
      setLocationPhase(null);
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

  async function handleAddComment(input: { message: string; photos: ComposerPhoto[] }) {
    setCommentSubmitting(true);
    setFeedback(null);
    try {
      const { history_id } = await jobsApi.addJobComment(jobId, input.message);
      // One upload call per photo, in sequence (not Promise.all) - each is
      // its own multipart request against the same history_id. Sequential
      // (not parallel) so a failure partway through reports honestly how
      // many actually made it, instead of an ambiguous mixed batch result.
      // The backend never needed a multi-file endpoint for this - see
      // CommentComposer's own doc comment.
      let uploaded = 0;
      try {
        for (const photo of input.photos) {
          await jobsApi.uploadJobAttachment(jobId, history_id, photo);
          uploaded += 1;
        }
      } catch (uploadErr) {
        const remaining = input.photos.length - uploaded;
        setFeedback({
          message: `Update posted, but ${remaining} of ${input.photos.length} photo${remaining === 1 ? '' : 's'} failed to attach. ${feedbackFromError(uploadErr, 'Please try again.').message}`,
          variant: 'validation',
        });
        const historyData = await jobsApi.getJobHistory(jobId);
        setHistory(historyData);
        return;
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
      <View style={styles.screenFlex}>
        <View style={[styles.plainBackRow, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.plainBackButton}>
            <ChevronLeftIcon size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <ScreenContainer edges={['bottom']}>
          <Skeleton height={28} width="60%" style={styles.skeletonGap} />
          <Skeleton height={18} width="40%" style={styles.skeletonGap} />
          <Skeleton height={140} radius={16} style={styles.skeletonGap} />
        </ScreenContainer>
      </View>
    );
  }

  const company = job?.requestedBy?.company;
  const supervisor = job?.supervisor;
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
      {/* A load failure (job never arrived) has no hero to anchor to - still
          needs its own back button + top clearance, since the native header
          is hidden for this whole screen now. */}
      {!job && !!error && (
        <View style={[styles.plainBackRow, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.plainBackButton}>
            <ChevronLeftIcon size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      )}
      {!job && !!error && <Banner message={error} variant="error" />}

      {job && (
        <>
          <GradientCard color={colors.primary} style={styles.hero}>
            <View style={[styles.heroNavRow, { paddingTop: insets.top + spacing.sm }]}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.heroIconButton}>
                <ChevronLeftIcon size={20} color={colors.textOnPrimary} />
              </Pressable>
              <Text style={styles.heroNavTitle}>Job Details</Text>
              {/* Invisible - exists only to balance the back button so the
                  title above stays visually centered, not a second action. */}
              <View style={styles.heroIconSpacer} />
            </View>

            <View style={styles.heroStatusRow}>
              <StatusBadge status={job.display_status || job.status} />
            </View>

            <View style={styles.heroIconBadge}>
              <BriefcaseIcon size={22} color={colors.primary} />
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {job.title}
            </Text>
            {!!company?.name && (
              <Text style={styles.heroSubtitle} numberOfLines={1}>
                {company.name}
              </Text>
            )}
            <Text style={styles.heroCode}>Job ID: {job.code}</Text>
          </GradientCard>

          <Card style={styles.factsCard}>
            <View style={styles.factsRow}>
              <FactItem
                icon={<CalendarIcon size={16} color={colors.primary} />}
                value={formatDate(job.start_date)}
                label="Start date"
              />
              <View style={styles.factsDivider} />
              <FactItem
                icon={<CalendarIcon size={16} color={colors.primary} />}
                value={formatDate(job.dueDate)}
                label="Due date"
              />
              <View style={styles.factsDivider} />
              <FactItem icon={<TagIcon size={16} color={colors.primary} />} value={job.service_type} label="Category" />
            </View>
          </Card>

          {/* Below the hero/facts, not above them - with the native header
              hidden for this screen's full-bleed gradient, a banner at the
              very top of the content would render right under the status
              bar instead of somewhere the technician is actually looking. */}
          {!!error && <Banner message={error} variant="error" />}
          {!!feedback && <Banner message={feedback.message} variant={feedback.variant} />}

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

          {(company?.site || company?.address || company?.name) && (
            <Section
              title="Location"
              titleIcon={<PinIcon size={15} color={colors.textMuted} />}
              iconAction={
                company?.latitude != null && company?.longitude != null
                  ? {
                      icon: <ExternalLinkIcon size={15} color={colors.primary} />,
                      onPress: () =>
                        Linking.openURL(
                          `https://www.google.com/maps/search/?api=1&query=${company.latitude},${company.longitude}`,
                        ),
                    }
                  : undefined
              }
            >
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

          {!!supervisor && (
            <Section title="Supervisor" titleIcon={<PersonIcon size={15} color={colors.textMuted} />}>
              <PersonRow
                name={supervisor.name}
                accentColor={colors.crestBlue}
                trailing={
                  supervisor.phone ? (
                    <Pressable
                      onPress={() => Linking.openURL(`tel:${supervisor.phone}`)}
                      style={styles.callButton}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${supervisor.name}`}
                    >
                      <PhoneIcon size={16} color={colors.primary} />
                    </Pressable>
                  ) : undefined
                }
              />
            </Section>
          )}

          <Section
            title="Assigned team"
            titleIcon={<UsersIcon size={15} color={colors.textMuted} />}
            action={
              canReassign
                ? { label: 'Change', onPress: () => setReassignVisible(true) }
                : undefined
            }
          >
            {job.team.length > 0 ? (
              job.team.map((member) => (
                <PersonRow key={member.id} name={member.name} accentColor={colors.success} />
              ))
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
                  locationPhase={visitActionId === visit.id ? locationPhase : null}
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
        locationPhase={visitActionId === primaryVisit.id ? locationPhase : null}
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
  /** Set only while *this* visit's Start Visit is in flight - narrates what's actually happening instead of a bare spinner. */
  locationPhase: 'locating' | 'verifying' | null;
  onStart: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReschedule: () => void;
  onChangeTechnicians: () => void;
  onCancel: () => void;
}

const TERMINAL_VISIT_STATUSES: VisitStatus[] = ['COMPLETED', 'CANCELED'];

const LOCATION_PHASE_LABEL: Record<'locating' | 'verifying', string> = {
  locating: 'Checking your location...',
  verifying: "Verifying you're at the site...",
};

/** The one "what Start Visit is doing right now" caption, shared by the inline VisitRow button and the docked TechnicianActionBar. */
function LocationPhaseNote({ phase }: { phase: 'locating' | 'verifying' | null }) {
  if (!phase) return null;
  return (
    <View style={styles.locationPhaseRow}>
      <ClockIcon size={13} color={colors.textMuted} />
      <Text style={styles.locationPhaseText}>{LOCATION_PHASE_LABEL[phase]}</Text>
    </View>
  );
}

function VisitRow({
  visit,
  isTechnician,
  canManage,
  isMine,
  actionLoading,
  anyActionLoading,
  locationPhase,
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
      {showStart && <LocationPhaseNote phase={locationPhase} />}

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
  locationPhase: 'locating' | 'verifying' | null;
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
/** Defined once at module scope, not inline in the render below - an inline arrow function passed as a prop gets a new identity every render, which is exactly what `react/no-unstable-nested-components` flags. */
const renderPlayIcon = (color: string) => <PlayIcon size={16} color={color} />;

function TechnicianActionBar({ visit, loading, locationPhase, onStart, onSubmit }: TechnicianActionBarProps) {
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

  const isSubmit = visit.status === 'IN_PROGRESS';

  return (
    <View style={containerStyle}>
      <ArrowButton
        label={isSubmit ? 'Submit for Approval' : isMissed ? 'Start Anyway' : 'Start Visit'}
        onPress={isSubmit ? onSubmit : onStart}
        loading={loading}
        disabled={loading}
        style={styles.bottomBarButton}
        icon={isSubmit ? undefined : renderPlayIcon}
      />
      {!isSubmit && <LocationPhaseNote phase={locationPhase} />}
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
  titleIcon,
  iconAction,
}: {
  title: string;
  children: React.ReactNode;
  action?: { label: string; onPress: () => void };
  /** Small icon rendered before the title - matches the small utility icons every section now carries (location pin, person, team). */
  titleIcon?: React.ReactNode;
  /** A compact icon-only shortcut on the right (e.g. "open in maps") - distinct from `action`'s text link, and the two are mutually exclusive per section in practice. */
  iconAction?: { icon: React.ReactNode; onPress: () => void };
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionTitleRow}>
          {titleIcon}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {!!action && (
          <Pressable onPress={action.onPress} hitSlop={8}>
            <Text style={styles.sectionAction}>{action.label}</Text>
          </Pressable>
        )}
        {!!iconAction && (
          <Pressable onPress={iconAction.onPress} hitSlop={8} style={styles.iconActionButton} accessibilityRole="button">
            {iconAction.icon}
          </Pressable>
        )}
      </View>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

/** One person (supervisor, team member) as an avatar-initial + name row, with an optional trailing action (e.g. a call button). */
function PersonRow({ name, accentColor = colors.primary, trailing }: { name: string; accentColor?: string; trailing?: React.ReactNode }) {
  return (
    <View style={styles.personRow}>
      <View style={[styles.personAvatar, { backgroundColor: `${accentColor}1A` }]}>
        <Text style={[styles.personAvatarText, { color: accentColor }]}>{initialsFor(name)}</Text>
      </View>
      <Text style={styles.personName} numberOfLines={1}>
        {name}
      </Text>
      {trailing}
    </View>
  );
}

/** One of the hero's quick-facts columns (start date / due date / category). */
function FactItem({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={styles.factItem}>
      <View style={styles.factIconWrap}>{icon}</View>
      <Text style={styles.factValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.factLabel} numberOfLines={1}>
        {label}
      </Text>
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
    // Half-width and centered, not a full-bleed bar - it's a single
    // deliberate action, not a form submit that needs the whole width.
    width: '50%',
    minWidth: 180,
    alignSelf: 'center',
    minHeight: 46,
  },
  locationPhaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  locationPhaseText: {
    ...typography.caption,
    color: colors.textMuted,
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
  plainBackRow: {
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  plainBackButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  hero: {
    // Bleeds past ScreenContainer's own padding to reach the true screen
    // edges (and the very top, behind the status bar) - see the header/hero
    // structural comment above for why this screen hides the native header.
    marginTop: -spacing.lg,
    marginHorizontal: -spacing.lg,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  heroNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroIconButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconSpacer: {
    width: 36,
    height: 36,
  },
  heroNavTitle: {
    ...typography.bodyMedium,
    color: colors.textOnPrimary,
  },
  heroStatusRow: {
    alignItems: 'flex-end',
    marginTop: spacing.md,
  },
  heroIconBadge: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.textOnPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  heroTitle: {
    ...typography.title,
    color: colors.textOnPrimary,
  },
  heroSubtitle: {
    ...typography.body,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  heroCode: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
    marginTop: spacing.xs,
  },
  factsCard: {
    marginTop: -spacing.xxl,
    marginBottom: spacing.lg,
  },
  factsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  factsDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  factItem: {
    flex: 1,
    alignItems: 'center',
  },
  factIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoftBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
  factValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  factLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  personAvatar: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarText: {
    ...typography.captionMedium,
  },
  personName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  callButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoftBg,
    alignItems: 'center',
    justifyContent: 'center',
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  iconActionButton: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoftBg,
    alignItems: 'center',
    justifyContent: 'center',
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
