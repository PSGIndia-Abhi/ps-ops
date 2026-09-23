import { useEffect, useMemo, useState } from "react";
import { FiChevronDown, FiChevronRight, FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import StatusAlertModal from "../components/StatusAlertModal";
import ConfirmDialog from "../components/ConfirmDialog";
import "./AdminDepartments.css";

const emptyUnitForm = { name: "", parent_id: "", unit_type: "", branch_id: "", sort_order: "" };

// /api/branches can return a flat list or rows joined with their admins (one
// row per admin). Dedupe by id either way.
function normalizeBranches(data) {
  if (!Array.isArray(data)) return [];
  const map = new Map();
  data.forEach((row) => {
    if (!row?.id || map.has(row.id)) return;
    map.set(row.id, { id: row.id, name: row.name });
  });
  return Array.from(map.values());
}

export default function AdminDepartments() {
  const [tab, setTab] = useState("units"); // "units" | "designations"
  const [units, setUnits] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [status, setStatus] = useState(null); // null | { type, message }
  const [confirmState, setConfirmState] = useState(null); // null | { message, confirmLabel, onConfirm }

  const [collapsed, setCollapsed] = useState(() => new Set());

  const [unitModal, setUnitModal] = useState(null); // null | { mode: "add" | "edit", unit? }
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [unitFormError, setUnitFormError] = useState(null);

  const [desigModal, setDesigModal] = useState(null); // null | { mode: "add" | "edit", designation? }
  const [desigName, setDesigName] = useState("");
  const [desigError, setDesigError] = useState(null);

  const [saving, setSaving] = useState(false);

  async function loadAll() {
    try {
      setLoading(true);
      const [uRes, dRes, bRes] = await Promise.all([
        apiFetch("/api/org-units?include_inactive=1"),
        apiFetch("/api/designations?include_inactive=1"),
        apiFetch("/api/branches"),
      ]);
      if (!uRes?.ok) throw new Error((await safeJson(uRes))?.error || "Failed to load units");
      if (!dRes?.ok) throw new Error((await safeJson(dRes))?.error || "Failed to load designations");
      setUnits(await uRes.json());
      setDesignations(await dRes.json());
      // Branches are optional here (only used by the unit form), so a failure
      // to load them shouldn't block the page.
      setBranches(bRes?.ok ? normalizeBranches(await bRes.json()) : []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  /* ---------------- units tree ---------------- */

  const childrenByParent = useMemo(() => {
    const map = new Map();
    units
      .filter((u) => showInactive || u.is_active === 1)
      .forEach((u) => {
        const key = u.parent_id || "root";
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(u);
      });
    map.forEach((list) =>
      list.sort((a, b) => a.sort_order - b.sort_order || String(a.name).localeCompare(String(b.name)))
    );
    return map;
  }, [units, showInactive]);

  const rows = useMemo(() => {
    const out = [];
    const walk = (parentKey, depth) => {
      (childrenByParent.get(parentKey) || []).forEach((unit) => {
        const hasChildren = (childrenByParent.get(unit.id) || []).length > 0;
        out.push({ unit, depth, hasChildren });
        if (hasChildren && !collapsed.has(unit.id)) walk(unit.id, depth + 1);
      });
    };
    walk("root", 0);
    return out;
  }, [childrenByParent, collapsed]);

  // Everything at or below a unit — used to stop a unit being moved under itself.
  function descendantIds(unitId) {
    const result = new Set([unitId]);
    let grew = true;
    while (grew) {
      grew = false;
      units.forEach((u) => {
        if (u.parent_id && result.has(u.parent_id) && !result.has(u.id)) {
          result.add(u.id);
          grew = true;
        }
      });
    }
    return result;
  }

  const parentOptions = useMemo(() => {
    const blocked = unitModal?.mode === "edit" ? descendantIds(unitModal.unit.id) : new Set();
    const out = [];
    const walk = (parentKey, depth) => {
      (childrenByParent.get(parentKey) || []).forEach((u) => {
        if (u.is_active === 1 && !blocked.has(u.id)) out.push({ id: u.id, label: `${"— ".repeat(depth)}${u.name}` });
        walk(u.id, depth + 1);
      });
    };
    walk("root", 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childrenByParent, unitModal, units]);

  // The Type field stays free text (unit_type isn't a fixed enum — admins can
  // type anything), this just seeds the autocomplete list with "Role" so it's
  // pickable immediately instead of only appearing after someone types it once.
  const unitTypeSuggestions = useMemo(
    () => Array.from(new Set(["Role", ...units.map((u) => u.unit_type).filter(Boolean)])),
    [units]
  );

  function toggleCollapsed(id) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* ---------------- unit modal ---------------- */

  function openAddUnit(parentId) {
    setUnitModal({ mode: "add" });
    setUnitForm({ ...emptyUnitForm, parent_id: parentId || "" });
    setUnitFormError(null);
  }

  function openEditUnit(unit) {
    setUnitModal({ mode: "edit", unit });
    setUnitForm({
      name: unit.name || "",
      parent_id: unit.parent_id || "",
      unit_type: unit.unit_type || "",
      branch_id: unit.branch_id || "",
      sort_order: unit.sort_order ?? "",
    });
    setUnitFormError(null);
  }

  function closeUnitModal() {
    setUnitModal(null);
    setUnitForm(emptyUnitForm);
    setUnitFormError(null);
  }

  function updateUnitField(key, value) {
    setUnitForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveUnit() {
    const name = unitForm.name.trim();
    if (!name) return setUnitFormError("Unit name is required.");
    const isEdit = unitModal.mode === "edit";
    const isRoot = isEdit && !unitModal.unit.parent_id;
    if (!isRoot && !unitForm.parent_id) return setUnitFormError("Please choose a parent unit.");

    const body = {
      name,
      unit_type: unitForm.unit_type.trim(),
      branch_id: unitForm.branch_id || null,
    };
    if (!isRoot) body.parent_id = unitForm.parent_id;
    if (String(unitForm.sort_order).trim() !== "") body.sort_order = Number(unitForm.sort_order);

    try {
      setSaving(true);
      const res = await apiFetch(isEdit ? `/api/org-units/${unitModal.unit.id}` : "/api/org-units", {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to save unit");
      closeUnitModal();
      await loadAll();
      setStatus({ type: "success", message: `Unit "${name}" ${isEdit ? "updated" : "added"} successfully.` });
    } catch (err) {
      console.error(err);
      setUnitFormError(err.message || "Failed to save unit");
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteUnit(unit) {
    setConfirmState({
      message: `Delete "${unit.name}"? Units that still have sub-units or people can't be deleted.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await apiFetch(`/api/org-units/${unit.id}`, { method: "DELETE" });
          const data = await safeJson(res);
          if (!res?.ok) throw new Error(data?.error || "Failed to delete unit");
          await loadAll();
          setStatus({ type: "success", message: `Unit "${unit.name}" deleted successfully.` });
        } catch (err) {
          console.error(err);
          setStatus({ type: "error", message: err.message || "Failed to delete unit." });
        }
      },
    });
  }

  async function handleReactivateUnit(unit) {
    try {
      const res = await apiFetch(`/api/org-units/${unit.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: true }),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to reactivate unit");
      await loadAll();
      setStatus({ type: "success", message: `Unit "${unit.name}" reactivated.` });
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", message: err.message || "Failed to reactivate unit." });
    }
  }

  /* ---------------- designations ---------------- */

  const visibleDesignations = useMemo(
    () => designations.filter((d) => showInactive || d.is_active === 1),
    [designations, showInactive]
  );

  function openAddDesignation() {
    setDesigModal({ mode: "add" });
    setDesigName("");
    setDesigError(null);
  }

  function openEditDesignation(designation) {
    setDesigModal({ mode: "edit", designation });
    setDesigName(designation.name || "");
    setDesigError(null);
  }

  function closeDesigModal() {
    setDesigModal(null);
    setDesigName("");
    setDesigError(null);
  }

  async function handleSaveDesignation() {
    const name = desigName.trim();
    if (!name) return setDesigError("Designation name is required.");
    const isEdit = desigModal.mode === "edit";
    try {
      setSaving(true);
      const res = await apiFetch(isEdit ? `/api/designations/${desigModal.designation.id}` : "/api/designations", {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify({ name }),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to save designation");
      closeDesigModal();
      await loadAll();
      setStatus({ type: "success", message: `Designation "${name}" ${isEdit ? "updated" : "added"} successfully.` });
    } catch (err) {
      console.error(err);
      setDesigError(err.message || "Failed to save designation");
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteDesignation(designation) {
    setConfirmState({
      message: `Delete "${designation.name}"? Titles that people currently hold can't be deleted.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await apiFetch(`/api/designations/${designation.id}`, { method: "DELETE" });
          const data = await safeJson(res);
          if (!res?.ok) throw new Error(data?.error || "Failed to delete designation");
          await loadAll();
          setStatus({ type: "success", message: `Designation "${designation.name}" deleted successfully.` });
        } catch (err) {
          console.error(err);
          setStatus({ type: "error", message: err.message || "Failed to delete designation." });
        }
      },
    });
  }

  async function handleReactivateDesignation(designation) {
    try {
      const res = await apiFetch(`/api/designations/${designation.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: true }),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to reactivate designation");
      await loadAll();
      setStatus({ type: "success", message: `Designation "${designation.name}" reactivated.` });
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", message: err.message || "Failed to reactivate designation." });
    }
  }

  /* ---------------- render ---------------- */

  const hasRoot = units.some((u) => !u.parent_id && u.is_active === 1);

  return (
    <div className="dept-page">
      <div className="dept-header">
        <div>
          <h2>Departments</h2>
          <p>Set up your departments, teams and job titles. Nothing here is fixed — rename, add or move anything.</p>
        </div>
        <button
          type="button"
          className="dept-primary"
          onClick={() => (tab === "units" ? openAddUnit("") : openAddDesignation())}
          disabled={tab === "units" && !hasRoot}
        >
          <FiPlus /> {tab === "units" ? "Add Unit" : "Add Designation"}
        </button>
      </div>

      <div className="dept-tabs">
        <button type="button" className={tab === "units" ? "active" : ""} onClick={() => setTab("units")}>
          Departments &amp; Teams
        </button>
        <button type="button" className={tab === "designations" ? "active" : ""} onClick={() => setTab("designations")}>
          Designations
        </button>
        <label className="dept-toggle">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show deactivated
        </label>
      </div>

      {error && (
        <div className="dept-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {tab === "units" && (
        <div className="dept-card">
          <div className="dept-row dept-row-header dept-units-grid">
            <div>Name</div>
            <div>Type</div>
            <div>Head</div>
            <div>People</div>
            <div>Actions</div>
          </div>

          {loading ? (
            <div className="dept-empty">Loading units...</div>
          ) : rows.length === 0 ? (
            <div className="dept-empty">No units yet.</div>
          ) : (
            rows.map(({ unit, depth, hasChildren }) => (
              <div key={unit.id} className={`dept-row dept-units-grid ${unit.is_active === 1 ? "" : "inactive"}`}>
                <div className="dept-name" style={{ paddingLeft: depth * 22 }}>
                  {hasChildren ? (
                    <button type="button" className="dept-chevron" onClick={() => toggleCollapsed(unit.id)} aria-label="Toggle">
                      {collapsed.has(unit.id) ? <FiChevronRight /> : <FiChevronDown />}
                    </button>
                  ) : (
                    <span className="dept-chevron-spacer" />
                  )}
                  <span>{unit.name}</span>
                  {unit.is_active !== 1 && <span className="dept-pill muted">Deactivated</span>}
                  {unit.branch_name && <span className="dept-pill">{unit.branch_name}</span>}
                </div>
                <div className="dept-cell">{unit.unit_type || "-"}</div>
                <div className="dept-cell">{unit.heads?.length ? unit.heads.map((h) => h.name).join(", ") : "-"}</div>
                <div className="dept-cell">{unit.member_count}</div>
                <div className="dept-actions">
                  {unit.is_active === 1 ? (
                    <>
                      <button type="button" title="Add sub-unit" aria-label="Add sub-unit" onClick={() => openAddUnit(unit.id)}>
                        <FiPlus />
                      </button>
                      <button type="button" className="edit" title="Edit" aria-label="Edit" onClick={() => openEditUnit(unit)}>
                        <FiEdit2 />
                      </button>
                      {unit.parent_id && (
                        <button type="button" className="delete" title="Delete" aria-label="Delete" onClick={() => handleDeleteUnit(unit)}>
                          <FiTrash2 />
                        </button>
                      )}
                    </>
                  ) : (
                    <button type="button" className="text" onClick={() => handleReactivateUnit(unit)}>
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "designations" && (
        <div className="dept-card">
          <div className="dept-row dept-row-header dept-desig-grid">
            <div>Title</div>
            <div>People holding it</div>
            <div>Status</div>
            <div>Actions</div>
          </div>

          {loading ? (
            <div className="dept-empty">Loading designations...</div>
          ) : visibleDesignations.length === 0 ? (
            <div className="dept-empty">No designations yet.</div>
          ) : (
            visibleDesignations.map((d) => (
              <div key={d.id} className={`dept-row dept-desig-grid ${d.is_active === 1 ? "" : "inactive"}`}>
                <div className="dept-name">{d.name}</div>
                <div className="dept-cell">{d.in_use}</div>
                <div className="dept-cell">{d.is_active === 1 ? "Active" : "Deactivated"}</div>
                <div className="dept-actions">
                  {d.is_active === 1 ? (
                    <>
                      <button type="button" className="edit" title="Rename" aria-label="Rename" onClick={() => openEditDesignation(d)}>
                        <FiEdit2 />
                      </button>
                      <button type="button" className="delete" title="Delete" aria-label="Delete" onClick={() => handleDeleteDesignation(d)}>
                        <FiTrash2 />
                      </button>
                    </>
                  ) : (
                    <button type="button" className="text" onClick={() => handleReactivateDesignation(d)}>
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {unitModal && (
        <div className="dept-modal-overlay" onClick={closeUnitModal}>
          <div className="dept-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{unitModal.mode === "edit" ? "Edit Unit" : "Add Unit"}</h3>

            {unitFormError && (
              <div className="dept-error">
                <span>{unitFormError}</span>
                <button type="button" onClick={() => setUnitFormError(null)} aria-label="Dismiss">
                  ×
                </button>
              </div>
            )}

            <label className="dept-field">
              <span>Name *</span>
              <input value={unitForm.name} onChange={(e) => updateUnitField("name", e.target.value)} placeholder="e.g. Collection" />
            </label>

            {!(unitModal.mode === "edit" && !unitModal.unit.parent_id) && (
              <label className="dept-field">
                <span>Parent unit *</span>
                <select value={unitForm.parent_id} onChange={(e) => updateUnitField("parent_id", e.target.value)}>
                  <option value="">Select parent unit</option>
                  {parentOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="dept-field">
              <span>Type</span>
              <input
                list="dept-unit-types"
                value={unitForm.unit_type}
                onChange={(e) => updateUnitField("unit_type", e.target.value)}
                placeholder="e.g. Department, Team, Section"
              />
              <datalist id="dept-unit-types">
                {unitTypeSuggestions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>

            <label className="dept-field">
              <span>Branch (optional)</span>
              <select value={unitForm.branch_id} onChange={(e) => updateUnitField("branch_id", e.target.value)}>
                <option value="">No branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="dept-field">
              <span>Display order (optional)</span>
              <input
                type="number"
                value={unitForm.sort_order}
                onChange={(e) => updateUnitField("sort_order", e.target.value)}
                placeholder="Lower numbers show first"
              />
            </label>

            <div className="dept-modal-actions">
              <button type="button" className="secondary" onClick={closeUnitModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleSaveUnit} disabled={saving}>
                {saving ? "Saving..." : unitModal.mode === "edit" ? "Save Changes" : "Add Unit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {desigModal && (
        <div className="dept-modal-overlay" onClick={closeDesigModal}>
          <div className="dept-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{desigModal.mode === "edit" ? "Rename Designation" : "Add Designation"}</h3>

            {desigError && (
              <div className="dept-error">
                <span>{desigError}</span>
                <button type="button" onClick={() => setDesigError(null)} aria-label="Dismiss">
                  ×
                </button>
              </div>
            )}

            <label className="dept-field">
              <span>Title *</span>
              <input value={desigName} onChange={(e) => setDesigName(e.target.value)} placeholder="e.g. Service Coordinator" />
            </label>

            <div className="dept-modal-actions">
              <button type="button" className="secondary" onClick={closeDesigModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleSaveDesignation} disabled={saving}>
                {saving ? "Saving..." : desigModal.mode === "edit" ? "Save Changes" : "Add Designation"}
              </button>
            </div>
          </div>
        </div>
      )}

      <StatusAlertModal status={status} onClose={() => setStatus(null)} />

      <ConfirmDialog
        open={Boolean(confirmState)}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={() => confirmState?.onConfirm?.()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
