import { useEffect, useRef, useState } from "react";
import { HiOutlineQuestionMarkCircle, HiOutlineXMark } from "react-icons/hi2";

// "?" button that opens a small guide to the colours used on the dashboard.
const COLOURS = [
  { tone: "green", label: "Completed", hint: "Visit or job done" },
  { tone: "grey", label: "Upcoming", hint: "Scheduled, not done yet" },
  { tone: "violet", label: "In progress", hint: "Our team is working on it" },
  { tone: "red", label: "Missed", hint: "Visit did not happen" },
  { tone: "orange", label: "Complaints", hint: "Needs attention" },
  { tone: "blue", label: "Active / scheduled", hint: "Jobs that are open" },
];

export default function ColorGuide() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`cp-cg ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button" className="cp-cg-btn" aria-haspopup="dialog" aria-expanded={open}
        aria-label="What do the colours mean?" title="What do the colours mean?"
        onClick={() => setOpen((o) => !o)}
      >
        <HiOutlineQuestionMarkCircle aria-hidden="true" />
      </button>
      {open && (
        <div className="cp-cg-pop" role="dialog" aria-label="Colour guide">
          <header>
            <strong>What the colours mean</strong>
            <button type="button" className="cp-cg-close" onClick={() => setOpen(false)} aria-label="Close"><HiOutlineXMark /></button>
          </header>
          <ul>
            {COLOURS.map((c) => (
              <li key={c.tone}>
                <span className={`cp-cg-dot tone-${c.tone}`} aria-hidden="true" />
                <span className="cp-cg-text"><b>{c.label}</b><small>{c.hint}</small></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
