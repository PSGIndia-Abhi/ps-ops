const multer = require("multer");
const {
  createPreview,
  getImport,
  listImports,
  deleteImport,
  confirmImport,
  buildErrorRowsCsv,
  buildTemplate,
} = require("../services/InvoiceImport.service");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(xlsx|csv)$/i.test(file.originalname)) return cb(null, true);
    const err = new Error("Please upload an .xlsx or .csv file");
    err.status = 400;
    cb(err);
  },
});

// Runs multer and turns its errors (wrong type, file too large) into plain JSON messages.
function uploadFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "The file is too large (maximum 5 MB)" });
    res.status(err.status || 400).json({ error: err.message || "Upload failed" });
  });
}

function fail(res, err, fallback) {
  if (!err.status) console.error(fallback, err);
  res.status(err.status || 500).json({ error: err.status ? err.message : fallback });
}

async function previewImport(req, res) {
  if (!req.file) return res.status(400).json({ error: "Please choose a file to upload" });
  try {
    res.json(await createPreview(req.file, req.user));
  } catch (err) {
    fail(res, err, "Failed to read the file");
  }
}

async function getImportPreview(req, res) {
  try {
    res.json(await getImport(req.params.id, req.user));
  } catch (err) {
    fail(res, err, "Failed to load the import");
  }
}

async function listImportHistory(req, res) {
  try {
    res.json(await listImports(req.user));
  } catch (err) {
    fail(res, err, "Failed to load the upload history");
  }
}

async function removeImport(req, res) {
  try {
    res.json(await deleteImport(req.params.id, req.user));
  } catch (err) {
    fail(res, err, "Failed to remove the upload");
  }
}

async function downloadErrorRows(req, res) {
  try {
    const { fileName, content } = await buildErrorRowsCsv(req.params.id, req.user);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName.replace(/"/g, "")}"`);
    res.send(content);
  } catch (err) {
    fail(res, err, "Failed to download the error rows");
  }
}

async function confirmInvoiceImport(req, res) {
  try {
    res.json(await confirmImport(req.params.id, req.user));
  } catch (err) {
    fail(res, err, "Failed to import the invoices");
  }
}

async function downloadTemplate(req, res) {
  try {
    const buffer = await buildTemplate();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="invoice-import-template.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err) {
    fail(res, err, "Failed to build the template");
  }
}

module.exports = {
  uploadFile,
  previewImport,
  getImportPreview,
  listImportHistory,
  removeImport,
  downloadErrorRows,
  confirmInvoiceImport,
  downloadTemplate,
};
