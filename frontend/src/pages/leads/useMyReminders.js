import { useCallback, useEffect, useRef, useState } from "react";
import { CARD_EVENT, myReminders } from "./remindersApi";

/** A card confirming something just added closes by itself after this long; a "due now" card waits to be closed. */
const CONFIRM_MS = 8000;
/** Something whose time passed more than this long ago (the page was closed) does not pop up late. */
const LATE_MS = 10 * 60000;
const shownKey = (myId) => `lm.remindersShown.${myId}`;

function readShown(myId) {
  try {
    return JSON.parse(localStorage.getItem(shownKey(myId)) || "[]");
  } catch {
    return [];
  }
}

const DUE_TITLE = { meeting: "Meeting time", followup: "Follow-up due now", personal: "Reminder" };
const NEW_TITLE = { meeting: "New meeting for you", followup: "New follow-up for you", personal: "New reminder" };

const timeOf = (item) => (item.time ? item.at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }) : "");
const dayOf = (item) => item.at.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/**
 * The signed-in person's lead reminders - read on opening, once a minute, and whenever
 * `refreshKey` changes - with the on-screen popups for them:
 *   - when a meeting, follow-up or reminder reaches its time,
 *   - when someone else sets a new one for this person, and
 *   - right after this person adds a follow-up or sets a reminder (showReminderCard).
 * A card on the page only: no sound and no browser notification (the phone does the ringing).
 *
 * Returns { reminders, popups, dismiss(id) }.
 */
export function useMyReminders(myId, refreshKey) {
  const [reminders, setReminders] = useState([]);
  const [popups, setPopups] = useState([]);
  const list = useRef([]);
  // Keys on the list at the last read; null until the first read, so what was already there never pops up as new.
  const known = useRef(null);

  useEffect(() => {
    if (!myId) return undefined;
    let alive = true;
    const push = (cards) => cards.length > 0 && setPopups((cur) => [...cur, ...cards.filter((c) => !cur.some((x) => x.id === c.id))]);

    const load = () =>
      myReminders(myId)
        .then((items) => {
          if (!alive) return;
          if (known.current) {
            push(
              items
                .filter((i) => i.fromSomeoneElse && !known.current.has(i.key))
                .map((i) => ({
                  id: `new:${i.key}`,
                  kind: i.kind,
                  title: NEW_TITLE[i.kind],
                  text: i.title,
                  sub: [i.byName && `From ${i.byName}`, `${dayOf(i)}${i.time ? `, ${timeOf(i)}` : ""}`].filter(Boolean).join(" · "),
                  leadId: i.leadId,
                })),
            );
          }
          known.current = new Set(items.map((i) => i.key));
          list.current = items;
          setReminders(items);
        })
        .catch(() => {}); // the list just stays as it was

    const check = () => {
      const now = Date.now();
      const shown = readShown(myId);
      const due = list.current
        .map((i) => ({ item: i, id: `due:${i.key}:${i.date}T${i.time || ""}` }))
        // A meeting / follow-up does not pop up at its own time - only a reminder set on it does
        // (that one arrives as a notification). Personal reminders still pop up at their time.
        .filter(({ item, id }) => item.kind === "personal" && item.at.getTime() <= now && now <= item.at.getTime() + LATE_MS && !shown.includes(id));
      if (due.length === 0) return;
      // Remembered in this browser, so a reload does not show the same one again.
      localStorage.setItem(shownKey(myId), JSON.stringify([...shown, ...due.map((d) => d.id)].slice(-200)));
      push(
        due.map(({ item, id }) => ({
          id,
          kind: item.kind,
          title: DUE_TITLE[item.kind],
          text: item.title,
          sub: [item.kind === "personal" ? item.note : item.detail, timeOf(item)].filter(Boolean).join(" · "),
          leadId: item.leadId,
        })),
      );
    };

    // A follow-up just added or a reminder just set: its card now, and the list read again.
    const timers = [];
    const onCard = (e) => {
      const id = `made:${Date.now()}`;
      push([{ ...e.detail, id }]);
      timers.push(setTimeout(() => alive && setPopups((cur) => cur.filter((p) => p.id !== id)), CONFIRM_MS));
      load();
    };
    window.addEventListener(CARD_EVENT, onCard);

    load().then(check);
    const reload = setInterval(load, 60000);
    const tick = setInterval(check, 20000);
    return () => {
      alive = false;
      window.removeEventListener(CARD_EVENT, onCard);
      timers.forEach(clearTimeout);
      clearInterval(reload);
      clearInterval(tick);
    };
  }, [myId, refreshKey]);

  const dismiss = useCallback((id) => setPopups((cur) => cur.filter((p) => p.id !== id)), []);
  return { reminders, popups, dismiss };
}
