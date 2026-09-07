/**
 * Mirrors GET /api/bookings (backend/src/routes/bookings.routes.js).
 */

export interface BookingJob {
  id: string;
  code: string;
  sub_service: string;
  status: string;
  is_archived: boolean;
  start_date: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  company_id: string | null;
  company_name: string | null;
}

export interface Booking {
  id: string;
  code: string;
  contact_id: string | null;
  created_at: string;
  service_type: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  company_id: string | null;
  company_name: string | null;
  company_code: string | null;
  company_type: string | null;
  company_site: string | null;
  jobs: BookingJob[];
}

/**
 * POST /api/bookings request body - verified against the actual controller
 * (backend/src/controllers/bookings.controller.js createBooking) and
 * cross-checked against the real, working web form
 * (frontend/src/components/CreateBookingModal.jsx).
 *
 * This mobile flow deliberately sends a single start/end date for the whole
 * booking rather than a per-service `serviceSchedules` map - the controller
 * falls back to exactly that when `serviceSchedules` is omitted, so this is
 * a real supported path, not an invented shortcut. Recurrence is
 * intentionally not sent (see the Phase 5 report) - the backend's
 * recurrence rules are considerably more complex than this phase scopes.
 */
export interface CreateBookingInput {
  contact_id: string;
  serviceType: 'PEST' | 'DEEP' | 'BOTH';
  subServices: string[];
  start_date: string;
  end_date?: string | null;
  location?: string;
  notes?: string;
  supervisor_id?: string | number | null;
  technician_ids?: Array<string | number>;
}

export interface CreateBookingResultJob {
  id: string;
  code: string;
  booking_id: string;
  service_type: string;
  sub_service: string;
  status: string;
  supervisor_id: string | number | null;
  team: unknown[];
  branch_id: string;
  start_date: string | null;
  dueDate: string | null;
  address: string | null;
}

export interface CreateBookingResult {
  success: boolean;
  jobs: CreateBookingResultJob[];
}
