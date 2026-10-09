import { useEffect, useState } from "react";
import { FiChevronRight, FiRepeat } from "react-icons/fi";
import { fmtDate, recurrenceSummary } from "./format";
import { listSeries } from "./tasksApi";
import { Avatar } from "./ui";

/**
 * A recurring schedule only ever shows up as a real task once its first
 * occurrence's due date actually arrives — nothing is pre-created ahead of
 * time (see backend/src/utils/workTaskRecurrence.js: generation stops the
 * moment the next date would be in the future). So a schedule starting next
 * month produces nothing for Upcoming to show today, and there was no way to
 * confirm "yes, I created that" until it started. This fills that gap with a
 * short list of schedules that haven't produced an occurrence yet, scoped the
 * same way the Upcoming page's "Whose" filter is: mine, my team's, or everyone's.
 */
export default function NotStartedSeries({ scope, viewer, onOpen }) {
  const [list, setList] = useState(null); // null = still loading

  useEffect(() => {
    let live = true;
    listSeries()
      .then((rows) => {
        if (!live) return;
        const isMine = (s) => s.assigned_to === viewer.id;
        const inScope = scope === "my" ? isMine : scope === "team" ? (s) => !isMine(s) : () => true;
        setList(rows.filter((s) => s.status !== "CANCELLED" && !s.occurrences_created && inScope(s)));
      })
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [scope, viewer.id]);

  if (!list || list.length === 0) return null;

  return (
    <div className="tp-not-started">
      <div className="tp-not-started-head">
        <FiRepeat />
        {list.length === 1 ? "1 recurring schedule hasn't started yet" : `${list.length} recurring schedules haven't started yet`}
      </div>
      {list.map((s) => (
        <button
          key={s.id}
          type="button"
          className="tp-not-started-row"
          onClick={() => onOpen(s.id, s.created_by === viewer.id || viewer.teamIds.has(s.assigned_to))}
        >
          <Avatar name={s.assigned_to_name} size={28} />
          <span className="tp-not-started-text">
            <strong>{s.title}</strong>
            <small>
              {recurrenceSummary(s)} · Starts {fmtDate(s.start_date)}
              {scope !== "my" ? ` · ${s.assigned_to_name}` : ""}
            </small>
          </span>
          <FiChevronRight className="tp-not-started-chevron" />
        </button>
      ))}
    </div>
  );
}
