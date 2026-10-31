const minioClient = require("../lib/minio");
const { TARGET_PESTS } = require("../utils/audits");

// ---------------------------------------------------------------------------
// Site Audit voice notes: audio (kept in MinIO) -> Gemini -> transcript + English.
// Called only by the queue worker (jobs/auditQueue.cron.js), never from the app,
// so the API key stays on the server. Request format: Gemini REST generateContent
// with the audio inline (base64, < 20 MB), JSON output.
// ---------------------------------------------------------------------------

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.6-flash"; // fastest reliable (about 4-7 s)
// Tried when the main model is busy (503 / 429) or does not answer in time.
const DEFAULT_FALLBACK_MODEL = "gemini-3.8-flash";
const MAX_INLINE_BYTES = 18 * 1024 * 1024;
// One Gemini call may take at most this long; the worker retries right away after it.
const TIMEOUT_MS = 20 * 1000;
// The backup model starts only if the main one has not answered by then
// (asking both every time would use up the daily quota twice as fast).
const FALLBACK_AFTER_MS = 6 * 1000;

/** Gemini was busy or slow: worth trying again later (the worker retries). */
class VoiceBusyError extends Error {}

/** The API key's daily request limit is used up: retrying today will not help. */
class VoiceQuotaError extends Error {}
const QUOTA_MESSAGE = "Today's translation limit is used up. Type the English text, or try again tomorrow.";

/** The recording has no clear speech: retrying the same audio will not help. */
class VoiceNoSpeechError extends Error {}
const NO_SPEECH_MESSAGE = "No clear speech was heard in this recording. Tap Retake to record again, or type the text.";

const LANGUAGE_NAMES = { kn: "Kannada", hi: "Hindi", ta: "Tamil", te: "Telugu", en: "English" };

class VoiceConfigError extends Error {}

function isConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

async function readObject(objectKey) {
  const stream = await minioClient.getObject(process.env.MINIO_BUCKET, objectKey);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Gemini lists audio/m4a, audio/aac, audio/mp3, audio/wav, audio/ogg ...
function geminiMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m === "audio/mp4" || m === "audio/x-m4a") return "audio/m4a";
  if (m === "audio/mpeg") return "audio/mp3";
  return m || "audio/m4a";
}

/**
 * "All in one" recording: the supervisor says the observation, the customer's action and
 * BestServe's action in one go; Gemini translates and splits it into the three parts.
 */
function buildCombinedPrompt(sourceLanguage) {
  const lang = LANGUAGE_NAMES[sourceLanguage];
  return [
    "You are transcribing a voice note recorded by a pest-control supervisor during a site inspection in India.",
    lang ? `The speaker is most likely speaking ${lang}, possibly mixed with English words.` : "Detect the spoken language (it may be Kannada, Hindi, Tamil, Telugu or English, possibly mixed).",
    "In this one recording the supervisor usually says, in this order:",
    "  - the AREA name (e.g. kitchen, store room, front yard) and the PEST(S) found there (e.g. cockroaches, rats),",
    "  a) OBSERVATION: what was seen at the site (the problem, where, signs of pests).",
    "  b) CUSTOMER ACTION: what the customer / site staff must do (e.g. seal gaps, clean, repair, keep doors closed).",
    "  c) BESTSERVE ACTION: what BestServe (the pest-control company, 'we', 'our team') will do (e.g. place bait stations, spray, inspect again).",
    "Also fill these short fields:",
    '  - "area_name": the area name as said (English, 1-5 words), else "".',
    '  - "target_pests": a list of the pests mentioned. Use COCKROACHES, RODENTS (rats, mice, bandicoots), MOSQUITOES, FLIES, TERMITES for those; any other pest as a short English name (e.g. "Lizards"); [] if no pest is mentioned.',
    '  - "title": a short name for the problem, at most 5 words, no area name in it (e.g. "Gap under the shutter", "Rodent entry point"), else "".',
    '  - "risk_category": one of HARBOURAGE (rodent shelter, clutter, debris), BURROWS, ENTRY_POINT (gaps, holes, open drains), FOOD_SOURCE, WATER (stagnant water, leaks); if none fits, a short English name; "" if unclear.',
    '  - "risk_level": LOW, MEDIUM, HIGH or CRITICAL - the level the supervisor said, or else your suggestion from how serious the problem described is (e.g. live pests or droppings in a food area = HIGH or CRITICAL); "" if there is no problem described.',
    '  - "fix_within_days": a whole number of days only if the supervisor said a time (e.g. "within a week" = 7, "immediately" = 0), else null.',
    "1. Write an exact transcript in the language and script that was spoken.",
    "2. Translate into professional, grammatically correct English for a formal customer inspection report, and put each sentence in the part it belongs to.",
    "Keep exactly the same meaning as what was said: do not add, remove, interpret or summarise anything, and do not invent actions that were not said.",
    "Only improve the wording: fix grammar, remove filler words and repetitions, write complete sentences. Keep names, places and counts exactly as spoken.",
    "Keep pest-control terms as they are (rodent, burrow, harbourage, bait station, gel baiting, drain, debris).",
    "If a part was not said, leave it as an empty string. Do not copy a sentence into more than one part.",
    'If there is no clear speech (silence, noise, or words you cannot make out), set "no_speech": true and leave everything else empty. Never invent text.',
    'Reply with JSON only: {"no_speech": false, "detected_language": "<ISO 639-1 code>", "transcript": "...", "area_name": "...", "target_pests": [], "title": "...", "risk_category": "...", "risk_level": "...", "fix_within_days": null, "observation": "...", "customer_action": "...", "bestserve_action": "...", "confidence": "high|medium|low"}',
  ].join("\n");
}

