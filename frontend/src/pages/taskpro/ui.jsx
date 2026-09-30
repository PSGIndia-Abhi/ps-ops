import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiHelpCircle, FiInbox, FiX } from "react-icons/fi";
import { PRIORITY, STATUS } from "./data";
import { initials } from "./format";

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#db2777", "#ea580c", "#16a34a", "#4f46e5"];

export function Avatar({ name, size = 32 }) {
  let hash = 0;
  for (const ch of name || "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className="tp-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function StatusBadge({ status, live = false }) {
  const s = STATUS[status] || STATUS.OPEN;
  return (
    <span className="tp-badge" style={{ color: s.ink, background: s.soft }}>
      {live && status === "IN_PROGRESS" && <span className="tp-live-dot" style={{ background: s.color }} />}
      {s.label}
    </span>
  );
}

export function PriorityBadge({ priority, long = false }) {
  const p = PRIORITY[priority] || PRIORITY.NORMAL;
  return (
    <span className="tp-badge" style={{ color: p.color, background: p.soft }}>
      {p.label}
      {long ? " Priority" : ""}
    </span>
  );
}

export function PriorityDot({ priority }) {
  const p = PRIORITY[priority] || PRIORITY.NORMAL;
  return <span className="tp-pdot" style={{ background: p.color }} />;
}

export function Skeleton({ height = 16, width = "100%", radius = 8, style }) {
  return <span className="tp-skel" style={{ height, width, borderRadius: radius, ...style }} />;
}

export function EmptyState({ icon = FiInbox, title, text, children }) {
  const Icon = icon;
  return (
    <div className="tp-empty">
      <span className="tp-empty-icon">
        <Icon />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

/**
 * Dialog rendered inside .tp-root (so the scoped styles apply).
 * `children` may be a function receiving `close`, which plays the exit
 * animation and then calls `onClose`.
 */
export function Modal({ title, onClose, children, size = "md", hideHeader = false }) {
  const [closing, setClosing] = useState(false);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  const host = document.querySelector(".tp-root") || document.body;

  return createPortal(
    <div className={`tp-overlay ${closing ? "closing" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`tp-modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        {!hideHeader && (
          <div className="tp-modal-head">
            <h3>{title}</h3>
            <button type="button" className="tp-icon-btn" onClick={close} aria-label="Close">
              <FiX />
            </button>
          </div>
        )}
        {hideHeader && (
          <button type="button" className="tp-icon-btn tp-modal-x" onClick={close} aria-label="Close">
            <FiX />
          </button>
        )}
        {typeof children === "function" ? children(close) : children}
      </div>
    </div>,
    host,
  );
}

/**
 * Full-height panel that slides in from the right edge. Same contract as
 * Modal: `children` may be a function receiving `close`. `footer` (same
 * signature) stays pinned to the bottom while the body scrolls.
 */
export function Drawer({ title, subtitle, onClose, children, footer }) {
  const [closing, setClosing] = useState(false);
  // The panel starts sliding in straight away; its (heavier) form is built a
  // frame later, so building it never freezes the slide.
  const [bodyReady, setBodyReady] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setBodyReady(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 220);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  // While open, hide the page's scrollbar so the drawer reaches the screen
  // edge (a fixed element can't cover the page scrollbar, which otherwise
  // shows as a strip beside the drawer) — and pad the page by exactly the
  // scrollbar's width, so the content behind keeps the same width and
  // nothing jumps when the drawer opens or closes.
  useEffect(() => {
    const html = document.documentElement;
    const scrollbar = window.innerWidth - html.clientWidth;
    const prev = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
    html.style.overflow = "hidden";
    if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`;
    return () => {
      html.style.overflow = prev.overflow;
      html.style.paddingRight = prev.paddingRight;
    };
  }, []);

  // Touch devices can still scroll a page with overflow: hidden, so the
  // overlay also swallows wheel / touch scrolling — except inside something
  // in the drawer that can itself scroll that way (the form, a list, a textarea).
  const overlayRef = useRef(null);
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return undefined;
    const canScroll = (target, dy) => {
      for (let el = target; el && el !== overlay; el = el.parentElement) {
        const { overflowY } = getComputedStyle(el);
        if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
          if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
        }
      }
      return false;
    };
    let lastY = 0;
    const onWheel = (e) => {
      if (!canScroll(e.target, e.deltaY)) e.preventDefault();
    };
    const onTouchStart = (e) => {
      lastY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e) => {
      const y = e.touches[0]?.clientY ?? lastY;
      const dy = lastY - y;
      lastY = y;
      if (!canScroll(e.target, dy)) e.preventDefault();
    };
    overlay.addEventListener("wheel", onWheel, { passive: false });
    overlay.addEventListener("touchstart", onTouchStart, { passive: true });
    overlay.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      overlay.removeEventListener("wheel", onWheel);
      overlay.removeEventListener("touchstart", onTouchStart);
      overlay.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  const host = document.querySelector(".tp-root") || document.body;
  const render = (node) => (typeof node === "function" ? node(close) : node);

  return createPortal(
    <div ref={overlayRef} className={`tp-drawer-overlay ${closing ? "closing" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <aside className="tp-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="tp-drawer-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <small>{subtitle}</small>}
          </div>
          <button type="button" className="tp-icon-btn" onClick={close} aria-label="Close">
            <FiX />
          </button>
        </header>
        <div className="tp-drawer-body">{bodyReady ? render(children) : null}</div>
        {footer && <footer className="tp-drawer-foot">{bodyReady ? render(footer) : null}</footer>}
      </aside>
    </div>,
    host,
  );
}

/**
 * A "?" button that explains something. Hover (or keyboard focus) shows the
 * tips; a click pins them open until you click elsewhere or press Escape.
 * `items`: [{ icon, title, text }].
 */
export function HelpTip({ label = "How this works", title, items }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef(null);
  const open = hover || pinned;

  useEffect(() => {
    if (!pinned) return undefined;
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setPinned(false);
    const onKey = (e) => e.key === "Escape" && setPinned(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <span className="tp-help" ref={rootRef} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        className={`tp-help-btn ${open ? "on" : ""}`}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setPinned((p) => !p)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        <FiHelpCircle />
      </button>
      {open && (
        <div className="tp-help-pop" role="tooltip">
          {title && <strong className="tp-help-title">{title}</strong>}
          <ul>
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <li key={it.title} className="tp-help-item">
                  <span className="tp-help-icon">
                    <Icon />
                  </span>
                  <span>
                    <strong>{it.title}</strong>
                    <small>{it.text}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </span>
  );
}

/** Count-up number for KPI tiles. */
export function CountUp({ value, duration = 850 }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{n}</>;
}

/** Full-screen "done" moment: expanding rings and a drawn check mark. */
export function CompletionBurst() {
  const host = document.querySelector(".tp-root") || document.body;
  return createPortal(
    <div className="tp-burst" aria-hidden="true">
      <span className="tp-burst-ring" />
      <span className="tp-burst-ring two" />
      <svg viewBox="0 0 52 52">
        <circle cx="26" cy="26" r="24" className="c" />
        <path d="M15 27l8 8 14-16" className="k" />
      </svg>
    </div>,
    host,
  );
}
