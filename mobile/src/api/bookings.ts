import { httpClient } from './httpClient';
import type { Booking, CreateBookingInput, CreateBookingResult } from '../types/booking';

/** GET /api/bookings - requires VIEW_BOOKING. Scoped server-side by role. */
export async function listBookings(): Promise<Booking[]> {
  const { data } = await httpClient.get<Booking[]>('/api/bookings');
  return data;
}

/**
 * POST /api/bookings - requires CREATE_BOOKING. Creates one job (+ its
 * first visit) per entry in `subServices` - see CreateBookingInput's doc
 * comment for exactly what this mobile flow does and doesn't send.
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const { data } = await httpClient.post<CreateBookingResult>('/api/bookings', input);
  return data;
}

/**
 * POST /api/bookings/:bookingId/generate-jobs - requires CREATE_JOB. Only
 * succeeds if the booking has a recurring_rules row (i.e. was created with
 * recurrence) - since this mobile app doesn't create recurring bookings yet,
 * this is only reachable for bookings created via the web app's recurrence
 * flow.
 */
export async function generateBookingJobs(
  bookingId: string,
  days = 30,
): Promise<{ success: boolean; created: number; window_start: string; window_end: string }> {
  const { data } = await httpClient.post(`/api/bookings/${bookingId}/generate-jobs`, { days });
  return data;
}
