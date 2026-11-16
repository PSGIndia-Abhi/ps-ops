import { useState } from "react";
import { billingPost } from "./billingApi";
import { rupees } from "./format";
import ShareDialog from "./ShareDialog";
import { Modal, Msg } from "./ui";

// Confirms issuing one or more drafts (final, numbered), shows what was issued and what failed,
// and opens Share and Print for an issued invoice.

export default function IssueDialog({ drafts, warnings = [], onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [shareId, setShareId] = useState(null);
  const total = drafts.reduce((t, d) => t + (Number(d.total) || 0), 0);

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
        {!result && warnings.length > 0 && (
          <div>
            <div className="bl-m-sec">Please confirm</div>
            {warnings.map((w) => <div key={w} className="bl-chk"><span className="bl-dot a" /><span>{w}</span></div>)}
          </div>
        )}
        {result && (
          <>
            {result.issued.map((i) => (
              <div key={i.id} className="bl-chk" style={{ alignItems: "center" }}>
                <span className="bl-dot" style={{ marginTop: 0 }} />
                <span style={{ flex: 1 }}><b>{i.invoice_number}</b> · {i.customer} · {rupees(i.total)}{i.advance_adjusted ? ` (${rupees(i.advance_adjusted)} from advance)` : ""}</span>
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
              <button type="button" className="ac-btn green" onClick={issue} disabled={busy}>{busy ? "Issuing…" : "Issue"}</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
