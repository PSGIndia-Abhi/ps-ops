import { useEffect, useRef, useState } from "react";
import { deletePoFile, formatBytes, listPoFiles, openPoFile, poFileProblem, uploadPoFile } from "./brigadeShared";

// "Upload files" for a client PO. Any format, up to 3 MB each.
//
//  Saved PO (Billing) - pass `poNumber`: lists the PO's files; a picked file is
//    uploaded straight away and can be opened or removed.
//  New booking - pass `pending` + `onPendingChange`: picked files are only held
//    here and uploaded by the form once the booking is saved (they need the PO
//    number it is saved with). `disabledHint` explains why picking is off.
//  readOnly (Billing) - the PO's files can only be opened: no upload, no remove.
export default function PoFiles({ poNumber, pending, onPendingChange, disabledHint, readOnly = false }) {
  const saved = Boolean(poNumber) && !onPendingChange;
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  // The PO number whose files are on screen; until it matches, the list is still loading.
  const [loadedFor, setLoadedFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!saved) return undefined;
    let alive = true;
    listPoFiles(poNumber)
      .then((rows) => alive && setFiles(Array.isArray(rows) ? rows : []))
      .catch((err) => alive && setError(err.message || "Could not load the files"))
      .finally(() => alive && setLoadedFor(poNumber));
    return () => {
      alive = false;
    };
  }, [saved, poNumber]);

  async function pick(e) {
    const picked = [...(e.target.files || [])];
    e.target.value = ""; // the same file can be picked again after removing it
    if (!picked.length) return;
    const tooBig = picked.map(poFileProblem).filter(Boolean);
    const ok = picked.filter((f) => !poFileProblem(f));
    setError(tooBig.length ? `${tooBig.join(", ")}. Files can be up to 3 MB.` : "");
    if (!ok.length) return;

    if (!saved) {
      onPendingChange([...(pending || []), ...ok]);
      return;
    }
    setBusy(true);
    const failed = [];
    for (const file of ok) {
      try {
        const row = await uploadPoFile(poNumber, file);
        setFiles((cur) => [...cur, row]);
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
    }
    if (failed.length) setError(failed.join(" · "));
    setBusy(false);
  }

  async function remove(file) {
    setError("");
    try {
      await deletePoFile(file.id);
      setFiles((cur) => cur.filter((f) => f.id !== file.id));
    } catch (err) {
      setError(err.message || "Could not remove the file");
    }
  }

  async function open(file) {
    setError("");
    try {
      await openPoFile(file);
    } catch (err) {
      setError(err.message);
    }
  }

  const loading = saved && loadedFor !== poNumber;
  const disabled = busy || loading || Boolean(disabledHint);
  const list = saved
    ? files.map((f) => ({ key: f.id, name: f.file_name, size: f.file_size, file: f }))
    : (pending || []).map((f, i) => ({ key: `${f.name}-${i}`, name: f.name, size: f.size, index: i }));

  return (
    <div className="bg-files">
      {!readOnly && (
        <>
          <input ref={inputRef} type="file" multiple hidden onChange={pick} />
          <button type="button" className="bg-files-drop" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <span className="bg-files-icon" aria-hidden="true">⇪</span>
            <span>
              <strong>{busy ? "Uploading…" : "Upload files"}</strong>
              <small>{disabledHint || "PO copy, email or any document · any format · up to 3 MB each"}</small>
            </span>
          </button>
        </>
      )}

      {error && <div className="bg-field-error">{error}</div>}

      {loading ? (
        <div className="bg-files-empty">Loading files…</div>
      ) : readOnly && !list.length ? (
        <div className="bg-files-empty">No files on this PO</div>
      ) : (
        list.length > 0 && (
          <ul className="bg-files-list">
            {list.map((item) => (
              <li key={item.key}>
                <span className="bg-files-name" title={item.name}>{item.name}</span>
                <span className="bg-files-size">{formatBytes(item.size)}</span>
                {saved ? (
                  <>
                    <button type="button" className="bg-link-btn" onClick={() => open(item.file)}>Open</button>
                    {!readOnly && (
                      <button type="button" className="bg-link-btn danger" onClick={() => remove(item.file)}>Remove</button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="bg-link-btn danger"
                    onClick={() => onPendingChange(pending.filter((_, i) => i !== item.index))}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
