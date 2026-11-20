import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { FiCheck, FiCheckCircle, FiClock, FiFileText, FiPlus } from "react-icons/fi";
import { ApiError, billingGet, billingPost, billingPut, qs, useBilling } from "./billingApi";
import { GST_RATES, gstHint } from "./calc";
import { CATEGORY_LABEL, amount, dmy, monthLabel, nextBilling, today } from "./format";
import DescriptionPicker from "./DescriptionPicker";
import FrequencySelect from "./FrequencySelect";
import { STATES } from "./states";
import { Field, Msg } from "./ui";
import { deepCleaningServices, pestServices } from "../../components/CreateBookingModal";

// New contract, one step at a time, with everything billing needs in one place:
//   1 Customer      - the customer and its billing profile (Bill To, GSTIN, GST state, payment terms)
//   2 Contract      - billing type, frequency, timing, dates, GST, shortfall rule, description
//   3 Purchase order - only when one is needed: pick one or add a new one here
//   4 Services      - the service, its amount and (Service Plan permission) how many per month
//   5 Review        - the checklist, then Create
// The billing profile (step 1) and a new PO (step 3) are saved when Next is pressed, since they
// are useful on their own; the contract is created only at the last step.
// The customer type (Commercial / Residential) stays on the customer (Companies screen).

// Chemical is not a billing type here: an AMC / One-time / Termite contract bills services,
// chemicals or both ("What is billed" below). Older CHEMICAL contracts keep working as they are.
const TYPES = [["AMC", "AMC"], ["ONE_TIME", "One-time"], ["TERMITE", "Termite"]];
const PO_TYPES = ["CHEMICAL", "TERMITE"]; // always billed against a PO

// The description suggested for a bill of services (SERVICE) or of chemicals (CHEMICAL), by billing type.
// Never one combined wording: services and chemicals each have their own. It is only a default:
// the user can pick another saved wording or type their own.
function suggestDescription(billingType, frequencyMonths, kind) {
  const once = billingType === "ONE_TIME";
  const when = once ? "for {period}" : Number(frequencyMonths) > 1 ? "for {from_month} to {to_month}" : "for the month of {month}";
  if (kind === "CHEMICAL") return `Towards charges for the chemical charges ${when}`;
  if (billingType === "TERMITE") return "Termite Treatment";
  if (once) return "Pest control service carried out on {period}";
  return `Towards charges for the Pest control service carried out ${when}`;
}
const STEP_NAMES = { 1: "Customer", 2: "Contract", 3: "Purchase order", 4: "Services & prices", 5: "Review" };
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const SQM = "sq.m";

let lineKey = 0;
// kind: SERVICE (from the service list) or CHEMICAL (typed; remembered for other customers).
// group: optional invoice line summary - lines with the same summary print as ONE invoice line.
// qty: services per month (agreed) for a service, typed quantity for a chemical.
// site: the outlet the service is for ("" = the whole customer / all outlets).
const newLine = (termite, kind = "SERVICE", site = "") => ({ key: (lineKey += 1), kind, site, item_name: termite && kind === "SERVICE" ? "Termite Post-Construction Treatment" : "", rate: "", area: "", qty: kind === "CHEMICAL" ? 1 : kind === "SERVICE" && !termite ? 1 : "", group: "", picked: false });
// Group based: one service line per ticked company - the item name on the invoice is its outlet
// (or the company name when it has none / several), quantity = services per month, rate = bill value.
// the short code when a service has one: "General Pest Control (GPC)" -> "GPC"
const tagOf = (svc) => /\(([^()]+)\)\s*$/.exec(svc || "")?.[1] || svc || "";
// Group based: the item name on the invoice is the company name.
const companyLine = (c) => ({ ...newLine(false, "SERVICE"), company: c.company_id, site: c.sites?.length === 1 ? c.sites[0].site_id : "", item_name: c.name, base: c.name });
const lineTotal = (l, termite) => Number(l.rate) * (termite && l.kind === "SERVICE" ? Number(l.area) || 0 : Number(l.qty) || 0);