const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// Pests the AI heard: known codes in capitals, any other pest as short text (max 5).
function pestList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const raw of value) {
    const text = typeof raw === "string" ? raw.trim().slice(0, 40) : "";
    if (!text) continue;
    const v = TARGET_PESTS.includes(text.toUpperCase()) ? text.toUpperCase() : text;
    if (!out.includes(v)) out.push(v);
  }
  return out.slice(0, 5);
}

function buildPrompt(sourceLanguage) {
  const lang = LANGUAGE_NAMES[sourceLanguage];
  return [
    "You are transcribing a voice note recorded by a pest-control supervisor during a site inspection in India.",
    lang ? `The speaker is most likely speaking ${lang}, possibly mixed with English words.` : "Detect the spoken language (it may be Kannada, Hindi, Tamil, Telugu or English, possibly mixed).",
    "1. Write an exact transcript in the language and script that was spoken.",
    "2. Translate the transcript into professional, grammatically correct English suitable for a formal customer inspection report.",
    "The English must keep exactly the same meaning as what was said: do not add, remove, interpret, analyse or summarise anything.",
    "Do not add advice, causes, facts, numbers, places or details that were not said. Keep names, places, counts and areas exactly as spoken.",
    "Only improve the wording: fix grammar, remove filler words (e.g. 'sir', 'okay', 'that's it', repetitions), and write complete sentences.",
    "Keep pest-control terms as they are (rodent, burrow, harbourage, bait station, gel baiting, drain, debris).",
    'If there is no clear speech (silence, noise, or words you cannot make out), set "no_speech": true and leave transcript and english empty. Never invent text.',
    'Reply with JSON only: {"no_speech": false, "detected_language": "<ISO 639-1 code>", "transcript": "...", "english": "...", "confidence": "high|medium|low"}',
  ].join("\n");
}

/**
 * Sends one recording to Gemini. Returns { detectedLanguage, transcript, english, confidence, model }.
 * Throws on any failure; the caller records the error and keeps the audio.
 */
