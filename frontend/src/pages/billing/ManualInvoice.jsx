import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  FiCheck, FiCheckCircle, FiChevronDown, FiFileText, FiLock, FiMinus, FiPlus, FiPrinter, FiMail, FiSearch, FiX, FiZap,
} from "react-icons/fi";
import { billingPost, printPdf, qs, useBilling } from "./billingApi";
import { amountInWords, gstRateOf, lineAmount, totalsFor } from "./calc";
import { CATEGORY_LABEL, amount, dmy, initials, monthLabel, rupees, thisMonth, today, typeLabel } from "./format";
import { emailInvoice } from "./emailInvoice";
import { Field, Msg } from "./ui";

// Generate Invoice (manual): an extra, one-off bill for a customer, outside the monthly Bill Run.
//   1. pick the customer (only customers with an active contract)
//   2. tick the services - the rate comes from the contract and cannot be changed - and set the quantity
//   3. Generate & print: issued at once with the next number, and the print window opens.
// No draft and no separate check step. The contract's Bill Run period does not move, so the regular
// monthly bill still comes. The Service Coordinator's SOS count for the month is shown for reference.

const defaultDescription = (date) => `Pest control service carried out on ${dmy(date)}`;
const nameOf = (c) => (c.billing_group || c.customer || "").trim();