export default function NewContract() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const canPlan = me.can("MANAGE_SERVICE_PLANS");
  const { data: customers } = useBilling("/customers");

  const [step, setStep] = useState(1);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { id, code, planNote }

  // 1. customer + billing profile
  // Opened from a customer's profile (?company=COMP12): that customer is chosen already.
  const [searchParams] = useSearchParams();
  const [companyId, setCompanyId] = useState(searchParams.get("company") || "");
  // Group based contract (?type=group): a group, the ticked companies of it, one Bill To for the
  // group. The first ticked company is the contract's main company (the later steps use it).
  const groupMode = searchParams.get("type") === "group";
  const { data: contractGroups, error: groupsError, reload: reloadGroups } = useBilling(groupMode ? "/contract-groups" : null);
  const [groupId, setGroupId] = useState("");
  const [groupCompanyIds, setGroupCompanyIds] = useState([]);
  const group = (contractGroups || []).find((g) => g.id === groupId) || null;
  const [profile, setProfile] = useState(null); // the form; null while loading
  const [profileSaved, setProfileSaved] = useState(false);
  const customer = (customers || []).find((c) => c.company_id === companyId) || null;
  const pickedCompanies = (group?.companies || []).filter((c) => groupCompanyIds.includes(c.company_id));
  // The main company follows the ticks (the first ticked one, in the group's order).
  useEffect(() => {
    if (!groupMode) return;
    const first = (group?.companies || []).find((c) => groupCompanyIds.includes(c.company_id))?.company_id || "";
    setCompanyId((cur) => (cur === first ? cur : first));
  }, [groupMode, group, groupCompanyIds]);
  const residential = customer?.category === "RESIDENTIAL";

  // 2. contract terms
  const [terms, setTerms] = useState({
    billing_type: "AMC", frequency_months: 1, bill_timing: "ARREARS", start_date: today(), end_date: "", first_bill_from: "",
    shortfall_billing: "PRO_RATA", gst_applicable: true, gst_rate: 18, po_required: false, description_template: null, notes: "",
    separate_bills: null, chemical_description_template: null,
  });
  const setT = (patch) => setTerms((t) => ({ ...t, ...patch }));
  const termite = terms.billing_type === "TERMITE";
  const gstOn = !residential && terms.gst_applicable !== false;
  const needsPo = PO_TYPES.includes(terms.billing_type) || terms.po_required;

  // 3. purchase order
  const [poId, setPoId] = useState("");
  const [addingPo, setAddingPo] = useState(false);
  const [po, setPo] = useState({ po_number: "", po_date: today(), valid_from: "", expiry_date: "", open: false, po_amount: "", kind: "STANDARD", remarks: "" });
  const setP = (patch) => setPo((p) => ({ ...p, ...patch }));
  const { data: poData, reload: reloadPos } = useBilling(companyId && needsPo ? `/pos${qs({ company_id: companyId, status: "ACTIVE" })}` : null);
  const poRows = (poData?.rows || []).filter((p) => p.display_status !== "EXPIRED" && !p.contract_id);
  const emptyPo = { po_number: "", po_date: today(), valid_from: "", expiry_date: "", open: false, po_amount: "", kind: "STANDARD", remarks: "" };
  // Picking an existing PO fills in its details (shown, not edited, here).
  function choosePo(id) {
    const p = poRows.find((x) => x.id === id);
    setPoId(id);
    setAddingPo(false);
    setPo(p
      ? { po_number: p.po_number, po_date: p.po_date || "", valid_from: p.valid_from || "", expiry_date: p.expiry_date || "", open: Boolean(p.is_open_po), po_amount: p.po_amount ?? "", kind: p.kind || "STANDARD", remarks: p.remarks || "" }
      : emptyPo);
  }
  function startNewPo() {
    setPoId("");
    setAddingPo(true);
    setPo(emptyPo);
  }
  function cancelNewPo() {
    setAddingPo(false);
    setPo(emptyPo);
    setMsg({});
  }

  // 4. services and prices
  const [lines, setLines] = useState([newLine(false)]);
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  // Services and / or chemicals: lines of a kind that is switched off are kept but not saved.
  const [kinds, setKinds] = useState({ SERVICE: true, CHEMICAL: false });
  const { data: chemicals } = useBilling("/chemicals");
  // Services are set here, in the customer's billing profile: outlet, service, services per month
  // (agreed) and rate per service. The Service Coordinator's monthly SOS then says how many were
  // completed; Fixed amount bills the agreed number, Service based the completed number.
  const [groupText, setGroupText] = useState("");
  // Group based: the services done at the outlets (one or more, "+ Add service" under them; for the
  // monthly SOS) and one line per ticked company (item name = its outlet, bill value, quantity).
  // Each service has its amount; together they are the bill value of every outlet (filled into the
  // company lines, unless a line's bill value was typed by hand).
  const [groupMain, setGroupMain] = useState({ services: [{ name: "", rate: "" }] });
  const setGroupSvc = (i, patch) => setGroupMain((m) => ({ ...m, services: m.services.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const chosenSvcs = groupMain.services.map((s) => s.name).filter(Boolean);
  const svcRated = groupMain.services.some((s) => s.rate !== "");
  const svcRateSum = Math.round(groupMain.services.reduce((t, s) => t + (Number(s.rate) || 0), 0) * 100) / 100;
  const applySvcRate = () => setLines((ls) => ls.map((l) => (l.company ? { ...l, rate: String(svcRateSum), rateEdited: false } : l)));
  // saved on each line: the full names, or the short codes when the names are too long (100 characters)
  const groupSvcText = (() => {
    const full = chosenSvcs.join(" + ");
    return full.length <= 100 ? full : chosenSvcs.map(tagOf).join(" + ");
  })();
  const svcOf = () => groupSvcText;
  const groupLines = groupMode && !termite;
  useEffect(() => {
    if (!groupMode || !group) return;
    setLines((ls) => {
      if (termite) {
        // termite work is priced per sq. m as before; the company lines are dropped
        if (!ls.some((l) => l.company)) return ls;
        const kept = ls.filter((l) => !l.company);
        return kept.some((l) => l.kind === "SERVICE") ? kept : [newLine(true, "SERVICE"), ...kept];
      }
      // one line per ticked company (typed values kept), then the chemicals
      const rows = pickedCompanies.map((c) => {
        const l = ls.find((x) => x.company === c.company_id && !x.extra) || companyLine(c);
        // a name not typed by hand is the company name (also for lines kept from an earlier draft)
        return !l.edited && (l.item_name !== c.name || l.base !== c.name) ? { ...l, item_name: c.name, base: c.name } : l;
      });
      const next = [...rows, ...ls.filter((l) => !l.company && l.kind !== "SERVICE")];
      return next.length === ls.length && next.every((l, i) => l === ls[i]) ? ls : next;
    });
    // pickedCompanies follows group + groupCompanyIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupMode, group, groupCompanyIds, termite]);
  // The services' amounts added up go into every company line not typed by hand (new lines too).
  useEffect(() => {
    if (!groupMode || !svcRated) return;
    const want = String(svcRateSum);
    setLines((ls) => (ls.some((l) => l.company && !l.rateEdited && l.rate !== want)
      ? ls.map((l) => (l.company && !l.rateEdited ? { ...l, rate: want } : l))
      : ls));
  }, [groupMode, svcRated, svcRateSum, group, groupCompanyIds, termite]);
  function toggleKind(kind) {
    const next = { ...kinds, [kind]: !kinds[kind] };
    if (!next.SERVICE && !next.CHEMICAL) return; // at least one
    setKinds(next);
    if (next[kind] && !lines.some((l) => l.kind === kind)) setLines((ls) => [...ls, newLine(false, kind)]);
  }
  const { data: options } = useBilling(companyId ? `/service-options${qs({ company_id: companyId })}` : null);
  const sites = options?.sites || [];
  // Several outlets: each service line says which outlet it is for (or "All outlets").
  const multiOutlet = sites.length > 1;
  const ALL = "*";
  const serviceGroups = useMemo(() => groupsFor(options), [options]);

  const steps = [
    { n: 1, title: groupMode ? "Group" : "Customer" },
    { n: 2, title: "Contract" },
    ...(needsPo ? [{ n: 3, title: "Purchase order" }] : []),
    { n: 4, title: "Services & prices" },
    { n: 5, title: "Review" },
  ];
  const at = steps.findIndex((s) => s.n === step);

  // ---- unfinished contract: kept on this device, offered again next time ------------------------
  // Everything typed is saved in this browser (localStorage) as you go. Leaving and coming back
  // shows "Continue" / "Start over". Nothing is sent to the server until "Create contract".
  const draftKey = `bl-new-contract${groupMode ? "-group" : ""}:${localStorage.getItem("userId") || "me"}`;
  const [resume, setResume] = useState(() => {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || "null");
      return d && d.v === 1 && Date.now() - d.savedAt < 30 * 86400000 && d.companyId ? d : null;
    } catch {
      return null;
    }
  });
  const [savedAt, setSavedAt] = useState(null);
  useEffect(() => {
    if (resume || done || !companyId) return undefined; // not while the "continue?" choice is open
    const id = setTimeout(() => {
      try {
        const now = Date.now();
        localStorage.setItem(draftKey, JSON.stringify({
          v: 1, savedAt: now, step, companyId, customerName: customer?.name || "", stepsTotal: steps.length,
          terms, lines, kinds, poId, addingPo, po, groupText, groupId, groupCompanyIds, groupMain,
        }));
        setSavedAt(now);
      } catch { /* storage full or blocked: the form still works */ }
    }, 400);
    return () => clearTimeout(id);
    // steps / customer are derived from the saved fields
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, done, companyId, step, terms, lines, kinds, poId, addingPo, po, groupText, groupId, groupCompanyIds, groupMain]);
  function continueDraft() {
    const d = resume;
    lineKey = Math.max(lineKey, ...d.lines.map((l) => Number(l.key) || 0));
    setCompanyId(d.companyId);
    setProfile(null);
    // A draft saved when "Chemical" was still a billing type: AMC billing chemicals.
    const oldChemical = d.terms?.billing_type === "CHEMICAL";
    setTerms(oldChemical ? { ...d.terms, billing_type: "AMC" } : d.terms);
    setLines(d.lines);
    setKinds(oldChemical ? { SERVICE: false, CHEMICAL: true } : d.kinds);
    setPoId(d.poId || "");
    setAddingPo(Boolean(d.addingPo));
    setPo(d.po);
    setGroupText(d.groupText || "");
    if (groupMode) {
      setGroupId(d.groupId || "");
      setGroupCompanyIds(d.groupCompanyIds || []);
      const svcs = (d.groupMain?.services || [d.groupMain?.service || d.groupSvcs?.[0]?.service || d.groupService || ""])
        .map((s) => (typeof s === "string" ? { name: s, rate: "" } : s));
      setGroupMain({ services: svcs.length ? svcs : [{ name: "", rate: "" }] });
    }
    setStep(d.step);
    setResume(null);
    setMsg({ ok: `Continuing your contract for ${d.customerName || "the customer"}.` });
  }
  function startOver() {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    setResume(null);
  }
  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } };
  // The first invoice starts at "First bill from" when given (billed elsewhere until then), else at the start date.
  const next = nextBilling(terms, terms.first_bill_from || terms.start_date);

  // Description on invoice: required, typed or picked from the master list. Until it is touched, the wording
  // that fits the billing type and what is billed (services / chemicals / both) is suggested.
  // Both ticked: "Separate bills?" (terms.separate_bills, null until answered). Separate = two contracts
  // made on Create, one for services and one for chemicals, each with its own description, same PO.
  const both = kinds.SERVICE && kinds.CHEMICAL;
  const separate = both && terms.separate_bills === true;
  // The main description: services (or the only kind billed); a single bill for both uses the services wording.
  const suggested = suggestDescription(terms.billing_type, terms.frequency_months, kinds.SERVICE ? "SERVICE" : "CHEMICAL");
  const description = (terms.description_template ?? suggested).trim();
  const suggestedChemical = suggestDescription(terms.billing_type, terms.frequency_months, "CHEMICAL");
  const chemicalDescription = (terms.chemical_description_template ?? suggestedChemical).trim();

  // Load the customer's billing profile, or start a new one from the customer's details.
  // (A group contract uses the group's Bill To instead, loaded below.)
  useEffect(() => {
    if (!companyId || groupMode) return undefined;
    let live = true;
    billingGet(`/profiles/${encodeURIComponent(companyId)}`)
      .catch((err) => (err instanceof ApiError && err.status === 404 ? null : Promise.reject(err)))
      .then((p) => {
        if (!live) return;
        setProfileSaved(Boolean(p));
        setProfile(p
          ? { billing_name: p.billing_name || "", gst_number: p.gst_number || "", billing_address: p.billing_address || "", state_code: p.state_code || "29", payment_terms_days: p.payment_terms_days ?? 30 }
          : { billing_name: customer?.display_name || customer?.name || "", gst_number: customer?.gst_number || "", billing_address: "", state_code: "29", payment_terms_days: 30 });
      })
      .catch((err) => live && setMsg({ error: err.message }));
    return () => {
      live = false;
    };
    // customer is looked up from companyId; reloading on its identity alone would refetch needlessly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // The group's Bill To: loaded when the group is chosen, or started from the group's name.
  useEffect(() => {
    if (!groupMode || !groupId) return undefined;
    let live = true;
    setProfile(null);
    billingGet(`/group-profiles/${encodeURIComponent(groupId)}`)
      .catch((err) => (err instanceof ApiError && err.status === 404 ? null : Promise.reject(err)))
      .then((p) => {
        if (!live) return;
        setProfileSaved(Boolean(p));
        setProfile(p
          ? { billing_name: group?.name || p.billing_name || "", gst_number: p.gst_number || "", billing_address: p.billing_address || "", state_code: p.state_code || "29", payment_terms_days: p.payment_terms_days ?? 30 }
          : { billing_name: group?.name || "", gst_number: "", billing_address: "", state_code: "29", payment_terms_days: 30 });
      })
      .catch((err) => live && setMsg({ error: err.message }));
    return () => {
      live = false;
    };
    // group is looked up from groupId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupMode, groupId]);

  function chooseGroup(id) {
    setGroupId(id);
    setGroupCompanyIds([]);
    setProfile(null);
    setProfileSaved(false);
    setPoId("");
    setAddingPo(false);
    setPo(emptyPo);
    setMsg({});
  }
  const toggleCompany = (id) => setGroupCompanyIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  function chooseCustomer(id) {
    setCompanyId(id);
    setProfile(null);
    setProfileSaved(false);
    setPoId("");
    setAddingPo(false);
    setPo(emptyPo);
    setMsg({});
  }

  // Step 1 shows the billing fields from the start: empty and locked until a customer is chosen.
  const shown = profile || { billing_name: "", gst_number: "", billing_address: "", state_code: "29", payment_terms_days: 30 };
  const locked = groupMode ? !groupId || !profile : !customer?.category || !profile;

  // ---- step checks and Next --------------------------------------------------------------------
  function problems() {
    if (step === 1 && groupMode) {
      if (!groupId) return "Choose the group.";
      if (!pickedCompanies.length) return "Tick at least one company of the group.";
      const untyped = pickedCompanies.find((c) => !c.category);
      if (untyped) return `${untyped.name}: the customer type is not set. Set it on the customer in Companies first.`;
      if (new Set(pickedCompanies.map((c) => c.category)).size > 1) return "The ticked companies must all be Commercial or all Residential (it decides GST).";
      if (!profile) return "Loading the billing details…";
      if (!profile.billing_name.trim()) return "Type the billing name.";
      if (!profile.billing_address.trim()) return "Type the billing address.";
      const gg = profile.gst_number.trim();
      if (pickedCompanies[0].category !== "RESIDENTIAL" && !gg) return "Type the GSTIN (Commercial customers are billed with GST).";
      if (gg && !GSTIN_RE.test(gg)) return "GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5.";
      if (gg && gg.slice(0, 2) !== profile.state_code) return `The GSTIN starts with ${gg.slice(0, 2)} but the state is ${profile.state_code}; they must match.`;
      return "";
    }
    if (step === 1) {
      if (!companyId) return "Choose the customer.";
      if (!customer?.category) return "This customer's type (Corporate / Individual / RWA) is not set. Set it on the customer in Companies first.";
      if (!profile) return "Loading the billing details…";
      if (!profile.billing_name.trim()) return "Type the billing name.";
      if (!profile.billing_address.trim()) return "Type the billing address.";
      const g = profile.gst_number.trim();
      if (!residential && !g) return "Type the GSTIN (Commercial customers are billed with GST).";
      if (g && !GSTIN_RE.test(g)) return "GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5.";
      if (g && g.slice(0, 2) !== profile.state_code) return `The GSTIN starts with ${g.slice(0, 2)} but the state is ${profile.state_code}; they must match.`;
    }
    if (step === 2) {
      if (terms.billing_type !== "ONE_TIME" && !terms.frequency_months) return "Choose the billing frequency.";
      if (!terms.start_date) return "Choose the start date.";
      if (terms.end_date && terms.end_date < terms.start_date) return "The term end date cannot be before the term start date.";
      if (terms.first_bill_from && terms.first_bill_from < terms.start_date) return "First bill from cannot be before the term start date.";
      if (terms.first_bill_from && terms.end_date && terms.first_bill_from > terms.end_date) return "First bill from cannot be after the term end date.";
      if (gstOn && !GST_RATES.includes(Number(terms.gst_rate))) return `GST rate must be one of ${GST_RATES.join(", ")} %.`;
      if (both && typeof terms.separate_bills !== "boolean") return "Choose whether pest control and chemicals are billed separately.";
      if (!description) return separate ? "Type or choose the description for the pest control bill." : "Type or choose the description on invoice.";
      if (separate && !chemicalDescription) return "Type or choose the description for the chemical bill.";
    }
    if (step === 3) {
      if (addingPo) {
        if (!po.po_number.trim()) return "Type the PO number.";
        if (!po.po_date) return "Choose the PO date.";
        if (po.kind === "ADVANCE" && po.po_amount === "") return "An advance PO needs its amount.";
      } else if (!poId) return "Choose a purchase order, or add a new one.";
    }
    if (step === 4) {
      const filled = lines.filter((l) => kinds[l.kind] && (l.item_name || l.rate !== ""));
      if (!filled.length) return "Add at least one service or chemical with its amount.";
      if (kinds.SERVICE && groupLines) {
        if (!chosenSvcs.length) return "Choose the service done at the outlets.";
        if (chosenSvcs.length !== groupMain.services.length) return "Choose the added service, or remove it with ✕.";
        if (new Set(chosenSvcs).size !== chosenSvcs.length) return "The same service is added twice.";
        if (groupSvcText.length > 100) return "Too many services for one line. Remove one, or pick a combined service.";
        const rows = lines.filter((l) => l.company);
        if (!rows.length) return "Tick at least one company in step 1.";
        const bad = rows.find((l) => !l.item_name.trim() || l.rate === "" || Number(l.rate) < 0 || !(Number.isInteger(Number(l.qty)) && Number(l.qty) >= 1 && Number(l.qty) <= 999));
        if (bad) return `${bad.item_name.trim() || "A company"}: type the item name, the bill value and the quantity (1 or more).`;
        const names = rows.map((l) => l.item_name.trim().toLowerCase());
        if (new Set(names).size !== names.length) return "Two lines have the same item name. Make each item name different (e.g. add the service).";
      } else if (kinds.SERVICE && !termite) {
        const svc = lines.filter((l) => l.kind === "SERVICE");
        const bad = svc.findIndex((l) => !l.item_name || l.rate === "" || Number(l.rate) < 0 || !(Number.isInteger(Number(l.qty)) && Number(l.qty) >= 1 && Number(l.qty) <= 999));
        if (bad >= 0) return `Service ${bad + 1}: choose the service, the services per month (1 or more) and the rate per service.`;
        if (multiOutlet && svc.some((l) => !l.site)) return "Choose the outlet for each service (or “All outlets”).";
        const keys = svc.map((l) => `${l.site}|${l.item_name.trim().toLowerCase()}`);
        if (new Set(keys).size !== keys.length) return "The same service is listed twice for the same outlet.";
      }
      const badQty = filled.find((l) => l.kind === "CHEMICAL" && !(Number(l.qty) > 0));
      if (badQty) return `Type the quantity for ${badQty.item_name || "the chemical"}.`;
      for (const kind of termite ? ["SERVICE", "CHEMICAL"] : ["CHEMICAL"]) {
        const own = filled.filter((l) => l.kind === kind);
        const word = kind === "SERVICE" ? "Service" : "Chemical";
        const bad = own.findIndex((l) => !l.item_name.trim() || l.rate === "" || Number(l.rate) < 0 || (termite && kind === "SERVICE" && !(Number(l.area) > 0)));
        if (bad >= 0) return `${word} ${bad + 1}: ${kind === "SERVICE" ? "choose the service" : "type the chemical"} and the ${termite && kind === "SERVICE" ? "rate and the area" : "amount"}.`;
        const names = own.map((l) => l.item_name.trim().toLowerCase());
        if (new Set(names).size !== names.length) return `The same ${word.toLowerCase()} is listed twice.`;
      }
    }
    return "";
  }

  async function goNext() {
    const problem = problems();
    if (problem) {
      setMsg({ error: problem });
      return;
    }
    setMsg({});
    setBusy(true);
    try {
      if (step === 1 && groupMode) {
        // The group's Bill To, saved now (one for the whole group).
        await billingPut(`/group-profiles/${encodeURIComponent(groupId)}`, {
          billing_name: group.name, billing_address: profile.billing_address.trim(), state_code: profile.state_code,
          payment_terms_days: Number(profile.payment_terms_days) || 0, gst_number: profile.gst_number.trim().toUpperCase(),
        });
        setProfileSaved(true);
      } else if (step === 1) {
        // Saved now: the customer can be invoiced from here on, whatever happens next.
        await billingPut(`/profiles/${encodeURIComponent(companyId)}`, {
          billing_name: profile.billing_name.trim(), billing_address: profile.billing_address.trim(), state_code: profile.state_code,
          payment_terms_days: Number(profile.payment_terms_days) || 0, is_active: true, gst_number: profile.gst_number.trim().toUpperCase(),
        });
        setProfileSaved(true);
      }
      if (step === 3 && addingPo) {
        const created = await billingPost("/pos", {
          company_id: companyId, contract_id: null, po_number: po.po_number.trim(), po_date: po.po_date,
          valid_from: po.valid_from || null, expiry_date: po.open ? null : po.expiry_date || null,
          po_amount: po.po_amount === "" ? null : po.po_amount, kind: po.kind, remarks: po.remarks || null,
        });
        setPoId(created.id);
        setAddingPo(false);
        reloadPos();
      }
      setStep(steps[at + 1].n);
    } catch (err) {
      setMsg({ error: err.message, errors: err.errors });
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    setMsg({});
    if (at > 0) setStep(steps[at - 1].n);
  }

  // ---- create ---------------------------------------------------------------------------------
  const filledLines = lines.filter((l) => kinds[l.kind] && l.item_name && l.rate !== "");
  const total = filledLines.reduce((t, l) => t + lineTotal(l, termite), 0);
  const oneSite = sites.length === 1 ? sites[0].site_id : null;

  // Separate bills: the pest control contract made, while the chemical one failed (Create again makes only that).
  const [madeServices, setMadeServices] = useState(null);

  async function create() {
    setBusy(true);
    setMsg({});
    let first = madeServices;
    try {
      const body = {
        company_id: companyId,
        ...(groupMode ? { contract_kind: "GROUP", group_id: groupId, company_ids: pickedCompanies.map((c) => c.company_id) } : {}),
        billing_type: terms.billing_type,
        frequency_months: terms.billing_type === "ONE_TIME" ? null : Number(terms.frequency_months) || 1,
        bill_timing: terms.bill_timing,
        start_date: terms.start_date,
        end_date: terms.end_date || null,
        first_bill_from: terms.first_bill_from || null,
        invoice_grouping: "PER_CUSTOMER",
        site_id: null,
        po_required: needsPo,
        gst_applicable: gstOn,
        gst_rate: gstOn ? Number(terms.gst_rate) : 18,
        ...(needsPo ? { po_ids: poId ? [poId] : [] } : {}),
        shortfall_billing: terms.shortfall_billing,
        description_template: description,
        notes: terms.notes || null,
        lines: filledLines.map((l) => {
          const common = { site_id: groupMode ? null : oneSite, item_kind: l.kind, invoice_group: (l.group || "").trim() || null };
          if (groupMode && l.company) {
            // one invoice line per company: item name, bill value (rate per service) x quantity (services per month)
            return {
              ...common, company_id: l.company, site_id: l.site || null, item_name: l.item_name.trim(), sac_code: "998531", pricing_basis: "PER_SERVICE",
              unit: "Service", rate: l.rate, default_qty: Number(l.qty) || 1, plan_service_type: null, plan_sub_service: svcOf(l),
            };
          }
          if (l.kind === "CHEMICAL") {
            // a typed chemical: a fixed amount each period, not part of the service plan
            return { ...common, item_name: l.item_name.trim(), sac_code: null, pricing_basis: "PER_UNIT", unit: "Nos", rate: l.rate, default_qty: Number(l.qty), plan_service_type: null, plan_sub_service: null };
          }
          return termite
            ? { ...common, item_name: l.item_name, sac_code: "998531", pricing_basis: "PER_UNIT", unit: SQM, rate: l.rate, default_qty: l.area }
            : {
              // rate per service x services. default_qty = services per month agreed (Fixed amount
              // bills it every month); Service based bills the completed number from the SOS.
              ...common, site_id: multiOutlet ? (l.site === ALL ? null : l.site || null) : oneSite,
              item_name: l.item_name, sac_code: "998531", pricing_basis: "PER_SERVICE", unit: "Service", rate: l.rate, default_qty: Number(l.qty) || 1,
              plan_service_type: null, plan_sub_service: l.item_name,
            };
        }),
      };
      const planNote = "";
      if (!separate) {
        const created = await billingPost("/contracts", body);
        clearDraft();
        setDone({ id: created.id, code: created.contract_code, planNote });
        return;
      }
      // Separate bills: two contracts, one per kind, each with its own description. The PO is shared
      // (left unlinked so both contracts' Bill Runs use it).
      const { po_ids: _unused, ...shared } = body;
      const po = needsPo && poId ? { shared_po_id: poId } : {};
      const only = (kind) => body.lines.filter((l) => l.item_kind === kind);
      if (!first) {
        first = await billingPost("/contracts", { ...shared, ...po, description_template: description, lines: only("SERVICE") });
        setMadeServices(first);
      }
      const second = await billingPost("/contracts", { ...shared, ...po, description_template: chemicalDescription, lines: only("CHEMICAL") });
      clearDraft();
      setDone({ id: first.id, code: `${first.contract_code} (pest control) and ${second.contract_code} (chemicals)`, planNote, plural: true });
    } catch (err) {
      setMsg(first
        ? { error: `Contract ${first.contract_code} (pest control) was created, but the chemicals contract was not: ${err.message} Fix it and press Create again; only the chemicals contract will be made.`, errors: err.errors }
        : { error: err.message, errors: err.errors });
    } finally {
      setBusy(false);
    }
  }

  // ---- screens --------------------------------------------------------------------------------
  if (done) {
    return (
      <div className="ac-page nc-page">
        <div className="nc-success">
          <div className="nc-success-hero">
            <div className="nc-success-mark"><FiCheck /></div>
            <div>
              <h2>{done.plural ? "Contracts" : "Contract"} {done.code} created</h2>
              <p>{customer?.name}{next ? ` · first invoice ${dmy(next.start)} to ${dmy(next.end)}` : ""}</p>
            </div>
          </div>

          <div className="nc-success-grid">
            <div className="nc-success-card">
              <div className="nc-sum-head"><FiFileText /> What was set up</div>
              <dl className="nc-success-dl">
                {groupMode ? <><dt>Group</dt><dd>{group?.name} · {pickedCompanies.length} companies</dd></> : <><dt>Customer</dt><dd>{customer?.name}</dd></>}
                <dt>Billing</dt><dd>{TYPES.find(([v]) => v === terms.billing_type)?.[1]}{terms.billing_type !== "ONE_TIME" ? `, every ${terms.frequency_months} month${Number(terms.frequency_months) > 1 ? "s" : ""}` : ""} · {terms.bill_timing === "ADVANCE" ? "start" : "end"} of the month</dd>
                <dt>Structure</dt><dd>{terms.shortfall_billing === "FULL" ? "Fixed amount - the agreed services every month" : "Service based - the services completed"}</dd>
                <dt>GST</dt><dd>{gstOn ? `${terms.gst_rate}%` : "No GST"}</dd>
                {terms.first_bill_from && terms.first_bill_from !== terms.start_date && <><dt>First bill from</dt><dd>{dmy(terms.first_bill_from)}</dd></>}
                <dt>Services</dt><dd>{filledLines.length} line{filledLines.length === 1 ? "" : "s"} · ₹{amount(total)} per period{gstOn ? " + GST" : ""}</dd>
              </dl>
            </div>
            <div className="nc-success-card">
              <div className="nc-sum-head"><FiClock /> What happens next</div>
              <ol className="nc-next">
                {!termite && kinds.SERVICE && <li><b>Service Coordinator</b><span>Fills the Monthly SOS{next ? ` for ${monthLabel(next.start.slice(0, 7))}` : ""}: services completed at each outlet.</span></li>}
                <li><b>Bill Run{next ? ` · ${monthLabel(next.billMonth)}` : ""}</b><span>The contract shows as ready once the SOS is in; generate the draft in one click.</span></li>
                <li><b>Issue &amp; send</b><span>Issued with the next number, printed and emailed as set in the customer’s profile.</span></li>
              </ol>
            </div>
          </div>

          <div className="nc-success-actions">
            <button type="button" className="ac-btn" onClick={() => navigate("/billing/contracts")}>All contracts</button>
            <button type="button" className="ac-btn" onClick={() => navigate(`/billing/customers/${encodeURIComponent(companyId)}`)}>Customer profile</button>
            <button type="button" className="ac-btn" onClick={() => window.location.reload()}><FiPlus /> Another contract</button>
            <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate(`/billing/contracts/${done.id}`, { replace: true })}>Open contract</button>
          </div>
        </div>
      </div>
    );
  }

  // Invoice line summaries: ticked lines get one summary; each summary prints as one invoice line.
  const picked = filledLines.filter((l) => l.picked);
  const pickedTotal = picked.reduce((t, l) => t + lineTotal(l, termite), 0);
  const groups = [...filledLines.reduce((m, l) => {
    const g = (l.group || "").trim();
    if (g) m.set(g, [...(m.get(g) || []), l]);
    return m;
  }, new Map())];
  function applyGroup() {
    const text = groupText.replace(/\s+/g, " ").trim();
    if (!text || !picked.length) return;
    const keys = new Set(picked.map((l) => l.key));
    setLines((ls) => ls.map((l) => (keys.has(l.key) ? { ...l, group: text, picked: false } : l)));
    setGroupText("");
  }
  const removeGroup = (name) => setLines((ls) => ls.map((l) => ((l.group || "").trim() === name ? { ...l, group: "" } : l)));

  return (
    <div className="ac-page nc-page">
      <div className="ac-head">
        <div>
          <div className="ac-crumb"><button type="button" onClick={() => navigate("/billing/contracts")}>Contracts</button> / New</div>
          <h1 className="ac-title">New Contract</h1>
        </div>
      </div>

      {resume && (
        <div className="nc-resume" role="status">
          <span className="nc-resume-ic"><FiClock /></span>
          <div className="nc-resume-text">
            <b>You have an unfinished contract{resume.customerName ? ` for ${resume.customerName}` : ""}</b>
            <span>At “{STEP_NAMES[resume.step] || "Customer"}” · saved {new Date(resume.savedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} on this device</span>
          </div>
          <button type="button" className="ac-btn" onClick={startOver}>Start over</button>
          <button type="button" className="ac-btn ac-btn-primary" onClick={continueDraft}>Continue</button>
        </div>
      )}

      <ol className="nc-track" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s.n} className={i < at ? "done" : i === at ? "on" : ""} aria-current={i === at ? "step" : undefined}>
            <span className="nc-dot">{i < at ? <FiCheck /> : i + 1}</span>
            <span className="nc-lbl">{s.title}</span>
          </li>
        ))}
      </ol>

      <div className="nc-layout">
      <div className="ac-card nc-card">
        {step === 1 && groupMode && (
          <>
            <h3 className="nc-title">Group and billing details</h3>
            <Field label="Group" required>
              <select className="ac-select" value={groupId} onChange={(e) => chooseGroup(e.target.value)}>
                <option value="">{contractGroups ? (contractGroups.length ? "Choose the group…" : "No groups with companies yet") : groupsError ? "Could not load the groups" : "Loading…"}</option>
                {(contractGroups || []).map((g) => <option key={g.id} value={g.id}>{g.name} ({g.companies.length} compan{g.companies.length === 1 ? "y" : "ies"})</option>)}
              </select>
            </Field>
            {groupsError && !contractGroups && (
              <div className="bl-msg err" role="alert">
                Could not load the groups: {groupsError}{" "}
                <button type="button" className="ac-btn sm" onClick={reloadGroups}>Try again</button>
              </div>
            )}
            {group && (
              <div className="nc-group-cos">
                <div className="nc-group-cos-head">
                  <span className="nc-sec-title" style={{ margin: 0 }}>Companies in {group.name}</span>
                  <span className="ac-actions" style={{ gap: 6 }}>
                    <span className="ac-sub" style={{ fontSize: 12.5 }}>{pickedCompanies.length} of {group.companies.length} ticked</span>
                    <button type="button" className="ac-btn sm" onClick={() => setGroupCompanyIds(group.companies.map((c) => c.company_id))}>Select all</button>
                    <button type="button" className="ac-btn sm" disabled={!groupCompanyIds.length} onClick={() => setGroupCompanyIds([])}>Clear</button>
                  </span>
                </div>
                <div className="nc-group-list">
                  {group.companies.map((c) => (
                    <label key={c.company_id} className={`nc-group-co ${groupCompanyIds.includes(c.company_id) ? "on" : ""}`}>
                      <input type="checkbox" className="bl-cb" checked={groupCompanyIds.includes(c.company_id)} onChange={() => toggleCompany(c.company_id)} />
                      <span className="nc-group-co-text">
                        <b>{c.name}</b>
                        <span className="ac-sub">{[c.category ? CATEGORY_LABEL[c.category] : "Customer type not set", c.outlets].filter(Boolean).join(" · ")}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="nc-chip-row"><span className="ac-sub">{group ? "One Bill To for the group: every invoice of this contract is billed to it." : "Choose the group; its Bill To is filled in below."}</span></div>
            <div className="bl-grid g2" style={{ marginTop: 6 }}>
              <Field label="Billing name" required hint="The group name: a group contract is billed in the group’s name">
                <input className="ac-input" disabled value={group?.name || ""} readOnly />
              </Field>
              <Field label="GSTIN" required={pickedCompanies[0]?.category !== "RESIDENTIAL"} hint="15 characters; the state follows its first 2 digits">
                <input className="ac-input" disabled={locked} value={shown.gst_number} maxLength={15} placeholder="e.g. 29ABCDE1234F1Z5" style={{ textTransform: "uppercase" }}
                  onChange={(e) => {
                    const g = e.target.value.replace(/\s+/g, "").toUpperCase();
                    const code = g.slice(0, 2);
                    setProfile({ ...shown, gst_number: g, ...(STATES.some(([c]) => c === code) ? { state_code: code } : {}) });
                  }} />
              </Field>
              <Field label="Billing address" required className="bl-span2">
                <textarea className="ac-textarea" rows={3} disabled={locked} value={shown.billing_address} maxLength={1000} placeholder="As printed under Bill To" onChange={(e) => setProfile({ ...shown, billing_address: e.target.value })} />
              </Field>
              <Field label="State (GST)" required hint={shown.state_code === "29" ? "Karnataka: CGST + SGST" : "Outside Karnataka: IGST"}>
                <select className="ac-select" disabled={locked} value={shown.state_code} onChange={(e) => setProfile({ ...shown, state_code: e.target.value })}>
                  {STATES.map(([code, name]) => <option key={code} value={code}>{code} – {name}</option>)}
                </select>
              </Field>
              <Field label="Payment terms (days)">
                <input type="number" min="0" max="365" className="ac-input" disabled={locked} value={shown.payment_terms_days} onChange={(e) => setProfile({ ...shown, payment_terms_days: e.target.value })} />
              </Field>
            </div>
          </>
        )}

        {step === 1 && !groupMode && (
          <>
            <h3 className="nc-title">Customer and billing details</h3>
            <Field label="Customer" required>
              <select className="ac-select" value={companyId} onChange={(e) => chooseCustomer(e.target.value)}>
                <option value="">Choose a customer…</option>
                {(customers || []).map((c) => <option key={c.company_id} value={c.company_id}>{c.name}{!c.category ? " (customer type not set)" : ""}</option>)}
              </select>
            </Field>
            {customer && !customer.category && (
              <div className="ac-info error" style={{ marginTop: 10 }}>⚠ This customer&apos;s type (Corporate / Individual / RWA) is not set, so it cannot be billed yet. Set it on the customer in Companies, then come back.</div>
            )}
            {/* The billing fields show from the start; they open for typing once a customer is chosen. */}
            {customer?.category ? (
              <div className="nc-chip-row">
                <span className={`ac-badge ${residential ? "b-purple" : "b-blue"}`}>{CATEGORY_LABEL[customer.category]}</span>
                <span className="ac-sub">{residential ? "Billed without GST" : "Billed with GST"} · {!profile ? "Loading the billing details…" : profileSaved ? "Billing details found; check and continue" : "No billing details yet; fill them in"}</span>
              </div>
            ) : (
              <div className="nc-chip-row"><span className="ac-sub">{customer ? "Set the customer type first; the billing details open after that." : "Choose the customer; its billing details are filled in below."}</span></div>
            )}
            <div className="bl-grid g2" style={{ marginTop: 6 }}>
              <Field label="Billing name" required>
                <input className="ac-input" disabled={locked} value={shown.billing_name} maxLength={255} onChange={(e) => setProfile({ ...shown, billing_name: e.target.value })} />
              </Field>
              {!residential ? (
                <Field label="GSTIN" required hint={customer?.gst_number && shown.gst_number === customer.gst_number ? "From the customer record; the state follows its first 2 digits" : "15 characters; the state follows its first 2 digits"}>
                  <input className="ac-input" disabled={locked} value={shown.gst_number} maxLength={15} placeholder="e.g. 29ABCDE1234F1Z5" style={{ textTransform: "uppercase" }}
                    onChange={(e) => {
                      const g = e.target.value.replace(/\s+/g, "").toUpperCase();
                      const code = g.slice(0, 2);
                      setProfile({ ...shown, gst_number: g, ...(STATES.some(([c]) => c === code) ? { state_code: code } : {}) });
                    }} />
                </Field>
              ) : <div />}
              <Field label="Billing address" required className="bl-span2">
                <textarea className="ac-textarea" rows={3} disabled={locked} value={shown.billing_address} maxLength={1000} placeholder="As printed under Bill To" onChange={(e) => setProfile({ ...shown, billing_address: e.target.value })} />
              </Field>
              <Field label="State (GST)" required hint={shown.state_code === "29" ? "Karnataka: CGST + SGST" : "Outside Karnataka: IGST"}>
                <select className="ac-select" disabled={locked} value={shown.state_code} onChange={(e) => setProfile({ ...shown, state_code: e.target.value })}>
                  {STATES.map(([code, name]) => <option key={code} value={code}>{code} – {name}</option>)}
                </select>
              </Field>
              <Field label="Payment terms (days)">
                <input type="number" min="0" max="365" className="ac-input" disabled={locked} value={shown.payment_terms_days} onChange={(e) => setProfile({ ...shown, payment_terms_days: e.target.value })} />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="nc-title">Contract terms</h3>
            <Field label="Billing type" required>
              <div className="ac-pills">
                {TYPES.map(([v, l]) => (
                  <button key={v} type="button" className={`ac-pill ${terms.billing_type === v ? "active" : ""}`}
                    onClick={() => {
                      setT({ billing_type: v, frequency_months: v === "ONE_TIME" ? null : terms.frequency_months || 1, po_required: PO_TYPES.includes(v) ? true : terms.po_required });
                      if (lines.every((l) => l.rate === "")) setLines([newLine(v === "TERMITE")]);
                    }}>{l}</button>
                ))}
              </div>
            </Field>
            <div className="bl-grid g2" style={{ marginTop: 12 }}>
              <Field label="Billing frequency" required>
                <FrequencySelect value={terms.frequency_months} oneTime={terms.billing_type === "ONE_TIME"} onChange={(v) => setT({ frequency_months: v })} />
              </Field>
              <Field label="Bill date" required>
                <select className="ac-select" value={terms.bill_timing} onChange={(e) => setT({ bill_timing: e.target.value })}>
                  <option value="ADVANCE">Start of the month</option>
                  <option value="ARREARS">End of the month</option>
                </select>
              </Field>
              <Field label="Term start date" required><input type="date" className="ac-input" value={terms.start_date} onChange={(e) => setT({ start_date: e.target.value })} /></Field>
              <Field label="Term end date" hint="Leave empty if it runs until ended"><input type="date" className="ac-input" value={terms.end_date} onChange={(e) => setT({ end_date: e.target.value })} /></Field>
              <Field label="First bill from" hint="Already billed in Vyapar? Enter the first date not billed yet. Leave empty to bill from the start date.">
                <input type="date" className="ac-input" value={terms.first_bill_from} min={terms.start_date || undefined} max={terms.end_date || undefined} onChange={(e) => setT({ first_bill_from: e.target.value })} />
              </Field>
              <Field label="GST" hint={residential ? "Residential customer: never charged GST" : gstOn ? gstHint(terms.gst_rate, profile?.state_code) : "Invoices go out without GST"}>
                <div className="nc-gst">
                  <select className="ac-select" value={gstOn ? "YES" : "NO"} disabled={residential} onChange={(e) => setT({ gst_applicable: e.target.value === "YES" })}>
                    <option value="YES">Apply GST</option>
                    <option value="NO">No GST</option>
                  </select>
                  {gstOn && (
                    <span className="nc-rate">
                      <input type="number" min="5" max="28" step="1" className="ac-input" value={terms.gst_rate} onChange={(e) => setT({ gst_rate: e.target.value })} aria-label="GST rate in percent" />
                      <b>%</b>
                    </span>
                  )}
                </div>
              </Field>
              <Field label="Bill structure" hint={terms.shortfall_billing === "FULL" ? "The full amount every period, even if a service is missed" : "Billed for the services actually done (amount ÷ planned × done)"}>
                <select className="ac-select" value={terms.shortfall_billing} onChange={(e) => setT({ shortfall_billing: e.target.value })}>
                  <option value="FULL">Fixed amount</option>
                  <option value="PRO_RATA">Service based</option>
                </select>
              </Field>
              <Field label="Purchase order">
                <label className="bl-toggle">
                  <input type="checkbox" checked={needsPo} disabled={PO_TYPES.includes(terms.billing_type)} onChange={(e) => setT({ po_required: e.target.checked })} />
                  {PO_TYPES.includes(terms.billing_type) ? "Always needed for this type" : "This customer needs a PO on its invoices"}
                </label>
              </Field>
              <Field label={separate ? "Description – pest control bill" : "Description on invoice"} required hint={description ? `On the invoice: “${descriptionPreview(description, next)}”` : "Type it, or choose a saved one. {month}, {period}, {from_month}, {to_month} are filled in. A new wording is saved for next time."}>
                <DescriptionPicker value={terms.description_template ?? suggested} onChange={(text) => setT({ description_template: text })} />
              </Field>
              {/* What is billed: services, chemicals or both - beside the description it suggests; also sets the lines in step 4.
                  Both: asks whether they are billed separately (two invoices) or on one bill. */}
              <Field label="What is billed" required hint={both ? "" : "Choose one or both"}>
                <div className="nc-kinds" role="group" aria-label="What is billed">
                  {[["SERVICE", "Service"], ["CHEMICAL", "Chemical"]].map(([k, label]) => (
                    <label key={k} className={`nc-kind ${kinds[k] ? "on" : ""}`}>
                      <input type="checkbox" checked={kinds[k]} onChange={() => toggleKind(k)} /> {label}
                    </label>
                  ))}
                </div>
                {both && (
                  <div style={{ marginTop: 10 }}>
                    <div className="ac-sub" style={{ marginBottom: 6 }}>Separate bills for pest control services and chemicals?</div>
                    <div className="nc-kinds" role="radiogroup" aria-label="Separate bills">
                      {[[true, "Yes, separate bills"], [false, "No, one bill"]].map(([v, label]) => (
                        <label key={String(v)} className={`nc-kind ${terms.separate_bills === v ? "on" : ""}`}>
                          <input type="radio" name="nc-separate-bills" checked={terms.separate_bills === v} onChange={() => setT({ separate_bills: v })} /> {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </Field>
              {separate && (
                <Field label="Description – chemical bill" required hint={chemicalDescription ? `On the invoice: “${descriptionPreview(chemicalDescription, next)}”` : "Type it, or choose a saved one."}>
                  <DescriptionPicker value={terms.chemical_description_template ?? suggestedChemical} onChange={(text) => setT({ chemical_description_template: text })} />
                </Field>
              )}
              {separate && <div />}
              <Field label="Notes" className="bl-span2"><input className="ac-input" value={terms.notes} maxLength={1000} onChange={(e) => setT({ notes: e.target.value })} /></Field>
            </div>
            {next && (
              <div className="ac-info" style={{ marginTop: 12 }}>
                <span>ⓘ First invoice: <b>{dmy(next.start)} to {dmy(next.end)}</b>, in the <b>Bill Run for {monthLabel(next.billMonth)}</b>.</span>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            {/* Title with + Add PO at the top right (Cancel while a new PO is being typed). */}
            <div className="nc-title-row">
              <h3 className="nc-title">Purchase order</h3>
              {addingPo ? (
                <button type="button" className="ac-btn" onClick={cancelNewPo}>✕ Cancel new PO</button>
              ) : (
                <button type="button" className="ac-btn ac-btn-primary" onClick={startNewPo}>+ Add PO</button>
              )}
            </div>
            {/* The customer's purchase orders: picking one fills in its details below. No PO yet: + Add PO. */}
            {!addingPo && (
              <div className="nc-po-pick">
                <Field label="Existing purchase order" hint={poData && !poRows.length ? "This customer has no purchase order yet. Use + Add PO to add one." : ""}>
                  <select className="ac-select" value={poId} disabled={!poRows.length} onChange={(e) => choosePo(e.target.value)}>
                    <option value="">{!poData ? "Loading…" : poRows.length ? "Choose a PO…" : "No purchase orders yet"}</option>
                    {poRows.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.po_number} · {p.is_open_po ? "Open PO" : p.expiry_date ? `till ${dmy(p.expiry_date)}` : `from ${dmy(p.po_date)}`}{p.kind === "ADVANCE" ? " · Advance" : ""}{p.po_amount !== null ? ` · ₹${amount(p.po_amount)}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {/* Shown all the time: the chosen PO's details (read-only), or a new PO while + Add PO is open. */}
            <div className="nc-po-state">{poId ? "Details of the chosen PO (change them in Purchase Orders)" : addingPo ? "New purchase order" : "Purchase order details (choose a PO above, or + Add PO)"}</div>
            <div className="bl-grid g2">
              <Field label="PO number" required><input className="ac-input" value={po.po_number} disabled={!addingPo} maxLength={100} onChange={(e) => setP({ po_number: e.target.value })} /></Field>
              <Field label="PO date" required><input type="date" className="ac-input" value={po.po_date} disabled={!addingPo} onChange={(e) => setP({ po_date: e.target.value })} /></Field>
              <Field label="Valid from"><input type="date" className="ac-input" value={po.valid_from} disabled={!addingPo} onChange={(e) => setP({ valid_from: e.target.value })} /></Field>
              <Field label="Expiry date">
                <input type="date" className="ac-input" value={po.open ? "" : po.expiry_date} disabled={!addingPo || po.open} onChange={(e) => setP({ expiry_date: e.target.value })} />
                <label className="bl-toggle" style={{ paddingTop: 4 }}><input type="checkbox" checked={po.open} disabled={!addingPo} onChange={(e) => setP({ open: e.target.checked })} /> Open PO (no end date)</label>
              </Field>
              <Field label="PO amount (₹, incl. GST)" required={po.kind === "ADVANCE"} hint={addingPo && po.kind !== "ADVANCE" ? "Leave empty for no limit" : ""}>
                <input type="number" min="0" step="0.01" className="ac-input" value={po.po_amount} disabled={!addingPo} onChange={(e) => setP({ po_amount: e.target.value })} />
              </Field>
              <Field label="Type">
                <select className="ac-select" value={po.kind} disabled={!addingPo} onChange={(e) => setP({ kind: e.target.value })}>
                  <option value="STANDARD">Standard</option>
                  <option value="ADVANCE">Advance (paid before the work)</option>
                </select>
              </Field>
              <Field label="Remarks" className="bl-span2"><input className="ac-input" value={po.remarks} disabled={!addingPo} maxLength={1000} onChange={(e) => setP({ remarks: e.target.value })} /></Field>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h3 className="nc-title">Services and prices</h3>
            <p className="ac-sub" style={{ margin: "-6px 0 14px" }}>
              {termite ? "Rate per sq. m and the treated area; amount = rate × area" : "Amount = quantity × rate"}
              {residential || terms.gst_applicable === false ? ", no GST." : ", excluding GST (added on the invoice)."}
              {!termite && (terms.shortfall_billing === "FULL"
                ? " Fixed amount: every month bills the services per month agreed here, even if fewer were done."
                : " Service based: every month bills the services completed (from the Service Coordinator’s monthly SOS) × rate.")}
            </p>
            {/* Services / chemicals were chosen in step 2 (What is billed). */}

            {kinds.SERVICE && (
              <section className="nc-sec">
                <div className="nc-sec-title">Services</div>
                {groupLines ? (
                  <>
                    <div className="nc-grp-svcs">
                      <div className="nc-grp-svcrow nc-grp-svchead">
                        <span>{groupMain.services.length > 1 ? "Services done at the outlets" : "Service done at the outlets"} <span className="bl-req">*</span></span>
                        <span>Amount per outlet (₹)</span>
                        <span />
                      </div>
                      {groupMain.services.map((sv, i) => (
                        <div key={i} className="nc-grp-svcrow">
                          <select className="ac-select" value={sv.name} onChange={(e) => setGroupSvc(i, { name: e.target.value })} aria-label={`Service ${i + 1}`}>
                            <option value="">Choose the service…</option>
                            {serviceGroups.map(([label, names]) => (
                              <optgroup key={label} label={label}>{names.map((n) => <option key={n} value={n} disabled={n !== sv.name && chosenSvcs.includes(n)}>{n}</option>)}</optgroup>
                            ))}
                            {sv.name && !serviceGroups.some(([, names]) => names.includes(sv.name)) && <option value={sv.name}>{sv.name}</option>}
                          </select>
                          <input type="number" min="0" step="0.01" className="ac-input" value={sv.rate} placeholder="e.g. 1000" onChange={(e) => setGroupSvc(i, { rate: e.target.value })} aria-label={`Amount for service ${i + 1}`} />
                          {groupMain.services.length > 1
                            ? <button type="button" className="bl-x" onClick={() => setGroupMain((m) => ({ ...m, services: m.services.filter((_, j) => j !== i) }))} aria-label={`Remove service ${i + 1}`} title="Remove this service">✕</button>
                            : <span />}
                        </div>
                      ))}
                      <div className="nc-grp-svcfoot">
                        <button type="button" className="nc-grp-addsvc" onClick={() => setGroupMain((m) => ({ ...m, services: [...m.services, { name: "", rate: "" }] }))}>+ Add service</button>
                        {svcRated && (
                          <span className="nc-grp-svcsum">
                            Bill value per outlet <b>₹{amount(svcRateSum)}</b>
                            {lines.some((l) => l.company && l.rateEdited) && <button type="button" className="ac-btn sm" onClick={applySvcRate}>Apply to all</button>}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="nc-lines priced grp">
                      <div className="nc-line nc-head">
                        <span>Item name (on the invoice)</span>
                        <span className="nc-num">Bill value (₹)</span>
                        <span className="nc-num">Quantity / month</span>
                        <span className="nc-num">Amount (₹)</span>
                      </div>
                      {lines.filter((l) => l.company).map((l) => {
                        const co = pickedCompanies.find((c) => c.company_id === l.company);
                        if (!co) return null;
                        return (
                          <div key={l.key} className="nc-line-wrap">
                            <div className="nc-line">
                              <div className="nc-pickcell">
                                <input type="checkbox" className="bl-cb" checked={l.picked} disabled={!l.item_name || l.rate === ""} onChange={(e) => setLine(l.key, { picked: e.target.checked })} aria-label="Tick for an invoice line summary" />
                                <div className="nc-grp-item">
                                  <input className="ac-input" value={l.item_name} maxLength={255} onChange={(e) => setLine(l.key, { item_name: e.target.value, edited: true })} aria-label={`Item name for ${co.name}`} />
                                  <span className="ac-sub">{co.name}</span>
                                  {co?.sites?.length > 1 && (
                                    <select className="ac-select" value={l.site} onChange={(e) => setLine(l.key, { site: e.target.value })} aria-label="Outlet">
                                      <option value="">All outlets</option>
                                      {co.sites.map((s) => <option key={s.site_id} value={s.site_id}>{s.name}</option>)}
                                    </select>
                                  )}
                                </div>
                              </div>
                              <input type="number" min="0" step="0.01" className="ac-input" value={l.rate} placeholder="0.00" onChange={(e) => setLine(l.key, { rate: e.target.value, rateEdited: true })} aria-label="Bill value" />
                              <div className="bl-stp sp-stp">
                                <button type="button" onClick={() => setLine(l.key, { qty: Math.max(1, (Number(l.qty) || 1) - 1) })} aria-label="Fewer per month">−</button>
                                <input type="number" min="1" max="999" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label="Quantity per month" />
                                <button type="button" onClick={() => setLine(l.key, { qty: Math.min(999, (Number(l.qty) || 0) + 1) })} aria-label="More per month">+</button>
                              </div>
                              <span className="nc-num nc-amt">{l.rate === "" ? "—" : amount(lineTotal(l, termite))}</span>
                            </div>
                            {l.group && <div className="nc-in-group">In invoice line “{l.group}”</div>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="ac-sub" style={{ fontSize: 12, marginTop: 6 }}>One line per ticked company, all on one invoice to the group. To add or remove a company, go back to step 1.</div>
                  </>
                ) : !termite ? (
                  <>
                    <div className={`nc-lines priced svc2 ${multiOutlet ? "with-outlet" : ""}`}>
                      <div className="nc-line nc-head">
                        {multiOutlet && <span>Outlet</span>}
                        <span>Service</span>
                        <span className="nc-num">Per month</span>
                        <span className="nc-num">Rate / service (₹)</span>
                        <span className="nc-num">Month (₹)</span>
                        <span />
                      </div>
                      {lines.filter((l) => l.kind === "SERVICE").map((l) => (
                        <div key={l.key} className="nc-line-wrap">
                          <div className="nc-line">
                            {multiOutlet && (
                              <select className="ac-select" value={l.site} onChange={(e) => setLine(l.key, { site: e.target.value })} aria-label="Outlet">
                                <option value="">Choose outlet…</option>
                                <option value={ALL}>All outlets</option>
                                {sites.map((s) => <option key={s.site_id} value={s.site_id}>{s.name}</option>)}
                              </select>
                            )}
                            <div className="nc-pickcell">
                              <input type="checkbox" className="bl-cb" checked={l.picked} disabled={!l.item_name || l.rate === ""} onChange={(e) => setLine(l.key, { picked: e.target.checked })} aria-label="Tick for an invoice line summary" />
                              <select className="ac-select" value={l.item_name} onChange={(e) => setLine(l.key, { item_name: e.target.value })} aria-label="Service">
                                <option value="">Choose the service…</option>
                                {serviceGroups.map(([label, names]) => (
                                  <optgroup key={label} label={label}>{names.map((n) => <option key={n} value={n}>{n}</option>)}</optgroup>
                                ))}
                                {l.item_name && !serviceGroups.some(([, names]) => names.includes(l.item_name)) && <option value={l.item_name}>{l.item_name}</option>}
                              </select>
                            </div>
                            <div className="bl-stp sp-stp">
                              <button type="button" onClick={() => setLine(l.key, { qty: Math.max(1, (Number(l.qty) || 1) - 1) })} aria-label="Fewer per month">−</button>
                              <input type="number" min="1" max="999" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label="Services per month" />
                              <button type="button" onClick={() => setLine(l.key, { qty: Math.min(999, (Number(l.qty) || 0) + 1) })} aria-label="More per month">+</button>
                            </div>
                            <input type="number" min="0" step="0.01" className="ac-input" value={l.rate} placeholder="0.00" onChange={(e) => setLine(l.key, { rate: e.target.value })} aria-label="Rate per service" />
                            <span className="nc-num nc-amt">{l.rate === "" ? "—" : amount(lineTotal(l, termite))}</span>
                            <button type="button" className="bl-x" disabled={lines.filter((x) => x.kind === "SERVICE").length === 1 && !kinds.CHEMICAL} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Remove service">✕</button>
                          </div>
                          {l.group && <div className="nc-in-group">In invoice line “{l.group}”</div>}
                        </div>
                      ))}
                    </div>
                    <button type="button" className="sp-add" style={{ marginTop: 8 }} onClick={() => setLines([...lines, newLine(false, "SERVICE")])}>+ Add service</button>
                    {multiOutlet && <div className="ac-sub" style={{ fontSize: 12, marginTop: 6 }}>Add a line per outlet and service (the same service can have a different rate or count at each outlet).</div>}
                  </>
                ) : (
                <>
                <div className={`nc-lines ${termite ? "termite" : ""}`}>
                  <div className="nc-line nc-head">
                    <span>Service</span>
                    {termite ? <><span>Rate / sq. m (₹)</span><span>Area (sq. m)</span></> : <span>Amount (₹)</span>}
                    {canPlan && !termite && <span>Per month</span>}
                    <span />
                  </div>
                  {lines.filter((l) => l.kind === "SERVICE").map((l) => (
                    <div key={l.key} className="nc-line-wrap">
                      <div className="nc-line">
                        <div className="nc-pickcell">
                          <input type="checkbox" className="bl-cb" checked={l.picked} disabled={!l.item_name || l.rate === ""} onChange={(e) => setLine(l.key, { picked: e.target.checked })} aria-label="Tick for an invoice line summary" />
                          <select className="ac-select" value={l.item_name} onChange={(e) => setLine(l.key, { item_name: e.target.value })} aria-label="Service">
                            <option value="">Choose the service…</option>
                            {serviceGroups.map(([label, names]) => (
                              <optgroup key={label} label={label}>{names.map((n) => <option key={n} value={n}>{n}</option>)}</optgroup>
                            ))}
                            {l.item_name && !serviceGroups.some(([, names]) => names.includes(l.item_name)) && <option value={l.item_name}>{l.item_name}</option>}
                          </select>
                        </div>
                        <input type="number" min="0" step="0.01" className="ac-input" value={l.rate} placeholder="0.00" onChange={(e) => setLine(l.key, { rate: e.target.value })} aria-label={termite ? "Rate per square metre" : "Amount"} />
                        {termite && <input type="number" min="0" step="0.01" className="ac-input" value={l.area} placeholder="sq. m" onChange={(e) => setLine(l.key, { area: e.target.value })} aria-label="Area in square metres" />}
                        {canPlan && !termite && (
                          <div className="bl-stp sp-stp">
                            <button type="button" onClick={() => setLine(l.key, { visits: Math.max(1, (Number(l.visits) || 1) - 1) })} aria-label="Fewer per month">−</button>
                            <input type="number" min="1" max="31" value={l.visits} onChange={(e) => setLine(l.key, { visits: e.target.value })} aria-label="Per month" />
                            <button type="button" onClick={() => setLine(l.key, { visits: Math.min(31, (Number(l.visits) || 0) + 1) })} aria-label="More per month">+</button>
                          </div>
                        )}
                        <button type="button" className="bl-x" disabled={lines.filter((x) => x.kind === "SERVICE").length === 1 && !kinds.CHEMICAL} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Remove service">✕</button>
                      </div>
                      {l.group && <div className="nc-in-group">In invoice line “{l.group}”</div>}
                    </div>
                  ))}
                </div>
                <button type="button" className="sp-add" style={{ marginTop: 8 }} onClick={() => setLines([...lines, newLine(termite, "SERVICE")])}>+ Add service</button>
                </>
                )}
              </section>
            )}

            {kinds.CHEMICAL && (
              <section className="nc-sec">
                <div className="nc-sec-title">Chemicals</div>
                <datalist id="nc-chemicals">{(chemicals || []).map((c) => <option key={c} value={c} />)}</datalist>
                <div className="nc-lines priced">
                  <div className="nc-line nc-head">
                    <span>Chemical</span>
                    <span className="nc-num">Qty</span>
                    <span className="nc-num">Rate (₹)</span>
                    <span className="nc-num">Amount (₹)</span>
                    <span />
                  </div>
                  {lines.filter((l) => l.kind === "CHEMICAL").map((l) => (
                    <div key={l.key} className="nc-line-wrap">
                      <div className="nc-line">
                        <div className="nc-pickcell">
                          <input type="checkbox" className="bl-cb" checked={l.picked} disabled={!l.item_name.trim() || l.rate === ""} onChange={(e) => setLine(l.key, { picked: e.target.checked })} aria-label="Tick for an invoice line summary" />
                          <input className="ac-input" list="nc-chemicals" value={l.item_name} maxLength={255} placeholder="Type or choose the chemical" onChange={(e) => setLine(l.key, { item_name: e.target.value })} aria-label="Chemical" />
                        </div>
                        <input type="number" min="0" step="0.001" className="ac-input" value={l.qty} placeholder="Qty" onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label="Chemical quantity" />
                        <input type="number" min="0" step="0.01" className="ac-input" value={l.rate} placeholder="0.00" onChange={(e) => setLine(l.key, { rate: e.target.value })} aria-label="Chemical rate" />
                        <span className="nc-num nc-amt">{l.rate === "" ? "—" : amount(lineTotal(l, termite))}</span>
                        <button type="button" className="bl-x" disabled={lines.filter((x) => x.kind === "CHEMICAL").length === 1 && !kinds.SERVICE} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Remove chemical">✕</button>
                      </div>
                      {l.group && <div className="nc-in-group">In invoice line “{l.group}”</div>}
                    </div>
                  ))}
                </div>
                <button type="button" className="sp-add" style={{ marginTop: 8 }} onClick={() => setLines([...lines, newLine(false, "CHEMICAL")])}>+ Add chemical</button>
                <div className="ac-sub" style={{ fontSize: 12, marginTop: 6 }}>A new chemical is saved for other customers too. Each period bills quantity × rate.</div>
              </section>
            )}

            <div className="nc-total">Total per period: <b>₹{amount(total)}</b>{gstOn ? ` + GST ${terms.gst_rate}%` : ""}</div>

            {/* Invoice line summaries: ticked lines print as ONE invoice line (summary + their total).
                Lines not in a summary print one by one. */}
            {filledLines.length > 1 && (
              <div className="nc-summary">
                <div className="nc-sec-title" style={{ margin: 0 }}>Invoice line summaries (optional)</div>
                {picked.length ? (
                  <div className="nc-summary-row">
                    <input className="ac-input" value={groupText} maxLength={255} autoFocus placeholder={`Summary for the ${picked.length} ticked, e.g. Pest control services`} onChange={(e) => setGroupText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyGroup()} aria-label="Invoice line summary" />
                    <span className="nc-summary-amt">₹{amount(pickedTotal)}</span>
                    <button type="button" className="ac-btn ac-btn-primary" disabled={!groupText.trim()} onClick={applyGroup}>Add summary</button>
                  </div>
                ) : (
                  <div className="ac-sub" style={{ fontSize: 12.5 }}>Tick the services or chemicals to print as one invoice line, then type their summary. Lines not ticked print one by one.</div>
                )}
                {picked.length > 0 && <div className="ac-sub" style={{ fontSize: 12 }}>Ticked: {picked.map((l) => l.item_name).join(", ")}</div>}
                {groups.length > 0 && (
                  <ul className="nc-groups">
                    {groups.map(([name, ls]) => (
                      <li key={name}>
                        <div className="nc-group-main">
                          <b>{name}</b>
                          <span className="ac-sub">{ls.map((l) => l.item_name).join(", ")}</span>
                        </div>
                        <span className="nc-summary-amt">₹{amount(ls.reduce((t, l) => t + lineTotal(l, termite), 0))}</span>
                        <button type="button" className="ac-btn sm" onClick={() => removeGroup(name)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <h3 className="nc-title">Review</h3>
            <dl className="nc-review">
              {groupMode ? (
                <>
                  <dt>Group</dt><dd><b>{group?.name}</b></dd>
                  <dt>Companies</dt>
                  <dd>
                    <div className="nc-rv-tags">{pickedCompanies.map((c) => <span key={c.company_id} className="nc-rv-tag">{c.name}</span>)}</div>
                  </dd>
                </>
              ) : (
                <><dt>Customer</dt><dd>{customer?.name} <span className="ac-sub">({CATEGORY_LABEL[customer?.category]})</span></dd></>
              )}
              <dt>Bill To</dt><dd>{profile?.billing_name}{profile?.gst_number ? ` · GSTIN ${profile.gst_number}` : ""}</dd>
              <dt>Contract</dt>
              <dd>{TYPES.find(([v]) => v === terms.billing_type)?.[1]}{terms.billing_type !== "ONE_TIME" ? `, every ${terms.frequency_months} month${terms.frequency_months > 1 ? "s" : ""}` : ""}, billed at the {terms.bill_timing === "ADVANCE" ? "start" : "end"} of the month, from {dmy(terms.start_date)}{terms.end_date ? ` to ${dmy(terms.end_date)}` : ""}</dd>
              {terms.first_bill_from && terms.first_bill_from !== terms.start_date && <><dt>First bill from</dt><dd>{dmy(terms.first_bill_from)} <span className="ac-sub">(billed elsewhere before this date)</span></dd></>}
              <dt>GST</dt><dd>{gstOn ? `${terms.gst_rate}% GST` : "No GST"}</dd>
              {separate ? (
                <>
                  <dt>Bills</dt><dd>Two separate bills (two contracts, same PO)</dd>
                  <dt>Pest control bill</dt><dd>{descriptionPreview(description, next)}</dd>
                  <dt>Chemical bill</dt><dd>{descriptionPreview(chemicalDescription, next)}</dd>
                </>
              ) : (
                <><dt>Description</dt><dd>{descriptionPreview(description, next)}</dd></>
              )}
              {needsPo && <><dt>Purchase order</dt><dd>{poRows.find((p) => p.id === poId)?.po_number || (poId ? "Chosen" : "—")}</dd></>}
              {next && <><dt>First invoice</dt><dd>{dmy(next.start)} to {dmy(next.end)} <span className="ac-sub">· Bill Run for {monthLabel(next.billMonth)}</span></dd></>}
            </dl>

            {/* What is billed: the services (group: done at every outlet, with their amounts), then
                one row per invoice line, the total per period and the GST. */}
            <div className="nc-rv-sec">
              <div className="nc-sec-title">{groupMode ? "Services and outlets" : "Services and prices"}</div>
              {groupLines && chosenSvcs.length > 0 && (
                <div className="nc-rv-tags" style={{ marginBottom: 10 }}>
                  {groupMain.services.filter((s) => s.name).map((s) => (
                    <span key={s.name} className="nc-rv-tag svc">{s.name}{s.rate !== "" && <b>₹{amount(Number(s.rate))}</b>}</span>
                  ))}
                </div>
              )}
              <div className="nc-rv-wrap">
                <table className="nc-rv-table">
                  <thead>
                    <tr>
                      <th>Item name</th>
                      <th className="num">{termite ? "Qty" : "Qty / month"}</th>
                      <th className="num">{groupMode ? "Bill value" : "Rate"}</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filledLines.map((l) => {
                      const sub = l.company
                        ? pickedCompanies.find((c) => c.company_id === l.company)?.name
                        : l.kind === "CHEMICAL" ? "Chemical"
                          : multiOutlet && !termite ? (l.site === ALL ? "All outlets" : sites.find((s) => s.site_id === l.site)?.name) : "";
                      return (
                        <tr key={l.key}>
                          <td>
                            <div className="nc-rv-item">{l.item_name}</div>
                            {sub && sub !== l.item_name && <div className="ac-sub">{sub}</div>}
                          </td>
                          <td className="num">{termite && l.kind === "SERVICE" ? `${l.area} sq. m` : l.qty}</td>
                          <td className="num">₹{amount(Number(l.rate))}</td>
                          <td className="num"><b>₹{amount(lineTotal(l, termite))}</b></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={3}>Total per period</td><td className="num">₹{amount(total)}</td></tr>
                    {gstOn && <tr className="gst"><td colSpan={3}>GST {terms.gst_rate}%</td><td className="num">₹{amount(total * Number(terms.gst_rate) / 100)}</td></tr>}
                    {gstOn && <tr className="grand"><td colSpan={3}>Invoice total</td><td className="num">₹{amount(total * (1 + Number(terms.gst_rate) / 100))}</td></tr>}
                  </tfoot>
                </table>
              </div>
            </div>

            <ul className="nc-check">
              <li className="ok">Customer type set</li>
              <li className="ok">Billing details saved</li>
              {needsPo && <li className={poId ? "ok" : "bad"}>Purchase order {poId ? "chosen" : "missing"}</li>}
              <li className={filledLines.length ? "ok" : "bad"}>{groupLines ? `${filledLines.filter((l) => l.company).length} outlet${filledLines.filter((l) => l.company).length === 1 ? "" : "s"} priced` : `${filledLines.length} service${filledLines.length === 1 ? "" : "s"} priced`}</li>
              {!termite && kinds.SERVICE && <li className="info">{terms.shortfall_billing === "FULL" ? "Fixed amount: bills the services per month every month" : "Service based: bills the services completed each month (Service Coordinator’s SOS)"}</li>}
            </ul>
          </>
        )}

        <Msg {...msg} />
        <div className="nc-foot">
          {at > 0 ? <button type="button" className="ac-btn" disabled={busy} onClick={goBack}>← Back</button> : <button type="button" className="ac-btn" onClick={() => navigate("/billing/contracts")}>Cancel</button>}
          {step === 5 ? (
            <button type="button" className="ac-btn ac-btn-primary" disabled={busy} onClick={create}>{busy ? "Creating…" : "Create contract"}</button>
          ) : (
            <button type="button" className="ac-btn ac-btn-primary" disabled={busy || (step === 1 && (!customer?.category || !profile))} onClick={goNext}>
              {busy ? "Saving…" : step === 1 ? "Save and continue →" : step === 3 && addingPo ? "Save PO and continue →" : "Next →"}
            </button>
          )}
        </div>
      </div>

      {/* Live summary of what is being set up, and where the draft is kept. */}
      <aside className="nc-aside">
        <div className="nc-sum">
          <div className="nc-sum-head"><FiFileText /> Contract summary</div>
          <dl>
            {groupMode ? (
              <><dt>Group</dt><dd>{group ? <>{group.name} <span className="ac-sub">· {pickedCompanies.length} of {group.companies.length} companies</span></> : <span className="ac-sub">Not chosen</span>}</dd></>
            ) : (
              <><dt>Customer</dt><dd>{customer?.name || <span className="ac-sub">Not chosen</span>}</dd></>
            )}
            <dt>Billing</dt><dd>{TYPES.find(([v]) => v === terms.billing_type)?.[1]}{terms.billing_type !== "ONE_TIME" ? ` · every ${terms.frequency_months || 1} month${Number(terms.frequency_months) > 1 ? "s" : ""}` : ""}</dd>
            <dt>Bill date</dt><dd>{terms.bill_timing === "ADVANCE" ? "Start of the month" : "End of the month"}</dd>
            <dt>Structure</dt><dd>{terms.shortfall_billing === "FULL" ? "Fixed amount" : "Service based"}</dd>
            <dt>GST</dt><dd>{gstOn ? `${terms.gst_rate}%` : "No GST"}</dd>
            {next && <><dt>First invoice</dt><dd>{dmy(next.start)} – {dmy(next.end)}<span className="nc-sum-sub">Bill Run {monthLabel(next.billMonth)}</span></dd></>}
            <dt>Services</dt><dd>{filledLines.length ? `${filledLines.length} line${filledLines.length === 1 ? "" : "s"}` : <span className="ac-sub">None yet</span>}</dd>
          </dl>
          <div className="nc-sum-total"><span>Per period</span><b>₹{amount(total)}</b>{gstOn && <span className="nc-sum-sub">+ GST {terms.gst_rate}%</span>}</div>
        </div>
        {companyId && (
          <div className="nc-saved"><FiCheckCircle /> {savedAt ? `Draft saved on this device ${new Date(savedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Draft is saved on this device as you type"}</div>
        )}
      </aside>
      </div>
    </div>
  );
}

/** Service names: pest control and deep cleaning (the booking lists), then the others used on jobs or quotations. */
function groupsFor(options) {
  const seen = new Set();
  const take = (names) => names.filter((n) => {
    const k = String(n || "").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const others = [
    ...(options?.services || []).map((s) => s.sub_service),
    ...(options?.all_services || []),
    ...(options?.catalog || []).map((c) => c.name),
  ];
  return [
    ["Pest control", take(pestServices)],
    ["Deep cleaning", take(deepCleaningServices)],
    ["Other", take(others).sort((a, b) => a.localeCompare(b))],
  ].filter(([, names]) => names.length);
}

/** The description as it will read on the first invoice ({month} -> November 2026, ...). */
function descriptionPreview(text, period) {
  if (!period) return text;
  const values = {
    "{month}": monthLabel(period.start),
    "{period}": period.start === period.end ? dmy(period.start) : `${dmy(period.start)} to ${dmy(period.end)}`,
    "{from_month}": monthLabel(period.start),
    "{to_month}": monthLabel(period.end),
  };
  return String(text).replace(/\{(month|period|from_month|to_month)\}/g, (m) => values[m]);
}
