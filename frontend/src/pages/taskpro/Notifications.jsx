import { Link, useSearchParams } from "react-router-dom";
import { FiBell, FiCheck, FiCheckCircle } from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { timeAgo } from "./format";
import { dayBucket, describe } from "./notify";
import { markAllNotificationsRead, markNotificationRead, useNotifications } from "./tasksApi";
import { Avatar, EmptyState, Skeleton } from "./ui";

/**
 * One event: "<actor> <did something to> <task>", with a note line and time.
 * Opening it marks it read; read ones are shown faded, unread ones
 * highlighted with a dot.
 */
export function NotificationRow({ e, unread, compact = false, onOpen }) {
  const d = describe(e);
  const Icon = d.icon;
  return (
    <Link
      to={`${TASKPRO_HOME}/tasks/${e.task_id}`}
      className={`tp-ev ${unread ? "unread" : "read"} ${compact ? "compact" : ""}`}
      onClick={() => {
        markNotificationRead(e.id);
        onOpen?.();
      }}
    >
      <span className="tp-ev-avatar">
        <Avatar name={e.actor_name || "?"} size={compact ? 34 : 38} />
        <span className={`tp-ev-kind ${d.tone}`}>
          <Icon />
        </span>
      </span>
      <span className="tp-ev-body">
        <span className="tp-ev-text">
          <strong>{e.actor_name || "Someone"}</strong> {d.pre} <strong>{e.task_title}</strong>
          {d.post ? ` ${d.post}` : ""}
        </span>
        {d.note && <span className="tp-ev-note">{d.note}</span>}
        <span className="tp-ev-time">{timeAgo(e.at)}</span>
      </span>
      {unread && <span className="tp-ev-dot" aria-label="Unread" />}
    </Link>
  );
}

/** "Mark all read" button — shared by the bell and the page. */
export function MarkAllRead({ unread }) {
  return (
    <button type="button" className="tp-ev-markall" onClick={markAllNotificationsRead} disabled={!unread}>
      <FiCheck /> Mark all read
    </button>
  );
}

/**
 * Everything other people did that concerns you in the last 30 days: tasks
 * assigned to you, updates on tasks you gave out, comments, and reschedule
 * requests. Opening one marks it read; "Mark all read" clears the rest.
 */
export default function Notifications() {
  const { items, ready, unread, isUnread } = useNotifications();
  const [params, setParams] = useSearchParams();
  const onlyUnread = params.get("show") === "unread";
  const shown = onlyUnread ? items.filter(isUnread) : items;

  const groups = [];
  for (const e of shown) {
    const label = dayBucket(e.at);
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(e);
  }

  return (
    <>
      <div className="tp-page-head">
        <div>
          <h1>Notifications</h1>
          <p>What others did on your tasks and the tasks you gave out, in the last 30 days.</p>
        </div>
        <MarkAllRead unread={unread} />
      </div>

      <div className="tp-chips" role="tablist" aria-label="Which notifications" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" aria-selected={!onlyUnread} className={`tp-chip ${!onlyUnread ? "on" : ""}`} onClick={() => setParams({}, { replace: true })}>
          All <span>{items.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={onlyUnread} className={`tp-chip ${onlyUnread ? "on" : ""}`} onClick={() => setParams({ show: "unread" }, { replace: true })}>
          Unread <span>{unread}</span>
        </button>
      </div>

      {!ready && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={64} radius={14} style={{ marginBottom: 10 }} />)}

      {ready && items.length === 0 && (
        <EmptyState icon={FiBell} title="No notifications yet" text="When someone assigns you a task, updates one you gave out, comments, or answers your request, it shows up here." />
      )}
      {ready && items.length > 0 && shown.length === 0 && <EmptyState icon={FiCheckCircle} title="You're all caught up" text="No unread notifications." />}

      {ready &&
        groups.map((g) => (
          <section key={g.label} className="tp-card tp-ev-group">
            <div className="tp-card-head">
              <h3>{g.label}</h3>
              <small>{g.items.length}</small>
            </div>
            <div className="tp-ev-list">
              {g.items.map((e) => (
                <NotificationRow key={e.id} e={e} unread={isUnread(e)} />
              ))}
            </div>
          </section>
        ))}
    </>
  );
}
