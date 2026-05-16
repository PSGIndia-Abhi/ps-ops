import { useState, useEffect, useRef } from "react";
import "./jobrow.css";
import { API_BASE, apiFetch } from "../api";
import { formatDateTime } from "../utils/date";

export default function JobTimeline({ history = [] }) {
  const [activeImage, setActiveImage] = useState(null);
  const [attachmentMap, setAttachmentMap] = useState({});
  const attachmentUrlRef = useRef({});
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const [timeline, setTimeline] = useState([]);

  useEffect(() => {
    setTimeline(history);
  }, [history]);

  const actionMeta = (action) => {
    switch (action) {
      case "CREATED":
        return { icon: "\u2728", label: "Created", className: "created" };
      case "COMMENT":
        return { icon: "\uD83D\uDCAC", label: "Comment", className: "comment" };
      case "ASSIGNED":
        return { icon: "\uD83D\uDC64", label: "Assigned", className: "assigned" };
      case "STATUS_CHANGED":
        return { icon: "\u23F1", label: "Status", className: "status" };
      default:
        return { icon: "\uD83D\uDCCC", label: "Update", className: "default" };
    }
  };

  async function fetchAttachment(att) {
    if (attachmentUrlRef.current[att.id]) {
      return attachmentUrlRef.current[att.id];
    }

    if (!token) {
      throw new Error("Missing auth token");
    }

    const res = await fetch(`${API_BASE}/api/attachments/${att.id}/view`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error("Failed to fetch attachment");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    attachmentUrlRef.current[att.id] = url;

    setAttachmentMap((prev) => ({
      ...prev,
      [att.id]: {
        url,
        fileType: att.file_type,
        fileName: att.file_name,
      },
    }));

    return url;
  }

  async function handleDownload(att) {
    try {
      let url = attachmentUrlRef.current[att.id];
      let revokeAfter = false;

      if (!url) {
        if (!token) throw new Error("Missing auth token");
        const res = await fetch(`${API_BASE}/api/attachments/${att.id}/view`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error("Failed to fetch attachment");
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        revokeAfter = true;
      }

      const link = document.createElement("a");
      link.href = url;
      link.download = att.file_name || "attachment";
      document.body.appendChild(link);
      link.click();
      link.remove();

      if (revokeAfter) {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Failed to download attachment", err);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function prefetchMedia() {
      const toLoad = [];

      history.forEach((item) => {
        if (item.attachments?.length > 0) {
          item.attachments.forEach((att) => {
            const isAudio = (att.file_type || "").startsWith("audio/");
            if (att.type === "IMAGE" || isAudio) {
              toLoad.push(att);
            }
          });
        }
      });

      for (const att of toLoad) {
        if (attachmentUrlRef.current[att.id]) continue;
        try {
          await fetchAttachment(att);
        } catch (err) {
          if (!cancelled) {
            console.error("Failed to load attachment", err);
          }
        }
      }
    }

    if (history.length) {
      prefetchMedia();
    }

    return () => {
      cancelled = true;
    };
  }, [history, token]);

  useEffect(() => {
    return () => {
      Object.values(attachmentUrlRef.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });
      attachmentUrlRef.current = {};
    };
  }, []);

async function changeVisibility(itemId, newValue) {
  const current = timeline.find((h) => h.id === itemId);
  if (!current) return;

  if (current.visible_to_client === newValue) return;

  const msg = newValue
    ? "Make this update visible to client?"
    : "Client may have already seen this. Hide anyway?";

  const ok = window.confirm(msg);
  if (!ok) return;

  const previousValue = current.visible_to_client;

  // optimistic update
  setTimeline((prev) =>
    prev.map((h) =>
      h.id === itemId ? { ...h, visible_to_client: newValue } : h
    )
  );

  try {
    const res = await apiFetch(`/api/jobs/history/${itemId}/visibility`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visible_to_client: newValue }),
    });

    if (!res?.ok) throw new Error("Failed");
  } catch (err) {
    console.error(err);

    // rollback
    setTimeline((prev) =>
      prev.map((h) =>
        h.id === itemId
          ? { ...h, visible_to_client: previousValue }
          : h
      )
    );
  }
}

  return (
    <>
      <div className="job-timeline">
        <h3>Timeline</h3>

        {timeline.map((item) => (
          <div key={item.id} className="timeline-item">
            <div className="timeline-icon">
              {(() => {
                const meta = actionMeta(item.action);
                return (
                  <span
                    className={`timeline-icon-badge timeline-icon-${meta.className}`}
                    title={meta.label}
                  >
                    {meta.icon}
                  </span>
                );
              })()}
            </div>

            <div className="timeline-content">
              <div className="timeline-meta">
                <strong className="timeline-author">
                  {item.created_by || "System"}
                  {item.is_temporary_worker_comment ? " (One Time Access)" : ""}
                </strong>
                <span className="timeline-date">
                  {formatDateTime(item.created_at)}
                </span>
              </div>

              <div className="timeline-message">
                {item.message}
              </div>
              {(role === "admin" || role === "supervisor") && (
                <div className="timeline-visibility">
                  <label>
                    <input
                      type="radio"
                      name={`visibility-${item.id}`}
                      checked={!item.visible_to_client}
                      onClick={() => changeVisibility(item.id, false)}
                    />
                    Internal
                  </label>

                  <label style={{ marginLeft: 12 }}>
                    <input
                      type="radio"
                      name={`visibility-${item.id}`}
                      checked={item.visible_to_client}
                      onClick={() => changeVisibility(item.id, true)}
                    />
                    Client Visible
                  </label>


                </div>
              )}

              {item.attachments?.length > 0 && (
                <div className="timeline-attachments">
                  {item.attachments.map((att) => {
                    const isAudio = (att.file_type || "").startsWith("audio/");
                    const fileInfo = attachmentMap[att.id];

                    if (att.type === "IMAGE") {
                      if (!fileInfo?.url) {
                        return (
                          <button
                            key={att.id}
                            type="button"
                            className="attachment-load-btn"
                            onClick={() => fetchAttachment(att)}
                          >
                            Load image
                          </button>
                        );
                      }




                      return (
                        <img
                          key={att.id}
                          src={fileInfo.url}
                          alt={att.file_name}
                          className="attachment-thumb"
                          onClick={() => setActiveImage(fileInfo.url)}
                        />
                      );
                    }

                    if (isAudio) {
                      return (
                        <div key={att.id} className="attachment-audio">
                          {fileInfo?.url ? (
                            <audio controls src={fileInfo.url} />
                          ) : (
                            <button
                              type="button"
                              className="attachment-load-btn"
                              onClick={() => fetchAttachment(att)}
                            >
                              Load voice note
                            </button>
                          )}
                          <div className="attachment-file-row">
                            <div className="attachment-file-name">
                              {att.file_name || "Voice note"}
                            </div>
                            <div className="attachment-file-actions">
                              <button
                                type="button"
                                className="attachment-download-btn"
                                onClick={() => handleDownload(att)}
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={att.id} className="attachment-file-row">
                        <div className="attachment-file-name">
                          {att.file_name || "Attachment"}
                        </div>
                        <div className="attachment-file-actions">
                          <button
                            type="button"
                            className="attachment-download-btn"
                            onClick={() => handleDownload(att)}
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {activeImage && (
        <div
          className="image-modal"
          onClick={() => setActiveImage(null)}
        >
          <img
            src={activeImage}
            className="image-modal-content"
            alt="Preview"
          />
        </div>
      )}
    </>
  );
}
