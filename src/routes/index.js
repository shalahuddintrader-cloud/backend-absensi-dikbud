const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const uploadLaporan = require('../middleware/uploadLaporan');

const exportCtrl = require('../controllers/exportController');
const authCtrl    = require('../controllers/authController');
const absenCtrl   = require('../controllers/absensiController');
const lapCtrl     = require('../controllers/laporanController');
const izinCtrl    = require('../controllers/izinController');
const rekapCtrl   = require('../controllers/rekapController');
const pegawaiCtrl = require('../controllers/pegawaiController');
const importCtrl   = require('../controllers/importController');
const uploadImport = require('../middleware/uploadImport');

// ── AUTH ─────────────────────────────────────────────────────
router.post('/auth/login',           authCtrl.login);
router.post('/auth/logout',          authenticate, authCtrl.logout);
router.get ('/auth/me',              authenticate, authCtrl.getProfile);
router.put ('/auth/change-password', authenticate, authCtrl.changePassword);

// ── ABSENSI ──────────────────────────────────────────────────
router.get ('/absensi/hari-ini', authenticate, absenCtrl.getStatusHariIni);
router.post('/absensi/masuk',    authenticate, upload.single('foto'), absenCtrl.absenMasuk);
router.post('/absensi/keluar',   authenticate, upload.single('foto'), absenCtrl.absenKeluar);
router.get ('/absensi/riwayat',  authenticate, absenCtrl.getRiwayat);

// ── LAPORAN ──────────────────────────────────────────────────
router.get ('/laporan/hari-ini', authenticate, lapCtrl.getCekHariIni);
router.get ('/laporan/riwayat',  authenticate, lapCtrl.getRiwayat);
router.post('/laporan',          authenticate, uploadLaporan.uploadBuktiLaporan, lapCtrl.submitLaporan);
router.put ('/laporan/:id',      authenticate, uploadLaporan.uploadBuktiLaporan, lapCtrl.updateLaporan);
router.get ('/laporan/:id',      authenticate, lapCtrl.getDetail);

// ── IZIN ─────────────────────────────────────────────────────
router.post('/izin',              authenticate, upload.single('lampiran'), izinCtrl.ajukanIzin);
router.get ('/izin/riwayat',      authenticate, izinCtrl.getRiwayatIzin);
router.patch('/izin/:id/approve', authenticate, authorize('admin','pimpinan'), izinCtrl.approveIzin);

// ── REKAP ─────────────────────────────────────────────────────
router.get('/rekap/bulanan',  authenticate, rekapCtrl.getRekapBulanan);
router.get('/rekap/mingguan', authenticate, rekapCtrl.getRekapMingguan);

// ── DASHBOARD & REKAP ADMIN ───────────────────────────────────
router.get('/dashboard/summary', authenticate, authorize('admin','pimpinan'), rekapCtrl.getDashboardSummary);
router.get('/rekap/semua',       authenticate, authorize('admin','pimpinan'), rekapCtrl.getRekapSemuaPegawai);

// ── MANAJEMEN PEGAWAI ─────────────────────────────────────────
router.get   ('/pegawai',                    authenticate, authorize('admin','pimpinan'), pegawaiCtrl.getAll);
router.get   ('/pegawai/master-data',        authenticate, authorize('admin','pimpinan'), pegawaiCtrl.getMasterData);
router.get   ('/pegawai/:id',                authenticate, authorize('admin','pimpinan'), pegawaiCtrl.getDetail);
router.post  ('/pegawai',                    authenticate, authorize('admin'),            pegawaiCtrl.create);
router.put   ('/pegawai/:id',                authenticate, authorize('admin'),            pegawaiCtrl.update);
router.patch ('/pegawai/:id/toggle',         authenticate, authorize('admin'),            pegawaiCtrl.toggleAktif);
router.patch ('/pegawai/:id/reset-password', authenticate, authorize('admin'),            pegawaiCtrl.resetPassword);

// ── IMPORT EXCEL ──────────────────────────────────────────────
router.post('/import/pegawai',  authenticate, authorize('admin'), uploadImport, importCtrl.importPegawai);
router.get ('/import/template', authenticate, authorize('admin','pimpinan'), importCtrl.downloadTemplate);

// Export Excel
router.get('/export/rekap-bulanan',  authenticate, authorize('admin','pimpinan'), exportCtrl.exportRekapBulanan);
router.get('/export/laporan-harian', authenticate, authorize('admin','pimpinan'), exportCtrl.exportLaporanHarian);
router.get('/export/laporan-bulanan-pegawai',  authenticate, authorize('admin','pimpinan'),  exportCtrl.exportLaporanBulananPegawai);
// ── NOTIFIKASI ────────────────────────────────────────────────
const notifCtrl = require('../controllers/notifikasiController');
router.get('/notifikasi',              authenticate, notifCtrl.getNotifikasi);
router.patch('/notifikasi/:id/read',    authenticate, notifCtrl.tandaiDibaca);
router.patch('/notifikasi/read-all',   authenticate, notifCtrl.tandaiSemuaDibaca);
router.get('/notifikasi/unread-count', authenticate, notifCtrl.getJumlahBelumDibaca);
router.post('/device/token',           authenticate, notifCtrl.simpanFcmToken);

// ── IZIN BATAL ─────────────────────────────────────────────────
router.delete('/izin/:id', authenticate, izinCtrl.batalkanIzin);

// ── MIGRATE ────────────────────────────────────────────────────
const { migrate } = require('../config/migrate');
router.post('/migrate', async (req, res) => {
  try {
    await migrate();
    res.json({ status: 'success', message: 'Migration completed' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});
module.exports = router;