/** Searchable customer box: type to filter, arrows + Enter to pick, Esc to close. */
function CustomerPicker({ contracts, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const selected = contracts?.find((c) => c.id === value) || null;

  const rows = useMemo(() => {
    const all = contracts || [];
    const t = q.trim().toLowerCase();
    return t ? all.filter((c) => `${nameOf(c)} ${c.contract_code}`.toLowerCase().includes(t)) : all;
  }, [contracts, q]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  function pick(c) {
    onChange(c.id);
    setQ("");
    setOpen(false);
  }
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && open && rows[hi]) { e.preventDefault(); pick(rows[hi]); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className={`mi-picker ${open ? "open" : ""}`} ref={boxRef}>
      <div className="mi-picker-box" onClick={() => setOpen(true)}>
        <FiSearch className="mi-picker-ic" aria-hidden="true" />
        <input
          className="mi-picker-input"
          value={open ? q : selected ? nameOf(selected) : ""}
          placeholder={contracts ? (selected ? nameOf(selected) : `Search ${contracts.length} customers by name or contract code…`) : "Loading customers…"}
          onFocus={() => { setOpen(true); setHi(0); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={open}
          aria-controls="mi-picker-list"
          aria-label="Customer"
        />
        {selected && !open && <span className="mi-picker-code">{selected.contract_code}</span>}
        {selected ? (
          <button type="button" className="mi-picker-clear" aria-label="Clear customer" onClick={(e) => { e.stopPropagation(); onChange(""); setQ(""); }}><FiX /></button>
        ) : (
          <FiChevronDown className="mi-picker-chev" aria-hidden="true" />
        )}
      </div>
      {open && (
        <ul className="mi-picker-list" id="mi-picker-list" role="listbox" ref={listRef}>
          {!rows.length && <li className="mi-picker-empty">No customer with an active contract matches “{q}”.</li>}
          {rows.map((c, i) => (
            <li key={c.id} data-i={i} role="option" aria-selected={c.id === value}
              className={`${i === hi ? "hi" : ""} ${c.id === value ? "on" : ""}`}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(c); }}>
              <span className="mi-av">{initials(nameOf(c))}</span>
              <span className="mi-picker-txt">
                <b>{nameOf(c)}</b>
                <small>{typeLabel(c.billing_type, c.frequency_months, c.frequency_unit)}{c.contract_kind === "GROUP" ? " · Group" : ""}</small>
              </span>
              <span className="mi-picker-code">{c.contract_code}</span>
              {c.id === value && <FiCheck className="mi-picker-tick" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** − qty + : whole steps from the buttons, any number typed. */
function QtyStepper({ value, onChange, label }) {
  const n = Number(value) || 0;
  return (
    <div className={`mi-qty ${n > 0 ? "on" : ""}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={`Less ${label}`} disabled={n <= 0} onClick={() => onChange(String(Math.max(0, Math.ceil(n) - 1)))}><FiMinus /></button>
      <input type="number" min="0" step="any" inputMode="decimal" value={value} placeholder="0" aria-label={`Quantity for ${label}`}
        onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.target.select()} />
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(String(Math.floor(n) + 1))}><FiPlus /></button>
    </div>
  );
}

export default function ManualInvoice() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const allowed = me.can("GENERATE_INVOICE") && me.can("ISSUE_INVOICE");
  const { data: contractData, error: listError } = useBilling(allowed ? "/contracts?status=ACTIVE" : null);
  const contracts = useMemo(() => {
    const rows = Array.isArray(contractData) ? contractData : contractData?.rows;
    return rows ? rows.filter((c) => c.status === "ACTIVE").sort((a, b) => nameOf(a).localeCompare(nameOf(b))) : null;
  }, [contractData]);
  const [contractId, setContractId] = useState("");
  const { data: contract, error: contractError, loading: contractLoading } = useBilling(contractId ? `/contracts/${contractId}` : null);
  const companyId = contract?.company_id;
  const month = thisMonth();
  const { data: sos } = useBilling(companyId && contract?.contract_kind !== "GROUP" ? `/sos/${encodeURIComponent(companyId)}${qs({ month })}` : null);

  const [qty, setQty] = useState({}); // contract_line_id -> quantity (string); a line is ticked while it is here
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [description, setDescription] = useState(null); // null = the suggested wording
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({});
  const [done, setDone] = useState(null); // the issued invoice
  const [printNote, setPrintNote] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [emailNote, setEmailNote] = useState({});

  // Lines in force on the invoice date (the server checks again).
  const lines = useMemo(() => (contract?.lines || []).filter((l) => !l.effective_from || l.effective_from <= invoiceDate), [contract, invoiceDate]);
  const sosOf = (lineId) => (sos?.lines || []).find((x) => x.contract_line_id === lineId && !x.is_extra);
  const chosen = lines.filter((l) => qty[l.id] !== undefined).map((l) => ({ ...l, quantity: Number(qty[l.id]) || 0, adjustment_type: "NONE" }));
  const residential = contract?.category === "RESIDENTIAL";
  const gstOn = Boolean(contract) && !residential && contract.gst_applicable !== false;
  const gstRate = gstRateOf(contract?.gst_rate);
  const totals = totalsFor(chosen, gstOn ? "CGST_SGST" : "NONE", gstRate);
  const text = (description ?? defaultDescription(invoiceDate)).trim();

  function chooseContract(id) {
    setContractId(id);
    setQty({});
    setDescription(null);
    setMsg({});
  }
  const firstQty = (l) => String(l.default_qty && l.pricing_basis !== "FIXED" ? l.default_qty : 1);
  function toggle(l) {
    setQty((p) => {
      const next = { ...p };
      if (next[l.id] !== undefined) delete next[l.id];
      else next[l.id] = firstQty(l);
      return next;
    });
  }
  // The stepper ticks the line when it goes above 0 and unticks it at 0.
  function setLineQty(l, v) {
    setQty((p) => {
      const next = { ...p };
      if (v === "" || Number(v) > 0) next[l.id] = v;
      else delete next[l.id];
      return next;
    });
  }

  function problem() {
    if (!contract) return "Choose the customer.";
    if (!chosen.length) return "Tick at least one service.";
    const noQty = chosen.find((l) => !(l.quantity > 0));
    if (noQty) return `Enter the quantity for ${noQty.item_name}.`;
    if (!invoiceDate) return "Choose the invoice date.";
    if (invoiceDate > today()) return "The invoice date cannot be in the future.";
    if (!text) return "Type the description.";
    if (totals.total <= 0) return "The invoice total must be more than zero.";
    return "";
  }

  async function generate() {
    const p = problem();
    if (p) { setMsg({ error: p }); return; }
    setBusy(true);
    setMsg({});
    try {
      const r = await billingPost("/invoices/manual", {
        contract_id: contract.id,
        invoice_date: invoiceDate,
        description: text,
        lines: chosen.map((l) => ({ contract_line_id: l.id, quantity: l.quantity })),
      });
      const issued = r.issued[0];
      setDone(issued);
      await print(issued);
    } catch (err) {
      setMsg({ error: err.message, errors: err.errors });
    } finally {
      setBusy(false);
    }
  }

  async function print(issued) {
    if (Number(issued.print_copies) === 0) {
      setPrintNote("Not printed - print copies are set to 0 for this customer. Use Print on the invoice to print one.");
      return;
    }
    setPrintNote("Opening the print window…");
    try {
      await printPdf(`/invoices/download${qs({ ids: issued.id, copies: "print" })}`);
      setPrintNote(`The print window opened (${issued.print_copies} cop${issued.print_copies === 1 ? "y" : "ies"}).`);
    } catch (err) {
      setPrintNote(`Issued, but the print could not open (${err.message}). Use Print again.`);
    }
  }

  function another() {
    setDone(null);
    setPrintNote("");
    setEmailNote({});
    setQty({});
    setDescription(null);
    setContractId("");
    setInvoiceDate(today());
  }

  if (!allowed) return <Msg error="You need both Generate invoice and Issue invoice permissions to generate an invoice." />;

  if (done) {
    return (
      <div className="ac-page">
        <div className="ac-card mi-done">
          <div className="mi-done-mark"><FiCheck /></div>
          <h2>Invoice {done.invoice_number} issued</h2>
          <p className="ac-sub">{done.customer} · {rupees(done.total)}</p>
          <p className="mi-done-note"><FiPrinter aria-hidden="true" /> {printNote}{done.email?.status === "SENT" ? ` · Email sent to ${done.email.to.join(", ")}.` : ""}</p>
          <Msg {...emailNote} />
          <div className="mi-done-actions">
            <button type="button" className="ac-btn" onClick={() => print(done)}><FiPrinter /> Print again</button>
            <button type="button" className="ac-btn" disabled={emailing} onClick={async () => {
              setEmailing(true);
              setEmailNote({});
              try { setEmailNote({ ok: await emailInvoice(done.id) }); } catch (err) { setEmailNote({ error: err.message }); } finally { setEmailing(false); }
            }}><FiMail /> {emailing ? "Sending…" : "Email"}</button>
            <button type="button" className="ac-btn" onClick={() => navigate(`/billing/invoices/${done.id}`)}><FiFileText /> View invoice</button>
            <button type="button" className="ac-btn ac-btn-primary" onClick={another}><FiZap /> Generate another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ac-page mi-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Generate Invoice</h1>
          <p className="ac-sub">Issued and printed as soon as you press Generate - check the services and quantities first.</p>
        </div>
      </div>
      <Msg error={listError || contractError} />

      <div className="mi-grid">
        <div className="bl-stack">
          {/* 1. Customer */}
          <section className="ac-card mi-card">
            <div className="mi-step"><span>1</span> Customer</div>
            <CustomerPicker contracts={contracts} value={contractId} onChange={chooseContract} />
            {contract && (
              <div className="mi-cust">
                <span className="mi-av lg">{initials(nameOf(contract))}</span>
                <div className="mi-cust-txt">
                  <b>{nameOf(contract)}</b>
                  <div className="mi-tags">
                    <span>{contract.contract_code}</span>
                    <span>{typeLabel(contract.billing_type, contract.frequency_months, contract.frequency_unit)}</span>
                    <span className={residential ? "purple" : "teal"}>{CATEGORY_LABEL[contract.category] || "—"} · {gstOn ? `${gstRate}% GST` : "No GST"}</span>
                    {contract.po_required && <span className="amber">PO attached automatically</span>}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 2. Services */}
          <section className="ac-card mi-card">
            <div className="mi-step"><span>2</span> Services <small className="mi-lock"><FiLock aria-hidden="true" /> Rates from the contract</small></div>
            {!contractId ? (
              <div className="mi-empty"><FiSearch aria-hidden="true" /><span>Choose the customer to see the services on its contract.</span></div>
            ) : contractLoading && !contract ? (
              <div>{[0, 1, 2].map((i) => <div key={i} className="mi-skel-row" />)}</div>
            ) : !lines.length ? (
              <div className="mi-empty"><span>This contract has no services in force. Add them on the contract first.</span></div>
            ) : (
              <>
                <div className="mi-head-row" aria-hidden="true"><span>Service</span><span>Rate</span><span>Quantity</span><span>Amount</span></div>
                <div className="mi-lines">
                  {lines.map((l) => {
                    const on = qty[l.id] !== undefined;
                    const s = sosOf(l.id);
                    const n = Number(qty[l.id]) || 0;
                    return (
                      <div key={l.id} className={`mi-line ${on ? "on" : ""}`} onClick={() => toggle(l)} role="checkbox" aria-checked={on} tabIndex={0}
                        onKeyDown={(e) => { if (e.key === " " && e.target === e.currentTarget) { e.preventDefault(); toggle(l); } }}>
                        <div className="mi-line-main">
                          <span className={`mi-check ${on ? "on" : ""}`} aria-hidden="true">{on && <FiCheck />}</span>
                          <span className="mi-line-txt">
                            <b>{l.item_name}</b>
                            <small>{[l.site || (l.company_id ? null : "All outlets"), l.sac_code && `SAC ${l.sac_code}`].filter(Boolean).join(" · ")}</small>
                            {s && <em className="mi-sos">SOS {monthLabel(month)}: {s.completed ?? "—"} of {s.assigned} done</em>}
                          </span>
                        </div>
                        <div className="mi-line-rate"><b>₹{amount(l.rate)}</b><small>per {l.unit || "nos"}</small></div>
                        <div className="mi-line-qty"><QtyStepper value={on ? qty[l.id] : ""} label={l.item_name} onChange={(v) => setLineQty(l, v)} /></div>
                        <div className={`mi-line-amt ${on ? "on" : ""}`}>{on ? `₹${amount(lineAmount({ rate: l.rate, quantity: n, adjustment_type: "NONE" }))}` : "—"}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>

        {/* 3. Invoice summary */}
        <aside className="ac-card mi-side">
          <div className="mi-step"><span>3</span> Invoice</div>
          <Field label="Invoice date" required>
            <input type="date" className="ac-input" value={invoiceDate} max={today()} onChange={(e) => setInvoiceDate(e.target.value)} />
          </Field>
          <Field label="Description on invoice" required>
            <textarea className="ac-textarea" rows={2} maxLength={1000} value={description ?? defaultDescription(invoiceDate)} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <div className="mi-sum">
            {chosen.length ? (
              <ul className="mi-sum-lines">
                {chosen.map((l) => (
                  <li key={l.id}><span>{l.item_name}<small> × {l.quantity || 0}</small></span><b>{amount(lineAmount(l))}</b></li>
                ))}
              </ul>
            ) : (
              <p className="mi-sum-none">No services ticked yet</p>
            )}
            <div className="mi-sum-row"><span>Sub total</span><b>{amount(totals.subtotal)}</b></div>
            {gstOn && <div className="mi-sum-row"><span>GST {gstRate}%</span><b>{amount(totals.cgst + totals.sgst)}</b></div>}
            {Math.abs(totals.round_off) > 0.001 && <div className="mi-sum-row"><span>Round off</span><b>{amount(totals.round_off)}</b></div>}
            <div className="mi-sum-total"><span>Total</span><b>{rupees(totals.total)}</b></div>
            {totals.total > 0 && <div className="mi-sum-words">{amountInWords(totals.total)}</div>}
          </div>

          <Msg {...msg} />
          <button type="button" className="mi-go" disabled={busy || !chosen.length} onClick={generate}>
            {busy ? "Generating…" : <><FiCheckCircle /> Generate &amp; print</>}
          </button>
          <p className="mi-foot">Issued straight away with the next invoice number. The monthly bill for this customer still comes as usual.</p>
        </aside>
      </div>
    </div>
  );
}
