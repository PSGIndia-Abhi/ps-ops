import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BRIGADE_ROLE, brigadeRequest, formatDate, formatInr, statusLabel } from "./brigadeShared";
import "./brigade.css";

// Brigade details on the job page. Renders nothing for jobs that are not
// Brigade bookings. The Brigade Executive gets the flat card (every service of
// the flat + PO billing); every other role keeps the booking details card.
export default function BrigadeJobInfo({ jobId }) {
  if (localStorage.getItem("role") === BRIGADE_ROLE) return <BrigadeFlatCard jobId={jobId} />;
  return <BrigadeBookingCard jobId={jobId} />;
}

function BrigadeBookingCard({ jobId }) {
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
        Technician must upload at least {info.min_visit_photos} before and {info.min_visit_photos} after
        {info.min_visit_photos === 1 ? " photo" : " photos"} in the app.
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

const STATE_LABEL = { completed: "Done", booked: "Booked", none: "Not booked" };

// Brigade Executive: the job's flat — property, flat, BHK, this service's
// price, every service of the flat with its state, and the PO billing figures.
function BrigadeFlatCard({ jobId }) {
  const navigate = useNavigate();
  const [card, setCard] = useState(null);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    Promise.all([
      brigadeRequest(`/api/brigade/jobs/${jobId}/flat`),
      brigadeRequest(`/api/brigade/jobs/${jobId}`).catch(() => null),
    ])
      .then(([flat, details]) => {
        if (cancelled) return;
        setCard(flat?.is_brigade ? flat : null);
        setInfo(details?.is_brigade ? details : null);
      })
      .catch(() => {
        if (!cancelled) setCard(null);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (!card) return null;

  const property = card.site_name && card.site_name !== card.property ? `${card.property} – ${card.site_name}` : card.property;
  const done = card.services.filter((s) => s.state === "completed").length;
  const booked = card.services.filter((s) => s.state === "booked").length;
  const billing = card.billing;

  return (
    <section className="bgf-card" aria-label="Flat details">
      <header className="bgf-card-head">
        <div>
          <span className="bgb-eyebrow">Brigade flat</span>
          <div className="bgf-card-title">
            <strong>Flat {card.flat_number}</strong>
            <span className="bgf-bhk">{card.bhk}</span>
          </div>
          <div className="bgb-sub">{property}</div>
        </div>
        <dl className="bgf-card-facts">
          <div><dt>This service</dt><dd>{info ? formatInr(info.price) : "—"}</dd></div>
          <div><dt>Services done</dt><dd>{done}</dd></div>
          <div><dt>Booked</dt><dd>{booked}</dd></div>
        </dl>
      </header>

      <div className="bgf-card-body">
        <table className="bgb-ledger">
          <thead>
            <tr>
              <th>Service</th>
              <th>State</th>
              <th>Job</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {card.services.map((s) => {
              const current = s.job?.id === jobId;
              return (
                <tr key={s.sub_service} className={current ? "bgf-current" : undefined}>
                  <td>
                    <span className="bgb-strong">{s.sub_service}</span>
                    {current && <span className="bgf-this">This job</span>}
                  </td>
                  <td><span className={`bgf-state ${s.state}`}>{STATE_LABEL[s.state]}</span></td>
                  <td>
                    {s.job ? (
                      current ? (
                        <span className="bgb-sub-inline">{s.job.code} · {statusLabel(s.job.status)}</span>
                      ) : (
                        <button type="button" className="bgb-code" onClick={() => navigate(`/brigade/jobs/${s.job.id}`)}>
                          {s.job.code}
                        </button>
                      )
                    ) : (
                      "—"
                    )}
                    {s.state === "booked" && s.last_completed && (
                      <div className="bgb-sub">Last done {formatDate(s.last_completed.date)}</div>
                    )}
                  </td>
                  <td className="bgb-nowrap">{s.job?.date ? formatDate(s.job.date) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="bgf-card-foot">
        {billing ? (
          <>
            <span>
              PO <strong>{billing.po_number}</strong>
            </span>
            <span>This service billed <strong>{formatInr(billing.amount)}</strong></span>
            <span>PO amount <strong>{formatInr(billing.po_amount)}</strong></span>
            <span>
              PO balance{" "}
              <strong className={billing.po_balance !== null && billing.po_balance < 0 ? "bgb-neg" : undefined}>
                {formatInr(billing.po_balance)}
              </strong>
            </span>
            <button type="button" className="bgb-btn-outline" onClick={() => navigate(`/brigade/billing?po=${encodeURIComponent(billing.po_number)}`)}>
              Open PO
            </button>
          </>
        ) : (
          <span className="bgb-muted">Not on any PO yet — add it from Billing.</span>
        )}
        {info && <span className="bgf-photo-rule">Technician uploads at least {info.min_visit_photos} before and after photo{info.min_visit_photos === 1 ? "" : "s"}.</span>}
      </footer>
    </section>
  );
}
