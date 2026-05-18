require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const { connectDB } = require('./config/db');
const routes  = require('./routes');

const app = express();

// ── Security ─────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || '').split(','),
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50,
  message: { status: 'error', message: 'Terlalu banyak percobaan login' }
});

app.use(limiter);
app.use('/v1/auth/login', loginLimiter);

// ── Middleware ────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (foto absensi)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Routes ────────────────────────────────────────────────────
app.use('/v1', routes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// 404 handler
app.use((req, res) => res.status(404).json({ status: 'error', message: 'Endpoint tidak ditemukan' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ status: 'error', message: 'Ukuran file terlalu besar (maks 5MB)' });
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}).catch(err => {
  console.error('❌ Gagal koneksi database:', err);
  process.exit(1);
});