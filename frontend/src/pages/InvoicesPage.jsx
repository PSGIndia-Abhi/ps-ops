import { useEffect, useMemo, useState } from "react";
import { apiFetch, safeJson } from "../api";
import "./InvoicesPage.css";

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

const STATUS_OPTIONS = ["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"];

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_id: "",
    site_id: "",
    invoice_number: "",
    invoice_date: "",
    due_date: "",
    invoice_amount: "",
    remarks: "",
  });

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  async function loadInvoices() {
    try {
      setLoading(true);
      const res = await apiFetch("/api/invoices");
      if (!res?.ok) throw new Error((await safeJson(res))?.error || "Failed to load invoices");
      const list = await res.json();
      setInvoices(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Invoices load failed", err);
      setError(err.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();
    (async () => {
      const [companiesRes, sitesRes] = await Promise.all([
        apiFetch("/api/companies"),
        apiFetch("/api/sites"),
      ]);
      if (companiesRes?.ok) setCompanies((await safeJson(companiesRes)) || []);
      if (sitesRes?.ok) setSites((await safeJson(sitesRes)) || []);
    })();
  }, []);

  const filteredInvoices = useMemo(() => {
    if (!statusFilter) return invoices;
    return invoices.filter((inv) => (inv.display_status || inv.status) === statusFilter);
  }, [invoices, statusFilter]);

  const sitesForCustomer = useMemo(() => {
    if (!form.customer_id) return [];
    return sites.filter((s) => String(s.company_id) === String(form.customer_id));
  }, [sites, form.customer_id]);

  function resetForm() {
    setForm({
      customer_id: "",
      site_id: "",
      invoice_number: "",
      invoice_date: "",
      due_date: "",
      invoice_amount: "",
      remarks: "",
    });
    setFormError("");
  }

  async function handleCreateInvoice(e) {
    e.preventDefault();
    if (!form.customer_id || !form.invoice_number || !form.invoice_date || !form.invoice_amount) {
      setFormError("Customer, invoice number, invoice date and amount are required.");
      return;
    }

    try {
      setSaving(true);
      setFormError("");
      const res = await apiFetch("/api/invoices", {
        method: "POST",
        body: JSON.stringify({
          customer_id: form.customer_id,
          site_id: form.site_id || null,
          invoice_number: form.invoice_number,
          invoice_date: form.invoice_date,
          due_date: form.due_date || null,
          invoice_amount: Number(form.invoice_amount),
          remarks: form.remarks || null,
        }),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to create invoice");

      setIsFormOpen(false);
      resetForm();
      await loadInvoices();
    } catch (err) {
      setFormError(err.message || "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  }

  async function openInvoiceDetail(invoiceId) {
    setSelectedInvoice({ id: invoiceId });
    setDetailLoading(true);
    setDetailError("");
    try {
      const res = await apiFetch(`/api/invoices/${invoiceId}`);
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to load invoice");
      setSelectedInvoice(data);
    } catch (err) {
      setDetailError(err.message || "Failed to load invoice");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleCancelInvoice(invoiceId) {
    if (!window.confirm("Cancel this invoice? This cannot be undone.")) return;
    try {
      setActionBusy(true);
      const res = await apiFetch(`/api/invoices/${invoiceId}/cancel`, { method: "POST" });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to cancel invoice");
      setSelectedInvoice(null);
      await loadInvoices();
    } catch (err) {
      setDetailError(err.message || "Failed to cancel invoice");
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) return <div className="invoices-page">Loading invoices...</div>;
  if (error) return <div className="invoices-page">Error: {error}</div>;

  return (
    <div className="invoices-page">
      <div className="invoices-header">
        <div>
          <h2>Invoices</h2>
          <div className="invoices-subtitle">{filteredInvoices.length} total</div>
        </div>
        <button type="button" className="invoices-primary-btn" onClick={() => setIsFormOpen(true)}>
          New Invoice
        </button>
      </div>

      <div className="invoices-filters">
        <label>Status</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="invoices-list">
        {filteredInvoices.length === 0 && <div className="invoices-empty">No invoices found.</div>}
        {filteredInvoices.map((inv) => (
          <div key={inv.id} className="invoice-row" onClick={() => openInvoiceDetail(inv.id)}>
            <div className="invoice-main">
              <div className="invoice-number">{inv.invoice_number}</div>
              <div className="invoice-customer">
                {inv.customer_name}
                {inv.site_name ? ` · ${inv.site_name}` : ""}
              </div>
            </div>
            <div className="invoice-dates">
              <div>Invoice: {formatDate(inv.invoice_date)}</div>
              <div>Due: {formatDate(inv.due_date)}</div>
            </div>
            <div className="invoice-amounts">
              <div>₹{formatMoney(inv.invoice_amount)}</div>
              <div className="invoice-pending">Pending ₹{formatMoney(inv.pending_amount)}</div>
            </div>
            <div className={`invoice-status status-${inv.display_status || inv.status}`}>
              {inv.display_status || inv.status}
            </div>
          </div>
        ))}
      </div>

      {isFormOpen && (
        <div className="invoices-modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="invoices-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>New Invoice</h3>
            <form onSubmit={handleCreateInvoice} className="invoices-form">
              <label>
                Customer
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, customer_id: e.target.value, site_id: "" }))}
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

              <label>
                Site (optional)
                <select
                  value={form.site_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, site_id: e.target.value }))}
                  disabled={!form.customer_id}
                >
                  <option value="">No specific site</option>
                  {sitesForCustomer.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Invoice Number
                <input
                  type="text"
                  value={form.invoice_number}
                  onChange={(e) => setForm((prev) => ({ ...prev, invoice_number: e.target.value }))}
                  required
                />
              </label>

              <div className="invoices-form-row">
                <label>
                  Invoice Date
                  <input
                    type="date"
                    value={form.invoice_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, invoice_date: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Due Date
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
                  />
                </label>
              </div>

              <label>
                Amount
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.invoice_amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, invoice_amount: e.target.value }))}
                  required
                />
              </label>

              <label>
                Remarks
                <textarea
                  value={form.remarks}
                  onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
                  rows={2}
                />
              </label>

              {formError && <div className="invoices-form-error">{formError}</div>}

              <div className="invoices-form-actions">
                <button type="button" onClick={() => { setIsFormOpen(false); resetForm(); }} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="invoices-primary-btn" disabled={saving}>
                  {saving ? "Saving..." : "Create Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedInvoice && (
        <div className="invoices-modal-overlay" onClick={() => setSelectedInvoice(null)}>
          <div className="invoices-modal-card" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <div>Loading...</div>
            ) : detailError ? (
              <div className="invoices-form-error">{detailError}</div>
            ) : (
              <>
                <h3>{selectedInvoice.invoice_number}</h3>
                <div className="invoice-detail-grid">
                  <div>
                    <div className="invoice-detail-label">Customer</div>
                    <div>{selectedInvoice.customer_name}</div>
                  </div>
                  <div>
                    <div className="invoice-detail-label">Site</div>
                    <div>{selectedInvoice.site_name || "-"}</div>
                  </div>
                  <div>
                    <div className="invoice-detail-label">Status</div>
                    <div className={`invoice-status status-${selectedInvoice.display_status || selectedInvoice.status}`}>
                      {selectedInvoice.display_status || selectedInvoice.status}
                    </div>
                  </div>
                  <div>
                    <div className="invoice-detail-label">Amount</div>
                    <div>₹{formatMoney(selectedInvoice.invoice_amount)}</div>
                  </div>
                  <div>
                    <div className="invoice-detail-label">Paid</div>
                    <div>₹{formatMoney(selectedInvoice.paid_amount)}</div>
                  </div>
                  <div>
                    <div className="invoice-detail-label">Pending</div>
                    <div>₹{formatMoney(selectedInvoice.pending_amount)}</div>
                  </div>
                </div>

                <div className="invoice-detail-label" style={{ marginTop: 16 }}>
                  Payment History
                </div>
                {(selectedInvoice.allocations || []).length === 0 ? (
                  <div className="invoices-empty">No payments recorded yet.</div>
                ) : (
                  <div className="invoice-allocation-list">
                    {selectedInvoice.allocations.map((a) => (
                      <div key={a.id} className="invoice-allocation-row">
                        <span>{a.payment_number}</span>
                        <span>{formatDate(a.payment_date)}</span>
                        <span>{a.payment_mode}</span>
                        <span>₹{formatMoney(a.allocated_amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="invoices-form-actions">
                  <button type="button" onClick={() => setSelectedInvoice(null)}>
                    Close
                  </button>
                  {selectedInvoice.status !== "CANCELLED" && Number(selectedInvoice.paid_amount) === 0 && (
                    <button
                      type="button"
                      className="invoices-danger-btn"
                      disabled={actionBusy}
                      onClick={() => handleCancelInvoice(selectedInvoice.id)}
                    >
                      {actionBusy ? "Cancelling..." : "Cancel Invoice"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
