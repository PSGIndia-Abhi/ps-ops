import { useMemo, useState } from "react";
import { FiChevronRight, FiMaximize2, FiMinimize2, FiSearch, FiX } from "react-icons/fi";
import { Avatar } from "./ui";

/**
 * Builds the viewer's organisation below them as a tree, from what TaskPro
 * already loads: `team` (everyone below the viewer, any active line — GET
 * /api/users/me/team) and `directory` (each person's PRIMARY manager — GET
 * /api/hierarchy/tree).
 *
 *  - Each person sits under their primary manager when that manager is in
 *    the viewer's organisation; otherwise (they're reached through a
 *    secondary line) directly under the viewer, with a note.
 *  - Reporting loops are allowed in this org chart, so anyone the walk from
 *    the viewer can't reach is also placed under the viewer; every person
 *    appears exactly once.
 */
function buildTree(me, team, directory) {
  const members = new Map(team.map((m) => [Number(m.id), m]));
  const info = (id) => {
    const d = directory.get(id);
    const m = members.get(id);
    return {
      id,
      name: m?.name || d?.name || `User #${id}`,
      designation: d?.designation || m?.designation || m?.role || "",
      dept: d?.dept || m?.unit_name || "",
      managerId: d?.manager_id == null ? null : Number(d.manager_id),
    };
  };

  const kids = new Map();
  const add = (parent, id) => {
    if (!kids.has(parent)) kids.set(parent, []);
    kids.get(parent).push(id);
  };
  for (const id of members.keys()) {
    const mgr = info(id).managerId;
    add(mgr === me.id || !members.has(mgr) ? me.id : mgr, id);
  }

  const seen = new Set([me.id]);
  const toNode = (id, depth) => {
    seen.add(id);
    const children = (kids.get(id) || []).filter((c) => !seen.has(c));
    children.forEach((c) => seen.add(c));
    const node = { ...info(id), depth, children: children.map((c) => toNode(c, depth + 1)) };
    node.size = node.children.reduce((sum, c) => sum + 1 + c.size, 0);
    // People who lead others first, then by name.
    node.children.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
    return node;
  };
  const root = { id: me.id, name: me.name, designation: me.designation, dept: me.dept, depth: 0, children: [] };
  root.children = (kids.get(me.id) || []).map((c) => toNode(c, 1));
  // Caught in a loop that never reaches the viewer: still show them.
  for (const id of members.keys()) if (!seen.has(id)) root.children.push(toNode(id, 1));
  root.children.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
  root.size = root.children.reduce((sum, c) => sum + 1 + c.size, 0);

  // Where someone is placed under the viewer although their primary manager
  // is someone else, say why: a reporting loop, or a manager outside the
  // viewer's organisation (they're reached through a secondary line).
  const inside = (node, id) => node.children.some((k) => k.id === id || inside(k, id));
  for (const c of root.children) {
    if (!c.managerId || c.managerId === me.id) continue;
    const mgr = info(c.managerId).name;
    c.note = inside(c, c.managerId) ? `${c.name} and ${mgr} report to each other` : `Primary manager: ${mgr}`;
  }
  // Direct reports are the people whose primary manager is the viewer — not
  // everyone shown at the top level.
  root.direct = root.children.filter((c) => c.managerId === me.id).length;
  const levels = (n) => (n.children.length ? 1 + Math.max(...n.children.map(levels)) : 0);
  root.levels = levels(root);
  return root;
}

function collect(node, out = []) {
  out.push(node);
  node.children.forEach((c) => collect(c, out));
  return out;
}

