import { useCallback, useEffect, useRef, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { FiMail } from "react-icons/fi";
import { EMAIL_PLACEHOLDERS, emailValues, fillEmail, getEmailTemplates, getSettings, getTemplates, saveEmailTemplates, saveSettings, saveTemplates } from "./feedbackApi";
import { Card, ErrorBox, Loading, PageHead, Segmented, Switch, Toast } from "./ui";

// Masters › WhatsApp templates, Email templates and the module settings. Template codes are
// fixed; only the text, who it is for and on/off change.
const PLACEHOLDERS = ["customer", "site", "date", "ticket", "priority", "feedback", "action", "technician", "collector", "link"];
const AUDIENCES = [
  { value: "CUSTOMER", label: "Customer" },
  { value: "OPERATIONS", label: "Operations" },
  { value: "TECHNICIAN", label: "Technician" },
];
const SAMPLE = {
  customer: "Rameshwaram Cafe",
  site: "Bommasandra",
  date: "24 Sep 2026",
  ticket: "FB-0003",
  priority: "High",
  feedback: "Is the problem solved? No; \"Cockroaches seen in the kitchen\"",
  action: "Escalate to Operations · Rajan · by 31 Oct 2026",
  technician: "Praveenkumar h s",
  collector: "Priya",
  link: "https://bestserve.co.in/feedback/…",
};
const fill = (body) => body.replace(/\{(\w+)\}/g, (m, k) => SAMPLE[k] ?? m);
const EMAIL_SAMPLE = emailValues({
  name: "Abishek",
  customer: "Rameshwaram Cafe",
  site: "Bommasandra",
  month: "2026-09",
  ticketNumber: "FB-0003",
  issue: "Cockroaches seen in the kitchen 3 days after the service",
  revisitDate: "2026-11-05",
  closeNote: "Kitchen re-treated and drains sealed on 5 Nov.",
  sender: "Priya",
});

const WA_NOTES = {
  FORM_LINK: "To the customer from the call screen · must contain {link}",
  REVISIT_BOOKED: "To the customer once a ticket's re-visit is booked",
  TICKET_RAISED: "To the customer once a ticket is raised for their complaint",
  ISSUE_RESOLVED: "To the customer once a ticket is closed",
  FEEDBACK_SUMMARY: "To the owner or technician from a ticket",
  THANK_YOU: "To the customer from the call screen when there is no issue",
};
const EMAIL_NOTES = {
  THANK_YOU: "Offered when a call ends with no issue",
  ISSUE_RECEIVED: "Offered while a ticket is open",
  ISSUE_RESOLVED: "Offered when a ticket is closed",
};

const SETTING_ROWS = [
  { key: "other_text_enabled", type: "flag", label: '"Other feedback" box', hint: "A free text box on calls and on the customer's form" },
  { key: "link_expiry_days", type: "int", min: 1, max: 30, unit: "day", label: "Form link works for", hint: "After this the customer's link stops working" },
  { key: "offer_link_after_missed_calls", type: "int", min: 1, max: 10, unit: "call", label: "Suggest the form link after", hint: "Not-answered calls before the screen suggests WhatsApp" },
];

export default function TemplatesSettings() {
  const [tab, setTab] = useState("whatsapp");
  const [saved, setSaved] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [savedEmails, setSavedEmails] = useState(null);
  const [emails, setEmails] = useState(null);
  const [savedSettings, setSavedSettings] = useState(null);
  const [settings, setSettings] = useState(null);
  const [preview, setPreview] = useState(null);
  const [emailPreview, setEmailPreview] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const clearNotice = useCallback(() => setNotice(""), []);
  const [saving, setSaving] = useState(false);
  const areas = useRef({});
  const lastField = useRef({}); // per email template: "subject" or "body", where Insert puts the placeholder

  const load = useCallback(() => {
    Promise.all([getTemplates(), getEmailTemplates(), getSettings()])
      .then(([t, e, s]) => {
        setSaved(t.templates);
        setTemplates(t.templates);
        setPreview((p) => p || t.templates[0]?.code || null);
        setSavedEmails(e.templates);
        setEmails(e.templates);
        setEmailPreview((p) => p || e.templates[0]?.code || null);
        setSavedSettings(s.settings);
        setSettings(s.settings);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  if (!templates || !emails || !settings) return error ? <ErrorBox error={error} onRetry={load} /> : <Loading />;

  const changedTemplates = templates.filter((t) => {
    const before = saved.find((s) => s.code === t.code);
    return before.body !== t.body || before.is_active !== t.is_active || before.audiences.join() !== t.audiences.join();
  });
  const changedEmails = emails.filter((t) => {
    const before = savedEmails.find((s) => s.code === t.code);
    return before.subject !== t.subject || before.body !== t.body || before.is_active !== t.is_active;
  });
  const changedSettings = Object.fromEntries(Object.entries(settings).filter(([k, v]) => savedSettings[k] !== v));
  const dirty = changedTemplates.length > 0 || changedEmails.length > 0 || Object.keys(changedSettings).length > 0;

  const update = (code, changes) => setTemplates((list) => list.map((t) => (t.code === code ? { ...t, ...changes } : t)));
  const updateEmail = (code, changes) => setEmails((list) => list.map((t) => (t.code === code ? { ...t, ...changes } : t)));

  function insertAt(key, current, token, apply) {
    const el = areas.current[key];
    if (!el) return apply(current + token);
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    apply(current.slice(0, start) + token + current.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  }

  function insert(code, placeholder) {
    const t = templates.find((x) => x.code === code);
    insertAt(`wa-${code}`, t.body, `{${placeholder}}`, (body) => update(code, { body }));
  }

  function insertEmail(code, placeholder) {
    const t = emails.find((x) => x.code === code);
    const field = lastField.current[code] || "body";
    insertAt(`em-${field}-${code}`, t[field], `{${placeholder}}`, (value) => updateEmail(code, { [field]: value }));
  }

  function toggleAudience(t, value) {
    const has = t.audiences.includes(value);
    update(t.code, { audiences: AUDIENCES.map((a) => a.value).filter((a) => (a === value ? !has : t.audiences.includes(a))) });
  }

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (changedTemplates.length) {
        const d = await saveTemplates(changedTemplates.map((t) => ({ code: t.code, body: t.body, audiences: t.audiences, is_active: t.is_active })));
        setSaved(d.templates);
        setTemplates(d.templates);
      }
      if (changedEmails.length) {
        const d = await saveEmailTemplates(changedEmails.map((t) => ({ code: t.code, subject: t.subject, body: t.body, is_active: t.is_active })));
        setSavedEmails(d.templates);
        setEmails(d.templates);
      }
      if (Object.keys(changedSettings).length) {
        const d = await saveSettings(changedSettings);
        setSavedSettings(d.settings);
        setSettings(d.settings);
      }
      setNotice("Saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const previewed = templates.find((t) => t.code === preview);
  const emailPreviewed = emails.find((t) => t.code === emailPreview);
  const emailFilled = emailPreviewed ? fillEmail(emailPreviewed, EMAIL_SAMPLE) : null;

  return (
    <>
      <PageHead
        title="Templates & settings"
        actions={
          <>
            {dirty && (
              <button
                type="button"
                className="fb-btn"
                onClick={() => {
                  setTemplates(saved);
                  setEmails(savedEmails);
                  setSettings(savedSettings);
                }}
                disabled={saving}
              >
                Undo changes
              </button>
            )}
            <button type="button" className="fb-btn fb-btn-primary" onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      />
      <Toast notice={notice ? { text: notice } : null} onClose={clearNotice} />
      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBox error={error} />
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <Segmented
          label="Templates"
          options={[
            { value: "whatsapp", label: `WhatsApp templates (${templates.length})` },
            { value: "email", label: `Email templates (${emails.length})` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="fb-grid-side" style={{ gridTemplateColumns: "minmax(0,1fr) 400px" }}>
        <div className="fb-stack">
          {tab === "whatsapp"
            ? templates.map((t) => (
                <Card
                  key={t.code}
                  title={
                    <div className="fb-row" style={{ gap: 10, flexWrap: "nowrap" }}>
                      <span className="fb-tpl-icon is-wa">
                        <FaWhatsapp />
                      </span>
                      <div>
                        <h2>{t.name}</h2>
                        <div className="fb-small fb-muted">{WA_NOTES[t.code] || ""}</div>
                      </div>
                    </div>
                  }
                  aside={
                    <label className="fb-row" style={{ gap: 8 }}>
                      Active <Switch checked={t.is_active} onChange={(v) => update(t.code, { is_active: v })} label={`${t.name} active`} />
                    </label>
                  }
                >
                  <div className="fb-stack" style={{ gap: 10 }}>
                    <textarea
                      ref={(el) => {
                        areas.current[`wa-${t.code}`] = el;
                      }}
                      className="fb-textarea"
                      rows={Math.max(3, t.body.split("\n").length + 1)}
                      maxLength={1000}
                      value={t.body}
                      onChange={(e) => update(t.code, { body: e.target.value })}
                      onFocus={() => setPreview(t.code)}
                      aria-label={`${t.name} text`}
                    />
                    <div className="fb-placeholders">
                      Insert:
                      {PLACEHOLDERS.map((p) => (
                        <button key={p} type="button" onClick={() => insert(t.code, p)}>
                          {`{${p}}`}
                        </button>
                      ))}
                    </div>
                    <div className="fb-row" style={{ gap: 14, fontSize: 13 }}>
                      <span className="fb-muted">Sent to:</span>
                      {AUDIENCES.map((a) => (
                        <label key={a.value} className="fb-row" style={{ gap: 6 }}>
                          <input type="checkbox" checked={t.audiences.includes(a.value)} onChange={() => toggleAudience(t, a.value)} />
                          {a.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </Card>
              ))
            : emails.map((t) => (
                <Card
                  key={t.code}
                  title={
                    <div className="fb-row" style={{ gap: 10, flexWrap: "nowrap" }}>
                      <span className="fb-tpl-icon is-mail">
                        <FiMail />
                      </span>
                      <div>
                        <h2>{t.name}</h2>
                        <div className="fb-small fb-muted">To the customer · {EMAIL_NOTES[t.code] || ""}</div>
                      </div>
                    </div>
                  }
                  aside={
                    <label className="fb-row" style={{ gap: 8 }}>
                      Active <Switch checked={t.is_active} onChange={(v) => updateEmail(t.code, { is_active: v })} label={`${t.name} email active`} />
                    </label>
                  }
                >
                  <div className="fb-stack" style={{ gap: 10 }}>
                    <label className="fb-field" htmlFor={`em-subject-${t.code}`}>
                      Subject
                      <input
                        id={`em-subject-${t.code}`}
                        ref={(el) => {
                          areas.current[`em-subject-${t.code}`] = el;
                        }}
                        className="fb-input"
                        maxLength={200}
                        value={t.subject}
                        onChange={(e) => updateEmail(t.code, { subject: e.target.value })}
                        onFocus={() => {
                          lastField.current[t.code] = "subject";
                          setEmailPreview(t.code);
                        }}
                      />
                    </label>
                    <label className="fb-field" htmlFor={`em-body-${t.code}`}>
                      Message
                      <textarea
                        id={`em-body-${t.code}`}
                        ref={(el) => {
                          areas.current[`em-body-${t.code}`] = el;
                        }}
                        className="fb-textarea"
                        rows={Math.min(16, Math.max(6, t.body.split("\n").length + 1))}
                        maxLength={4000}
                        value={t.body}
                        onChange={(e) => updateEmail(t.code, { body: e.target.value })}
                        onFocus={() => {
                          lastField.current[t.code] = "body";
                          setEmailPreview(t.code);
                        }}
                      />
                    </label>
                    <div className="fb-placeholders">
                      Insert:
                      {EMAIL_PLACEHOLDERS.map((p) => (
                        <button key={p} type="button" onClick={() => insertEmail(t.code, p)}>
                          {`{${p}}`}
                        </button>
                      ))}
                    </div>
                    <div className="fb-small fb-muted">
                      {"{revisit_note}"} becomes "A re-visit has been scheduled for …" when one is booked, and {"{action_taken}"} the closing note; when there is none they are left out.
                    </div>
                  </div>
                </Card>
              ))}
        </div>

        <div className="fb-stack">
          {tab === "whatsapp"
            ? previewed && (
                <Card title="Preview" aside={previewed.name}>
                  <div className="fb-wa-preview">{fill(previewed.body)}</div>
                  <div className="fb-small fb-muted" style={{ marginTop: 8 }}>
                    Sample values. Click in a message to preview it.
                  </div>
                </Card>
              )
            : emailFilled && (
                <Card title="Preview" aside={emailPreviewed.name}>
                  <div className="fb-email-preview">
                    <div className="fb-email-subject">{emailFilled.subject}</div>
                    <div className="fb-email-body">{emailFilled.body}</div>
                  </div>
                  <div className="fb-small fb-muted" style={{ marginTop: 8 }}>
                    Sample values. The collector can still change the email in Gmail before sending.
                  </div>
                </Card>
              )}
          <Card title="Settings">
            <div className="fb-stack" style={{ gap: 16 }}>
              {SETTING_ROWS.map((s) => (
                <div key={s.key} className="fb-setting">
                  <div>
                    <div className="fb-strong">{s.label}</div>
                    <div className="fb-small fb-muted">{s.hint}</div>
                  </div>
                  {s.type === "flag" ? (
                    <Switch checked={settings[s.key]} onChange={(v) => setSettings((x) => ({ ...x, [s.key]: v }))} label={s.label} />
                  ) : (
                    <select className="fb-select" style={{ width: 110 }} value={settings[s.key]} onChange={(e) => setSettings((x) => ({ ...x, [s.key]: Number(e.target.value) }))} aria-label={s.label}>
                      {Array.from({ length: s.max - s.min + 1 }, (_, i) => s.min + i).map((n) => (
                        <option key={n} value={n}>
                          {n} {s.unit}
                          {n === 1 ? "" : "s"}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