async function transcribeAndTranslate({ objectKey, mimeType, sourceLanguage, combined = false }) {
  if (!isConfigured()) throw new VoiceConfigError("Translation is not set up on the server (GEMINI_API_KEY missing)");
  const main = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallback = process.env.GEMINI_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL;
  const models = [main, fallback].filter((m, i, all) => m && all.indexOf(m) === i);

  const audio = await readObject(objectKey);
  if (!audio.length) throw new Error("The recording is empty");
  if (audio.length > MAX_INLINE_BYTES) throw new Error("The recording is too long to translate (over 18 MB)");
  const data = audio.toString("base64");
  const waiting = [];
  const startNext = () => waiting.forEach((go) => go());

  // Ask every model at the same time and take the first good answer, so one
  // busy model never makes the supervisor wait. The others are then cancelled.
  // A "no speech" answer also ends the wait at once (it is a final answer, not a failure to retry).
  // The backup model starts after FALLBACK_AFTER_MS, or at once if the main one fails first.
  const controllers = models.map(() => new AbortController());
  const timers = [];
  try {
    const first = await Promise.any(models.map((model, i) => {
      const run = () => callModel(model, data, mimeType, sourceLanguage, controllers[i].signal, combined).catch((err) => {
        if (err instanceof VoiceNoSpeechError) return { noSpeech: err };
        throw err;
      });
      if (i === 0) {
        const p = run();
        p.catch(() => startNext());
        return p;
      }
      return new Promise((resolve, reject) => {
        let started = false;
        const go = () => { if (!started) { started = true; run().then(resolve, reject); } };
        waiting.push(go);
        timers.push(setTimeout(go, FALLBACK_AFTER_MS));
      });
    }));
    if (first.noSpeech) throw first.noSpeech;
    return first;
  } catch (agg) {
    if (agg instanceof VoiceNoSpeechError) throw agg;
    const errors = agg?.errors || [agg];
    // Every main model has used today's quota: try the lite models (separate quota) one by one.
    if (errors.length && errors.every((e) => e instanceof VoiceQuotaError)) {
      return quotaFallback(data, mimeType, sourceLanguage, combined);
    }
    // Busy -> retry soon; quota -> stop for today; anything else is a real error.
    throw errors.find((e) => !(e instanceof VoiceBusyError) && !(e instanceof VoiceQuotaError))
      || errors.find((e) => e instanceof VoiceBusyError)
      || errors[0];
  } finally {
    timers.forEach(clearTimeout);
    controllers.forEach((c) => c.abort());
  }
}

// Used only when the main models hit the daily limit (free plan: 20 a day per model).
// Lite models have their own quota; tested on Hindi audio: about 2-3 s with a faithful translation.
const DEFAULT_QUOTA_FALLBACK = "gemini-3.5-flash-lite,gemini-flash-lite-latest";

async function quotaFallback(data, mimeType, sourceLanguage, combined) {
  const models = (process.env.GEMINI_QUOTA_FALLBACK_MODELS ?? DEFAULT_QUOTA_FALLBACK).split(",").map((m) => m.trim()).filter(Boolean);
  let last = new VoiceQuotaError(QUOTA_MESSAGE);
  for (const model of models) {
    try {
      return await callModel(model, data, mimeType, sourceLanguage, undefined, combined);
    } catch (err) {
      if (err instanceof VoiceNoSpeechError) throw err;
      last = err;
      if (!(err instanceof VoiceQuotaError) && !(err instanceof VoiceBusyError)) throw err;
    }
  }
  throw last;
}

async function callModel(model, data, mimeType, sourceLanguage, outerSignal, combined = false) {
  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: geminiMime(mimeType), data } },
        { text: combined ? buildCombinedPrompt(sourceLanguage) : buildPrompt(sourceLanguage) },
      ],
    }],
    generationConfig: {
      response_mime_type: "application/json",
      // 0 = the same recording always gives the same, literal translation.
      temperature: 0,
      // Transcription needs little reasoning; lower thinking answers much faster.
      thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING_LEVEL || "low" },
    },
  };

  try {
    return parseResult(await postGemini(model, body, outerSignal), model, combined);
  } catch (err) {
    // A model that does not accept the thinking setting: try once without it.
    if (err.status === 400 && /thinking/i.test(err.message)) {
      delete body.generationConfig.thinkingConfig;
      return parseResult(await postGemini(model, body, outerSignal), model, combined);
    }
    throw err;
  }
}

