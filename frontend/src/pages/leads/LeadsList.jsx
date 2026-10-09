import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiChevronRight, FiPhoneCall, FiPlus, FiSearch } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { AddLeadModal, CallVerifyModal, ScheduleMeetingModal } from "./dialogs";
import { providerName, useLeadData } from "./leadsApi";
import { SOURCES } from "./constants";
import { compactMoney, dayLabel, nextAction } from "./format";
import { useLoaded, usePaged } from "./hooks";
import { Button, Card, Empty, Pager, SkeletonRows, StageBadge, Tabs } from "./ui";
import { useViewer, visibleLeads } from "./viewer";

const QUEUE = ["NEW", "TO_CALL", "NEED_MORE_INFO"];
const OPEN = ["QUALIFIED", "MEETING_SCHEDULED", "VISIT_COMPLETED", "QUOTATION_SENT"];

/** The tabs each persona gets above the list. */
function tabsFor(persona) {
  if (persona === "lead_provider") {
    return [
      { key: "all", label: "All", match: () => true },
      { key: "review", label: "Under Review", match: (l) => QUEUE.includes(l.stage) },
      { key: "progress", label: "In Progress", match: (l) => OPEN.includes(l.stage) },
      { key: "converted", label: "Converted", match: (l) => l.stage === "WON" },
      { key: "rejected", label: "Rejected", match: (l) => l.stage === "NOT_GENUINE" || l.stage === "LOST" },
    ];
  }
  return [
    { key: "all", label: "All Leads", match: () => true },
    { key: "new", label: "New", match: (l) => l.stage === "NEW" },
    { key: "call", label: "To Call", match: (l) => l.stage === "TO_CALL" || l.stage === "NEED_MORE_INFO" },
    { key: "qualified", label: "Qualified", match: (l) => l.stage === "QUALIFIED" },
    { key: "meeting", label: "Meeting Scheduled", match: (l) => l.stage === "MEETING_SCHEDULED" },
    { key: "progress", label: "In Progress", match: (l) => l.stage === "VISIT_COMPLETED" || l.stage === "QUOTATION_SENT" },
    { key: "closed", label: "Converted", match: (l) => l.stage === "WON" },
    { key: "rejected", label: "Rejected", match: (l) => l.stage === "NOT_GENUINE" || l.stage === "LOST" },
  ];
}

/**
 * The leads table. `persona` decides the columns: a provider sees status and
 * feedback only; staff see source, owner and the next action.
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
            <th>Status</th>
            {provider ? <th>Feedback</th> : full && <th>Next Action</th>}
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
              <td>
                <StageBadge stage={lead.stage} />
              </td>
              {provider ? <td className="muted">{lead.providerFeedback || "-"}</td> : full && <td className="muted">{nextAction(lead)}</td>}
              {full && <td className="num">{compactMoney(lead.quote)}</td>}
              <td onClick={(e) => e.stopPropagation()}>
                {onCall && QUEUE.includes(lead.stage) ? (
                  <Button size="sm" icon={<FiPhoneCall />} onClick={() => onCall(lead)}>
                    Call
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
  const [adding, setAdding] = useState(false);
  const [calling, setCalling] = useState(null);
  const [scheduling, setScheduling] = useState(null);

  const mine = useMemo(() => visibleLeads(leads, viewer), [leads, viewer]);
  const tabs = useMemo(() => tabsFor(persona).map((t) => ({ ...t, count: mine.filter(t.match).length })), [persona, mine]);
  const active = tabs.find((t) => t.key === tab) || tabs[0];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine
      .filter(active.match)
      .filter((l) => !source || l.source === source)
      .filter((l) => !q || [l.company, l.contact, l.phone, l.number, l.area].some((v) => String(v).toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [mine, active, source, query]);

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
              ? "Every lead you have submitted, with its current status."
              : persona === "telecaller"
                ? "The shared queue - call new leads and verify them."
                : persona === "sales"
                  ? "Leads you brought in or were assigned."
                  : "Every commercial lead across the team."}
          </p>
        </div>
        <div className="lm-head-actions">
          <Button icon={<FiPlus />} onClick={() => setAdding(true)}>
            {persona === "lead_provider" ? "Submit Lead" : "Add Lead"}
          </Button>
        </div>
      </div>

      <Card flush>
        <Tabs
          tabs={tabs}
          value={active.key}
          onChange={(key) => {
            setTab(key);
            paged.onPage(1);
          }}
        />
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
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
        </div>

        {!ready ? (
          <SkeletonRows rows={6} />
        ) : shown.length === 0 ? (
          <Empty
            title={query || source || active.key !== "all" ? "No matching leads" : "No leads yet"}
            text={query || source || active.key !== "all" ? "Try a different search, source or tab." : "Leads appear here as soon as they are added."}
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
