import { useEffect, useRef, useState } from "react";
import { billingPost, printPdf, qs } from "./billingApi";
import { rupees } from "./format";
import { FiAlertCircle, FiCheck, FiMail, FiMinusCircle, FiPrinter } from "react-icons/fi";
import { Modal, Msg } from "./ui";

// Confirms issuing one or more drafts (final, numbered), shows what was issued and what failed,
// with a success message. Right after issuing, the print window opens by itself with every invoice
// just issued (copies as set in each customer profile), and each one is emailed when the customer has
// "Email invoices automatically" on (done by the server on issue; the result says what happened).
// issuedResult: the caller has already issued (draft editor, nothing to confirm) - the dialog opens
// on the success message and prints.
// `warnings` is given by a caller that has just checked the draft (the draft editor). Without it
// (several drafts from Draft Invoices) every draft is checked here first, so each warning is
// seen before it is confirmed - issuing confirms all of them.

export default function IssueDialog({ drafts, warnings, onClose, onDone, issuedResult = null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(issuedResult);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");
  const [checks, setChecks] = useState(null); // [{ id, customer, warnings, errors }] when checked here
  const total = drafts.reduce((t, d) => t + (Number(d.total) || 0), 0);
  const checkHere = warnings === undefined && !issuedResult;

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

  async function printIssued(issued) {
    if (!issued?.length) return;
    setPrinting(true);
    setPrintError("");
    try {
      await printPdf(`/invoices/download${qs({ ids: issued.map((i) => i.id).join(","), copies: "print" })}`);
    } catch (err) {
      setPrintError(`Issued, but the print could not open (${err.message}). Use Print again.`);
    } finally {
      setPrinting(false);
    }
  }

  async function issue() {
    setBusy(true);
    setError("");
    try {
      const r = await billingPost("/invoices/issue", { ids: drafts.map((d) => d.id), confirm_warnings: true });
      setResult(r);
      onDone?.(r);
      // Print straight away (no separate Print click); the email went out on issue.
      await printIssued(r.issued);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Already issued by the caller: print once on opening.
  const printedOnce = useRef(false);
  useEffect(() => {
    if (!issuedResult || printedOnce.current) return;
    printedOnce.current = true;
    printIssued(issuedResult.issued);
  }, [issuedResult]);

  const ok = result?.issued || [];
  const emailLine = (e) => {
    if (!e) return null;
    if (e.status === "SENT") return { cls: "ok", icon: <FiMail />, text: `Email sent to ${e.to.join(", ")}` };
    if (e.status === "FAILED") return { cls: "err", icon: <FiAlertCircle />, text: "Email could not be sent - use Email on the invoice to try again" };
    if (e.status === "OFF") return { cls: "", icon: <FiMinusCircle />, text: "Not emailed - automatic email is off for this customer" };
    return { cls: "", icon: <FiMinusCircle />, text: "Not emailed - no invoice email saved for this customer" };
  };

  return (
    <Modal onClose={busy ? undefined : onClose} narrow label="Issue invoices">
      <div className="bl-m-head">
        <div>
          <h3>{result ? (ok.length ? (ok.length === 1 ? `Invoice ${ok[0].invoice_number} issued` : `${ok.length} invoices issued`) : "Not issued") : `Issue ${drafts.length} invoice${drafts.length === 1 ? "" : "s"}?`}</h3>
          {!result && <div className="ac-sub">Total {rupees(total)}. Issued invoices get the next number and cannot be edited.</div>}
        </div>
        <button type="button" className="bl-x" onClick={onClose} aria-label="Close" disabled={busy}>✕</button>
      </div>
      <div className="bl-m-body">
        <Msg error={error || printError} />
        {ok.length > 0 && (
          <div className="is-ok">
            <span className="is-ok-mark"><FiCheck /></span>
            <div>
              <b>{ok.length === 1 ? "Issued successfully" : `${ok.length} invoices issued successfully`}</b>
              <span><FiPrinter aria-hidden="true" /> {printing ? "Opening the print window…" : printError ? "Print did not open - use Print again" : `Print window opened (${ok.length === 1 ? `${ok[0].print_copies || 1} cop${(ok[0].print_copies || 1) === 1 ? "y" : "ies"}` : `${ok.length} invoices`})`}</span>
            </div>
          </div>
        )}
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
            {result.issued.map((i) => {
              const e = emailLine(i.email);
              return (
                <div key={i.id} className="is-row">
                  <div className="is-row-top">
                    <b>{i.invoice_number}</b>
                    <span className="ac-sub">{i.customer}</span>
                    <b className="is-amt">{rupees(i.total)}</b>
                  </div>
                  {i.advance_adjusted ? <div className="ac-sub">{rupees(i.advance_adjusted)} adjusted from the advance</div> : null}
                  {e && <div className={`is-mail ${e.cls}`}>{e.icon}<span>{e.text}</span></div>}
                </div>
              );
            })}
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
            <>
              {result.issued.length > 0 && <button type="button" className="ac-btn" onClick={() => printIssued(result.issued)} disabled={printing}>{printing ? "Opening print…" : "Print again"}</button>}
              <button type="button" className="ac-btn ac-btn-primary" onClick={onClose}>Done</button>
            </>
          ) : (
            <>
              <button type="button" className="ac-btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="ac-btn green" onClick={issue} disabled={busy || checking || (checkHere && checks && withErrors.length === checks.length)}>
                {busy ? (printing ? "Opening print…" : "Issuing…") : checking ? "Checking…" : withWarnings.length ? "Confirm and issue" : "Issue"}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
