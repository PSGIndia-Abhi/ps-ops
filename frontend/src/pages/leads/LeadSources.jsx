// The lead source master (crm_lead_sources): what the lead forms offer as
// "Source of Lead". Kept by the sales manager (and admin). A source is never
// deleted - leads keep its name - so it is switched off instead.

import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiCheck, FiEdit2, FiPlus, FiSearch, FiTag, FiX } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { addSource, listAllSources, updateSource } from "./leadsApi";
import { useToast } from "./hooks";
import { Alert, Badge, Button, Card, Empty, Note, SkeletonRows } from "./ui";
import { useViewer } from "./viewer";

/** The popup that names a new source. `onAdded` runs once the server has saved it. */
function AddSourcePopup({ onClose, onAdded }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(close) {
    if (busy) return;
    if (name.trim().length < 2) {
      toast("Enter a source name.", true);
      return;
    }
    setBusy(true);
    try {
      await addSource(name);
      toast(`"${name.trim()}" added`);
      onAdded();
      close();
    } catch (err) {
      toast(err.message || "Could not add the source.", true);
      setBusy(false);
    }
  }

  return (
    <Alert
      icon={<FiTag />}
      title="Add a Source"
      onClose={onClose}
      actions={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} icon={<FiPlus />} onClick={() => save(close)}>
            Add Source
          </Button>
        </>
      )}
    >
      <input
        className="lm-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save(onClose)}
        placeholder="e.g. Trade Fair, Newspaper Ad, IndiaMART"
        maxLength={60}
        autoFocus
        aria-label="Source name"
      />
    </Alert>
  );
}

export default function LeadSources() {
  const { persona } = useViewer();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0); // bumped after every change, to read the list again
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false); // the Add Source popup is open
  const [editing, setEditing] = useState(null); // { id, name }
  const [busyId, setBusyId] = useState(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows && q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  useEffect(() => {
    let alive = true;
    listAllSources()
      .then((list) => alive && (setRows(list), setError("")))
      .catch((err) => alive && setError(err.message || "Could not load the lead sources."));
    return () => {
      alive = false;
    };
  }, [version]);

  if (persona !== "sales_manager") return <Navigate to={LEADS_HOME} replace />;

  async function change(row, patch, done) {
    setBusyId(row.id);
    try {
      await updateSource(row.id, patch);
      toast(done);
      setEditing(null);
      setVersion((v) => v + 1);
    } catch (err) {
      toast(err.message || "Could not update the source.", true);
    } finally {
      setBusyId(null);
    }
  }

  function saveName(row) {
    const name = editing.name.trim();
    if (name === row.name) return setEditing(null);
    if (name.length < 2) return toast("Enter a source name.", true);
    change(row, { name }, `Renamed to "${name}"`);
  }

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>Lead Sources</h1>
          <p>Where leads come from. These are the choices in &quot;Source of Lead&quot; on every lead form, for staff and lead providers.</p>
        </div>
      </div>

      <Card index={0}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label className="lm-search" style={{ flex: "1 1 240px", maxWidth: "none" }}>
            <FiSearch />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sources..." aria-label="Search sources" />
          </label>
          <Button icon={<FiPlus />} onClick={() => setAdding(true)}>
            Add Source
          </Button>
        </div>
      </Card>

      <Card title="All Sources" sub={rows ? `${rows.filter((r) => r.active).length} active of ${rows.length}` : undefined} index={1} flush className="lm-detail">
        <div style={{ height: 14 }} />
        {error ? (
          <Empty title="Could not load the sources" text={error} icon={<FiTag />} />
        ) : !rows ? (
          <SkeletonRows rows={5} />
        ) : rows.length === 0 ? (
          <Empty title="No sources yet" text="Add the first one above." icon={<FiTag />} />
        ) : shown.length === 0 ? (
          <Empty title="No matching sources" text="Try a different search." icon={<FiSearch />} />
        ) : (
          <div className="lm-table-wrap">
            <table className="lm-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Leads</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((row, i) => (
                  <tr key={row.id} style={{ "--i": i, cursor: "default" }}>
                    <td>
                      {editing?.id === row.id ? (
                        <input
                          className="lm-input"
                          value={editing.name}
                          maxLength={60}
                          autoFocus
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveName(row);
                            if (e.key === "Escape") setEditing(null);
                          }}
                          aria-label="Source name"
                        />
                      ) : (
                        <strong>{row.name}</strong>
                      )}
                    </td>
                    <td className="num">{row.leads}</td>
                    <td>
                      <Badge tone={row.active ? "success" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td>
                      <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        {editing?.id === row.id ? (
                          <>
                            <Button size="sm" busy={busyId === row.id} icon={<FiCheck />} onClick={() => saveName(row)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" icon={<FiX />} onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" icon={<FiEdit2 />} onClick={() => setEditing({ id: row.id, name: row.name })}>
                              Rename
                            </Button>
                            <Button
                              size="sm"
                              variant={row.active ? "danger" : "ghost"}
                              busy={busyId === row.id}
                              onClick={() => change(row, { active: !row.active }, row.active ? `"${row.name}" switched off` : `"${row.name}" switched on`)}
                            >
                              {row.active ? "Deactivate" : "Activate"}
                            </Button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Note tone="info">
        A source is never deleted, because existing leads keep it. Deactivate it to stop it being offered on new leads. Renaming a source also renames it on the leads that already use it.
      </Note>

      {adding && <AddSourcePopup onClose={() => setAdding(false)} onAdded={() => setVersion((v) => v + 1)} />}
    </>
  );
}
