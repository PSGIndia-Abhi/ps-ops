import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiOutlineBuildingOffice2, HiOutlineUserGroup, HiOutlineKey, HiOutlineMagnifyingGlass, HiOutlinePlus,
  HiOutlinePencilSquare, HiOutlineNoSymbol, HiOutlineCheckCircle, HiOutlineMapPin, HiOutlineDocumentText,
  HiOutlineChevronLeft, HiOutlineEnvelope, HiOutlinePhone, HiOutlineXMark, HiOutlineShieldCheck, HiOutlineBuildingStorefront,
} from "react-icons/hi2";
import { apiFetch, safeJson } from "../../api";
import StatusAlertModal from "../../components/StatusAlertModal";
import CompanyDocuments from "./CompanyDocuments";
import CompanyAvatar from "./CompanyAvatar";
import { initialsOf } from "./avatarUtils";
import "./ClientAccounts.css";

// Admin > Client Accounts: create client portal logins per company.
// "All outlets" = company admin (sees every outlet); "Selected outlets" = outlet user.

const emptyForm = { name: "", email: "", phone: "", password: "", access: "company", site_ids: [] };

export default function ClientAccounts() {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState("");
  const [onlyWithLogins, setOnlyWithLogins] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [tab, setTab] = useState("logins");

  const [modal, setModal] = useState(null); // { mode: 'create' | 'edit' | 'password', login? }
  const [status, setStatus] = useState(null);

  const loadCompanies = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await apiFetch("/api/client-accounts/companies");
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to load companies");
      setCompanies(Array.isArray(data) ? data : []);
      setListError(null);
    } catch (err) {
      setListError(err.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (companyId) => {
    if (!companyId) return;
    setLoadingDetail(true);
    try {
      const res = await apiFetch(`/api/client-accounts/companies/${encodeURIComponent(companyId)}`);
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to load company");
      setDetail(data);
      setDetailError(null);
    } catch (err) {
      setDetail(null);
      setDetailError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  function selectCompany(id) {
    setSelectedId(id);
    setTab("logins");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (onlyWithLogins && !c.login_count) return false;
      if (!q) return true;
      return [c.name, c.display_name, c.code, c.id].some((v) => v && v.toLowerCase().includes(q));
    });
  }, [companies, search, onlyWithLogins]);

  const totals = useMemo(
    () => ({
      companies: companies.length,
      withLogins: companies.filter((c) => c.login_count > 0).length,
      logins: companies.reduce((sum, c) => sum + c.login_count, 0),
    }),
    [companies]
  );

  async function afterSave(message) {
    setModal(null);
    setStatus({ type: "success", message });
    await Promise.all([loadDetail(selectedId), loadCompanies()]);
  }

  async function toggleActive(login) {
    const res = await apiFetch(`/api/client-accounts/logins/${login.id}`, {
      method: "PUT",
      body: JSON.stringify({ is_active: !login.is_active }),
    });
    const data = await safeJson(res);
    if (!res?.ok) {
      setStatus({ type: "error", message: data?.error || "Failed to update login" });
      return;
    }
    setStatus({ type: "success", message: `${login.name} ${login.is_active ? "disabled" : "enabled"}.` });
    loadDetail(selectedId);
  }

  const companyName = (c) => String(c?.display_name || c?.name || "").trim();

  return (
    <div className="ca-page">
      <header className="ca-hero">
        <div className="ca-hero-text">
          <span className="ca-hero-icon"><HiOutlineShieldCheck /></span>
          <div>
            <h2>Client Accounts</h2>
            <p>Give client companies access to their portal. A company admin sees every outlet; an outlet login sees only the outlets you pick.</p>
          </div>
        </div>
        <div className="ca-stats">
          <div className="ca-stat"><HiOutlineBuildingOffice2 /><div><strong>{totals.companies}</strong><span>Companies</span></div></div>
          <div className="ca-stat"><HiOutlineCheckCircle /><div><strong>{totals.withLogins}</strong><span>With portal access</span></div></div>
          <div className="ca-stat"><HiOutlineUserGroup /><div><strong>{totals.logins}</strong><span>Client logins</span></div></div>
        </div>
      </header>

      <div className="ca-layout">
        {/* Company list */}
        <aside className={`ca-list ${selectedId ? "ca-hide-mobile" : ""}`}>
          <div className="ca-list-tools">
            <label className="ca-search">
              <HiOutlineMagnifyingGlass aria-hidden="true" />
              <input type="search" placeholder="Search company or code" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <div className="ca-segment" role="tablist">
              <button role="tab" aria-selected={!onlyWithLogins} className={!onlyWithLogins ? "active" : ""} onClick={() => setOnlyWithLogins(false)}>
                All <span>{companies.length}</span>
              </button>
              <button role="tab" aria-selected={onlyWithLogins} className={onlyWithLogins ? "active" : ""} onClick={() => setOnlyWithLogins(true)}>
                With logins <span>{totals.withLogins}</span>
              </button>
            </div>
          </div>

          {listError && <div className="ca-error">{listError} <button onClick={loadCompanies}>Retry</button></div>}

          <ul>
            {loadingList && companies.length === 0 && Array.from({ length: 6 }).map((_, i) => <li key={i}><div className="ca-skel-row" /></li>)}
            {!loadingList && !listError && filtered.length === 0 && <li className="ca-empty">No companies match.</li>}
            {filtered.map((c) => (
              <li key={c.id}>
                <button className={`ca-company ${selectedId === c.id ? "active" : ""}`} onClick={() => selectCompany(c.id)}>
                  <CompanyAvatar name={companyName(c)} size={40} />
                  <span className="ca-company-text">
                    <strong>{companyName(c) || c.id}</strong>
                    <small>
                      {c.code || c.id}
                      <span className="ca-dot">•</span>
                      <HiOutlineBuildingStorefront aria-hidden="true" /> {c.outlet_count}
                    </small>
                  </span>
                  {c.login_count > 0 && <span className="ca-badge" title={`${c.login_count} portal login(s)`}><HiOutlineKey aria-hidden="true" />{c.login_count}</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Company detail */}
        <section className={`ca-detail ${selectedId ? "" : "ca-hide-mobile"}`}>
          {!selectedId && (
            <div className="ca-placeholder">
              <span className="ca-placeholder-icon"><HiOutlineBuildingOffice2 /></span>
              <h3>Select a company</h3>
              <p>Pick a company to manage its portal logins, shared documents and outlets.</p>
            </div>
          )}

          {selectedId && (
            <>
              <button className="ca-back" onClick={() => setSelectedId(null)}><HiOutlineChevronLeft /> All companies</button>
              {loadingDetail && !detail && <div className="ca-skel-block" />}
              {detailError && <div className="ca-error">{detailError}</div>}

              {detail && (
                <>
                  <div className="ca-detail-head">
                    <CompanyAvatar name={companyName(detail.company)} size={60} />
                    <div className="ca-detail-title">
                      <h3>{companyName(detail.company)}</h3>
                      <div className="ca-chips">
                        <span>{detail.company.code || detail.company.id}</span>
                        {detail.company.type && <span>{detail.company.type}</span>}
                        <span><HiOutlineBuildingStorefront aria-hidden="true" /> {detail.sites.length} outlet{detail.sites.length === 1 ? "" : "s"}</span>
                        <span><HiOutlineKey aria-hidden="true" /> {detail.logins.length} login{detail.logins.length === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <button
                      className="ca-primary"
                      onClick={() => setModal({ mode: "create" })}
                      disabled={detail.sites.length === 0}
                      title={detail.sites.length === 0 ? "Add an outlet (site) to this company first" : ""}
                    >
                      <HiOutlinePlus /> Add login
                    </button>
                  </div>

                  {detail.sites.length === 0 && (
                    <div className="ca-warn">This company has no outlets yet. Add a site under Companies first.</div>
                  )}

                  <div className="ca-tabs" role="tablist">
                    <button role="tab" aria-selected={tab === "logins"} className={tab === "logins" ? "active" : ""} onClick={() => setTab("logins")}>
                      <HiOutlineKey /> Portal logins <span>{detail.logins.length}</span>
                    </button>
                    <button role="tab" aria-selected={tab === "documents"} className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}>
                      <HiOutlineDocumentText /> Shared documents
                    </button>
                    <button role="tab" aria-selected={tab === "outlets"} className={tab === "outlets" ? "active" : ""} onClick={() => setTab("outlets")}>
                      <HiOutlineMapPin /> Outlets <span>{detail.sites.length}</span>
                    </button>
                  </div>

                  {tab === "logins" && (
                    detail.logins.length === 0 ? (
                      <div className="ca-empty-state">
                        <span><HiOutlineKey /></span>
                        <strong>No portal logins yet</strong>
                        <p>Create a login so this company can see its jobs, complaints, documents and audit reports.</p>
                        {detail.sites.length > 0 && <button className="ca-primary" onClick={() => setModal({ mode: "create" })}><HiOutlinePlus /> Add first login</button>}
                      </div>
                    ) : (
                      <div className="ca-login-grid">
                        {detail.logins.map((l) => (
                          <article key={l.id} className={`ca-login-card ${l.is_active ? "" : "inactive"}`}>
                            <div className="ca-login-top">
                              <span className="ca-person">{initialsOf(l.name)}</span>
                              <div className="ca-login-who">
                                <strong>{l.name}</strong>
                                <span className={`ca-role ${l.access === "company" ? "company" : ""}`}>
                                  {l.access === "company" ? "Company admin" : "Outlet user"}
                                </span>
                              </div>
                              <span className={`ca-state ${l.is_active ? "on" : "off"}`}>{l.is_active ? "Active" : "Disabled"}</span>
                            </div>
                            <div className="ca-login-contact">
                              <span><HiOutlineEnvelope aria-hidden="true" /> {l.email}</span>
                              {l.phone && <span><HiOutlinePhone aria-hidden="true" /> {l.phone}</span>}
                            </div>
                            <div className="ca-login-access">
                              {l.access === "company" ? (
                                <span className="ca-tag company"><HiOutlineBuildingOffice2 aria-hidden="true" /> All outlets</span>
                              ) : (
                                l.sites.map((s) => <span key={s.id} className="ca-tag"><HiOutlineMapPin aria-hidden="true" /> {s.name || s.id}</span>)
                              )}
                            </div>
                            <div className="ca-login-actions">
                              <button onClick={() => setModal({ mode: "edit", login: l })} title="Edit"><HiOutlinePencilSquare /> Edit</button>
                              <button onClick={() => setModal({ mode: "password", login: l })} title="Reset password"><HiOutlineKey /> Password</button>
                              <button className={l.is_active ? "danger" : "ok"} onClick={() => toggleActive(l)}>
                                {l.is_active ? <><HiOutlineNoSymbol /> Disable</> : <><HiOutlineCheckCircle /> Enable</>}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )
                  )}

                  {tab === "documents" && (
                    <CompanyDocuments companyId={detail.company.id} sites={detail.sites} onStatus={setStatus} />
                  )}

                  {tab === "outlets" && (
                    detail.sites.length === 0 ? (
                      <div className="ca-empty-state"><span><HiOutlineMapPin /></span><strong>No outlets</strong><p>Add sites to this company under Companies.</p></div>
                    ) : (
                      <div className="ca-outlets">
                        {detail.sites.map((s) => (
                          <div key={s.id} className="ca-outlet">
                            <span className="ca-outlet-icon"><HiOutlineBuildingStorefront /></span>
                            <div>
                              <strong>{s.name || s.id}</strong>
                              <span>{[s.address, s.city].filter(Boolean).join(", ") || "No address"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>

      {modal && detail && modal.mode !== "password" && (
        <LoginModal mode={modal.mode} login={modal.login} company={detail.company} sites={detail.sites} onClose={() => setModal(null)} onSaved={afterSave} />
      )}
      {modal && modal.mode === "password" && (
        <PasswordModal login={modal.login} onClose={() => setModal(null)} onSaved={afterSave} />
      )}

      <StatusAlertModal status={status} onClose={() => setStatus(null)} />
    </div>
  );
}

function LoginModal({ mode, login, company, sites, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          ...emptyForm,
          name: login.name || "",
          email: login.email || "",
          phone: login.phone || "",
          access: login.access,
          site_ids: login.sites.map((s) => String(s.id)),
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const toggleSite = (id) =>
    set("site_ids", form.site_ids.includes(id) ? form.site_ids.filter((x) => x !== id) : [...form.site_ids, id]);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError("Name is required.");
    if (!isEdit && !form.email.trim()) return setError("Email is required.");
    if (!isEdit && form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (form.access === "sites" && form.site_ids.length === 0) return setError("Select at least one outlet.");

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        access: form.access,
        site_ids: form.access === "sites" ? form.site_ids : [],
      };
      const res = isEdit
        ? await apiFetch(`/api/client-accounts/logins/${login.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch(`/api/client-accounts/companies/${encodeURIComponent(company.id)}/logins`, {
            method: "POST",
            body: JSON.stringify({ ...payload, email: form.email.trim(), password: form.password }),
          });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to save");
      await onSaved(isEdit ? `${payload.name} updated.` : `Login created for ${payload.name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ca-modal-backdrop" onClick={onClose}>
      <form className="ca-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="ca-modal-head">
          <CompanyAvatar name={company.display_name || company.name} size={40} />
          <div>
            <h3>{isEdit ? "Edit login" : "New portal login"}</h3>
            <p className="ca-muted">{company.display_name || company.name}</p>
          </div>
          <button type="button" className="ca-x" onClick={onClose} aria-label="Close"><HiOutlineXMark /></button>
        </header>

        {error && <div className="ca-error">{error}</div>}

        <div className="ca-form-grid">
          <label>Full name *
            <input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          </label>
          <label>Phone
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </label>
        </div>
        <label>Email (used to sign in) *
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={isEdit} />
        </label>
        {!isEdit && (
          <label>Password * (min 6 characters)
            <input type="text" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
          </label>
        )}

        <div className="ca-access">
          <span className="ca-access-label">Access</span>
          <div className="ca-access-cards">
            <button type="button" className={`ca-access-card ${form.access === "company" ? "active" : ""}`} onClick={() => set("access", "company")}>
              <HiOutlineBuildingOffice2 />
              <strong>All outlets</strong>
              <small>Company admin. Sees every outlet, including ones added later.</small>
            </button>
            <button type="button" className={`ca-access-card ${form.access === "sites" ? "active" : ""}`} onClick={() => set("access", "sites")}>
              <HiOutlineMapPin />
              <strong>Selected outlets</strong>
              <small>Outlet user. Sees only the outlets ticked below.</small>
            </button>
          </div>

          {form.access === "sites" && (
            <div className="ca-site-picks">
              {sites.map((s) => (
                <label key={s.id} className={`ca-site-pick ${form.site_ids.includes(String(s.id)) ? "on" : ""}`}>
                  <input type="checkbox" checked={form.site_ids.includes(String(s.id))} onChange={() => toggleSite(String(s.id))} />
                  <span>{s.name || s.id}{s.city ? <small> · {s.city}</small> : null}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="ca-modal-actions">
          <button type="button" className="ca-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="ca-primary" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save changes" : "Create login"}</button>
        </div>
      </form>
    </div>
  );
}

function PasswordModal({ login, onClose, onSaved }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/client-accounts/logins/${login.id}/password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to reset password");
      await onSaved(`Password reset for ${login.name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ca-modal-backdrop" onClick={onClose}>
      <form className="ca-modal ca-modal-sm" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="ca-modal-head">
          <span className="ca-person">{initialsOf(login.name)}</span>
          <div>
            <h3>Reset password</h3>
            <p className="ca-muted">{login.name} · {login.email}</p>
          </div>
          <button type="button" className="ca-x" onClick={onClose} aria-label="Close"><HiOutlineXMark /></button>
        </header>
        {error && <div className="ca-error">{error}</div>}
        <label>New password (min 6 characters)
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="new-password" />
        </label>
        <div className="ca-modal-actions">
          <button type="button" className="ca-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="ca-primary" disabled={saving}>{saving ? "Saving…" : "Reset password"}</button>
        </div>
      </form>
    </div>
  );
}
