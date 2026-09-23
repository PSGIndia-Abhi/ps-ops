import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiBriefcase,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiChevronsDown,
  FiChevronsUp,
  FiClipboard,
  FiCopy,
  FiEdit2,
  FiInfo,
  FiLayers,
  FiMail,
  FiMapPin,
  FiMoreVertical,
  FiPhone,
  FiPlus,
  FiSearch,
  FiTag,
  FiUser,
  FiUserCheck,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import StatusAlertModal from "../components/StatusAlertModal";
import ConfirmDialog from "../components/ConfirmDialog";
import "./AdminUserHierarchy.css";

const AVATAR_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#d97706", "#dc2626", "#059669", "#db2777", "#4f46e5"];

function colorFor(id) {
  return AVATAR_COLORS[Math.abs(Number(id) || 0) % AVATAR_COLORS.length];
}

function capitalize(text) {
  const s = String(text || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

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

function personMatches(person, term) {
  return [person.name, person.email, person.designation, person.role]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term));
}

// Keep only the units/people matching the search. A unit whose own name
// matches keeps everyone in it.
function filterUnit(unit, term) {
  if (!term) return unit;
  const unitMatches = String(unit.name).toLowerCase().includes(term);
  const members = unitMatches ? unit.members : unit.members.filter((m) => personMatches(m, term));
  const children = unit.children.map((c) => filterUnit(c, term)).filter(Boolean);
  if (!unitMatches && members.length === 0 && children.length === 0) return null;
  return { ...unit, members, children };
}

// Every direct + indirect report under a forest node (not counting the
// person themselves) — the count badge on a person-header row.
function countDescendants(node) {
  return node.children.length + node.children.reduce((sum, c) => sum + countDescendants(c), 0);
}

function countPeople(unit) {
  return unit.members.length + unit.children.reduce((sum, c) => sum + countPeople(c), 0);
}

// Nest a unit's members under their primary manager when that manager is in
// the same unit. Reporting loops are allowed (e.g. Operation Head <-> Quality
// Head), so members caught in a loop are never anyone's root by themselves —
// any member not reached from a normal root is promoted to a root, which
// breaks the loop for display instead of hiding them.
function buildForest(members) {
  const inUnit = new Map(members.map((m) => [m.user_id, m]));
  const childrenOf = new Map();
  const roots = [];
  members.forEach((m) => {
    const parent = m.primary_manager_id != null && inUnit.has(m.primary_manager_id) && m.primary_manager_id !== m.user_id
      ? m.primary_manager_id
      : null;
    if (parent === null) roots.push(m);
    else {
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent).push(m);
    }
  });

  const visited = new Set();
  const nodeFor = (member) => {
    visited.add(member.user_id);
    const kids = (childrenOf.get(member.user_id) || []).filter((k) => !visited.has(k.user_id));
    return { member, children: kids.map(nodeFor) };
  };

  const forest = roots.map(nodeFor);
  members.forEach((m) => {
    if (!visited.has(m.user_id)) forest.push(nodeFor(m));
  });
  return forest;
}

function flattenUnits(units, depth = 0, out = []) {
  units.forEach((u) => {
    out.push({ id: u.id, name: u.name, depth });
    flattenUnits(u.children, depth + 1, out);
  });
  return out;
}

// Units in tree order, each with its (filtered) members — the manager picker's groups.
function flattenUnitGroups(units, out = []) {
  units.forEach((u) => {
    out.push({ key: u.id, name: u.name, unit_type: u.unit_type, members: u.members });
    flattenUnitGroups(u.children, out);
  });
  return out;
}

// Units typed as "Role" (job titles modeled as units — e.g. "Supervisor",
// "Tech Lead") get a distinct icon from ordinary departments/teams, so the
// two read as different kinds of node in the tree at a glance.
function UnitIcon({ unitType }) {
  return String(unitType || "").trim().toLowerCase() === "role" ? <FiTag /> : <FiBriefcase />;
}

// Every collapsible row in the whole tree — units AND the person-header rows
// (a manager whose reports are nested under them) — so "Collapse All" folds
// both kinds, not just units.
function collectExpandableIds(units, out = []) {
  const walkForest = (nodes) => {
    nodes.forEach((node) => {
      if (node.children.length) {
        out.push(node.member.user_id);
        walkForest(node.children);
      }
    });
  };
  units.forEach((u) => {
    if (u.children.length || u.members.length) out.push(u.id);
    walkForest(buildForest(u.members));
    collectExpandableIds(u.children, out);
  });
  return out;
}

const emptyForm = {
  // Only used when creating a new person:
  name: "", email: "", phone: "", password: "", roleId: "", branchId: "",
  // Used for both creating and editing:
  unitId: "", designationId: "", isHead: false, managers: [], from: "", to: "",
};

function formFromDetail(detail) {
  return {
    ...emptyForm,
    unitId: detail.unit?.id || "",
    designationId: detail.designation?.id || "",
    isHead: Boolean(detail.is_head),
    managers: detail.managers.map((m) => ({ id: m.manager_user_id, primary: Boolean(m.is_primary) })),
    from: todayLocal(),
    to: "",
  };
}

function randomPassword() {
  // Not a security boundary — just a sane default the admin can see, share and
  // change. Length 10, mixed case + digits, no ambiguous characters.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const DETAIL_TABS = [
  { key: "details", label: "Details" },
  { key: "hierarchy", label: "Hierarchy" },
  { key: "roles", label: "Roles" },
  { key: "teams", label: "Teams" },
  { key: "tasks", label: "Tasks" },
];

const DRAWER_TABS_EDIT = [
  { key: "hierarchy", label: "Hierarchy" },
  { key: "roles", label: "Roles" },
  { key: "departments", label: "Departments" },
  { key: "info", label: "Additional Info" },
];

// Creating a person: role/branch/credentials are their own always-visible
// section (there's no existing "Roles" or "Additional Info" to show yet).
const DRAWER_TABS_CREATE = [
  { key: "departments", label: "Departments" },
  { key: "hierarchy", label: "Hierarchy" },
];

