// Helpdesk API - /api/helpdesk. Rules (who raises, who answers) live in services/helpdesk.service.js.
//
//   GET    /summary                  badges + queue counts; tells the screen if this person is the team
//   GET    /agents                   technical team (for the assign picker)            [team]
//   GET    /tickets                  ?scope=&q=&priority=&page=
//   POST   /tickets                  multipart: message, subject?, source, page, appVersion, device, files[]  [raisers]
//   GET    /tickets/:id              ticket + thread (marks it read)
//   POST   /tickets/:id/messages     multipart: message, internal?, files[]
//   PATCH  /tickets/:id              { status?, priority?, assignedTo? ("me" | id | null) }   [team]
//   POST   /tickets/:id/confirm      user confirms a resolved ticket is solved              [raisers]
//   POST   /tickets/:id/reopen       { message? } user reopens - still an issue             [raisers]
//   GET    /attachments/:id          the file (needs login + access to the ticket)
const express = require("express");
const multer = require("multer");
const auth = require("../middleware/auth.middleware");
const hd = require("../services/helpdesk.service");

const router = express.Router();

const MAX_FILES = 5;
const MAX_FILE_MB = 10;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (hd.isAllowedFile(file)) return cb(null, true);
    cb(new hd.HttpError(400, "Only images (JPG, PNG, GIF, WEBP, HEIC) and PDF files can be attached"));
  },
});

// multer's own errors (too big, too many) as plain 400s.
function files(req, res, next) {
  upload.array("files", MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === "LIMIT_FILE_SIZE" ? `Each file must be under ${MAX_FILE_MB} MB`
        : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE" ? `You can attach up to ${MAX_FILES} files`
        : "Could not read the attached files";
      return res.status(400).json({ error: msg });
    }
    return hd.sendError(res, err, "Could not read the attached files");
  });
}

function handle(fn, fallback) {
  return async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      hd.sendError(res, err, fallback);
    }
  };
}

router.use(auth);

router.get("/summary", handle(hd.summary, "Failed to load helpdesk summary"));

router.get(
  "/agents",
  handle(async (req) => {
    hd.requireAgent(req);
    return { agents: await hd.listAgents() };
  }, "Failed to load the technical team")
);

router.get("/tickets", handle(hd.listTickets, "Failed to load tickets"));
router.post("/tickets", files, handle(hd.createTicket, "Failed to raise the ticket"));
router.get("/tickets/:id", handle(hd.getTicket, "Failed to load the ticket"));
router.post("/tickets/:id/messages", files, handle(hd.addMessage, "Failed to send the message"));
router.patch("/tickets/:id", express.json(), handle(hd.updateTicket, "Failed to update the ticket"));
router.post("/tickets/:id/confirm", handle(hd.confirmSolved, "Failed to close the ticket"));
router.post("/tickets/:id/reopen", express.json(), handle(hd.reopenTicket, "Failed to reopen the ticket"));

router.get("/attachments/:id", async (req, res) => {
  try {
    const file = await hd.getAttachment(req);
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    if (file.size) res.setHeader("Content-Length", file.size);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    file.stream.on("error", () => res.end());
    file.stream.pipe(res);
  } catch (err) {
    hd.sendError(res, err, "Failed to load the file");
  }
});

module.exports = router;
