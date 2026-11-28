import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  FiSearch, FiRefreshCw, FiX, FiCamera, FiMapPin, FiCalendar, FiChevronLeft, FiChevronRight,
  FiDownload, FiImage, FiFile, FiExternalLink, FiEye,
} from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { formatDate, serviceLabel } from "./portalUtils";
import { getPortalFile } from "./portalFiles";
import PortalLoader from "./PortalLoader";
import PortalPhoto from "./PortalPhoto";

// Service Photos (sidebar > Records): before / after photos the team shared, one card per job.
// Click a photo to open the gallery (previous / next, download).

const PHASE_LABEL = { before: "Before", after: "After", other: "Photo" };
const THUMBS = 4;
// Visit photos stream from /attachments/:id; photos shared by staff carry their own path.
const photoPath = (p) => p.path || `/api/client-portal/attachments/${encodeURIComponent(p.id)}`;
const isImage = (p) => String(p.file_type || "").startsWith("image/") || p.type === "IMAGE";

export default function PortalPhotos() {
  const navigate = useNavigate();
  const { portal } = useOutletContext();
  const outlets = portal.outlets;

  const [site, setSite] = useState(""); // this page only; the Dashboard outlet does not apply
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState({ total: 0, photo_total: 0 });
  const [shared, setShared] = useState([]); // photos staff shared from Documents (page 1)
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [gallery, setGallery] = useState(null); // { job, index }

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // A new filter starts again from page 1.
  const filterKey = `${site}|${search}|${from}|${to}|${reloadKey}`;
  const [lastKey, setLastKey] = useState(filterKey);
  if (lastKey !== filterKey) {
    setLastKey(filterKey);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const q = new URLSearchParams({ page: String(page), page_size: "12" });
        if (site) q.set("site_id", site);
        if (search) q.set("search", search);
        if (from) q.set("from", from);
        if (to) q.set("to", to);
        const res = await apiFetch(`/api/client-portal/photos?${q}`);
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load photos");
        if (cancelled) return;
        setJobs((prev) => (page === 1 ? body.jobs : [...prev, ...body.jobs]));
        if (page === 1) setShared(body.shared || []);
        setMeta({ total: body.total || 0, photo_total: body.photo_total || 0 });
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  const filtered = site || search || from || to;
  // Shared photos open in the same gallery, as one group.
  const sharedJob = {
    id: "shared", code: null, sub_service: "Shared by BestServe", site_name: "", city: "",
    photos: shared.map((p) => ({ ...p, phase: "other" })),
  };

  return (
    <div className="cp-page">
      <section className="cp-hero">
        <div>
          <h2>Service photos</h2>
          <p>
            Before and after photos from our visits
            {meta.total > 0 && ` · ${meta.photo_total} photo${meta.photo_total === 1 ? "" : "s"} from ${meta.total} job${meta.total === 1 ? "" : "s"}`}
          </p>
        </div>
      </section>

      <div className="cp-toolbar">
        <label className="cp-search">
          <FiSearch aria-hidden="true" />
          <input type="search" placeholder="Search job number, service, outlet or city" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        {outlets.length > 1 && (
          <label className="cp-select">
            Outlet
            <select value={site} onChange={(e) => setSite(e.target.value)}>
              <option value="">All outlets</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name || o.id}{o.city ? ` · ${o.city}` : ""}</option>)}
            </select>
          </label>
        )}
        <div className="cp-daterange cp-select">
          <span>Date</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span>to</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {(from || to) && <button className="cp-icon-btn cp-clear" onClick={() => { setFrom(""); setTo(""); }} aria-label="Clear dates"><FiX /></button>}
        </div>
      </div>

      {error && (
        <div className="cp-alert">{error}<button className="cp-btn cp-btn-ghost" onClick={() => setReloadKey((n) => n + 1)}><FiRefreshCw /> Retry</button></div>
      )}

      {/* Photos shared by BestServe (uploaded under Documents), above the visit photos. */}
      {shared.length > 0 && (
        <section className="cp-card cp-ph-shared">
          <header className="cp-ph-shared-head">
            <strong>Shared by BestServe</strong>
            <small>{shared.length} photo{shared.length === 1 ? "" : "s"}</small>
          </header>
          <div className="cp-ph-shared-grid">
            {shared.map((p, i) => (
              <figure key={p.id} className="cp-ph-shared-item">
                <PortalPhoto attachment={p} onOpen={() => setGallery({ job: sharedJob, index: i })} />
                <figcaption><b title={p.title}>{p.title}</b><small>{formatDate(p.created_at)}</small></figcaption>
                <div className="cp-ph-shared-actions">
                  <button type="button" className="cp-btn cp-btn-ghost" onClick={() => setGallery({ job: sharedJob, index: i })}><FiEye /> View</button>
                  <button
                    type="button" className="cp-btn cp-btn-ghost" aria-label={`Download ${p.title}`} title="Download"
                    onClick={() => getPortalFile(p.path, { download: true, name: p.file_name || `${p.title}.jpg` }).catch((err) => setError(err.message))}
                  >
                    <FiDownload />
                  </button>
                </div>
              </figure>
            ))}
          </div>
        </section>
      )}

      {loading && page === 1 && jobs.length === 0 ? (
        <div className="cp-card"><PortalLoader compact label="Loading photos…" /></div>
      ) : !error && jobs.length === 0 && shared.length > 0 ? null : !error && jobs.length === 0 ? (
        <div className="cp-card cp-empty-state">
          <FiCamera aria-hidden="true" />
          <strong>No photos found</strong>
          <span>{filtered ? "Try another filter." : "Photos from our visits will appear here."}</span>
        </div>
      ) : (
        <div className="cp-ph-grid">
          {jobs.map((j) => {
            const before = j.photos.filter((p) => p.phase === "before").length;
            const after = j.photos.filter((p) => p.phase === "after").length;
            const extra = j.photos.length - THUMBS;
            return (
              <article key={j.id} className="cp-ph-card">
                <header className="cp-ph-head">
                  <span className="cp-ph-icon" aria-hidden="true"><FiCamera /></span>
                  <div className="cp-ph-title">
                    <strong>{j.sub_service || serviceLabel(j.service_type)}</strong>
                    <small>Job #{j.code} · {serviceLabel(j.service_type)}</small>
                  </div>
                  <span className="cp-ph-count">{j.photo_count}</span>
                </header>
                <div className="cp-ph-meta">
                  <span><FiMapPin aria-hidden="true" /> {j.site_name || "—"}{j.city ? `, ${j.city}` : ""}</span>
                  <span><FiCalendar aria-hidden="true" /> {formatDate(j.last_at)}</span>
                </div>
                <div className="cp-ph-thumbs">
                  {j.photos.slice(0, THUMBS).map((p, i) => (
                    <figure key={p.id} className={`cp-ph-thumb phase-${p.phase}`}>
                      <PortalPhoto attachment={p} onOpen={() => setGallery({ job: j, index: i })} />
                      <figcaption>{PHASE_LABEL[p.phase]}</figcaption>
                      {i === THUMBS - 1 && extra > 0 && (
                        <button type="button" className="cp-ph-more" onClick={() => setGallery({ job: j, index: i })} aria-label={`See all ${j.photos.length} photos`}>
                          +{extra}
                        </button>
                      )}
                    </figure>
                  ))}
                </div>
                <footer className="cp-ph-foot">
                  <span className="cp-ph-phases">
                    {before > 0 && <span className="cp-ph-tag before">{before} before</span>}
                    {after > 0 && <span className="cp-ph-tag after">{after} after</span>}
                  </span>
                  <button type="button" className="cp-btn cp-btn-ghost" onClick={() => setGallery({ job: j, index: 0 })}>
                    <FiImage /> View all
                  </button>
                  <button type="button" className="cp-link" onClick={() => navigate(`/client/jobs/${encodeURIComponent(j.id)}`)}>
                    Open job <FiChevronRight aria-hidden="true" />
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {jobs.length > 0 && (
        <div className="cp-loadmore">
          <span className="cp-muted">Showing {jobs.length} of {meta.total} job{meta.total === 1 ? "" : "s"}</span>
          {jobs.length < meta.total && (
            <button className="cp-btn cp-btn-ghost" disabled={loading} onClick={() => setPage((p) => p + 1)}>{loading ? "Loading…" : "Load more"}</button>
          )}
        </div>
      )}

      {gallery && (
        <PhotoGallery
          job={gallery.job}
          index={gallery.index}
          onIndex={(index) => setGallery((g) => ({ ...g, index }))}
          onClose={() => setGallery(null)}
        />
      )}
    </div>
  );
}

// Full-screen viewer for one job's photos: arrows / ← → to move, Esc to close, download.
function PhotoGallery({ job, index, onIndex, onClose }) {
  const photos = job.photos;
  const photo = photos[index];
  const [src, setSrc] = useState({ id: null, url: null, failed: false });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onIndex, onClose]);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(photoPath(photo));
        if (!res?.ok) throw new Error("failed");
        objectUrl = URL.createObjectURL(await res.blob());
        if (!cancelled) setSrc({ id: photo.id, url: objectUrl, failed: false });
      } catch {
        if (!cancelled) setSrc({ id: photo.id, url: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo]);

  async function download() {
    setSaving(true);
    setSaveError(null);
    try {
      await getPortalFile(photoPath(photo), { download: true, name: photo.file_name || `${job.code ? `job-${job.code}` : "bestserve"}-photo-${index + 1}.jpg` });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const ready = src.id === photo.id;

  return (
    <div className="cp-gallery" role="dialog" aria-modal="true" aria-label={`Photos for job ${job.code}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <header className="cp-gallery-bar">
        <div>
          <strong>{job.code ? `${job.sub_service || serviceLabel(job.service_type)} · Job #${job.code}` : (photo.title || job.sub_service)}</strong>
          <small>{job.site_name ? `${job.site_name}${job.city ? `, ${job.city}` : ""} · ` : ""}{formatDate(photo.created_at)}</small>
        </div>
        <span className={`cp-ph-tag ${photo.phase}`}>{PHASE_LABEL[photo.phase]}</span>
        <span className="cp-gallery-counter">{index + 1} / {photos.length}</span>
        <button type="button" className="cp-gallery-btn" onClick={download} disabled={saving} aria-label="Download photo">
          <FiDownload /> {saving ? "Saving…" : "Download"}
        </button>
        <button type="button" className="cp-gallery-btn icon" onClick={onClose} aria-label="Close"><FiX /></button>
      </header>
      {saveError && <div className="cp-gallery-error">{saveError}</div>}

      <div className="cp-gallery-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <button type="button" className="cp-gallery-nav prev" onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous photo"><FiChevronLeft /></button>
        {!ready ? (
          <PortalLoader compact label="Loading photo…" />
        ) : src.failed ? (
          <div className="cp-gallery-missing"><FiImage aria-hidden="true" /> This photo could not be loaded.</div>
        ) : isImage(photo) ? (
          <img src={src.url} alt={photo.file_name || "Service photo"} />
        ) : (
          <a className="cp-gallery-file" href={src.url} target="_blank" rel="noreferrer">
            <FiFile aria-hidden="true" /> {photo.file_name || "File"} <FiExternalLink aria-hidden="true" />
          </a>
        )}
        <button type="button" className="cp-gallery-nav next" onClick={() => onIndex(index + 1)} disabled={index === photos.length - 1} aria-label="Next photo"><FiChevronRight /></button>
      </div>

      <div className="cp-gallery-strip">
        {photos.map((p, i) => (
          <button key={p.id} type="button" className={`cp-gallery-dot ${i === index ? "on" : ""} phase-${p.phase}`} onClick={() => onIndex(i)} aria-label={`Photo ${i + 1}`}>
            {PHASE_LABEL[p.phase].charAt(0)}{i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
