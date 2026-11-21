import { useNavigate } from "react-router-dom";
import { FiArrowUpRight, FiFileText, FiLayers, FiRepeat } from "react-icons/fi";
import { LuReceiptIndianRupee } from "react-icons/lu";
import { useBilling } from "./billingApi";
import { BILLING_HOME } from "./access";
import { CountUp } from "./ui";

// Masters: the lists billing is set up from, as one page of cards (no expanding menu).

export default function MastersPage() {
  const navigate = useNavigate();
  const { data: contracts } = useBilling("/contracts");
  const { data: pos } = useBilling("/pos");
  const { data: descriptions } = useBilling("/descriptions");
  const { data: frequencies } = useBilling("/frequencies");

  const activeOf = (list) => (Array.isArray(list) ? list.filter((x) => x.is_active !== false).length : null);
  const contractList = Array.isArray(contracts) ? contracts : contracts?.rows;
  const cards = [
    { key: "contracts", icon: FiLayers, color: "blue", title: "Contracts & Price Lists", text: "Per customer: Bill To, services and rates, print copies and email", stat: contractList ? contractList.filter((c) => c.status === "ACTIVE").length : null, statLabel: "Active" },
    { key: "pos", icon: LuReceiptIndianRupee, color: "green", title: "Purchase Orders", text: "Validity, amount and advance POs", stat: pos?.summary?.active ?? null, statLabel: "Active" },
    { key: "descriptions", icon: FiFileText, color: "purple", title: "Invoice Descriptions", text: "Wording printed on invoices", stat: activeOf(descriptions), statLabel: "In use" },
    { key: "frequencies", icon: FiRepeat, color: "orange", title: "Billing Frequencies", text: "Monthly, quarterly, half-yearly…", stat: activeOf(frequencies), statLabel: "In use" },
  ];

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Masters</h1>
          <p className="ac-sub">Lists billing is set up from.</p>
        </div>
      </div>
      <div className="bl-mcards">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button key={c.key} type="button" className={`bl-mcard ${c.color}`} onClick={() => navigate(`${BILLING_HOME}/${c.key}`)}>
              <span className="bl-mcard-top">
                <span className="bl-mcard-icon"><Icon /></span>
                <span className="bl-mcard-go"><FiArrowUpRight /></span>
              </span>
              <span className="bl-mcard-stat">
                <b>{c.stat === null ? "…" : <CountUp value={c.stat} />}</b>
                <small>{c.statLabel}</small>
              </span>
              <span className="bl-mcard-title">{c.title}</span>
              <span className="bl-mcard-text">{c.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
