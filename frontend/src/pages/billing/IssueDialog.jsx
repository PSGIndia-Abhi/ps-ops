import { useEffect, useState } from "react";
import { billingPost } from "./billingApi";
import { rupees } from "./format";
import ShareDialog from "./ShareDialog";
import { Modal, Msg } from "./ui";

// Confirms issuing one or more drafts (final, numbered), shows what was issued and what failed,
// and opens Share and Print for an issued invoice.
// `warnings` is given by a caller that has just checked the draft (the draft editor). Without it
// (several drafts from Draft Invoices) every draft is checked here first, so each warning is
// seen before it is confirmed - issuing confirms all of them.

export default function IssueDialog({ drafts, warnings, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [shareId, setShareId] = useState(null);
  const [checks, setChecks] = useState(null); // [{ id, customer, warnings, errors }] when checked here
  const total = drafts.reduce((t, d) => t + (Number(d.total) || 0), 0);
  const checkHere = warnings === undefined;

  useEffect(() => {
    if (!checkHere) return undefined;
    let live = true;
    (async () => {
      const out = [];
      try {
        // A few at a time: up to 200 drafts can be issued together.
        for (let i = 0; i < drafts.length; i += 5) {
          const batch = drafts.slice(i, i + 5);
          const done = await Promise.all(batch.map((d) => billingPost(`/invoices/${d.id}/check`, {})
            .then((r) => ({ id: d.id, customer: d.customer, warnings: r.warnings || [], errors: r.errors || [] }))
            .catch((err) => ({ id: d.id, customer: d.customer, warnings: [], errors: [err.message] }))));
          out.push(...done);
        }
        if (live) setChecks(out);
      } catch (err) {
        if (live) setError(err.message);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checking = checkHere && !checks && !error;
  const withWarnings = (checks || []).filter((c) => c.warnings.length);
  const withErrors = (checks || []).filter((c) => c.errors.length);

  async function issue() {
    setBusy(true);
    setError("");
    try {
      const r = await billingPost("/invoices/issue", { ids: drafts.map((d) => d.id), confirm_warnings: true });
      setResult(r);
      onDone?.(r);
      if (r.issued.length === 1 && !r.failed.length) setShareId(r.issued[0].id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (shareId) return <ShareDialog invoiceId={shareId} justIssued onClose={() => (result?.issued.length > 1 ? setShareId(null) : onClose())} />;

  return (
    <Modal onClose={busy ? undefined : onClose} narrow label="Issue invoices">
      <div className="bl-m-head">
        <div>
          <h3>{result ? "Issue result" : `Issue ${drafts.length} invoice${drafts.length === 1 ? "" : "s"}?`}</h3>
          {!result && <div className="ac-sub">Total {rupees(total)}. Issued invoices get the next number and cannot be edited.</div>}
        </div>
        <button type="button" className="bl-x" onClick={onClose} aria-label="Close" disabled={busy}>✕</button>
      </div>
      <div className="bl-m-body">
        <Msg error={error} />
        {!result && !checkHere && warnings.length > 0 && (
          <div>
            <div className="bl-m-sec">Please confirm</div>
            {warnings.map((w) => <div key={w} className="bl-chk"><span className="bl-dot a" /><span>{w}</span></div>)}
          </div>
        )}
        {!result && checking && <div className="ac-sub">Checking {drafts.length} draft{drafts.length === 1 ? "" : "s"}…</div>}
        {!result && withErrors.length > 0 && (
          <div>
            <div className="bl-m-sec">Will not be issued</div>
            {withErrors.map((c) => <div key={c.id} className="bl-chk"><span className="bl-dot r" /><span><b>{c.customer}</b>: {c.errors.join("; ")}</span></div>)}
          </div>
        )}
        {!result && withWarnings.length > 0 && (
          <div>
            <div className="bl-m-sec">Please confirm</div>
            {withWarnings.map((c) => c.warnings.map((w) => (
              <div key={`${c.id}-${w}`} className="bl-chk"><span className="bl-dot a" /><span><b>{c.customer}</b>: {w}</span></div>
            )))}
          </div>
        )}
        {result && (
          <>
            {result.issued.map((i) => (
              <div key={i.id} className="bl-chk" style={{ alignItems: "center" }}>
                <span className="bl-dot" style={{ marginTop: 0 }} />
                <span style={{ flex: 1 }}>
                  <b>{i.invoice_number}</b> · {i.customer} · {rupees(i.total)}{i.advance_adjusted ? ` (${rupees(i.advance_adjusted)} from advance)` : ""}
                  {i.email && (
                    <span className={`bl-tag ${i.email.status === "SENT" ? "ok" : i.email.status === "FAILED" ? "err" : ""}`} style={{ marginLeft: 6 }}>
                      {i.email.status === "SENT" ? `Emailed to ${i.email.to.join(", ")}` : i.email.status === "FAILED" ? "Email failed - share again" : i.email.status === "OFF" ? "Auto-email off for this customer" : "No email in profile"}
                    </span>
                  )}
                </span>
                <button type="button" className="ac-btn sm share" onClick={() => setShareId(i.id)}>Print / Share</button>
              </div>
            ))}
            {result.failed.map((f) => {
              const d = drafts.find((x) => x.id === f.id);
              return (
                <div key={f.id} className="bl-chk">
                  <span className="bl-dot r" />
                  <span><b>{d?.customer || "Draft"}</b> not issued: {f.errors.join("; ")}</span>
                </div>
              );
            })}
          </>
        )}
      </div>
      <div className="bl-m-foot">
        <span />
        <div className="ac-actions">
          {result ? (
            <button type="button" className="ac-btn ac-btn-primary" onClick={onClose}>Done</button>
          ) : (
            <>
              <button type="button" className="ac-btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="ac-btn green" onClick={issue} disabled={busy || checking || (checkHere && checks && withErrors.length === checks.length)}>
                {busy ? "Issuing…" : checking ? "Checking…" : withWarnings.length ? "Confirm and issue" : "Issue"}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
