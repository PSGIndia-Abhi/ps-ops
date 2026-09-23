import { useEffect, useMemo, useState } from "react";
import { apiFetch, safeJson } from "../api";
import "./PaymentsPage.css";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB");
}

function formatMoney(value) {
  const num = Number(value || 0);
  return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAYMENT_MODES = ["CASH", "UPI", "BANK_TRANSFER", "NEFT", "CHEQUE", "CARD", "OTHER"];

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_id: "",
    payment_date: "",
    received_amount: "",
    payment_mode: "",
    reference_number: "",
    remarks: "",
  });
  const [allocations, setAllocations] = useState([]);

  const [selectedPayment, setSelectedPayment] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  async function loadPayments() {
    try {
      setLoading(true);
      const res = await apiFetch("/api/payments");
      if (!res?.ok) throw new Error((await safeJson(res))?.error || "Failed to load payments");
      const list = await res.json();
      setPayments(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Payments load failed", err);
      setError(err.message || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayments();
    (async () => {
      const [companiesRes, invoicesRes] = await Promise.all([
        apiFetch("/api/companies"),
        apiFetch("/api/invoices"),
      ]);
      if (companiesRes?.ok) setCompanies((await safeJson(companiesRes)) || []);
      if (invoicesRes?.ok) setInvoices((await safeJson(invoicesRes)) || []);
    })();
  }, []);

  const pendingInvoicesForCustomer = useMemo(() => {
    if (!form.customer_id) return [];
    return invoices.filter(
      (inv) => String(inv.customer_id) === String(form.customer_id) && Number(inv.pending_amount) > 0
    );
  }, [invoices, form.customer_id]);

  const allocatedTotal = useMemo(
    () => allocations.reduce((sum, a) => sum + (Number(a.allocated_amount) || 0), 0),
    [allocations]
  );

  function resetForm() {
    setForm({
      customer_id: "",
      payment_date: "",
      received_amount: "",
      payment_mode: "",
      reference_number: "",
      remarks: "",
    });
    setAllocations([]);
    setFormError("");
  }

  function addAllocationRow() {
    setAllocations((prev) => [...prev, { invoice_id: "", allocated_amount: "" }]);
  }

  function updateAllocationRow(index, field, value) {
    setAllocations((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function removeAllocationRow(index) {
    setAllocations((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreatePayment(e) {
    e.preventDefault();
    if (!form.customer_id || !form.payment_date || !form.received_amount || !form.payment_mode) {
      setFormError("Customer, payment date, amount and mode are required.");
      return;
    }
    const cleanAllocations = allocations.filter((a) => a.invoice_id && Number(a.allocated_amount) > 0);
    if (allocatedTotal > Number(form.received_amount)) {
      setFormError("Allocated amount cannot exceed the received amount.");
      return;
    }

    try {
      setSaving(true);
      setFormError("");
      const res = await apiFetch("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          customer_id: form.customer_id,
          payment_date: form.payment_date,
          received_amount: Number(form.received_amount),
          payment_mode: form.payment_mode,
          reference_number: form.reference_number || null,
          remarks: form.remarks || null,
          allocations: cleanAllocations.map((a) => ({
            invoice_id: a.invoice_id,
            allocated_amount: Number(a.allocated_amount),
          })),
        }),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to record payment");

      setIsFormOpen(false);
      resetForm();
      await Promise.all([loadPayments(), apiFetch("/api/invoices").then((r) => r?.ok && r.json()).then((list) => list && setInvoices(list))]);
    } catch (err) {
      setFormError(err.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  async function openPaymentDetail(paymentId) {
    setSelectedPayment({ id: paymentId });
    setDetailLoading(true);
    setDetailError("");
    try {
      const res = await apiFetch(`/api/payments/${paymentId}`);
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to load payment");
      setSelectedPayment(data);
    } catch (err) {
      setDetailError(err.message || "Failed to load payment");
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading) return <div className="payments-page">Loading payments...</div>;
  if (error) return <div className="payments-page">Error: {error}</div>;

  return (
    <div className="payments-page">
      <div className="payments-header">
        <div>
          <h2>Payments</h2>
          <div className="payments-subtitle">{payments.length} total</div>
        </div>
        <button type="button" className="payments-primary-btn" onClick={() => setIsFormOpen(true)}>
          Record Payment
        </button>
      </div>

      <div className="payments-list">
        {payments.length === 0 && <div className="payments-empty">No payments recorded yet.</div>}
        {payments.map((p) => (
          <div key={p.id} className="payment-row" onClick={() => openPaymentDetail(p.id)}>
            <div className="payment-main">
              <div className="payment-number">{p.payment_number}</div>
              <div className="payment-customer">{p.customer_name}</div>
            </div>
            <div className="payment-date">{formatDate(p.payment_date)}</div>
            <div className="payment-mode">{p.payment_mode}</div>
            <div className="payment-amount">₹{formatMoney(p.received_amount)}</div>
          </div>
        ))}
      </div>

      {isFormOpen && (
        <div className="payments-modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="payments-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Record Payment</h3>
            <form onSubmit={handleCreatePayment} className="payments-form">
              <label>
                Customer
                <select
                  value={form.customer_id}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, customer_id: e.target.value }));
                    setAllocations([]);
                  }}
                  required
                >
                  <option value="">Select customer</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.code ? `(${c.code})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="payments-form-row">
                <label>
                  Payment Date
                  <input
                    type="date"
                    value={form.payment_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, payment_date: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Received Amount
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.received_amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, received_amount: e.target.value }))}
                    required
                  />
                </label>
              </div>

              <div className="payments-form-row">
                <label>
                  Payment Mode
                  <select
                    value={form.payment_mode}
                    onChange={(e) => setForm((prev) => ({ ...prev, payment_mode: e.target.value }))}
                    required
                  >
                    <option value="">Select mode</option>
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Reference Number
                  <input
                    type="text"
                    value={form.reference_number}
                    onChange={(e) => setForm((prev) => ({ ...prev, reference_number: e.target.value }))}
                  />
                </label>
              </div>

              <label>
                Remarks
                <textarea
                  value={form.remarks}
                  onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
                  rows={2}
                />
              </label>

              <div className="payments-allocations">
                <div className="payments-allocations-header">
                  <span>Allocate to invoices (optional)</span>
                  <button type="button" onClick={addAllocationRow} disabled={!form.customer_id}>
                    + Add invoice
                  </button>
                </div>
                {allocations.map((row, index) => (
                  <div key={index} className="payments-allocation-row">
                    <select
                      value={row.invoice_id}
                      onChange={(e) => updateAllocationRow(index, "invoice_id", e.target.value)}
                    >
                      <option value="">Select invoice</option>
                      {pendingInvoicesForCustomer.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoice_number} (pending ₹{formatMoney(inv.pending_amount)})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Amount"
                      value={row.allocated_amount}
                      onChange={(e) => updateAllocationRow(index, "allocated_amount", e.target.value)}
                    />
                    <button type="button" onClick={() => removeAllocationRow(index)}>
                      Remove
                    </button>
                  </div>
                ))}
                {allocations.length > 0 && (
                  <div className="payments-allocation-total">
                    Allocated: ₹{formatMoney(allocatedTotal)} / ₹{formatMoney(form.received_amount || 0)}
                  </div>
                )}
              </div>

              {formError && <div className="payments-form-error">{formError}</div>}

              <div className="payments-form-actions">
                <button type="button" onClick={() => { setIsFormOpen(false); resetForm(); }} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="payments-primary-btn" disabled={saving}>
                  {saving ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedPayment && (
        <div className="payments-modal-overlay" onClick={() => setSelectedPayment(null)}>
          <div className="payments-modal-card" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <div>Loading...</div>
            ) : detailError ? (
              <div className="payments-form-error">{detailError}</div>
            ) : (
              <>
                <h3>{selectedPayment.payment_number}</h3>
                <div className="payment-detail-grid">
                  <div>
                    <div className="payment-detail-label">Customer</div>
                    <div>{selectedPayment.customer_name}</div>
                  </div>
                  <div>
                    <div className="payment-detail-label">Date</div>
                    <div>{formatDate(selectedPayment.payment_date)}</div>
                  </div>
                  <div>
                    <div className="payment-detail-label">Mode</div>
                    <div>{selectedPayment.payment_mode}</div>
                  </div>
                  <div>
                    <div className="payment-detail-label">Amount</div>
                    <div>₹{formatMoney(selectedPayment.received_amount)}</div>
                  </div>
                </div>

                <div className="payment-detail-label" style={{ marginTop: 16 }}>
                  Allocated To
                </div>
                {(selectedPayment.allocations || []).length === 0 ? (
                  <div className="payments-empty">Not allocated to any invoice.</div>
                ) : (
                  <div className="payment-allocation-list">
                    {selectedPayment.allocations.map((a) => (
                      <div key={a.id} className="payment-allocation-row">
                        <span>{a.invoice_number}</span>
                        <span>₹{formatMoney(a.allocated_amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="payments-form-actions">
                  <button type="button" onClick={() => setSelectedPayment(null)}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
