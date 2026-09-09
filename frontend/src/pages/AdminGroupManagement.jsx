import { useCallback, useEffect, useMemo, useState } from "react";
import { FiEdit2, FiEye, FiTrash2 } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { formatDateTime } from "../utils/date";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";
import StatusAlertModal from "../components/StatusAlertModal";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  clearPendingGroupManagementCount,
  getPendingGroupManagementCounts,
  subscribePendingGroupManagementCounts,
} from "../utils/groupManagementNotice";
import Pagination from "../components/Pagination";
import { paginate } from "../utils/pagination";
import "./AdminGroupManagement.css";

const SUB_TABS = [
  { key: "groups", label: "Groups" },
  { key: "companies", label: "Companies" },
  { key: "sites", label: "Sites" },
];

const COMPANY_TYPES = ["CORPORATE", "INDIVIDUAL", "RWA"];

// "Latest" = most recently created first (the default everywhere); "az" =
// alphabetical by whichever field the caller passes as sortKey.
function sortRows(rows, sortOrder, sortKey) {
  const sorted = [...rows];
  if (sortOrder === "az") {
    sorted.sort((a, b) => String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")));
  } else {
    sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }
  return sorted;
}

const emptyCompanyForm = { name: "", group_id: "", code: "", gst_number: "", type: "" };
const emptySiteForm = { company_id: "", name: "", address: "", city: "", state: "" };

export default function AdminGroupManagement() {
  const [subTab, setSubTab] = useState("groups");
  const [status, setStatus] = useState(null); // null | { type: "success" | "error", message }
  const [pendingCounts, setPendingCounts] = useState(getPendingGroupManagementCounts);

  // In-app replacement for window.confirm() on every delete in this page.
  const [confirmState, setConfirmState] = useState(null); // null | { message, onConfirm }

  function requestConfirm(message, onConfirm) {
    setConfirmState({ message, onConfirm });
  }

  function closeConfirm() {
    setConfirmState(null);
  }

  useEffect(() => {
    return subscribePendingGroupManagementCounts(setPendingCounts);
  }, []);

  /* ---------------- Groups ---------------- */
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("latest");
  const [page, setPage] = useState(1);

  const [editingGroup, setEditingGroup] = useState(null); // null | group row
  const [editName, setEditName] = useState("");
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  async function loadGroups() {
    try {
      setLoading(true);
      const res = await apiFetch("/api/groups");
      if (!res?.ok) throw new Error((await safeJson(res))?.error || "Failed to load groups");
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = query ? groups.filter((group) => (group.name || "").toLowerCase().includes(query)) : groups;
    return sortRows(matches, sortOrder, "name");
  }, [groups, search, sortOrder]);

  useEffect(() => {
    setPage(1);
  }, [search, sortOrder]);

  const pagedGroups = useMemo(() => paginate(filteredGroups, page), [filteredGroups, page]);

  function openEditModal(group) {
    setEditingGroup(group);
    setEditName(group.name || "");
    setFormError(null);
  }

  function closeEditModal() {
    setEditingGroup(null);
    setEditName("");
    setFormError(null);
  }

  async function handleSaveEdit() {
    const trimmed = editName.trim();
    if (!trimmed) {
      setFormError("Group name is required.");
      return;
    }

    try {
      setSaving(true);
      const res = await apiFetch(`/api/groups/${editingGroup.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await safeJson(res);
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to update group");
      }
      closeEditModal();
      await loadGroups();
      setStatus({ type: "success", message: `Group "${trimmed}" updated successfully.` });
    } catch (err) {
      console.error(err);
      setFormError(err.message || "Failed to update group");
      setStatus({ type: "error", message: err.message || "Failed to update group." });
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(group) {
    requestConfirm(
      `Delete "${group.name}"? Companies still assigned to this group will block the delete.`,
      () => performDeleteGroup(group)
    );
  }

  async function performDeleteGroup(group) {
    closeConfirm();
    try {
      setDeletingId(group.id);
      const res = await apiFetch(`/api/groups/${group.id}`, { method: "DELETE" });
      const data = await safeJson(res);
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to delete group");
      }
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      setError(null);
      setStatus({ type: "success", message: `Group "${group.name}" deleted successfully.` });
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to delete group");
      setStatus({ type: "error", message: err.message || "Failed to delete group." });
    } finally {
      setDeletingId(null);
    }
  }

  /* ---------------- Companies ---------------- */
  const [companies, setCompanies] = useState([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companiesError, setCompaniesError] = useState(null);
  const [companySearch, setCompanySearch] = useState("");
  const [companySortOrder, setCompanySortOrder] = useState("latest");
  const [companyPage, setCompanyPage] = useState(1);

  const [editingCompany, setEditingCompany] = useState(null); // null | company row
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [companyFormError, setCompanyFormError] = useState(null);
  const [companySaving, setCompanySaving] = useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = useState(null);

  async function loadCompanies() {
    try {
      setCompaniesLoading(true);
      const res = await apiFetch("/api/companies");
      if (!res?.ok) throw new Error((await safeJson(res))?.error || "Failed to load companies");
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
      setCompaniesError(null);
    } catch (err) {
      console.error(err);
      setCompaniesError(err.message || "Failed to load companies");
    } finally {
      setCompaniesLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
    loadCompanies();
    loadSites();
  }, []);

  const filteredCompanies = useMemo(() => {
    const query = companySearch.trim().toLowerCase();
    const matches = query
      ? companies.filter((company) => {
          const haystack = `${company.name || ""} ${company.group_name || ""} ${company.code || ""}`.toLowerCase();
          return haystack.includes(query);
        })
      : companies;
    return sortRows(matches, companySortOrder, "name");
  }, [companies, companySearch, companySortOrder]);

  useEffect(() => {
    setCompanyPage(1);
  }, [companySearch, companySortOrder]);

  const pagedCompanies = useMemo(
    () => paginate(filteredCompanies, companyPage),
    [filteredCompanies, companyPage]
  );

  function openEditCompanyModal(company) {
    setEditingCompany(company);
    setCompanyForm({
      name: company.name || "",
      group_id: company.group_id || "",
      code: company.code || "",
      gst_number: company.gst_number || "",
      type: company.type || "",
    });
    setCompanyFormError(null);
  }

  function closeCompanyModal() {
    setEditingCompany(null);
    setCompanyForm(emptyCompanyForm);
    setCompanyFormError(null);
  }

  function updateCompanyField(key, value) {
    setCompanyForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveCompanyEdit() {
    const trimmed = companyForm.name.trim();
    if (!trimmed) {
      setCompanyFormError("Company name is required.");
      return;
    }

    try {
      setCompanySaving(true);
      const res = await apiFetch(`/api/companies/${editingCompany.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: trimmed,
          group_id: companyForm.group_id || null,
          code: companyForm.code.trim() || null,
          gst_number: companyForm.gst_number.trim() || null,
          type: companyForm.type || null,
        }),
      });
      const data = await safeJson(res);
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to update company");
      }
      closeCompanyModal();
      await loadCompanies();
      setStatus({ type: "success", message: `Company "${trimmed}" updated successfully.` });
    } catch (err) {
      console.error(err);
      setCompanyFormError(err.message || "Failed to update company");
      setStatus({ type: "error", message: err.message || "Failed to update company." });
    } finally {
      setCompanySaving(false);
    }
  }

  function handleDeleteCompany(company) {
    requestConfirm(
      `Delete "${company.name}"? Sites still assigned to this company will block the delete.`,
      () => performDeleteCompany(company)
    );
  }

  async function performDeleteCompany(company) {
    closeConfirm();
    try {
      setDeletingCompanyId(company.id);
      const res = await apiFetch(`/api/companies/${company.id}`, { method: "DELETE" });
      const data = await safeJson(res);
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to delete company");
      }
      setCompanies((prev) => prev.filter((c) => c.id !== company.id));
      setCompaniesError(null);
      setStatus({ type: "success", message: `Company "${company.name}" deleted successfully.` });
    } catch (err) {
      console.error(err);
      setCompaniesError(err.message || "Failed to delete company");
      setStatus({ type: "error", message: err.message || "Failed to delete company." });
    } finally {
      setDeletingCompanyId(null);
    }
  }

  /* ---------------- Sites ---------------- */
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState(null);
  const [siteSearch, setSiteSearch] = useState("");
  const [siteSortOrder, setSiteSortOrder] = useState("latest");
  const [sitePage, setSitePage] = useState(1);

  const [editingSite, setEditingSite] = useState(null); // null | site row
  const [siteForm, setSiteForm] = useState(emptySiteForm);
  const [siteFormError, setSiteFormError] = useState(null);
  const [siteSaving, setSiteSaving] = useState(false);
  const [deletingSiteId, setDeletingSiteId] = useState(null);

  const [viewingSite, setViewingSite] = useState(null); // null | full site detail
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState(null);

  async function loadSites() {
    try {
      setSitesLoading(true);
      const res = await apiFetch("/api/sites");
      if (!res?.ok) throw new Error((await safeJson(res))?.error || "Failed to load sites");
      const data = await res.json();
      setSites(Array.isArray(data) ? data : []);
      setSitesError(null);
    } catch (err) {
      console.error(err);
      setSitesError(err.message || "Failed to load sites");
    } finally {
      setSitesLoading(false);
    }
  }

  const filteredSites = useMemo(() => {
    const query = siteSearch.trim().toLowerCase();
    const matches = query
      ? sites.filter((site) => {
          const haystack = `${site.name || ""} ${site.company_name || ""} ${site.group_name || ""} ${
            site.address || ""
          } ${site.city || ""} ${site.state || ""}`.toLowerCase();
          return haystack.includes(query);
        })
      : sites;
    // A-Z here sorts by company name specifically, per how this section is used.
    return sortRows(matches, siteSortOrder, "company_name");
  }, [sites, siteSearch, siteSortOrder]);

  useEffect(() => {
    setSitePage(1);
  }, [siteSearch, siteSortOrder]);

  const pagedSites = useMemo(() => paginate(filteredSites, sitePage), [filteredSites, sitePage]);

  function openEditSiteModal(site) {
    setEditingSite(site);
    setSiteForm({
      company_id: site.company_id || "",
      name: site.name || "",
      address: site.address || "",
      city: site.city || "",
      state: site.state || "",
    });
    setSiteFormError(null);
  }

  function closeSiteModal() {
    setEditingSite(null);
    setSiteForm(emptySiteForm);
    setSiteFormError(null);
  }

  function updateSiteField(key, value) {
    setSiteForm((prev) => ({ ...prev, [key]: value }));
  }

  // Fired when the admin picks a suggestion from the Google Places dropdown —
  // fills address, city, and state together from the selected place.
  const handleSiteAddressSelected = useCallback(({ address, city, state }) => {
    setSiteForm((prev) => ({
      ...prev,
      address: address || prev.address,
      city: city || prev.city,
      state: state || prev.state,
    }));
  }, []);

  async function handleSaveSiteEdit() {
    if (!siteForm.company_id) {
      setSiteFormError("Company is required.");
      return;
    }
    const trimmedName = siteForm.name.trim();
    if (!trimmedName) {
      setSiteFormError("Site name is required.");
      return;
    }

    try {
      setSiteSaving(true);
      const res = await apiFetch(`/api/sites/${editingSite.id}`, {
        method: "PUT",
        body: JSON.stringify({
          company_id: siteForm.company_id,
          name: trimmedName,
          address: siteForm.address.trim() || null,
          city: siteForm.city.trim() || null,
          state: siteForm.state.trim() || null,
        }),
      });
      const data = await safeJson(res);
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to update site");
      }
      closeSiteModal();
      await loadSites();
      setStatus({ type: "success", message: `Site "${trimmedName}" updated successfully.` });
    } catch (err) {
      console.error(err);
      setSiteFormError(err.message || "Failed to update site");
      setStatus({ type: "error", message: err.message || "Failed to update site." });
    } finally {
      setSiteSaving(false);
    }
  }

  function handleDeleteSite(site) {
    const contactCount = Number(site.contact_count) || 0;
    const jobCount = Number(site.job_count) || 0;
    const parts = [];
    if (contactCount > 0) parts.push(`${contactCount} contact${contactCount === 1 ? "" : "s"}`);
    if (jobCount > 0) parts.push(`${jobCount} job${jobCount === 1 ? "" : "s"}`);

    const message = parts.length
      ? `This site has ${parts.join(" and ")} linked to it. Are you sure you want to delete "${site.name}"?`
      : `Delete "${site.name}"? This cannot be undone.`;

    requestConfirm(message, () => performDeleteSite(site));
  }

  async function performDeleteSite(site) {
    closeConfirm();
    try {
      setDeletingSiteId(site.id);
      const res = await apiFetch(`/api/sites/${site.id}`, { method: "DELETE" });
      const data = await safeJson(res);
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to delete site");
      }
      setSites((prev) => prev.filter((s) => s.id !== site.id));
      setSitesError(null);
      setStatus({ type: "success", message: `Site "${site.name}" deleted successfully.` });
    } catch (err) {
      console.error(err);
      setSitesError(err.message || "Failed to delete site");
      setStatus({ type: "error", message: err.message || "Failed to delete site." });
    } finally {
      setDeletingSiteId(null);
    }
  }

  async function openViewSiteModal(site) {
    setViewingSite({ id: site.id });
    setViewError(null);
    setViewLoading(true);
    try {
      const res = await apiFetch(`/api/sites/${site.id}`);
      const data = await safeJson(res);
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to load site details");
      }
      setViewingSite(data);
    } catch (err) {
      console.error(err);
      setViewError(err.message || "Failed to load site details");
    } finally {
      setViewLoading(false);
    }
  }

  function closeViewModal() {
    setViewingSite(null);
    setViewError(null);
  }

  return (
    <div className="group-mgmt-page">
      <div className="group-mgmt-header">
        <div>
          <h2>Group Management</h2>
          <p>Manage the Group → Company → Site hierarchy.</p>
        </div>
      </div>

      <div className="group-mgmt-subtabs">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={subTab === tab.key ? "active" : ""}
            onClick={() => {
              setSubTab(tab.key);
              // Clicking a tab — even the one already open — means the admin
              // has now seen it, so its badge clears. Nothing clears just
              // from this page mounting, so the default "groups" tab keeps
              // its badge visible until actually clicked, same as the others.
              clearPendingGroupManagementCount(tab.key);
            }}
          >
            {tab.label}
            {pendingCounts[tab.key] > 0 && <span className="nav-badge">{pendingCounts[tab.key]}</span>}
          </button>
        ))}
      </div>

      {subTab === "groups" && (
        <>
          {error && (
            <div className="group-mgmt-error">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}

          <div className="group-mgmt-toolbar">
            <input
              className="group-mgmt-search"
              placeholder="Search groups by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="latest">Latest</option>
              <option value="az">A-Z</option>
            </select>
          </div>

          <div className="group-mgmt-card">
            <div className="group-mgmt-row group-mgmt-row-header">
              <div>Name</div>
              <div>Created</div>
              <div>Actions</div>
            </div>

            {loading ? (
              <div className="group-mgmt-loading">Loading groups...</div>
            ) : filteredGroups.length === 0 ? (
              <div className="group-mgmt-empty">No groups match your search.</div>
            ) : (
              pagedGroups.map((group) => (
                <div key={group.id} className="group-mgmt-row">
                  <div className="group-mgmt-cell" data-label="Name">
                    {group.name || "Unnamed group"}
                  </div>
                  <div className="group-mgmt-cell" data-label="Created">
                    {group.created_at ? formatDateTime(group.created_at) : "-"}
                  </div>
                  <div className="group-mgmt-cell group-mgmt-actions" data-label="Actions">
                    <button type="button" className="edit" title="Edit" aria-label="Edit" onClick={() => openEditModal(group)}>
                      <FiEdit2 />
                    </button>
                    <button
                      type="button"
                      className="danger"
                      title="Delete"
                      aria-label="Delete"
                      onClick={() => handleDelete(group)}
                      disabled={deletingId === group.id}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <Pagination page={page} totalItems={filteredGroups.length} onChange={setPage} />
        </>
      )}

      {subTab === "companies" && (
        <>
          {companiesError && (
            <div className="group-mgmt-error">
              <span>{companiesError}</span>
              <button type="button" onClick={() => setCompaniesError(null)} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}

          <div className="group-mgmt-toolbar">
            <input
              className="group-mgmt-search"
              placeholder="Search companies by name, group, or code"
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
            />
            <select value={companySortOrder} onChange={(e) => setCompanySortOrder(e.target.value)}>
              <option value="latest">Latest</option>
              <option value="az">A-Z</option>
            </select>
          </div>

          <div className="group-mgmt-card">
            <div className="group-mgmt-row group-mgmt-row-header group-mgmt-row-companies">
              <div>Company Name</div>
              <div>Group</div>
              <div>Created</div>
              <div>Type</div>
              <div>Actions</div>
            </div>

            {companiesLoading ? (
              <div className="group-mgmt-loading">Loading companies...</div>
            ) : filteredCompanies.length === 0 ? (
              <div className="group-mgmt-empty">No companies match your search.</div>
            ) : (
              pagedCompanies.map((company) => (
                <div key={company.id} className="group-mgmt-row group-mgmt-row-companies">
                  <div className="group-mgmt-cell" data-label="Company Name">
                    {company.name || "Unnamed company"}
                  </div>
                  <div className="group-mgmt-cell" data-label="Group">
                    {company.group_name || "No group"}
                  </div>
                  <div className="group-mgmt-cell" data-label="Created">
                    {company.created_at ? formatDateTime(company.created_at) : "-"}
                  </div>
                  <div className="group-mgmt-cell" data-label="Type">
                    {company.type || "-"}
                  </div>
                  <div className="group-mgmt-cell group-mgmt-actions" data-label="Actions">
                    <button type="button" className="edit" title="Edit" aria-label="Edit" onClick={() => openEditCompanyModal(company)}>
                      <FiEdit2 />
                    </button>
                    <button
                      type="button"
                      className="danger"
                      title="Delete"
                      aria-label="Delete"
                      onClick={() => handleDeleteCompany(company)}
                      disabled={deletingCompanyId === company.id}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <Pagination page={companyPage} totalItems={filteredCompanies.length} onChange={setCompanyPage} />
        </>
      )}

      {subTab === "sites" && (
        <>
          {sitesError && (
            <div className="group-mgmt-error">
              <span>{sitesError}</span>
              <button type="button" onClick={() => setSitesError(null)} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}

          <div className="group-mgmt-toolbar">
            <input
              className="group-mgmt-search"
              placeholder="Search sites by name, company, group, or address"
              value={siteSearch}
              onChange={(e) => setSiteSearch(e.target.value)}
            />
            <select value={siteSortOrder} onChange={(e) => setSiteSortOrder(e.target.value)}>
              <option value="latest">Latest</option>
              <option value="az">A-Z (Company Name)</option>
            </select>
          </div>

          <div className="group-mgmt-card">
            <div className="group-mgmt-row group-mgmt-row-header group-mgmt-row-sites">
              <div>Company Name</div>
              <div>Group</div>
              <div>Site Name</div>
              <div className="group-mgmt-address-cell">Address</div>
              <div>Actions</div>
            </div>

            {sitesLoading ? (
              <div className="group-mgmt-loading">Loading sites...</div>
            ) : filteredSites.length === 0 ? (
              <div className="group-mgmt-empty">No sites match your search.</div>
            ) : (
              pagedSites.map((site) => {
                const addressParts = [site.address, site.city, site.state].filter(Boolean);
                return (
                  <div key={site.id} className="group-mgmt-row group-mgmt-row-sites">
                    <div className="group-mgmt-cell" data-label="Company Name">
                      {site.company_name || "No company"}
                    </div>
                    <div className="group-mgmt-cell" data-label="Group">
                      {site.group_name || "No group"}
                    </div>
                    <div className="group-mgmt-cell" data-label="Site Name">
                      {site.name || "Unnamed site"}
                    </div>
                    <div
                      className="group-mgmt-cell group-mgmt-address-cell"
                      data-label="Address"
                      title={addressParts.join(", ") || "-"}
                    >
                      {addressParts.join(", ") || "-"}
                    </div>
                    <div className="group-mgmt-cell group-mgmt-actions" data-label="Actions">
                      <button type="button" className="view" title="View" aria-label="View" onClick={() => openViewSiteModal(site)}>
                        <FiEye />
                      </button>
                      <button type="button" className="edit" title="Edit" aria-label="Edit" onClick={() => openEditSiteModal(site)}>
                        <FiEdit2 />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => handleDeleteSite(site)}
                        disabled={deletingSiteId === site.id}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <Pagination page={sitePage} totalItems={filteredSites.length} onChange={setSitePage} />
        </>
      )}

      {editingGroup && (
        <div className="group-mgmt-modal-overlay" onClick={closeEditModal}>
          <div className="group-mgmt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Group</h3>

            {formError && <div className="group-mgmt-error">{formError}</div>}

            <label className="group-mgmt-field">
              <span>Group Name *</span>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Group name" />
            </label>

            <div className="group-mgmt-modal-actions">
              <button type="button" className="secondary" onClick={closeEditModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingCompany && (
        <div className="group-mgmt-modal-overlay" onClick={closeCompanyModal}>
          <div className="group-mgmt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Company</h3>

            {companyFormError && <div className="group-mgmt-error">{companyFormError}</div>}

            <label className="group-mgmt-field">
              <span>Company Name *</span>
              <input
                value={companyForm.name}
                onChange={(e) => updateCompanyField("name", e.target.value)}
                placeholder="Company legal name"
              />
            </label>

            <label className="group-mgmt-field">
              <span>Group</span>
              <select value={companyForm.group_id} onChange={(e) => updateCompanyField("group_id", e.target.value)}>
                <option value="">No group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="group-mgmt-field">
              <span>Code</span>
              <input
                value={companyForm.code}
                onChange={(e) => updateCompanyField("code", e.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className="group-mgmt-field">
              <span>GST Number</span>
              <input
                value={companyForm.gst_number}
                onChange={(e) => updateCompanyField("gst_number", e.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className="group-mgmt-field">
              <span>Type</span>
              <select value={companyForm.type} onChange={(e) => updateCompanyField("type", e.target.value)}>
                <option value="">Select type</option>
                {COMPANY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <div className="group-mgmt-modal-actions">
              <button type="button" className="secondary" onClick={closeCompanyModal} disabled={companySaving}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleSaveCompanyEdit} disabled={companySaving}>
                {companySaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingSite && (
        <div className="group-mgmt-modal-overlay" onClick={closeSiteModal}>
          <div className="group-mgmt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Site</h3>

            {siteFormError && <div className="group-mgmt-error">{siteFormError}</div>}

            <label className="group-mgmt-field">
              <span>Company *</span>
              <select value={siteForm.company_id} onChange={(e) => updateSiteField("company_id", e.target.value)}>
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="group-mgmt-field">
              <span>Site Name *</span>
              <input
                value={siteForm.name}
                onChange={(e) => updateSiteField("name", e.target.value)}
                placeholder="e.g. Hebbal Warehouse"
              />
            </label>

            <label className="group-mgmt-field">
              <span>Address</span>
              <AddressAutocompleteInput
                value={siteForm.address}
                onChange={(val) => updateSiteField("address", val)}
                onPlaceSelected={handleSiteAddressSelected}
                placeholder="Start typing an address..."
              />
            </label>

            <label className="group-mgmt-field">
              <span>City</span>
              <input
                value={siteForm.city}
                onChange={(e) => updateSiteField("city", e.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className="group-mgmt-field">
              <span>State</span>
              <input
                value={siteForm.state}
                onChange={(e) => updateSiteField("state", e.target.value)}
                placeholder="Optional"
              />
            </label>

            <div className="group-mgmt-modal-actions">
              <button type="button" className="secondary" onClick={closeSiteModal} disabled={siteSaving}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleSaveSiteEdit} disabled={siteSaving}>
                {siteSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingSite && (
        <div className="group-mgmt-modal-overlay" onClick={closeViewModal}>
          <div className="group-mgmt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Site Details</h3>

            {viewError && <div className="group-mgmt-error">{viewError}</div>}

            {viewLoading ? (
              <div className="group-mgmt-loading">Loading site details...</div>
            ) : (
              !viewError && (
                <div className="group-mgmt-view-grid">
                  <div>
                    <span>Site Name</span>
                    <strong>{viewingSite.name || "-"}</strong>
                  </div>
                  <div>
                    <span>Company</span>
                    <strong>{viewingSite.company_name || "-"}</strong>
                  </div>
                  <div>
                    <span>Group</span>
                    <strong>{viewingSite.group_name || "-"}</strong>
                  </div>
                  <div>
                    <span>Branch</span>
                    <strong>{viewingSite.branch_name || "-"}</strong>
                  </div>
                  <div>
                    <span>Address</span>
                    <strong>{viewingSite.address || "-"}</strong>
                  </div>
                  <div>
                    <span>City</span>
                    <strong>{viewingSite.city || "-"}</strong>
                  </div>
                  <div>
                    <span>State</span>
                    <strong>{viewingSite.state || "-"}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{viewingSite.is_active ? "Active" : "Inactive"}</strong>
                  </div>
                  <div>
                    <span>Created</span>
                    <strong>{viewingSite.created_at ? formatDateTime(viewingSite.created_at) : "-"}</strong>
                  </div>
                  <div>
                    <span>Last Updated</span>
                    <strong>{viewingSite.updated_at ? formatDateTime(viewingSite.updated_at) : "-"}</strong>
                  </div>
                </div>
              )
            )}

            <div className="group-mgmt-modal-actions">
              <button type="button" className="secondary" onClick={closeViewModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        message={confirmState?.message}
        onConfirm={() => confirmState?.onConfirm?.()}
        onCancel={closeConfirm}
      />

      <StatusAlertModal status={status} onClose={() => setStatus(null)} />
    </div>
  );
}
