import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { createInvoice, downloadInvoice, formatDate, formatInr, listInvoices, previewInvoiceUrl } from "./brigadeShared";

// Tax invoices for one PO (Billing -> PO page): the invoices already issued, and the flow
//  1. "Preview invoice" shows the PDF as it would be issued, stamped PREVIEW (nothing saved);
//  2. "Generate invoice" at the bottom of the preview asks to confirm;
//  3. on confirm the invoice is saved (it gets its invoice number then) and downloaded.
// The invoice takes the services ticked on the PO page (`selected`: { ids, count, amount });
// a PO can be invoiced any number of times. `blockedReason` disables it (e.g. unsaved changes -
// the invoice uses the PO as saved - or nothing ticked).
export default function PoInvoices({ poNumber, selected, blockedReason }) {
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null); // null | { loading } | { url } | { error }
  const [confirming, setConfirming] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(""); // the number just generated

  const load = useCallback(() => {
    listInvoices(poNumber)
      .then((rows) => setInvoices(Array.isArray(rows) ? rows : []))
      .catch((err) => {
        setInvoices([]);
        setError(err.message || "Could not load invoices");
      });
  }, [poNumber]);

  useEffect(() => {
    load();
  }, [load]);

  async function openPreview() {
    setError("");
    setDone("");
    setPreview({ loading: true });
    try {
      setPreview({ url: await previewInvoiceUrl(poNumber, selected.ids) });
    } catch (err) {
      setPreview({ error: err.message || "Could not prepare the invoice" });
    }
  }

  function closePreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function generate() {
    setConfirming(false);
    setGenerating(true);
    try {
      const invoice = await createInvoice(poNumber, selected.ids);
      closePreview();
      setDone(invoice.invoice_number);
      load();
      await downloadInvoice(invoice);
    } catch (err) {
      setPreview((p) => (p ? { ...p, saveError: err.message || "Could not generate the invoice" } : p));
    } finally {
      setGenerating(false);
    }
  }

  async function download(invoice) {
    setError("");
    try {
      await downloadInvoice(invoice);
    } catch (err) {
      setError(err.message || "Could not download the invoice");
    }
  }

  const blocked = Boolean(blockedReason);

  return (
    <section className="bgb-invoices">
      <div className="bgb-lines-bar">
        <h3>
          Invoices <span className="bgb-count">{invoices ? invoices.length : "…"}</span>
        </h3>
        <button type="button" className="primary" onClick={openPreview} disabled={blocked} title={blockedReason || "See the invoice, then generate it from the preview"}>
          Preview invoice
        </button>
      </div>
      {blockedReason ? (
        <div className="bgb-sub">{blockedReason}</div>
      ) : (
        <div className="bgb-sub">
          {selected.count} service{selected.count === 1 ? "" : "s"} selected · {formatInr(selected.amount)} + GST {formatInr(selected.amount * 0.18)} ={" "}
          <strong>{formatInr(selected.amount * 1.18)}</strong>
        </div>
      )}
      {done && <div className="bgb-invoice-done">Invoice {done} generated and downloaded.</div>}
      {error && <div className="bg-field-error">{error}</div>}

      {invoices && invoices.length > 0 && (
        <table className="bgb-invoice-table">
          <thead>
            <tr>
              <th>Invoice No.</th>
              <th>Date</th>
              <th>Services</th>
              <th className="num">Taxable</th>
              <th className="num">GST (18%)</th>
              <th className="num">Total</th>
              <th aria-label="Download" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td><strong>{inv.invoice_number}</strong></td>
                <td>{formatDate(inv.invoice_date)}</td>
                <td>{inv.lines}</td>
                <td className="num">{formatInr(inv.subtotal)}</td>
                <td className="num">{formatInr(inv.cgst + inv.sgst)}</td>
                <td className="num"><strong>{formatInr(inv.total)}</strong></td>
                <td className="num">
                  <button type="button" className="bg-link-btn" onClick={() => download(inv)}>Download PDF</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* The preview; "Generate invoice" at its foot issues it (after a confirm). */}
      {preview && (
        <div className="bgi-overlay" role="dialog" aria-modal="true" aria-label="Invoice preview">
          <div className="bgi-modal">
            <header className="bgi-head">
              <div>
                <h3>Invoice preview · PO {poNumber} · {selected.count} service{selected.count === 1 ? "" : "s"}</h3>
                <p>Check the invoice. When it is right, click Generate invoice.</p>
              </div>
              <button type="button" className="bgb-btn-ghost" onClick={closePreview} disabled={generating}>Close</button>
            </header>
            <div className="bgi-body">
              {preview.loading && <div className="bg-loading">Preparing the invoice…</div>}
              {preview.error && <div className="bg-error">{preview.error}</div>}
              {preview.url && <iframe title="Invoice preview" src={preview.url} />}
            </div>
            <footer className="bgi-foot">
              {preview.saveError && <span className="bg-field-error">{preview.saveError}</span>}
              <button type="button" className="bgb-btn-ghost" onClick={closePreview} disabled={generating}>Cancel</button>
              <button type="button" className="primary" onClick={() => setConfirming(true)} disabled={!preview.url || generating}>
                {generating ? "Generating…" : "Generate invoice"}
              </button>
            </footer>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Generate invoice?"
        message={`Are you sure you want to generate the invoice for ${selected.count} service${selected.count === 1 ? "" : "s"} on PO ${poNumber}? Once generated, it is saved and cannot be changed.`}
        confirmLabel="Yes, generate"
        onConfirm={generate}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
