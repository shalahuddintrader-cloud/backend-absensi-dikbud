const { query } = require('../config/db');
const { success, error } = require('../utils/response');
const dayjs = require('dayjs');

exports.getRekapBulanan = async (req, res) => {
  try {
    const { tahun, bulan } = req.query;
    const idPengguna = req.user.role === 'pegawai' ? req.user.id : req.query.id_pengguna;

    const awal = dayjs(`${tahun}-${String(bulan).padStart(2,'0')}-01`).format('YYYY-MM-DD');
    const akhir = dayjs(awal).endOf('month').format('YYYY-MM-DD');

    const [rows] = await query(
      `SELECT
         COUNT(*) as total_hari_kerja,
         SUM(status='hadir') as total_hadir,
         SUM(status='izin') as total_izin,
         SUM(status='sakit') as total_sakit,
         SUM(status='cuti') as total_cuti,
         SUM(status='alpha') as total_alpha,
         SUM(is_terlambat=1) as total_terlambat,
         SUM(menit_terlambat) as total_menit_terlambat,
         ROUND(SUM(status='hadir')/COUNT(*)*100, 2) as persentase_hadir
       FROM absensi WHERE id_pengguna = ? AND tanggal BETWEEN ? AND ?`,
      [idPengguna || req.user.id, awal, akhir]
    );

    return success(res, { ...rows[0], periode_awal: awal, periode_akhir: akhir });
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};

exports.getRekapMingguan = async (req, res) => {
  try {
    const { tanggal } = req.query;
    const tgl = dayjs(tanggal || undefined);
    const awal = tgl.startOf('week').format('YYYY-MM-DD');
    const akhir = tgl.endOf('week').format('YYYY-MM-DD');

    const [rows] = await query(
      `SELECT a.tanggal, a.status, a.waktu_masuk, a.waktu_keluar,
              a.is_terlambat, a.menit_terlambat,
              (SELECT COUNT(*) > 0 FROM laporan_kegiatan WHERE id_pengguna=a.id_pengguna AND tanggal=a.tanggal) as ada_laporan
       FROM absensi a
       WHERE a.id_pengguna = ? AND a.tanggal BETWEEN ? AND ?
       ORDER BY a.tanggal ASC`,
      [req.user.id, awal, akhir]
    );
    return success(res, { minggu: rows, periode_awal: awal, periode_akhir: akhir });
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};

// Rekap SEMUA pegawai — untuk admin/pimpinan
exports.getRekapSemuaPegawai = async (req, res) => {
  try {
    const { tahun, bulan, id_departemen } = req.query;
    const awal = dayjs(`${tahun}-${String(bulan).padStart(2,'0')}-01`).format('YYYY-MM-DD');
    const akhir = dayjs(awal).endOf('month').format('YYYY-MM-DD');

    let deptFilter = '';
    const params = [awal, akhir];
    if (id_departemen) {
      deptFilter = 'AND p.id_departemen = ?';
      params.push(id_departemen);
    }

    const [rows] = await query(
      `SELECT p.id_pengguna, p.nik, p.nama_lengkap, d.nama_departemen, j.nama_jabatan,
              COUNT(a.id_absensi) as total_hari,
              SUM(a.status='hadir') as hadir,
              SUM(a.status='izin') as izin,
              SUM(a.status='sakit') as sakit,
              SUM(a.status='alpha') as alpha,
              SUM(a.status='cuti') as cuti,
              SUM(a.is_terlambat=1) as terlambat,
              ROUND(SUM(a.status='hadir')/COUNT(a.id_absensi)*100, 1) as persen_hadir
       FROM pengguna p
       LEFT JOIN absensi a ON a.id_pengguna = p.id_pengguna AND a.tanggal BETWEEN ? AND ?
       LEFT JOIN departemen d ON d.id_departemen = p.id_departemen
       LEFT JOIN jabatan j ON j.id_jabatan = p.id_jabatan
       WHERE p.role = 'pegawai' AND p.is_active = 1 ${deptFilter}
       GROUP BY p.id_pengguna
       ORDER BY p.nama_lengkap`,
      params
    );
    return success(res, rows);
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};

// Dashboard summary untuk pimpinan
exports.getDashboardSummary = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');

    const [totalPegawai] = await query(
      "SELECT COUNT(*) as total FROM pengguna WHERE role='pegawai' AND is_active=1"
    );
    const [hadir] = await query(
      "SELECT COUNT(*) as total FROM absensi WHERE tanggal=? AND status='hadir'", [today]
    );
    const [izin] = await query(
      "SELECT COUNT(*) as total FROM absensi WHERE tanggal=? AND (status='izin' OR status='sakit')", [today]
    );
    const [alpha] = await query(
      `SELECT COUNT(*) as total FROM pengguna p
       WHERE p.role='pegawai' AND p.is_active=1
       AND p.id_pengguna NOT IN (SELECT id_pengguna FROM absensi WHERE tanggal=?)`
      , [today]
    );
    const [terlambat] = await query(
      "SELECT COUNT(*) as total FROM absensi WHERE tanggal=? AND is_terlambat=1", [today]
    );
    const [belumLaporan] = await query(
      `SELECT COUNT(*) as total FROM pengguna p
       WHERE p.role='pegawai' AND p.is_active=1
       AND p.id_pengguna NOT IN (SELECT id_pengguna FROM laporan_kegiatan WHERE tanggal=?)`,
      [today]
    );

    // Trend 7 hari terakhir
    const [trend] = await query(
      `SELECT tanggal,
              SUM(status='hadir') as hadir,
              SUM(status='alpha') as alpha,
              SUM(status='izin' OR status='sakit') as izin
       FROM absensi
       WHERE tanggal BETWEEN DATE_SUB(?, INTERVAL 6 DAY) AND ?
       GROUP BY tanggal ORDER BY tanggal`,
      [today, today]
    );

    return success(res, {
      total_pegawai: totalPegawai[0].total,
      hadir_hari_ini: hadir[0].total,
      izin_hari_ini: izin[0].total,
      alpha_hari_ini: alpha[0].total,
      terlambat_hari_ini: terlambat[0].total,
      belum_laporan: belumLaporan[0].total,
      trend_7_hari: trend,
    });
  } catch (e) {
    console.error(e);
    return error(res, 'Server error', 500);
  }
};