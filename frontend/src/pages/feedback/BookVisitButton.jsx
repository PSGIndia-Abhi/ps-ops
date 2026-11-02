import { useEffect, useState } from "react";
import { FiCalendar } from "react-icons/fi";
import { apiFetch } from "../../api";
import CreateBookingModal from "../../components/CreateBookingModal";

// "Book a visit" (Feedback Desk header, and a ticket's re-visit): opens the same Create Booking form
// as the admin panel and saves through POST /api/bookings. The backend needs CREATE_BOOKING (bookings)
// and VIEW_USER (the supervisor / technician lists) for the user's role. contactId / services fill
// the form in, siteId limits the contacts to that site; onBooked(jobs) gets the jobs created.
async function usersByRole(role) {
  const res = await apiFetch(`/api/users?role=${role}`);
  if (!res?.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export default function BookVisitButton({ onBooked, contactId, siteId, services, label = "Book a visit", className = "fb-btn fb-btn-primary fb-book-btn", disabled = false }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState({ supervisors: [], technicians: [] });

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    Promise.all([usersByRole("supervisor"), usersByRole("technician")])
      .then(([supervisors, technicians]) => live && setPeople({ supervisors, technicians }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);

  async function createBooking(form) {
    const res = await apiFetch("/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        client: { contact_id: form.contact_id, serviceType: form.serviceType },
        subServices: form.subServices,
        address: form.location || null,
        start_date: form.start_date,
        end_date: form.end_date,
        notes: form.notes,
        recurrence: form.recurrence || null,
        serviceSchedules: form.serviceSchedules,
        supervisor_id: form.supervisor_id ?? null,
        technician_ids: form.technician_ids ?? [],
      }),
    });
    if (!res.ok) {
      let message = "Create booking failed";
      try {
        const data = await res.clone().json();
        message = data.error || message;
      } catch {
        // not JSON
      }
      if (res.status === 403) message = "Your role can't create bookings. Ask an admin to give it \"Create booking\" and \"View users\" in Roles & Permissions.";
      // The form shows this in its error popup.
      throw new Error(message);
    }
    const data = await res.json();
    onBooked?.(data.jobs || []);
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} disabled={disabled}>
        <FiCalendar aria-hidden="true" /> {label}
      </button>
      {open && (
        <CreateBookingModal
          isOpen
          onClose={() => setOpen(false)}
          onCreate={createBooking}
          supervisors={people.supervisors}
          technicians={people.technicians}
          initialContactId={contactId}
          initialSubServices={services}
          siteId={siteId}
        />
      )}
    </>
  );
}
