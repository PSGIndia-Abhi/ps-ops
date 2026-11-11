// Non-component helpers shared by the Help widget and the Helpdesk desk.
import { useEffect, useRef, useState } from "react";
import { checkFiles, getSummary } from "./helpdeskApi";

export function timeAgo(value) {
  if (!value) return "";
  const d = new Date(value);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function clock(value) {
  if (!value) return "";
  const d = new Date(value);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return today ? time : `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

// Runs fn every `ms` (and when the tab becomes visible again) while enabled; skips hidden tabs.
export function useInterval(fn, ms, enabled = true) {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => document.visibilityState === "visible" && saved.current();
    const id = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms, enabled]);
}

// Files picked for a message: button, drag & drop, or a screenshot pasted with Ctrl+V.
// Each image gets its preview link when added and loses it when removed / sent - not in a render
// effect, which React runs twice in development (that revoked the link and broke the preview).
const isImage = (f) => /^image\/(png|jpe?g|gif|webp)$/i.test(f.type);
const revoke = (items) => items.forEach((it) => it.url && URL.revokeObjectURL(it.url));

export function useFilePicker() {
  const [items, setItems] = useState([]); // [{ file, url }]
  const [error, setError] = useState("");
  const latest = useRef(items);
  useEffect(() => {
    latest.current = items;
  }, [items]);
  // Leaving the screen with files still picked: free their previews.
  useEffect(() => () => revoke(latest.current), []);

  const files = items.map((it) => it.file);
  const add = (list) => {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    const res = checkFiles(files, incoming);
    if (res.error) {
      setError(res.error);
      return;
    }
    setError("");
    setItems((cur) => [...cur, ...incoming.map((file) => ({ file, url: isImage(file) ? URL.createObjectURL(file) : null }))]);
  };
  const remove = (i) =>
    setItems((cur) => {
      revoke([cur[i]].filter(Boolean));
      return cur.filter((_, idx) => idx !== i);
    });
  const reset = () => {
    revoke(items);
    setItems([]);
    setError("");
  };
  const onPaste = (e) => {
    const pasted = Array.from(e.clipboardData?.files || []);
    if (!pasted.length) return;
    e.preventDefault();
    const stamp = Date.now();
    add(pasted.map((f, i) => (f.name && f.name !== "image.png" ? f : new File([f], `screenshot-${stamp}${i ? `-${i}` : ""}.png`, { type: f.type }))));
  };
  return { items, files, error, setError, add, remove, reset, onPaste };
}

// The technical team - they answer tickets (the server decides; this only picks what to show).
// Technical Head raises tickets like everyone else - not on the team side.
export const HELPDESK_AGENT_ROLES = ["Technical Lead", "Technical Team"];

export function isHelpdeskAgentRole(role) {
  const r = String(role || "").toLowerCase().trim();
  return HELPDESK_AGENT_ROLES.some((x) => x.toLowerCase() === r);
}

// Desk counts for the team (unread, unassigned, mine...), refreshed every minute and on `refreshKey`
// change (e.g. the page path). null until loaded or if the server says no.
export function useHelpdeskSummary(enabled = true, refreshKey = "") {
  const [summary, setSummary] = useState(null);
  const load = useRef(null);
  useEffect(() => {
    load.current = () => getSummary().then(setSummary).catch(() => setSummary(null));
  });
  useEffect(() => {
    if (enabled) load.current?.();
  }, [enabled, refreshKey]);
  useInterval(() => load.current?.(), 60 * 1000, enabled);
  // Desk actions (assign, reply...) ask the badge to refresh straight away.
  useEffect(() => {
    if (!enabled) return undefined;
    const on = () => load.current?.();
    window.addEventListener("helpdesk:changed", on);
    return () => window.removeEventListener("helpdesk:changed", on);
  }, [enabled]);
  return summary;
}
