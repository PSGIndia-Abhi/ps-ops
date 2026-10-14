import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiCheckSquare, FiChevronRight, FiPlus, FiSearch, FiX } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { AddLeadModal, CallVerifyModal, ScheduleMeetingModal } from "./dialogs";
import { providerName, providerSources, useLeadData, userName } from "./leadsApi";
import { compactMoney, dayLabel, nextAction } from "./format";
import { useLoaded, usePaged } from "./hooks";
import { Button, Card, Empty, Pager, SkeletonRows, StageBadge, Tabs } from "./ui";
import { useViewer, visibleLeads } from "./viewer";

const QUEUE = ["NEW", "TO_CALL", "NEED_MORE_INFO"];

/** The tabs each persona gets above the list. */
function tabsFor(persona) {
  // The provider never learns a lead's status, so they get one list with no status tabs.
  if (persona === "lead_provider") return [{ key: "all", label: "All", match: () => true }];
  // The sales manager only ever sees verified leads, so the calling-queue tabs would always be empty.
  const queue = persona !== "sales_manager";
  return [
    { key: "all", label: "All Leads", match: () => true },
    ...(queue ? [{ key: "new", label: "New", match: (l) => l.stage === "NEW" }] : []),
    ...(queue ? [{ key: "call", label: "To Call", match: (l) => l.stage === "TO_CALL" || l.stage === "NEED_MORE_INFO" }] : []),
    { key: "qualified", label: "Qualified", match: (l) => l.stage === "QUALIFIED" },
    { key: "meeting", label: "Meeting Scheduled", match: (l) => l.stage === "MEETING_SCHEDULED" },
    { key: "progress", label: "In Progress", match: (l) => l.stage === "VISIT_COMPLETED" || l.stage === "QUOTATION_SENT" },
    { key: "closed", label: "Converted", match: (l) => l.stage === "WON" },
    { key: "rejected", label: queue ? "Rejected" : "Lost", match: (l) => l.stage === "NOT_GENUINE" || l.stage === "LOST" },
  ];
}

/**
 * The leads table. `persona` decides the columns: a provider sees only what they
 * submitted (never the status); staff see status, source, owner and the next action.
 * `onCall` / `onSchedule` add the quick action button for telecallers.
 * `compact` drops the secondary columns, for the narrower cards on a dashboard.
 */
