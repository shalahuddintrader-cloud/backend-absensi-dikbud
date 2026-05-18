/**
 * Tambahkan ke src/middleware/upload.js
 * atau buat file baru uploadLaporan.js
 */
const multer = require('multer');
const path   = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Pastikan folder ada
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const storageLaporan = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder;
    if (file.fieldname === 'bukti_foto') {
      folder = 'uploads/laporan/foto';
    } else {
      folder = 'uploads/laporan/file';
    }
    ensureDir(folder);
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilterLaporan = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/jpg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Format file tidak diizinkan'), false);
};

const uploadLaporan = multer({
  storage: storageLaporan,
  fileFilter: fileFilterLaporan,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Upload multiple fields: bukti_foto dan bukti_file
exports.uploadBuktiLaporan = uploadLaporan.fields([
  { name: 'bukti_foto', maxCount: 1 },
  { name: 'bukti_file', maxCount: 1 },
]);