/** POSTs to generateContent; returns the raw body. Busy / slow answers throw VoiceBusyError. */
async function postGemini(model, body, outerSignal, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  outerSignal?.addEventListener("abort", () => controller.abort(), { once: true });
  let res;
  try {
    res = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new VoiceBusyError(`Gemini (${model}) did not answer in ${timeoutMs / 1000} s`);
    throw new VoiceBusyError(`Could not reach Gemini: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  const raw = await res.text();
  if (res.ok) return raw;
  let msg = raw.slice(0, 300);
  let perDay = false;
  try {
    const e = JSON.parse(raw)?.error;
    msg = e?.message || msg;
    perDay = (e?.details || []).some((d) => (d.violations || []).some((v) => /PerDay/i.test(v.quotaId || "")));
  } catch { /* keep raw */ }
  if (res.status === 429 && perDay) throw new VoiceQuotaError(QUOTA_MESSAGE);
  if ([429, 500, 502, 503, 504].includes(res.status)) throw new VoiceBusyError(`Gemini is busy (${res.status}): ${msg}`);
  const err = new Error(`Gemini error ${res.status}: ${msg}`);
  err.status = res.status;
  throw err;
}

function parseResult(raw, model, combined = false) {
  let text;
  try {
    const data = JSON.parse(raw);
    text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  } catch {
    throw new Error("Gemini returned an unreadable response");
  }
  let out;
  try {
    out = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new Error("Gemini did not return the expected JSON");
  }
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  // "All in one": the three parts; english = the observation (shown in the Observation box).
  // Also the area details and a suggested risk; each is checked and left empty when unclear.
  const days = Number.isInteger(out.fix_within_days) && out.fix_within_days >= 0 && out.fix_within_days <= 365 ? out.fix_within_days : null;
  const level = str(out.risk_level).toUpperCase();
  const parts = combined
    ? {
      observation: str(out.observation),
      customerAction: str(out.customer_action),
      bestserveAction: str(out.bestserve_action),
      areaName: str(out.area_name).slice(0, 200),
      targetPests: pestList(out.target_pests),
      title: str(out.title).slice(0, 250),
      riskCategory: str(out.risk_category).slice(0, 50),
      riskLevel: RISK_LEVELS.includes(level) ? level : "",
      fixWithinDays: days,
    }
    : null;
  const english = combined ? parts.observation : str(out.english);
  // Silence or noise: Gemini says so, or returns no real words (e.g. "0.0").
  const spoken = combined ? [parts.observation, parts.customerAction, parts.bestserveAction, parts.areaName, parts.title].join(" ") : english;
  const letters = (spoken.match(/\p{L}/gu) || []).length;
  if (out.no_speech === true || letters < 3) throw new VoiceNoSpeechError(NO_SPEECH_MESSAGE);

  return {
    detectedLanguage: typeof out.detected_language === "string" ? out.detected_language.slice(0, 10) : null,
    transcript: typeof out.transcript === "string" ? out.transcript.trim() : null,
    english,
    parts,
    confidence: ["high", "medium", "low"].includes(out.confidence) ? out.confidence : null,
    model,
  };
}

// ---------------------------------------------------------------------------
// Site walkthrough: ONE recording describing many areas -> a list of areas, each with its findings.
// Longer recordings take Gemini longer, so this call gets its own, longer time limit.
// ---------------------------------------------------------------------------
const WALKTHROUGH_TIMEOUT_MS = 120 * 1000;

function buildWalkthroughPrompt(sourceLanguage) {
  const lang = LANGUAGE_NAMES[sourceLanguage];
  return [
    "You are processing a voice recording made by a pest-control supervisor while walking through a customer site in India.",
    lang ? `The speaker is most likely speaking ${lang}, possibly mixed with English words.` : "Detect the spoken language (it may be Kannada, Hindi, Tamil, Telugu or English, possibly mixed).",
    "The supervisor goes area by area (e.g. front yard, backyard, first floor, kitchen, store room). For each area they say the problem,",
    "what the customer should do, and what BestServe (the pest-control company, 'we', 'our team') will do.",
    "Split the recording into areas in the order they were spoken. If one area has two separate problems, give it two findings.",
    "Translate everything into professional, grammatically correct English for a formal inspection report.",
    "Keep exactly the same meaning as what was said: do not add, remove or invent problems, actions, places or numbers.",
    "Only improve the wording: fix grammar, remove filler words and repetitions. Keep pest-control terms (rodent, burrow, harbourage, bait station, gel baiting, drain, debris).",
    "For each area: area_name (English, 1-5 words), zone_name (building / block / floor if said, else \"\").",
    "For each finding: title (a short name for the problem, at most 5 words), observation, customer_action, bestserve_action (\"\" if not said),",
    "risk_category: one of HARBOURAGE, BURROWS, ENTRY_POINT, FOOD_SOURCE, WATER, or a short English name if none fits;",
    "risk_level: LOW, MEDIUM, HIGH or CRITICAL - what was said, or else your suggestion from how serious the problem is;",
    "fix_within_days: a whole number only if a time was said (\"within a week\" = 7, \"immediately\" = 0), else null.",
    'If there is no clear speech, set "no_speech": true and return an empty "areas" list. Never invent text.',
    'Reply with JSON only: {"no_speech": false, "detected_language": "<ISO 639-1>", "transcript": "...", "areas": [{"area_name": "...", "zone_name": "...", "findings": [{"title": "...", "risk_category": "...", "risk_level": "...", "fix_within_days": null, "observation": "...", "customer_action": "...", "bestserve_action": "..."}]}]}',
  ].join("\n");
}

function parseWalkthrough(raw, model) {
  let out;
  try {
    const data = JSON.parse(raw);
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    out = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new Error("Gemini did not return the expected JSON");
  }
  const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const areas = (Array.isArray(out.areas) ? out.areas : []).slice(0, 60).map((a) => ({
    areaName: str(a?.area_name, 200),
    zoneName: str(a?.zone_name, 150),
    findings: (Array.isArray(a?.findings) ? a.findings : []).slice(0, 10).map((f) => {
      const level = str(f?.risk_level, 10).toUpperCase();
      const days = Number.isInteger(f?.fix_within_days) && f.fix_within_days >= 0 && f.fix_within_days <= 365 ? f.fix_within_days : null;
      return {
        title: str(f?.title, 250),
        riskCategory: str(f?.risk_category, 50),
        riskLevel: RISK_LEVELS.includes(level) ? level : "",
        fixWithinDays: days,
        observation: str(f?.observation, 4000),
        customerAction: str(f?.customer_action, 2000),
        bestserveAction: str(f?.bestserve_action, 2000),
      };
    }).filter((f) => f.observation || f.title || f.customerAction || f.bestserveAction),
  })).filter((a) => a.areaName || a.findings.length);
  if (out.no_speech === true || !areas.length) throw new VoiceNoSpeechError(NO_SPEECH_MESSAGE);
  return {
    areas,
    transcript: typeof out.transcript === "string" ? out.transcript.trim() : null,
    detectedLanguage: typeof out.detected_language === "string" ? out.detected_language.slice(0, 10) : null,
    model,
  };
}

/** One walkthrough recording -> areas and findings. Tries the main, backup and lite models in turn. */
async function transcribeWalkthrough({ objectKey, mimeType, sourceLanguage }) {
  if (!isConfigured()) throw new VoiceConfigError("Translation is not set up on the server (GEMINI_API_KEY missing)");
  const audio = await readObject(objectKey);
  if (!audio.length) throw new Error("The recording is empty");
  if (audio.length > MAX_INLINE_BYTES) throw new Error("The recording is too long (over 18 MB). Record the site in two parts.");
  const data = audio.toString("base64");
  const main = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallback = process.env.GEMINI_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL;
  const lite = (process.env.GEMINI_QUOTA_FALLBACK_MODELS ?? DEFAULT_QUOTA_FALLBACK).split(",").map((m) => m.trim());
  const models = [main, fallback, ...lite].filter((m, i, all) => m && all.indexOf(m) === i);
  const body = {
    contents: [{ parts: [{ inline_data: { mime_type: geminiMime(mimeType), data } }, { text: buildWalkthroughPrompt(sourceLanguage) }] }],
    generationConfig: { response_mime_type: "application/json", temperature: 0, thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING_LEVEL || "low" } },
  };
  let last = null;
  for (const model of models) {
    try {
      let raw;
      try {
        raw = await postGemini(model, body, undefined, WALKTHROUGH_TIMEOUT_MS);
      } catch (err) {
        if (err.status === 400 && /thinking/i.test(err.message)) {
          const plain = { ...body, generationConfig: { response_mime_type: "application/json", temperature: 0 } };
          raw = await postGemini(model, plain, undefined, WALKTHROUGH_TIMEOUT_MS);
        } else throw err;
      }
      return parseWalkthrough(raw, model);
    } catch (err) {
      if (err instanceof VoiceNoSpeechError) throw err;
      last = err;
      // Busy, slow or out of today's quota: try the next model; anything else is a real error.
      if (!(err instanceof VoiceBusyError) && !(err instanceof VoiceQuotaError)) throw err;
    }
  }
  throw last || new VoiceBusyError("Translation is busy. Try again in a minute.");
}

module.exports = { transcribeWalkthrough, transcribeAndTranslate, isConfigured, VoiceConfigError, VoiceBusyError, VoiceNoSpeechError, VoiceQuotaError };
