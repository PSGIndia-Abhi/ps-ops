// Building blocks shared by the Help widget (everyone) and the Helpdesk desk (technical team).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FiFileText, FiImage, FiLock, FiPaperclip, FiSend, FiX } from "react-icons/fi";
import { ACCEPT, attachmentUrl } from "./helpdeskApi";
import { clock, useFilePicker } from "./helpdeskHooks";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// What the person raising the ticket reads; the team sees the plain labels.
const USER_STATUS = {
  OPEN: "Submitted",
  IN_PROGRESS: "In progress",
  WAITING_USER: "Needs your reply",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
const TEAM_STATUS = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_USER: "Waiting on user",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function StatusChip({ status, team = false }) {
  return <span className={`hd-chip hd-chip--${status.toLowerCase()}`}>{(team ? TEAM_STATUS : USER_STATUS)[status] || status}</span>;
}

export function PriorityChip({ priority }) {
  if (!priority || priority === "NORMAL") return null;
  return <span className={`hd-chip hd-prio--${priority.toLowerCase()}`}>{priority.charAt(0) + priority.slice(1).toLowerCase()}</span>;
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

function useAttachmentUrl(id) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    attachmentUrl(id).then((u) => alive && setUrl(u)).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [id]);
  return { url, failed };
}

function openBlob(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  if (!/\.(pdf|png|jpe?g|gif|webp)$/i.test(name || "")) a.download = name || "file";
  a.click();
}

function AttachmentView({ file }) {
  const { url, failed } = useAttachmentUrl(file.id);
  if (file.isImage) {
    return (
      <button type="button" className="hd-att-img" onClick={() => url && openBlob(url, file.name)} title={file.name} disabled={!url}>
        {url ? <img src={url} alt={file.name} /> : <span className="hd-att-ph">{failed ? "Couldn't load" : <FiImage />}</span>}
      </button>
    );
  }
  return (
    <button type="button" className="hd-att-file" onClick={() => url && openBlob(url, file.name)} disabled={!url}>
      <FiFileText />
      <span className="hd-att-name">{file.name}</span>
      <span className="hd-att-size">{failed ? "Couldn't load" : fileSize(file.size)}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

function dayLabel(value) {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * The conversation. `team` = the technical team is looking (shows notes, names everyone).
 * For the user, every team reply reads "Technical team · <name>".
 */
export function Thread({ messages, team = false }) {
  const endRef = useRef(null);
  const count = messages.length;
  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  return (
    <div className="hd-thread">
      {messages.map((m, i) => {
        const showDay = i === 0 || new Date(m.createdAt).toDateString() !== new Date(messages[i - 1].createdAt).toDateString();
        return (
          <div key={m.id}>
            {showDay && <div className="hd-day"><span>{dayLabel(m.createdAt)}</span></div>}
            {m.kind === "SYSTEM" ? (
              <div className="hd-system">
                {m.body} · {clock(m.createdAt)}
              </div>
            ) : (
              <div className={`hd-msg ${m.isMine ? "hd-msg--mine" : ""} ${m.kind === "NOTE" ? "hd-msg--note" : ""}`}>
                {!m.isMine && (
                  <div className="hd-msg-who">
                    {m.side === "AGENT" && !team ? `Technical team · ${m.sender?.name || ""}` : m.sender?.name || "Unknown"}
                    {team && m.side === "USER" && <span className="hd-msg-tag">Requester</span>}
                  </div>
                )}
                {m.kind === "NOTE" && (
                  <div className="hd-note-tag">
                    <FiLock /> Internal note · only the technical team sees this
                  </div>
                )}
                <div className="hd-bubble">
                  {m.body && m.body !== "(file attached)" && <div className="hd-text">{m.body}</div>}
                  {m.attachments?.length > 0 && (
                    <div className="hd-atts">
                      {m.attachments.map((f) => (
                        <AttachmentView key={f.id} file={f} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="hd-msg-time">{clock(m.createdAt)}</div>
              </div>
            )}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// File picking: button, drag & drop, paste a screenshot
// ---------------------------------------------------------------------------

function Preview({ file, url, onRemove }) {
  const ext = (file.name.split(".").pop() || "").toUpperCase().slice(0, 4);
  return (
    <div className="hd-pick">
      {url ? (
        <img src={url} alt="" />
      ) : (
        <span className={`hd-pick-thumb ${file.type === "application/pdf" ? "is-pdf" : ""}`}>
          <FiFileText />
          <small>{ext}</small>
        </span>
      )}
      <span className="hd-pick-info">
        <span className="hd-pick-name" title={file.name}>{file.name}</span>
        <span className="hd-pick-size">{fileSize(file.size)}</span>
      </span>
      <button type="button" className="hd-pick-x" onClick={onRemove} aria-label={`Remove ${file.name}`}>
        <FiX />
      </button>
    </div>
  );
}

export function PickedFiles({ picker }) {
  if (!picker.files.length && !picker.error) return null;
  return (
    <>
      {picker.files.length > 0 && (
        <div className="hd-picks">
          {picker.items.map((it, i) => (
            <Preview key={`${it.file.name}-${i}`} file={it.file} url={it.url} onRemove={() => picker.remove(i)} />
          ))}
        </div>
      )}
      {picker.error && <div className="hd-error hd-error--inline">{picker.error}</div>}
    </>
  );
}

export function AttachButton({ picker, label }) {
  const input = useRef(null);
  return (
    <>
      <button type="button" className="hd-icon-btn" onClick={() => input.current?.click()} title="Attach images or PDF" aria-label="Attach files">
        <FiPaperclip />
        {label && <span>{label}</span>}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          picker.add(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

function useAutoGrow(ref, value, max = 160) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [ref, value, max]);
}

/**
 * Reply box under the thread. Enter sends, Shift+Enter new line. `team` adds the Reply / Internal
 * note switch. `onSend({ message, files, internal })` must return a promise.
 */
export function Composer({ onSend, team = false, disabled = false, placeholder = "Write a message…" }) {
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const picker = useFilePicker();
  const area = useRef(null);
  const [drag, setDrag] = useState(false);
  useAutoGrow(area, text);

  const canSend = !disabled && !sending && (text.trim() || picker.files.length);

  async function send() {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend({ message: text.trim(), files: picker.files, internal: team && internal });
      setText("");
      picker.reset();
      area.current?.focus();
    } catch (err) {
      picker.setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={`hd-composer ${internal ? "hd-composer--note" : ""} ${drag ? "hd-drag" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        picker.add(e.dataTransfer.files);
      }}
    >
      {team && (
        <div className="hd-mode">
          <button type="button" className={!internal ? "is-on" : ""} onClick={() => setInternal(false)}>Reply to user</button>
          <button type="button" className={internal ? "is-on" : ""} onClick={() => setInternal(true)}>
            <FiLock /> Internal note
          </button>
        </div>
      )}
      <PickedFiles picker={picker} />
      <div className="hd-compose-row">
        <AttachButton picker={picker} />
        <textarea
          ref={area}
          rows={1}
          value={text}
          disabled={disabled || sending}
          placeholder={internal ? "Note for the technical team (the user won't see this)…" : placeholder}
          onChange={(e) => setText(e.target.value)}
          onPaste={picker.onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className="hd-send" onClick={send} disabled={!canSend} aria-label="Send">
          {sending ? <span className="hd-spinner" /> : <FiSend />}
        </button>
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="hd-center">
      <span className="hd-spinner hd-spinner--dark" />
      <span>{label}</span>
    </div>
  );
}
