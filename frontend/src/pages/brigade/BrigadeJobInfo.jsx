import { useEffect, useState } from "react";
import { brigadeRequest, formatDate, formatInr } from "./brigadeShared";
import "./brigade.css";

// Brigade details card on the job page (property, flat, price, client PO).
// Renders nothing for jobs that are not Brigade bookings.
export default function BrigadeJobInfo({ jobId }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    brigadeRequest(`/api/brigade/jobs/${jobId}`)
      .then((data) => {
        if (!cancelled) setInfo(data?.is_brigade ? data : null);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (!info) return null;

  const hasPo = info.client_po_number || info.po_source || info.po_date || info.po_amount !== null;

  return (
    <section className="bg-card" aria-label="Brigade details">
      <h3>Brigade booking</h3>
      <p className="bg-card-sub">
        Technician must upload {info.min_visit_photos} before and {info.min_visit_photos} after photos in the app.
      </p>
      <div className="bg-form-row" style={{ alignItems: "start" }}>
        <Detail label="Property" value={info.site_name && info.site_name !== info.property ? `${info.property} – ${info.site_name}` : info.property} />
        <Detail label="Flat" value={`${info.flat_number} · ${info.bhk}`} />
        <Detail label="Price (excl. GST)" value={formatInr(info.price)} />
        {hasPo && (
          <>
            <Detail label="Client PO" value={info.client_po_number || "—"} />
            <Detail label="PO from" value={info.po_source || "—"} />
            <Detail label="PO date" value={formatDate(info.po_date)} />
            <Detail label="PO amount" value={formatInr(info.po_amount)} />
          </>
        )}
      </div>
    </section>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div className="bg-tile-label">{label}</div>
      <div style={{ marginTop: 4, fontWeight: 600 }}>{value || "—"}</div>
    </div>
  );
}
