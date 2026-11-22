// The industry type master (crm_industry_types): what the lead forms offer as "Industry Type",
// and the word each one puts in the agreement text ("the Apartment has agreed ..."). Kept by
// whoever manages leads (sales manager, Managing Director, Personal Assistant) and admin.
// A type is never deleted - leads keep its code - so it is switched off instead.

import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiBriefcase, FiCheck, FiEdit2, FiPlus, FiSearch, FiX } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { addIndustryType, listAllIndustryTypes, updateIndustryType } from "./leadsApi";
import { useToast } from "./hooks";
import { Alert, Badge, Button, Card, Empty, Note, SkeletonRows } from "./ui";
import { useViewer } from "./viewer";

/** The popup that adds a new type. `onAdded` runs once the server has saved it. */
function AddIndustryPopup({ onClose, onAdded }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(close) {
    if (busy) return;
    if (name.trim().length < 2) {
      toast("Enter an industry name.", true);
      return;
    }
    setBusy(true);
    try {
      await addIndustryType({ name, word });
      toast(`"${name.trim()}" added`);
      onAdded();
      close();
    } catch (err) {
      toast(err.message || "Could not add the industry type.", true);
      setBusy(false);
    }
  }

  return (
    <Alert
      icon={<FiBriefcase />}
      title="Add an Industry Type"
      onClose={onClose}
      actions={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} icon={<FiPlus />} onClick={() => save(close)}>
            Add Industry
          </Button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <input
          className="lm-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save(onClose)}
          placeholder="Industry name, e.g. Hotel, School, Warehouse"
          maxLength={60}
          autoFocus
          aria-label="Industry name"
        />
        <input
          className="lm-input"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save(onClose)}
          placeholder={`Word in the agreement (default: ${name.trim() || "the name"})`}
          maxLength={40}
          aria-label="Agreement word"
        />
      </div>
    </Alert>
  );
}

export default function IndustryTypes() {
  const { persona } = useViewer();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0); // bumped after every change, to read the list again
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false); // the Add popup is open
  const [editing, setEditing] = useState(null); // { id, name, word, order }
  const [busyId, setBusyId] = useState(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows && q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.word.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  useEffect(() => {
    let alive = true;
    listAllIndustryTypes()
      .then((list) => alive && (setRows(list), setError("")))
      .catch((err) => alive && setError(err.message || "Could not load the industry types."));
    return () => {
      alive = false;
    };
  }, [version]);

  if (persona !== "sales_manager") return <Navigate to={LEADS_HOME} replace />;

  async function change(row, patch, done) {
    setBusyId(row.id);
    try {
      await updateIndustryType(row.id, patch);
      toast(done);
      setEditing(null);
      setVersion((v) => v + 1);
    } catch (err) {
      toast(err.message || "Could not update the industry type.", true);
    } finally {
      setBusyId(null);
    }
  }

  function saveEdit(row) {
    const name = editing.name.trim();
    const word = editing.word.trim();
    const order = Number(editing.order);
    if (name.length < 2) return toast("Enter an industry name.", true);
    if (word.length < 2) return toast("Enter the word used in the agreement.", true);
    if (!Number.isInteger(order) || order < 0 || order > 9999) return toast("Order must be a whole number from 0 to 9999.", true);
    const patch = {};
    if (name !== row.name) patch.name = name;
    if (word !== row.word) patch.word = word;
    if (order !== row.order) patch.order = order;
    if (Object.keys(patch).length === 0) return setEditing(null);
    change(row, patch, `"${name}" updated`);
  }

  const onKey = (row) => (e) => {
    if (e.key === "Enter") saveEdit(row);
    if (e.key === "Escape") setEditing(null);
  };

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>Industry Types</h1>
          <p>
            The choices in &quot;Industry Type&quot; on every commercial lead form (web and app), and the word each one uses in the
            agreement, e.g. &quot;the <strong>Apartment</strong> has agreed to accept…&quot;.
          </p>
        </div>
      </div>

      <Card index={0}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label className="lm-search" style={{ flex: "1 1 240px", maxWidth: "none" }}>
            <FiSearch />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search industry types..." aria-label="Search industry types" />
          </label>
          <Button icon={<FiPlus />} onClick={() => setAdding(true)}>
            Add Industry
          </Button>
        </div>
      </Card>

      <Card
        title="All Industry Types"
        sub={rows ? `${rows.filter((r) => r.active).length} active of ${rows.length}` : undefined}
        index={1}
        flush
        className="lm-detail"
      >
        <div style={{ height: 14 }} />
        {error ? (
          <Empty title="Could not load the industry types" text={error} icon={<FiBriefcase />} />
        ) : !rows ? (
          <SkeletonRows rows={5} />
        ) : rows.length === 0 ? (
          <Empty title="No industry types yet" text="Add the first one above." icon={<FiBriefcase />} />
        ) : shown.length === 0 ? (
          <Empty title="No matching industry types" text="Try a different search." icon={<FiSearch />} />
        ) : (
          <div className="lm-table-wrap">
            <table className="lm-table">
              <thead>
                <tr>
                  <th>Industry</th>
                  <th>Word in agreement</th>
                  <th>Order</th>
                  <th>Leads</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((row, i) => {
                  const isEditing = editing?.id === row.id;
                  return (
                    <tr key={row.id} style={{ "--i": i, cursor: "default" }}>
                      <td>
                        {isEditing ? (
                          <input
                            className="lm-input"
                            value={editing.name}
                            maxLength={60}
                            autoFocus
                            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                            onKeyDown={onKey(row)}
                            aria-label="Industry name"
                          />
                        ) : (
                          <strong>{row.name}</strong>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="lm-input"
                            value={editing.word}
                            maxLength={40}
                            onChange={(e) => setEditing({ ...editing, word: e.target.value })}
                            onKeyDown={onKey(row)}
                            aria-label="Word in agreement"
                          />
                        ) : (
                          row.word
                        )}
                      </td>
                      <td className="num">
                        {isEditing ? (
                          <input
                            className="lm-input"
                            type="number"
                            min={0}
                            max={9999}
                            style={{ width: 90 }}
                            value={editing.order}
                            onChange={(e) => setEditing({ ...editing, order: e.target.value })}
                            onKeyDown={onKey(row)}
                            aria-label="Order"
                          />
                        ) : (
                          row.order
                        )}
                      </td>
                      <td className="num">{row.leads}</td>
                      <td>
                        <Badge tone={row.active ? "success" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td>
                        <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          {isEditing ? (
                            <>
                              <Button size="sm" busy={busyId === row.id} icon={<FiCheck />} onClick={() => saveEdit(row)}>
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" icon={<FiX />} onClick={() => setEditing(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<FiEdit2 />}
                                onClick={() => setEditing({ id: row.id, name: row.name, word: row.word, order: String(row.order) })}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant={row.active ? "danger" : "ghost"}
                                busy={busyId === row.id}
                                onClick={() =>
                                  change(row, { active: !row.active }, row.active ? `"${row.name}" switched off` : `"${row.name}" switched on`)
                                }
                              >
                                {row.active ? "Deactivate" : "Activate"}
                              </Button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Note tone="info">
        An industry type is never deleted, because existing leads keep it. Deactivate it to stop it being offered on new leads; leads
        that already have it keep showing it. Renaming a type changes its name everywhere, including on existing leads. Lower order
        numbers come first in the dropdown.
      </Note>

      {adding && <AddIndustryPopup onClose={() => setAdding(false)} onAdded={() => setVersion((v) => v + 1)} />}
    </>
  );
}
