const cron = require("node-cron");
const { pool } = require("../../db");
const {
  transcribeAndTranslate, VoiceConfigError, VoiceBusyError, VoiceNoSpeechError, VoiceQuotaError,
} = require("../services/AuditVoice.service");
const { processReports } = require("../services/AuditReport.service");
const { isCombinedVoice } = require("../utils/audits");

// ---------------------------------------------------------------------------
// Site Audit voice translation.
// - translateNow(id): called right after a recording is uploaded (or retried),
//   so the supervisor gets English in seconds instead of waiting for the cron.
// - The cron (every 30 s) is the backup: it picks up anything still QUEUED
//   (server restart, Gemini busy) and retries it.
// A note is claimed by flipping QUEUED -> PROCESSING in one UPDATE, so the
// same recording is never translated twice at once.
// (Report generation joins this queue in Phase 3.)
// ---------------------------------------------------------------------------

// Gemini being busy (503 / slow) gets more tries than a real error.
const MAX_ATTEMPTS = 3;
const MAX_BUSY_ATTEMPTS = 5;
const BATCH = 3;
const RETRY_AFTER_MS = 2000;
let running = false;

async function processNote(noteId) {
  const [claim] = await pool.query(
    "UPDATE audit_voice_notes SET status = 'PROCESSING', attempts = attempts + 1, processed_at = NULL WHERE id = ? AND status = 'QUEUED' AND is_current = 1",
    [noteId],
  );
  if (!claim.affectedRows) return;
  const [[note]] = await pool.query(
    "SELECT id, object_key, mime_type, source_language, attempts FROM audit_voice_notes WHERE id = ?",
    [noteId],
  );

  try {
    // "All in one" recording (marked in its file name): split into observation + both actions.
    const combined = isCombinedVoice(note.object_key);
    const r = await transcribeAndTranslate({
      objectKey: note.object_key,
      mimeType: note.mime_type,
      sourceLanguage: note.source_language,
      combined,
    });
    await pool.query(
      `UPDATE audit_voice_notes SET status = 'REVIEW_REQUIRED', detected_language = ?, transcript = ?,
         english_draft = ?, model_name = ?, error_message = NULL, processed_at = NOW()
       WHERE id = ? AND status = 'PROCESSING'`,
      // The three parts are kept together (JSON) in the draft; the app shows them in their own boxes.
      [r.detectedLanguage, r.transcript, combined ? JSON.stringify(r.parts) : r.english, r.model, note.id],
    );
  } catch (err) {
    // Config problems, silent recordings and a used-up daily quota never fix themselves on retry;
    // busy Gemini gets more tries.
    const final = err instanceof VoiceConfigError || err instanceof VoiceNoSpeechError || err instanceof VoiceQuotaError;
    const limit = err instanceof VoiceBusyError ? MAX_BUSY_ATTEMPTS : MAX_ATTEMPTS;
    const giveUp = final || note.attempts >= limit;
    await pool.query(
      `UPDATE audit_voice_notes SET status = ?, error_message = ?, processed_at = NOW()
       WHERE id = ? AND status = 'PROCESSING'`,
      [giveUp ? "FAILED" : "QUEUED", String(err.message || err).slice(0, 1000), note.id],
    );
    if (!final) console.error("Audit voice translation failed", note.id, err.message);
    // Busy or network blip: try again in 2 s instead of waiting for the 30 s cron.
    if (!giveUp && err instanceof VoiceBusyError) {
      setTimeout(() => processNote(note.id).catch(() => undefined), RETRY_AFTER_MS);
    }
  }
}

/** Start translating one recording now, without waiting for the cron. Never throws. */
function translateNow(noteId) {
  setImmediate(() => {
    processNote(noteId).catch((err) => console.error("Audit voice translate error", noteId, err));
  });
}

async function processVoiceNotes() {
  // A note stuck in PROCESSING (server restarted mid-call) goes back to the queue.
  await pool.query(
    `UPDATE audit_voice_notes SET status = 'QUEUED'
     WHERE status = 'PROCESSING' AND processed_at IS NULL AND created_at < NOW() - INTERVAL 10 MINUTE
       AND attempts < ?`,
    [MAX_BUSY_ATTEMPTS],
  );
  const [rows] = await pool.query(
    "SELECT id FROM audit_voice_notes WHERE status = 'QUEUED' AND is_current = 1 ORDER BY created_at LIMIT ?",
    [BATCH],
  );
  await Promise.all(rows.map((r) => processNote(r.id)));
}

function startAuditQueueCron() {
  cron.schedule("*/30 * * * * *", async () => {
    if (running) return;
    running = true;
    try {
      await processVoiceNotes();
      await processReports();
    } catch (err) {
      console.error("Audit queue error", err);
    } finally {
      running = false;
    }
  });
}

module.exports = { startAuditQueueCron, processVoiceNotes, translateNow };
