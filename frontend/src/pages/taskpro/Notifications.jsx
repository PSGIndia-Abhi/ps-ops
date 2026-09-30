import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiBell } from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { timeAgo } from "./format";
import { dayBucket, describe } from "./notify";
import { markNotificationsSeen, useNotifications } from "./tasksApi";
import { useViewer } from "./viewerContext";
import { Avatar, EmptyState, Skeleton } from "./ui";

/** One event: "<actor> <did something to> <task>", with a note line and time. */
export function NotificationRow({ e, unread, compact = false, onOpen }) {
  const d = describe(e);
  const Icon = d.icon;
  return (
    <Link to={`${TASKPRO_HOME}/tasks/${e.task_id}`} className={`tp-ev ${unread ? "unread" : ""} ${compact ? "compact" : ""}`} onClick={onOpen}>
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

/**
 * Everything other people did that concerns you in the last 30 days: tasks
 * assigned to you, updates on tasks you gave out, comments, and reschedule
 * requests. Opening this page marks everything as read.
 */
export default function Notifications() {
  const viewer = useViewer();
  const { items, ready, seen } = useNotifications();

  // "Last seen" as it was when the page opened, so new items stay
  // highlighted while you read; the badge clears straight away.
  const [seenAtOpen] = useState(seen);
  const isNew = (e) => !seenAtOpen || new Date(e.at) > new Date(seenAtOpen);
  useEffect(() => {
    if (ready && viewer.id) markNotificationsSeen(viewer.id);
  }, [ready, viewer.id]);

  const groups = [];
  for (const e of items) {
    const label = dayBucket(e.at);
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  const newCount = items.filter(isNew).length;

  return (
    <>
      <div className="tp-page-head">
        <div>
          <h1>Notifications</h1>
          <p>What others did on your tasks and the tasks you gave out, in the last 30 days.</p>
        </div>
        {ready && newCount > 0 && <span className="tp-count-pill">{newCount} new</span>}
      </div>

      {!ready && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={64} radius={14} style={{ marginBottom: 10 }} />)}

      {ready && items.length === 0 && (
        <EmptyState icon={FiBell} title="No notifications yet" text="When someone assigns you a task, updates one you gave out, comments, or answers your request, it shows up here." />
      )}

      {ready &&
        groups.map((g) => (
          <section key={g.label} className="tp-card tp-ev-group">
            <div className="tp-card-head">
              <h3>{g.label}</h3>
              <small>{g.items.length}</small>
            </div>
            <div className="tp-ev-list">
              {g.items.map((e) => (
                <NotificationRow key={e.id} e={e} unread={isNew(e)} />
              ))}
            </div>
          </section>
        ))}
    </>
  );
}