function Avatar({ id, name, size = "" }) {
  return (
    <span className={`uh-avatar ${size}`} style={{ background: colorFor(id) }}>
      {initials(name)}
    </span>
  );
}

export default function AdminUserHierarchy() {
  const navigate = useNavigate();
  const [tree, setTree] = useState({ units: [], unassigned: [] });
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());
  // The open ⋮ menu: which row, and where it floats. It's positioned with
  // `position: fixed` (from the button's screen position) so the scrolling
  // tree can't clip it on the last rows.
  const [menu, setMenu] = useState(null); // null | { key, top, right }

  const [selectedId, setSelectedId] = useState(null);
  const [loadedDetail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailTab, setDetailTab] = useState("hierarchy");
  const detailRequest = useRef(0);
  // Which drawer session has already scrolled its chosen manager into view.
  const scrolledFor = useRef(null);

  // Only ever expose details that belong to the person currently selected.
  // Details load asynchronously; without this, quickly selecting A then B can
  // leave A's details on screen under B's highlight, and "Assign / Update"
  // would then build its form from A but save it to B.
  const detail = loadedDetail && loadedDetail.user.id === selectedId ? loadedDetail : null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("edit"); // "edit" an existing person | "create" a new one
  const [drawerTab, setDrawerTab] = useState("hierarchy");
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [formFor, setFormFor] = useState(null); // whose details the form was built from
  const [managerSearch, setManagerSearch] = useState("");
  const [groupCollapsed, setGroupCollapsed] = useState(() => new Set());
  const [drawerError, setDrawerError] = useState(null);
  const [saving, setSaving] = useState(false);
  // Set once a new account is created; shown in place of the create form so
  // the one-time password isn't lost in a toast that auto-dismisses in 3s.
  const [createdAccount, setCreatedAccount] = useState(null); // null | { name, email, password, placementError }

  const [status, setStatus] = useState(null);
  const [confirmState, setConfirmState] = useState(null); // loop confirmation

  const loadTree = useCallback(async () => {
    try {
      const [tRes, dRes] = await Promise.all([apiFetch("/api/hierarchy/tree"), apiFetch("/api/designations")]);
      if (!tRes?.ok) throw new Error((await safeJson(tRes))?.error || "Failed to load hierarchy");
      setTree(await tRes.json());
      setDesignations(dRes?.ok ? await dRes.json() : []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load hierarchy");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    // A newer selection (or refresh) supersedes this one: a slow, older
    // response must not overwrite a newer one that already arrived.
    const requestId = ++detailRequest.current;
    const isLatest = () => requestId === detailRequest.current;
    try {
      setDetailLoading(true);
      const res = await apiFetch(`/api/users/${id}/hierarchy`);
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to load details");
      if (isLatest()) {
        setDetail(data);
        setDetailError(null);
      }
      return data;
    } catch (err) {
      console.error(err);
      if (isLatest()) {
        setDetail(null);
        setDetailError(err.message || "Failed to load details");
      }
      return null;
    } finally {
      if (isLatest()) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Close an open ⋮ menu on any outside click, or when anything scrolls (a
  // fixed-position menu would otherwise drift away from its row).
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  // Build the drawer's form from the person's details once they've loaded.
  // (Adjusting state during render, guarded by formFor, so there's no effect
  // and no flash of an empty form.) Only in "edit" mode — in "create" mode the
  // form is whatever the admin is typing, and `detail` may still hold some
  // other, previously-selected person's data.
  if (drawerOpen && drawerMode === "edit" && detail && formFor !== detail.user.id) {
    setFormFor(detail.user.id);
    setForm(formFromDetail(detail));
  }

  /* ---------------- derived data ---------------- */

  const allUnits = useMemo(() => flattenUnits(tree.units), [tree.units]);

  // Everyone we know about, keyed by id (people in a unit + people without one).
  const people = useMemo(() => {
    const map = new Map();
    const walk = (units) =>
      units.forEach((u) => {
        u.members.forEach((m) => map.set(m.user_id, { ...m, unit_name: u.name }));
        walk(u.children);
      });
    walk(tree.units);
    tree.unassigned.forEach((u) => map.set(u.user_id, { ...u, unit_name: null, designation: null, is_head: 0 }));
    return map;
  }, [tree]);

  // Summary cards. Nothing here names a specific role or department: the two
  // biggest roles are whichever roles actually have the most people.
  const statCards = useMemo(() => {
    const everyone = Array.from(people.values());
    const roleCounts = new Map();
    everyone.forEach((p) => {
      const role = p.role || "No role";
      roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
    });
    const byCount = Array.from(roleCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const topRoles = byCount.slice(0, 2);
    const otherPeople = byCount.slice(2).reduce((sum, [, n]) => sum + n, 0);
    const root = tree.units[0];

    const cards = [
      { key: "total", label: "Total Users", value: everyone.length, icon: <FiUsers />, tone: "blue" },
      { key: "depts", label: "Departments", value: root ? root.children.length : tree.units.length, icon: <FiLayers />, tone: "indigo" },
      { key: "mgrs", label: "Managers", value: everyone.filter((p) => p.report_count > 0).length, icon: <FiUserCheck />, tone: "green" },
    ];
    const tones = ["purple", "orange"];
    topRoles.forEach(([role, count], i) => {
      cards.push({ key: `role-${role}`, label: capitalize(role), value: count, icon: <FiUser />, tone: tones[i] });
    });
    cards.push({ key: "other", label: "Other Roles", value: otherPeople, icon: <FiUsers />, tone: "teal" });
    return cards;
  }, [people, tree.units]);

  const term = search.trim().toLowerCase();
  const visibleUnits = useMemo(
    () => tree.units.map((u) => filterUnit(u, term)).filter(Boolean),
    [tree.units, term]
  );
  const visibleUnassigned = useMemo(
    () => (term ? tree.unassigned.filter((u) => personMatches(u, term)) : tree.unassigned),
    [tree.unassigned, term]
  );

  function toggleCollapsed(id) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(key) {
    setGroupCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectPerson(id) {
    setSelectedId(id);
  }

  /* ---------------- drawer ---------------- */

  // Roles and branches are only needed by the "create person" form, so load
  // them the first time it opens rather than on every page load.
  async function loadLookups() {
    try {
      const [rRes, bRes] = await Promise.all([apiFetch("/api/roles"), apiFetch("/api/branches")]);
      if (rRes?.ok) {
        const data = await rRes.json();
        setRoles(Array.isArray(data) ? data : []);
      }
      if (bRes?.ok) {
        const list = normalizeBranches(await bRes.json());
        setBranches(list);
        // Only one branch exists in most setups — pick it so the admin isn't
        // forced through a single-option dropdown just to submit the form.
        if (list.length === 1) {
          setForm((p) => (p.branchId ? p : { ...p, branchId: list[0].id }));
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  const assignableRoles = useMemo(
    () => roles.filter((r) => !["admin", "super_admin", "system"].includes(String(r.name || "").toLowerCase())),
    [roles]
  );

  function openDrawerFor(id) {
    setDrawerMode("edit");
    if (id !== selectedId) setSelectedId(id);
    setDrawerTab("hierarchy");
    setManagerSearch("");
    setDrawerError(null);
    setFormFor(null); // forces the form to be rebuilt from fresh details
    scrolledFor.current = null;
    setDrawerOpen(true);
  }

  // Creating a person isn't tied to a headcount: any unit, any designation, as
  // many people as needed. `unitId` pre-fills the unit when opened from a
  // unit row's "+". `managerId` additionally pre-fills the reporting manager
  // when opened from a person-header row's "+" (adding someone who reports
  // to that person).
  function openCreateDrawer(unitId = "", managerId = null) {
    setDrawerMode("create");
    setForm({
      ...emptyForm,
      unitId,
      managers: managerId ? [{ id: managerId, primary: true }] : [],
      from: todayLocal(),
      password: randomPassword(),
      branchId: branches.length === 1 ? branches[0].id : "",
    });
    setFormFor(null);
    setManagerSearch("");
    setDrawerError(null);
    setDrawerTab("departments");
    setCreatedAccount(null);
    scrolledFor.current = null;
    setDrawerOpen(true);
    if (roles.length === 0) loadLookups();
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerError(null);
    setFormFor(null);
    setCreatedAccount(null);
    scrolledFor.current = null;
  }

  function toggleManager(id) {
    setForm((prev) => {
      const exists = prev.managers.some((m) => m.id === id);
      let managers = exists ? prev.managers.filter((m) => m.id !== id) : [...prev.managers, { id, primary: false }];
      if (managers.length && !managers.some((m) => m.primary)) {
        managers = managers.map((m, i) => ({ ...m, primary: i === 0 }));
      }
      return { ...prev, managers };
    });
  }

  function setPrimary(id) {
    setForm((prev) => ({ ...prev, managers: prev.managers.map((m) => ({ ...m, primary: m.id === id })) }));
  }

  // The manager picker: everyone except the person being edited, grouped by
  // their unit (people with no unit last), narrowed by the search box.
  const managerGroups = useMemo(() => {
    const q = managerSearch.trim().toLowerCase();
    // A brand-new person has no id yet, so there's no one to exclude in create mode.
    const excludeId = drawerMode === "edit" ? detail?.user.id : null;
    const keep = (p) => p.user_id !== excludeId && (!q || personMatches(p, q) || String(p.unit_name || "").toLowerCase().includes(q));
    const groups = flattenUnitGroups(tree.units).map((g) => ({
      ...g,
      members: g.members.map((m) => ({ ...m, unit_name: g.name })).filter(keep),
    }));
    groups.push({
      key: "no-unit",
      name: "No unit",
      members: tree.unassigned.map((u) => ({ ...u, unit_name: null, designation: null })).filter(keep),
    });
    return groups.filter((g) => g.members.length > 0);
  }, [tree, managerSearch, detail, drawerMode]);

  async function saveHierarchy(confirmLoop = false) {
    if (!detail || formFor !== detail.user.id) return;
    // The person these details (and so this form) belong to — never whoever
    // happens to be selected by the time the requests go out.
    const personId = detail.user.id;
    if (!form.from) return setDrawerError("Effective from date is required.");
    if (form.to && form.to < form.from) return setDrawerError("Effective to cannot be before effective from.");

    const originalManagers = detail.managers.map((m) => m.manager_user_id).sort((a, b) => a - b);
    const originalPrimary = detail.managers.find((m) => m.is_primary)?.manager_user_id ?? null;
    const nextManagers = form.managers.map((m) => m.id).sort((a, b) => a - b);
    const nextPrimary = form.managers.find((m) => m.primary)?.id ?? null;
    const managersChanged =
      JSON.stringify(originalManagers) !== JSON.stringify(nextManagers) || originalPrimary !== nextPrimary;
    const unitChanged =
      (form.unitId || "") !== (detail.unit?.id || "") ||
      (form.designationId || "") !== (detail.designation?.id || "") ||
      Boolean(form.isHead) !== Boolean(detail.is_head);

    if (!managersChanged && !unitChanged) return setDrawerError("There are no changes to save.");

    try {
      setSaving(true);
      setDrawerError(null);

      // Reporting lines first: a loop needs the admin's confirmation, and we
      // don't want half the change applied while they decide.
      if (managersChanged) {
        const res = await apiFetch(`/api/users/${personId}/reporting-lines`, {
          method: "PUT",
          body: JSON.stringify({
            managers: form.managers.map((m) => ({ manager_user_id: m.id, is_primary: m.primary })),
            effective_from: form.from,
            effective_to: form.to || undefined,
            confirm_loop: confirmLoop || undefined,
          }),
        });
        const data = await safeJson(res);
        if (res?.status === 409 && data?.code === "LOOP") {
          const cycle = (data.loops?.[0]?.path || []).map((p) => p.name || `#${p.id}`).join(" → ");
          setConfirmState({
            title: "Reporting loop",
            message: `This makes these people report to each other in a loop: ${cycle}. Loops are allowed (for example Operation Head ⇄ Quality Head), but please make sure this is intended. Continue?`,
            confirmLabel: "Create loop",
          });
          return;
        }
        if (!res?.ok) throw new Error(data?.error || "Failed to update reporting lines");
      }

      if (unitChanged) {
        const res = await apiFetch(`/api/users/${personId}/org-unit`, {
          method: "PUT",
          body: JSON.stringify({
            org_unit_id: form.unitId || null,
            designation_id: form.designationId || null,
            is_head: form.isHead,
            effective_from: form.from,
            effective_to: form.to || undefined,
          }),
        });
        const data = await safeJson(res);
        if (!res?.ok) {
          await Promise.all([loadTree(), loadDetail(personId)]);
          throw new Error(
            `${managersChanged ? "Reporting lines were saved, but the unit change failed: " : ""}${data?.error || "Failed to update unit"}`
          );
        }
      }

      closeDrawer();
      await Promise.all([loadTree(), loadDetail(personId)]);
      setStatus({ type: "success", message: `Hierarchy updated for ${detail.user.name}.` });
    } catch (err) {
      console.error(err);
      setDrawerError(err.message || "Failed to update hierarchy");
    } finally {
      setSaving(false);
    }
  }

  // Creates the person through the same POST /api/users the User Management
  // page uses (real credentials, active immediately) — this does not add a
  // second, parallel way to create a user. Placement (unit + managers) is a
  // second step against the same endpoints saveHierarchy uses, so if it fails
  // the account still exists and the admin can finish placement from the
  // person's own "Assign / Update".
  async function saveNewPerson() {
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name) return setDrawerError("Name is required.");
    if (!email) return setDrawerError("Email is required.");
    if (form.password.length < 6) return setDrawerError("Password must be at least 6 characters.");
    if (!form.roleId) return setDrawerError("Please choose a role.");
    if (!form.branchId) return setDrawerError("Please choose a branch.");
    if ((form.designationId || form.isHead) && !form.unitId) {
      return setDrawerError("Choose a department/team to go with the designation.");
    }
    if (!form.from) return setDrawerError("Effective from date is required.");
    if (form.to && form.to < form.from) return setDrawerError("Effective to cannot be before effective from.");

    try {
      setSaving(true);
      setDrawerError(null);

      const res = await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          phone: form.phone.trim() || undefined,
          password: form.password,
          role_id: form.roleId,
          branch_id: form.branchId,
        }),
      });
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to create the account");
      const newId = data.user.id;

      // A brand-new person has no existing reporting lines, so assigning
      // managers here can never create a loop — unlike saveHierarchy, no
      // confirm_loop round trip is needed.
      let placementError = null;
      try {
        if (form.unitId) {
          const uRes = await apiFetch(`/api/users/${newId}/org-unit`, {
            method: "PUT",
            body: JSON.stringify({
              org_unit_id: form.unitId,
              designation_id: form.designationId || null,
              is_head: form.isHead,
              effective_from: form.from,
              effective_to: form.to || undefined,
            }),
          });
          if (!uRes?.ok) throw new Error((await safeJson(uRes))?.error || "Failed to set the department");
        }
        if (form.managers.length) {
          const lRes = await apiFetch(`/api/users/${newId}/reporting-lines`, {
            method: "PUT",
            body: JSON.stringify({
              managers: form.managers.map((m) => ({ manager_user_id: m.id, is_primary: m.primary })),
              effective_from: form.from,
              effective_to: form.to || undefined,
            }),
          });
          if (!lRes?.ok) throw new Error((await safeJson(lRes))?.error || "Failed to set the manager");
        }
      } catch (err) {
        placementError = err.message;
      }

      await loadTree();
      setSelectedId(newId);
      // Stay in the drawer and show the credentials — closing now and relying
      // on the (auto-dismissing) toast would risk losing the one-time password.
      setCreatedAccount({ name, email, password: form.password, placementError });
    } catch (err) {
      console.error(err);
      setDrawerError(err.message || "Failed to create the account");
    } finally {
      setSaving(false);
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ type: "success", message: "Copied to clipboard." });
    } catch (err) {
      console.error(err);
    }
  }

  /* ---------------- render helpers ---------------- */

  function renderKebab(key, items) {
    return (
      <div className="uh-kebab-wrap">
        <button
          type="button"
          className="uh-kebab"
          aria-label="More actions"
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setMenu((current) =>
              current?.key === key ? null : { key, top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) }
            );
          }}
        >
          <FiMoreVertical />
        </button>
        {menu?.key === key && (
          <div className="uh-menu" style={{ top: menu.top, right: menu.right }} onClick={(e) => e.stopPropagation()}>
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setMenu(null);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderPerson(node, unitId) {
    const { member, children } = node;
    const key = `p-${member.user_id}`;
    const kebabItems = [
      { label: "View details", onClick: () => selectPerson(member.user_id) },
      { label: "Assign / Update", onClick: () => openDrawerFor(member.user_id) },
    ];

    // A manager (has 1+ direct reports nested under them): show their row the
    // same way a unit row looks — bold label, chevron to fold/unfold their
    // team, a count of everyone under them, and a "+" that adds a new person
    // reporting straight to them. Reporting-line nesting itself is unchanged;
    // only people WITH reports get this treatment, leaves keep the plain row.
    if (children.length > 0) {
      const isCollapsed = !term && collapsed.has(member.user_id);
      return (
        <div key={member.user_id}>
          <div className="uh-unit-head">
            <button type="button" className="uh-unit-toggle" onClick={() => toggleCollapsed(member.user_id)}>
              {isCollapsed ? <FiChevronRight /> : <FiChevronDown />}
              <Avatar id={member.user_id} name={member.name} />
              <span className="uh-person-name">{member.name}</span>
              <span className="uh-person-title">{member.designation || member.role || "No designation"}</span>
              {member.is_head === 1 && <span className="uh-badge head">Head</span>}
            </button>
            <span className="uh-count">{countDescendants(node)}</span>
            <button
              type="button"
              className="uh-unit-add"
              title={`Add someone reporting to ${member.name}`}
              aria-label={`Add someone reporting to ${member.name}`}
              onClick={() => openCreateDrawer(unitId, member.user_id)}
            >
              <FiPlus />
            </button>
            {renderKebab(key, kebabItems)}
          </div>
          {!isCollapsed && <div className="uh-nest">{children.map((child) => renderPerson(child, unitId))}</div>}
        </div>
      );
    }

    return (
      <div key={member.user_id}>
        <div
          className={`uh-person ${selectedId === member.user_id ? "selected" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => selectPerson(member.user_id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") selectPerson(member.user_id);
          }}
        >
          <Avatar id={member.user_id} name={member.name} />
          <span className="uh-person-name">{member.name}</span>
          <span className="uh-person-title">{member.designation || member.role || "No designation"}</span>
          {member.is_head === 1 && <span className="uh-badge head">Head</span>}
          {member.manager_count > 1 && <span className="uh-badge">+{member.manager_count - 1} manager</span>}
          {renderKebab(key, kebabItems)}
        </div>
      </div>
    );
  }

  function renderUnit(unit, depth) {
    const isCollapsed = !term && collapsed.has(unit.id);
    const forest = buildForest(unit.members);
    return (
      <div key={unit.id} className="uh-unit">
        <div className={`uh-unit-head ${depth === 0 ? "root" : ""}`}>
          <button type="button" className="uh-unit-toggle" onClick={() => toggleCollapsed(unit.id)}>
            {isCollapsed ? <FiChevronRight /> : <FiChevronDown />}
            <span className="uh-unit-icon">
              <UnitIcon unitType={unit.unit_type} />
            </span>
            <span className="uh-unit-name">{unit.name}</span>
          </button>
          <span className="uh-count">{countPeople(unit)}</span>
          <button
            type="button"
            className="uh-unit-add"
            title={`Add a person to ${unit.name}`}
            aria-label={`Add a person to ${unit.name}`}
            onClick={() => openCreateDrawer(unit.id)}
          >
            <FiPlus />
          </button>
          {renderKebab(`u-${unit.id}`, [{ label: "Manage departments", onClick: () => navigate("/admin/departments") }])}
        </div>
        {!isCollapsed && (
          <div className="uh-nest">
            {forest.map((node) => renderPerson(node, unit.id))}
            {unit.children.map((child) => renderUnit(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  const today = todayLocal();
  const lineState = (line) => {
    if (line.effective_from > today) return "Scheduled";
    if (line.effective_to && line.effective_to < today) return "Ended";
    return "Current";
  };

  const activeDesignations = designations.filter((d) => d.is_active === 1);

  function personCard(item, onClick, badge) {
    return (
      <button key={item.key} type="button" className="uh-link-row" onClick={onClick}>
        <Avatar id={item.id} name={item.name} />
        <span className="uh-person-text">
          <span className="uh-person-name">{item.name}</span>
          <span className="uh-person-sub">{item.sub || "—"}</span>
        </span>
        {badge}
      </button>
    );
  }

  function renderDetailTab() {
    if (!detail) return null;
    const primary = detail.managers.find((m) => m.is_primary === 1) || detail.managers[0];
    const managerIds = new Set(detail.managers.map((m) => m.manager_user_id));
    const upTheChain = detail.chain.filter((c) => !managerIds.has(c.id));

    if (detailTab === "details") {
      const rows = [
        ["Full name", detail.user.name],
        ["Email", detail.user.email],
        ["Phone", detail.user.phone],
        ["Role", detail.user.role],
        ["Branch", detail.user.branch_name],
        ["Status", detail.user.is_active ? "Active" : "Inactive"],
        ["Department / team", detail.unit?.name],
        ["Designation", detail.designation?.name],
        ["Head of unit", detail.is_head === 1 ? "Yes" : "No"],
      ];
      return (
        <div className="uh-fact-grid">
          {rows.map(([label, value]) => (
            <div key={label} className="uh-fact">
              <span>{label}</span>
              <strong>{value || "—"}</strong>
            </div>
          ))}
        </div>
      );
    }

    if (detailTab === "roles") {
      return (
        <div className="uh-tab-body">
          <div className="uh-block">
            <h4>Role</h4>
            <span className="uh-badge head big">{detail.user.role || "No role"}</span>
          </div>
          <div className="uh-muted">
            A role controls what someone is allowed to do. It is separate from where they sit in the hierarchy, and is
            changed from User Management.
          </div>
        </div>
      );
    }

    if (detailTab === "teams") {
      return (
        <div className="uh-tab-body">
          <div className="uh-block">
            <h4>
              Direct reports <span className="uh-count">{detail.direct_reports.length}</span>
            </h4>
            {detail.direct_reports.length === 0 ? (
              <div className="uh-muted">No one reports to this person.</div>
            ) : (
              detail.direct_reports.map((r) =>
                personCard(
                  { key: r.line_id, id: r.user_id, name: r.name, sub: [r.designation, r.unit_name].filter(Boolean).join(" · ") },
                  () => selectPerson(r.user_id)
                )
              )
            )}
          </div>
          <div className="uh-muted">{detail.team_count} {detail.team_count === 1 ? "person" : "people"} in the whole team, counting everyone below.</div>
        </div>
      );
    }

    if (detailTab === "tasks") {
      return (
        <div className="uh-empty-state">
          <FiClipboard />
          <strong>No tasks yet</strong>
          <span>Tasks assigned to this person will appear here once Task Management is available.</span>
        </div>
      );
    }

    // hierarchy
    return (
      <div className="uh-tab-body">
        <div className="uh-timeline">
          <div className="uh-block">
            <h4>Reports to</h4>
            {detail.managers.length === 0 ? (
              <div className="uh-muted">No manager assigned.</div>
            ) : (
              detail.managers.map((m) =>
                personCard(
                  { key: m.line_id, id: m.manager_user_id, name: m.name, sub: [m.designation, m.unit_name].filter(Boolean).join(" · ") },
                  () => selectPerson(m.manager_user_id),
                  m.is_primary === 1 ? <span className="uh-badge head">Primary</span> : null
                )
              )
            )}
          </div>

          {upTheChain.length > 0 && (
            <div className="uh-block">
              <h4>Chain of command</h4>
              <div className="uh-crumbs">
                {upTheChain.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && " › "}
                    <button type="button" className="uh-inline-link" onClick={() => selectPerson(c.id)}>
                      {c.name}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="uh-block">
            <h4>Department</h4>
            <div className="uh-box">
              {detail.unit ? (
                <>
                  <strong>{detail.unit.name}</strong>
                  <span className="uh-muted">{detail.unit.path.map((p) => p.name).join(" › ")}</span>
                </>
              ) : (
                <span className="uh-muted">Not assigned to a unit yet.</span>
              )}
            </div>
          </div>

          <div className="uh-block">
            <h4>Location</h4>
            <div className="uh-box">
              <strong>{detail.user.branch_name || "—"}</strong>
            </div>
          </div>

          <div className="uh-block">
            <h4>
              Direct reports <span className="uh-count">{detail.direct_reports.length}</span>
              {detail.team_count > 0 && <span className="uh-muted"> · {detail.team_count} in the whole team</span>}
            </h4>
            {detail.direct_reports.length === 0 ? (
              <div className="uh-muted">No one reports to this person.</div>
            ) : (
              detail.direct_reports.map((r) =>
                personCard(
                  { key: r.line_id, id: r.user_id, name: r.name, sub: [r.designation, r.unit_name].filter(Boolean).join(" · ") },
                  () => selectPerson(r.user_id)
                )
              )
            )}
          </div>

          <div className="uh-block">
            <h4>Reporting history</h4>
            {detail.line_history.length === 0 ? (
              <div className="uh-muted">No history yet.</div>
            ) : (
              detail.line_history.map((h) => (
                <div key={h.line_id} className="uh-history-row">
                  <span>{h.name}</span>
                  <span className="uh-muted">
                    {h.effective_from} → {h.effective_to || "present"}
                  </span>
                  <span className={`uh-badge ${lineState(h) === "Current" ? "ok" : ""}`}>{lineState(h)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="uh-summary">
          <FiUsers />
          <span>
            <strong>{detail.user.name}</strong>{" "}
            {detail.unit ? `is part of the ${detail.unit.name} team` : "is not assigned to a unit yet"}
            {primary ? ` and reports to ${primary.name}.` : detail.unit ? " and does not report to anyone yet." : "."}
          </span>
        </div>
      </div>
    );
  }

  const drawerReady = drawerMode === "create" || Boolean(detail && formFor === detail.user.id);
  const drawerTabs = drawerMode === "create" ? DRAWER_TABS_CREATE : DRAWER_TABS_EDIT;

  return (
    <div className="uh-page">
      <div className="uh-header">
        <div>
          <h2>User Hierarchy</h2>
          <p>Manage reporting structure and team assignments</p>
        </div>
        <div className="uh-header-actions">
          <button type="button" className="uh-add-person" onClick={() => openCreateDrawer("")}>
            <FiPlus /> Add Person
          </button>
          <button type="button" onClick={() => setCollapsed(new Set())}>
            <FiChevronsDown /> Expand All
          </button>
          <button type="button" onClick={() => setCollapsed(new Set(collectExpandableIds(tree.units)))}>
            <FiChevronsUp /> Collapse All
          </button>
        </div>
      </div>

      {error && (
        <div className="uh-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className="uh-stats">
        {statCards.map((card) => (
          <div key={card.key} className="uh-stat">
            <span className={`uh-stat-icon ${card.tone}`}>{card.icon}</span>
            <div className="uh-stat-text">
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="uh-layout">
        <section className="uh-panel">
          <h3>Organization Structure</h3>
          <div className="uh-search">
            <FiSearch />
            <input
              placeholder="Search user by name, role or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="uh-tree">
            {loading ? (
              <div className="uh-empty">Loading...</div>
            ) : (
              <>
                {visibleUnits.map((u) => renderUnit(u, 0))}
                {visibleUnassigned.length > 0 && (
                  <div className="uh-unit">
                    <div className="uh-unit-head static">
                      <span className="uh-unit-icon muted">
                        <FiUsers />
                      </span>
                      <span className="uh-unit-name">No unit assigned</span>
                      <span className="uh-count">{visibleUnassigned.length}</span>
                    </div>
                    <div className="uh-nest">
                      {visibleUnassigned.map((u) => (
                        <div
                          key={u.user_id}
                          className={`uh-person ${selectedId === u.user_id ? "selected" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectPerson(u.user_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") selectPerson(u.user_id);
                          }}
                        >
                          <Avatar id={u.user_id} name={u.name} />
                          <span className="uh-person-name">{u.name}</span>
                          <span className="uh-person-title">{u.role || "No role"}</span>
                          {u.manager_count > 0 && <span className="uh-badge">{u.manager_count} manager</span>}
                          {renderKebab(`p-${u.user_id}`, [
                            { label: "View details", onClick: () => selectPerson(u.user_id) },
                            { label: "Assign / Update", onClick: () => openDrawerFor(u.user_id) },
                          ])}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {visibleUnits.length === 0 && visibleUnassigned.length === 0 && (
                  <div className="uh-empty">Nothing matches your search.</div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="uh-panel uh-details">
          <div className="uh-details-head">
            <h3>User Details</h3>
            {detail && (
              <button type="button" className="uh-edit" onClick={() => openDrawerFor(detail.user.id)}>
                <FiEdit2 /> Edit
              </button>
            )}
          </div>

          {!selectedId && <div className="uh-empty">Select a person on the left to see who they report to.</div>}
          {selectedId && detailLoading && !detail && <div className="uh-empty">Loading...</div>}
          {detailError && (
            <div className="uh-error">
              <span>{detailError}</span>
              <button type="button" onClick={() => setDetailError(null)} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}

          {detail && (
            <div className="uh-detail-body">
              <div className="uh-person-card">
                <Avatar id={detail.user.id} name={detail.user.name} size="xl" />
                <div className="uh-person-card-text">
                  <div className="uh-person-title-row">
                    <span className="uh-person-heading">{detail.user.name}</span>
                    <span className={`uh-badge ${detail.user.is_active ? "ok" : ""}`}>
                      {detail.user.is_active ? "Active" : "Inactive"}
                    </span>
                    {detail.is_head === 1 && <span className="uh-badge head">Head</span>}
                  </div>
                  <div className="uh-muted">{detail.designation?.name || detail.user.role || "No designation"}</div>
                  {detail.user.email && (
                    <div className="uh-contact">
                      <FiMail /> {detail.user.email}
                    </div>
                  )}
                  {detail.user.phone && (
                    <div className="uh-contact">
                      <FiPhone /> {detail.user.phone}
                    </div>
                  )}
                  {detail.user.branch_name && (
                    <div className="uh-contact">
                      <FiMapPin /> {detail.user.branch_name}
                    </div>
                  )}
                </div>
              </div>

              <div className="uh-tabs">
                {DETAIL_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={detailTab === t.key ? "active" : ""}
                    onClick={() => setDetailTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {renderDetailTab()}
            </div>
          )}
        </section>
      </div>

      {drawerOpen && (
        <div className="uh-drawer-overlay" onClick={closeDrawer}>
          <aside className="uh-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="uh-drawer-head">
              <h3>{drawerMode === "create" ? "Add Person" : "Assign / Update Hierarchy"}</h3>
              <button type="button" onClick={closeDrawer} aria-label="Close">
                <FiX />
              </button>
            </div>

            {!drawerReady ? (
              <div className="uh-empty">Loading...</div>
            ) : createdAccount ? (
              <>
                <div className="uh-drawer-body uh-created">
                  <div className="uh-created-icon">
                    <FiCheckCircle />
                  </div>
                  <h4>{createdAccount.name}&apos;s account is ready</h4>

                  <div className="uh-created-row">
                    <span>Email</span>
                    <strong>{createdAccount.email}</strong>
                  </div>
                  <div className="uh-created-row">
                    <span>Temporary password</span>
                    <strong className="uh-created-password">{createdAccount.password}</strong>
                    <button type="button" className="uh-copy" onClick={() => copyToClipboard(createdAccount.password)}>
                      <FiCopy /> Copy
                    </button>
                  </div>

                  {createdAccount.placementError && (
                    <div className="uh-error">
                      <span>Placement failed: {createdAccount.placementError}. Use &quot;Assign / Update&quot; on their row to finish.</span>
                    </div>
                  )}

                  <div className="uh-note">
                    <FiInfo /> Share these with {createdAccount.name} so they can log in. They&apos;ll land on a simple
                    panel showing where they sit in the hierarchy — task assignment isn&apos;t set up yet.
                  </div>
                </div>
                <div className="uh-drawer-actions">
                  <button type="button" className="primary" onClick={closeDrawer}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                {drawerMode === "edit" && (
                  <div className="uh-drawer-person">
                    <Avatar id={detail.user.id} name={detail.user.name} size="lg" />
                    <div>
                      <div className="uh-person-title-row">
                        <strong>{detail.user.name}</strong>
                        <span className={`uh-badge ${detail.user.is_active ? "ok" : ""}`}>
                          {detail.user.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="uh-muted">{detail.designation?.name || detail.user.role || ""}</div>
                    </div>
                  </div>
                )}

                <div className="uh-tabs drawer">
                  {drawerTabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      className={drawerTab === t.key ? "active" : ""}
                      onClick={() => setDrawerTab(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="uh-drawer-body">
                  {drawerError && (
                    <div className="uh-error">
                      <span>{drawerError}</span>
                      <button type="button" onClick={() => setDrawerError(null)} aria-label="Dismiss">
                        ×
                      </button>
                    </div>
                  )}

                  {drawerTab === "hierarchy" && (
                    <>
                      <div className="uh-field">
                        <span>Reporting Manager *</span>
                        <div className="uh-selected-manager">
                          {form.managers.length === 0 ? (
                            <span className="uh-muted">No manager selected</span>
                          ) : (
                            (() => {
                              const lead = form.managers.find((m) => m.primary) || form.managers[0];
                              const p = people.get(lead.id);
                              return (
                                <>
                                  <Avatar id={lead.id} name={p?.name} />
                                  <span className="uh-person-text">
                                    <span className="uh-person-name">{p?.name || `#${lead.id}`}</span>
                                    <span className="uh-person-sub">
                                      {[p?.designation, p?.unit_name].filter(Boolean).join(" · ") || "—"}
                                    </span>
                                  </span>
                                  {form.managers.length > 1 && (
                                    <span className="uh-badge">+{form.managers.length - 1} more</span>
                                  )}
                                </>
                              );
                            })()
                          )}
                          <FiChevronDown className="uh-selected-chevron" />
                        </div>
                      </div>

                      <div className="uh-search small">
                        <FiSearch />
                        <input
                          placeholder="Search manager..."
                          value={managerSearch}
                          onChange={(e) => setManagerSearch(e.target.value)}
                        />
                      </div>

                      <div className="uh-manager-tree">
                        {managerGroups.length === 0 && <div className="uh-empty">No matches.</div>}
                        {managerGroups.map((g) => {
                          // While searching, always show matches even inside a collapsed group.
                          const isOpen = Boolean(managerSearch.trim()) || !groupCollapsed.has(g.key);
                          return (
                            <div key={g.key} className="uh-manager-group">
                              <button type="button" className="uh-manager-group-head" onClick={() => toggleGroup(g.key)}>
                                {isOpen ? <FiChevronDown /> : <FiChevronRight />}
                                <span className="uh-unit-icon">
                                  <UnitIcon unitType={g.unit_type} />
                                </span>
                                <span>{g.name}</span>
                              </button>
                              {isOpen &&
                                g.members.map((p) => {
                                  const chosen = form.managers.find((m) => m.id === p.user_id);
                                  return (
                                    <div
                                      key={p.user_id}
                                      className={`uh-manager-row ${chosen ? "chosen" : ""}`}
                                      // On opening, bring the current manager into view inside the
                                      // picker's own scroll area (once per drawer session).
                                      ref={
                                        chosen && scrolledFor.current !== formFor
                                          ? (el) => {
                                              if (el) {
                                                scrolledFor.current = formFor;
                                                el.scrollIntoView({ block: "nearest" });
                                              }
                                            }
                                          : undefined
                                      }
                                    >
                                      <label>
                                        <Avatar id={p.user_id} name={p.name} />
                                        <span className="uh-person-text">
                                          <span className="uh-person-name">{p.name}</span>
                                          <span className="uh-person-sub">
                                            {[p.designation, p.unit_name].filter(Boolean).join(" · ") || p.role || "—"}
                                          </span>
                                        </span>
                                        <input
                                          type="checkbox"
                                          checked={Boolean(chosen)}
                                          onChange={() => toggleManager(p.user_id)}
                                        />
                                      </label>
                                      {chosen && (
                                        <label className="uh-primary">
                                          <input
                                            type="radio"
                                            name="uh-primary-manager"
                                            checked={chosen.primary}
                                            onChange={() => setPrimary(p.user_id)}
                                          />
                                          Primary
                                        </label>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          );
                        })}
                      </div>
                      <div className="uh-muted small">
                        The primary manager is the one shown in the org chart. Every manager can see and reassign this
                        person&apos;s tasks.
                      </div>
                    </>
                  )}

                  {drawerTab === "departments" && (
                    <>
                      {drawerMode === "create" && (
                        <div className="uh-create-basics">
                          <label className="uh-field">
                            <span>Name *</span>
                            <input
                              value={form.name}
                              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                              placeholder="Full name"
                            />
                          </label>
                          <label className="uh-field">
                            <span>Email *</span>
                            <input
                              type="email"
                              value={form.email}
                              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                              placeholder="name@example.com"
                            />
                          </label>
                          <label className="uh-field">
                            <span>Phone</span>
                            <input
                              value={form.phone}
                              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                              placeholder="Optional"
                            />
                          </label>
                          <label className="uh-field">
                            <span>Temporary Password *</span>
                            <div className="uh-password-row">
                              <input
                                value={form.password}
                                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                                placeholder="At least 6 characters"
                              />
                              <button
                                type="button"
                                className="uh-generate"
                                onClick={() => setForm((p) => ({ ...p, password: randomPassword() }))}
                              >
                                Generate
                              </button>
                            </div>
                          </label>
                          <label className="uh-field">
                            <span>Role *</span>
                            <select value={form.roleId} onChange={(e) => setForm((p) => ({ ...p, roleId: e.target.value }))}>
                              <option value="">Select role</option>
                              {assignableRoles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="uh-field">
                            <span>Branch *</span>
                            <select value={form.branchId} onChange={(e) => setForm((p) => ({ ...p, branchId: e.target.value }))}>
                              <option value="">Select branch</option>
                              {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="uh-divider" />
                        </div>
                      )}

                      <label className="uh-field">
                        <span>Department / team</span>
                        <select value={form.unitId} onChange={(e) => setForm((p) => ({ ...p, unitId: e.target.value }))}>
                          <option value="">No unit</option>
                          {allUnits.map((u) => (
                            <option key={u.id} value={u.id}>
                              {`${"— ".repeat(u.depth)}${u.name}`}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="uh-field">
                        <span>Designation</span>
                        <select
                          value={form.designationId}
                          onChange={(e) => setForm((p) => ({ ...p, designationId: e.target.value }))}
                        >
                          <option value="">No designation</option>
                          {activeDesignations.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="uh-check">
                        <input
                          type="checkbox"
                          checked={form.isHead}
                          onChange={(e) => setForm((p) => ({ ...p, isHead: e.target.checked }))}
                        />
                        Head of this unit
                      </label>
                    </>
                  )}

                  {drawerTab === "roles" && (
                    <div className="uh-tab-body">
                      <div className="uh-block">
                        <h4>Role</h4>
                        <span className="uh-badge head big">{detail.user.role || "No role"}</span>
                      </div>
                      <div className="uh-note">
                        <FiInfo /> A role controls what someone can do. It doesn&apos;t change where they sit in the
                        hierarchy, and is edited from User Management.
                      </div>
                    </div>
                  )}

                  {drawerTab === "info" && (
                    <div className="uh-fact-grid single">
                      {[
                        ["Email", detail.user.email],
                        ["Phone", detail.user.phone],
                        ["Branch", detail.user.branch_name],
                        ["Status", detail.user.is_active ? "Active" : "Inactive"],
                      ].map(([label, value]) => (
                        <div key={label} className="uh-fact">
                          <span>{label}</span>
                          <strong>{value || "—"}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="uh-dates">
                  <label className="uh-field">
                    <span>Effective From *</span>
                    <input type="date" value={form.from} onChange={(e) => setForm((p) => ({ ...p, from: e.target.value }))} />
                  </label>
                  <label className="uh-field">
                    <span>Effective To</span>
                    <input type="date" value={form.to} onChange={(e) => setForm((p) => ({ ...p, to: e.target.value }))} />
                  </label>
                </div>

                <div className="uh-drawer-actions">
                  <button type="button" className="secondary" onClick={closeDrawer} disabled={saving}>
                    Cancel
                  </button>
                  {drawerMode === "create" ? (
                    <button type="button" className="primary" onClick={saveNewPerson} disabled={saving}>
                      {saving ? "Creating..." : "Add Person"}
                    </button>
                  ) : (
                    <button type="button" className="primary" onClick={() => saveHierarchy(false)} disabled={saving}>
                      {saving ? "Saving..." : "Update Hierarchy"}
                    </button>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <StatusAlertModal status={status} onClose={() => setStatus(null)} />

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={() => {
          setConfirmState(null);
          saveHierarchy(true);
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
