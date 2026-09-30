import { useMemo } from "react";
import { FiX } from "react-icons/fi";
import { FILTER_KEYS, NO_DEPT, SCOPES, deptsIn, peopleIn } from "./selectors";
import { useViewer } from "./viewerContext";

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className={`tp-select ${value ? "on" : ""}`}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Whose / Department / Assigned to / Assigned by dropdowns.
 *
 * `tasks` is the pool the options are built from (so a dropdown only ever
 * lists people and departments that actually have tasks here). `show` picks
 * which dropdowns appear; `scopes` lists the scope options when "scope" is shown.
 */
export default function PeopleFilters({ tasks, values, onChange, onClear, show, scopes = [] }) {
  const viewer = useViewer();

  const assignees = useMemo(() => peopleIn(tasks, "assigned_to", "assigned_to_name"), [tasks]);
  const creators = useMemo(() => peopleIn(tasks, "created_by", "created_by_name"), [tasks]);
  const depts = useMemo(() => deptsIn(tasks, viewer), [tasks, viewer]);

  // A value that came in through the URL but isn't in the pool any more still
  // has to be selectable, or the <select> would silently show "All".
  const withCurrent = (list, current, label) =>
    current && !list.some((o) => String(o.value) === current) ? [...list, { value: current, label }] : list;

  const personOptions = (people, current) => [
    { value: "", label: "Anyone" },
    ...withCurrent(
      people.map((p) => ({ value: String(p.id), label: p.id === viewer.id ? `${p.name} (you)` : p.name })),
      current,
      "Selected person",
    ),
  ];

  const active = FILTER_KEYS.some((k) => show.includes(k) && values[k]);

  return (
    <div className="tp-filters">
      {show.includes("scope") && scopes.length > 1 && (
        <FilterSelect
          label="Whose"
          value={values.scope || "all"}
          onChange={(v) => onChange("scope", v === "all" ? "" : v)}
          options={scopes.map((s) => ({ value: s, label: SCOPES[s].label }))}
        />
      )}
      {show.includes("dept") && (
        <FilterSelect
          label="Department"
          value={values.dept}
          onChange={(v) => onChange("dept", v)}
          options={[
            { value: "", label: "All" },
            ...withCurrent(
              depts.map((d) => ({ value: d, label: d === NO_DEPT ? "No department" : d })),
              values.dept,
              values.dept === NO_DEPT ? "No department" : values.dept,
            ),
          ]}
        />
      )}
      {show.includes("assignee") && (
        <FilterSelect label="Assigned to" value={values.assignee} onChange={(v) => onChange("assignee", v)} options={personOptions(assignees, values.assignee)} />
      )}
      {show.includes("creator") && (
        <FilterSelect label="Assigned by" value={values.creator} onChange={(v) => onChange("creator", v)} options={personOptions(creators, values.creator)} />
      )}
      {active && onClear && (
        <button type="button" className="tp-filter-clear" onClick={onClear}>
          <FiX /> Clear
        </button>
      )}
    </div>
  );
}