export function LeadTable({ leads, persona, onCall, onSchedule, compact = false }) {
  const navigate = useNavigate();
  const provider = persona === "lead_provider";
  const full = !provider && !compact;
  const open = (lead) => navigate(`${LEADS_HOME}/${lead.id}`);

  return (
    <div className="lm-table-wrap">
      <table className="lm-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Company</th>
            <th>Phone</th>
            {full && <th>Source</th>}
            {!provider && <th>Status</th>}
            {full && <th>Next Action</th>}
            {full && <th>Quote</th>}
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, i) => (
            <tr key={lead.id} style={{ "--i": i }} onClick={() => open(lead)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && open(lead)}>
              <td className="num muted">{dayLabel(lead.createdAt)}</td>
              <td>
                <span className="lm-who-text">
                  <strong>{lead.company}</strong>
                  <small>
                    {lead.contact} · {lead.number}
                  </small>
                </span>
              </td>
              <td className="num">{lead.phone}</td>
              {full && <td className="muted">{lead.providerId ? providerName(lead.providerId) : lead.source}</td>}
              {/* The provider never sees how their lead is progressing. */}
              {!provider && (
                <td>
                  <StageBadge stage={lead.stage} />
                </td>
              )}
              {full && <td className="muted">{nextAction(lead)}</td>}
              {full && <td className="num">{compactMoney(lead.quote)}</td>}
              <td onClick={(e) => e.stopPropagation()}>
                {onCall && QUEUE.includes(lead.stage) ? (
                  // Opens the verification form (record the call's result), so it says so.
                  <Button size="sm" icon={<FiCheckSquare />} onClick={() => onCall(lead)}>
                    Verify Lead
                  </Button>
                ) : onSchedule && lead.stage === "QUALIFIED" ? (
                  <Button size="sm" variant="ghost" onClick={() => onSchedule(lead)}>
                    Schedule
                  </Button>
                ) : (
                  <button type="button" className="lm-row-go" aria-label={`Open ${lead.company}`} onClick={() => open(lead)}>
                    <FiChevronRight />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Created" choices on the manager's list: how far back a lead's creation date may be. */
const CREATED_RANGES = [
  { key: "", label: "Any date" },
  { key: "today", label: "Created today" },
  { key: "week", label: "Last 7 days" },
  { key: "month", label: "This month" },
];

function createdIn(range, createdAt) {
  if (!range) return true;
  const d = new Date(String(createdAt).replace(" ", "T"));
  const now = new Date();
  if (range === "today") return d.toDateString() === now.toDateString();
  if (range === "week") return now - d <= 7 * 86400000;
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** The people a list of leads mentions in one field (who created it, its telecaller, its sales person), by name. */
function peopleIn(leads, field) {
  const ids = [...new Set(leads.map((l) => l[field]).filter(Boolean).map(String))];
  return ids.map((id) => ({ id, name: userName(id) || providerName(id) || `User ${id}` })).sort((a, b) => a.name.localeCompare(b.name));
}

export default function LeadsList() {
  const viewer = useViewer();
  const { persona } = viewer;
  const { leads } = useLeadData();
  const ready = useLoaded();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "all");
  // The search text lives in the address bar (?q=...), so the top-bar search and this box are one thing.
  const query = params.get("q") || "";
  const setQuery = (text) => setParams(text ? { q: text } : {}, { replace: true });
  const [source, setSource] = useState("");
  // The sales manager's extra filters: who created the lead, its telecaller, its sales executive, when it was created.
  const [creator, setCreator] = useState("");
  const [telecaller, setTelecaller] = useState("");
  const [salesPerson, setSalesPerson] = useState("");
  const [created, setCreated] = useState("");
  const [adding, setAdding] = useState(false);
  const [calling, setCalling] = useState(null);
  const [scheduling, setScheduling] = useState(null);

  const mine = useMemo(() => visibleLeads(leads, viewer), [leads, viewer]);
  // The master list plus any source an older lead still carries (an old code, or a source since switched off).
  const sourceOptions = useMemo(() => [...new Set([...providerSources(), ...mine.map((l) => l.source).filter(Boolean)])].sort(), [mine]);
  const tabs = useMemo(() => tabsFor(persona).map((t) => ({ ...t, count: mine.filter(t.match).length })), [persona, mine]);
  const active = tabs.find((t) => t.key === tab) || tabs[0];
  const manager = persona === "sales_manager";
  const people = useMemo(
    () => (manager ? { creators: peopleIn(mine, "createdBy"), telecallers: peopleIn(mine, "telecallerId"), sales: peopleIn(mine, "salesId") } : null),
    [manager, mine],
  );
  const filtered = !!(source || creator || telecaller || salesPerson || created);
  const clearFilters = () => {
    setSource("");
    setCreator("");
    setTelecaller("");
    setSalesPerson("");
    setCreated("");
    paged.onPage(1);
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine
      .filter(active.match)
      .filter((l) => !source || l.source === source)
      .filter((l) => !creator || String(l.createdBy) === creator)
      .filter((l) => !telecaller || String(l.telecallerId) === telecaller)
      .filter((l) => !salesPerson || String(l.salesId) === salesPerson)
      .filter((l) => createdIn(created, l.createdAt))
      .filter((l) => !q || [l.company, l.contact, l.phone, l.number, l.area].some((v) => String(v).toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [mine, active, source, creator, telecaller, salesPerson, created, query]);

  const paged = usePaged(shown, 8);
  const staff = persona !== "lead_provider";
  // A dialog always shows the lead as it is now, not as it was when its button was pressed.
  const fresh = (lead) => leads.find((l) => l.id === lead.id) || lead;
  const canVerify = persona === "telecaller" || persona === "sales_manager";

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>{persona === "sales_manager" ? "All Leads" : persona === "telecaller" ? "Leads" : "My Leads"}</h1>
          <p>
            {persona === "lead_provider"
              ? "Every lead you have submitted."
              : persona === "telecaller"
                ? "The shared queue - call new leads and verify them."
                : persona === "sales"
                  ? "Leads you brought in or were assigned."
                  : "Every commercial lead across the team."}
          </p>
        </div>
        {/* Telecallers verify leads; they do not add them (the Android app and the server agree). */}
        {persona !== "telecaller" && (
          <div className="lm-head-actions">
            <Button icon={<FiPlus />} onClick={() => setAdding(true)}>
              {persona === "lead_provider" ? "Submit Lead" : "Add Lead"}
            </Button>
          </div>
        )}
      </div>

      <Card flush>
        {staff && (
          <Tabs
            tabs={tabs}
            value={active.key}
            onChange={(key) => {
              setTab(key);
              paged.onPage(1);
            }}
          />
        )}
        <div className="lm-tools">
          <label className="lm-search">
            <FiSearch />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by company, phone, lead number..."
              aria-label="Search leads"
            />
          </label>
          {staff && (
            <select className="lm-select" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by source">
              <option value="">All sources</option>
              {sourceOptions.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
          {manager && (
            <>
              {[
                ["Filter by who created the lead", "Created by anyone", creator, setCreator, people.creators],
                ["Filter by telecaller", "Any telecaller", telecaller, setTelecaller, people.telecallers],
                ["Filter by sales executive", "Any sales executive", salesPerson, setSalesPerson, people.sales],
              ].map(([label, all, value, set, options]) => (
                <select key={label} className="lm-select" value={value} onChange={(e) => {
                    set(e.target.value);
                    paged.onPage(1);
                  }} aria-label={label}>
                  <option value="">{all}</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ))}
              <select className="lm-select" value={created} onChange={(e) => {
                  setCreated(e.target.value);
                  paged.onPage(1);
                }} aria-label="Filter by date created">
                {CREATED_RANGES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </>
          )}
          {filtered && (
            <Button variant="ghost" size="sm" icon={<FiX />} onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {!ready ? (
          <SkeletonRows rows={6} />
        ) : shown.length === 0 ? (
          <Empty
            title={query || filtered || active.key !== "all" ? "No matching leads" : "No leads yet"}
            text={query || filtered || active.key !== "all" ? "Try a different search, filter or tab." : "Leads appear here as soon as they are added."}
          />
        ) : (
          <>
            {/* `key` replays the row entrance when the tab or page changes. */}
            <div key={`${active.key}:${paged.page}`}>
              <LeadTable leads={paged.rows} persona={persona} onCall={canVerify ? setCalling : undefined} onSchedule={canVerify ? setScheduling : undefined} />
            </div>
            <Pager {...paged} />
          </>
        )}
      </Card>

      {adding && <AddLeadModal onClose={() => setAdding(false)} />}
      {calling && <CallVerifyModal lead={fresh(calling)} onClose={() => setCalling(null)} onScheduleMeeting={setScheduling} />}
      {scheduling && <ScheduleMeetingModal lead={fresh(scheduling)} onClose={() => setScheduling(null)} />}
    </>
  );
}
