const multer = require('multer');
const path   = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const dir = 'uploads/import';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.xlsx';
    cb(null, `import_${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];
  allowed.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error('Hanya file Excel (.xlsx/.xls) yang diizinkan'), false);
};

module.exports = multer({
  storage, fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('file');