import { useState, useRef, useEffect } from "react";
import "../styles/JobUpdateComposer.css";

export default function JobUpdateComposer({ onSubmit }) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordError, setRecordError] = useState("");
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordChunksRef = useRef([]);
  const isUnmountingRef = useRef(false);

  function addFiles(nextFiles) {
    if (!nextFiles.length) return;
    setFiles((prev) => {
      const existingKeys = new Set(
        prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`)
      );
      const merged = [...prev];
      nextFiles.forEach((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          merged.push(file);
        }
      });
      return merged;
    });
  }

  function removeFile(targetIndex) {
    setFiles((prev) => prev.filter((_, idx) => idx !== targetIndex));
  }

  function cleanupMedia() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordChunksRef.current = [];
  }

  function pickMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  async function startRecording() {
    setRecordError("");

    if (!navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordError("Voice recording is not supported on this device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordChunksRef.current = [];

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        if (isUnmountingRef.current) return;
        setRecordError("Failed to record audio.");
      };

recorder.onstop = () => {
  if (recordChunksRef.current.length) {
    const finalType = recorder.mimeType || mimeType || "audio/webm";

    const blob = new Blob(recordChunksRef.current, { type: finalType });

    const ext = finalType.includes("ogg")
      ? "ogg"
      : finalType.includes("mp4")
      ? "mp4"
      : "webm";

    const file = new File(
      [blob],
      `voice-note-${Date.now()}.${ext}`,
      { type: finalType }
    );

    addFiles([file]);
  }

  cleanupMedia();
};

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setRecordError("Microphone permission was denied.");
      cleanupMedia();
      setIsRecording(false);
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    setIsRecording(false);
  }

  function handleUpdate() {
    const trimmed = message.trim();
    if (!trimmed && files.length === 0) return;

    onSubmit?.({
      message: trimmed || "Attachment added",
      files,
    });

    setMessage("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore teardown errors
        }
      }
      cleanupMedia();
    };
  }, []);

  return (
    <div className="job-update-composer">
      <textarea
        className="job-update-textarea"
        placeholder="Describe the latest update on the job"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const incoming = Array.from(e.target.files || []);
          addFiles(incoming);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />

      {files.length > 0 && (
        <div className="job-update-files">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="job-update-file">
              <div className="job-update-file-name">{file.name}</div>
              <button
                type="button"
                className="job-update-file-remove"
                onClick={() => removeFile(index)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="job-update-actions">
        <div className="job-update-left">
          <button type="button" onClick={() => fileInputRef.current.click()}>
            Attach Files & Photos
            {files.length > 0 && ` (${files.length})`}
          </button>

          <button
            type="button"
            className={`job-update-record-btn ${isRecording ? "recording" : ""}`}
            onClick={() => (isRecording ? stopRecording() : startRecording())}
          >
            {isRecording ? "Stop Recording" : "Record Voice Note"}
          </button>
        </div>

        <div className="job-update-right">
          <button className="btn-primary" onClick={handleUpdate} disabled={isRecording}>
            Update
          </button>
        </div>
      </div>

      {recordError && <div className="job-update-record-error">{recordError}</div>}
    </div>
  );
}