function Node({ node, open, toggle, matches, isRoot }) {
  const hasKids = node.children.length > 0;
  const expanded = isRoot || open.has(node.id);
  const hit = matches?.has(node.id);
  return (
    <li className={`tp-org-item ${isRoot ? "root" : ""}`}>
      <div className={`tp-org-node ${isRoot ? "me" : ""} ${hit ? "hit" : ""}`}>
        {hasKids && !isRoot ? (
          <button type="button" className={`tp-org-toggle ${expanded ? "open" : ""}`} onClick={() => toggle(node.id)} aria-label={expanded ? `Collapse ${node.name}'s team` : `Expand ${node.name}'s team`} aria-expanded={expanded}>
            <FiChevronRight />
          </button>
        ) : (
          <span className="tp-org-toggle-space" />
        )}
        <Avatar name={node.name} size={isRoot ? 40 : 34} />
        <span className="tp-org-text">
          <strong>
            {node.name}
            {isRoot ? " (you)" : ""}
          </strong>
          <small>{[node.designation, node.dept].filter(Boolean).join(" · ") || "—"}</small>
          {node.note && <em>{node.note}</em>}
        </span>
        {hasKids && (
          <span className="tp-org-count" title={`${node.children.length} direct, ${node.size} in total`}>
            {node.size} {node.size === 1 ? "person" : "people"}
          </span>
        )}
      </div>
      {hasKids && expanded && (
        <ul className="tp-org-children">
          {node.children.map((c) => (
            <Node key={c.id} node={c} open={open} toggle={toggle} matches={matches} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * "My team" as the real organisation below the viewer: every person under
 * their manager, branches you can open and close, and a search that opens
 * the path to whoever matches.
 */
export default function OrgTree({ me, team, directory }) {
  const root = useMemo(() => buildTree(me, team, directory), [me, team, directory]);
  const everyone = useMemo(() => collect(root).slice(1), [root]);
  const parents = useMemo(() => everyone.filter((n) => n.children.length), [everyone]);
  // Start with the viewer's direct reports showing and their teams folded.
  const [open, setOpen] = useState(() => new Set());
  const [query, setQuery] = useState("");

  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Search: highlight matches and open every branch on the way to them.
  const needle = query.trim().toLowerCase();
  const { matches, pathOpen } = useMemo(() => {
    if (!needle) return { matches: null, pathOpen: null };
    const hits = new Set();
    const onPath = new Set();
    const walk = (n, trail) => {
      if ([n.name, n.designation, n.dept].filter(Boolean).join(" ").toLowerCase().includes(needle)) {
        hits.add(n.id);
        trail.forEach((id) => onPath.add(id));
      }
      n.children.forEach((c) => walk(c, [...trail, n.id]));
    };
    root.children.forEach((c) => walk(c, []));
    return { matches: hits, pathOpen: onPath };
  }, [needle, root]);
  const effectiveOpen = pathOpen ? new Set([...open, ...pathOpen]) : open;

  const direct = root.direct;
  return (
    <section className="tp-card tp-org-card">
      <div className="tp-card-head tp-org-head">
        <div className="tp-chart-title">
          <h3>My team</h3>
          <small>
            {direct} direct {direct === 1 ? "report" : "reports"} · {root.size} {root.size === 1 ? "person" : "people"} in total
            {root.levels > 1 ? ` · ${root.levels} levels` : ""}
          </small>
        </div>
        {parents.length > 0 && (
          <div className="tp-org-tools">
            {everyone.length > 8 && (
              <label className="tp-org-search">
                <FiSearch />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person, role or department" aria-label="Find a person in your team" />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                    <FiX />
                  </button>
                )}
              </label>
            )}
            <button type="button" className="tp-org-btn" onClick={() => setOpen(new Set(parents.map((n) => n.id)))}>
              <FiMaximize2 /> Expand all
            </button>
            <button type="button" className="tp-org-btn" onClick={() => setOpen(new Set())}>
              <FiMinimize2 /> Collapse all
            </button>
          </div>
        )}
      </div>
      {needle && matches.size === 0 && <p className="tp-desc muted">Nobody in your team matches “{query}”.</p>}
      <ul className="tp-org">
        <Node node={root} open={effectiveOpen} toggle={toggle} matches={matches} isRoot />
      </ul>
    </section>
  );
}
