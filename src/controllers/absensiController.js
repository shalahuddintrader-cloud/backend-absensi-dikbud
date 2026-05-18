const { query } = require('../config/db');
const { validasiRadius } = require('../utils/gps');
const { success, error, paginated } = require('../utils/response');
const dayjs = require('dayjs');

// ── Validasi Jam Absen ────────────────────────────────────────
const validasiJamAbsen = (tipe) => {
  const now  = dayjs();
  const jam  = now.hour() * 60 + now.minute();
  const hari = now.day();

  if (hari === 0) return { valid: false, pesan: 'Hari Minggu tidak ada absensi.' };

  if (tipe === 'masuk') {
    if (jam < 6 * 60)  return { valid: false, pesan: 'Absen masuk belum dibuka. Mulai pukul 06:00.' };
    if (jam > 12 * 60) return { valid: false, pesan: 'Waktu absen masuk sudah tutup. Maksimal pukul 12:00.' };
    return { valid: true };
  }

  if (tipe === 'keluar') {
    if (hari === 6) return { valid: false, pesan: 'Hari Sabtu tidak ada absensi pulang.' };
    const mulai   = hari === 5 ? 16 * 60 + 30 : 16 * 60;
    const jamBuka = hari === 5 ? '16:30' : '16:00';
    if (jam < mulai)    return { valid: false, pesan: `Absen pulang belum dibuka. Mulai pukul ${jamBuka}.` };
    if (jam > 22 * 60)  return { valid: false, pesan: 'Waktu absen pulang sudah tutup. Maksimal pukul 22:00.' };
    return { valid: true };
  }
};

// ── GET Status Hari Ini ───────────────────────────────────────
exports.getStatusHariIni = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const [rows] = await query(
      `SELECT a.*, lk.nama_lokasi, lk.latitude as lok_lat, lk.longitude as lok_lng,
              lk.radius_meter,
              (SELECT COUNT(*) > 0 FROM laporan_kegiatan WHERE id_pengguna = ? AND tanggal = ?) as laporan_terisi
       FROM absensi a
       LEFT JOIN lokasi_kerja lk ON lk.id_lokasi = a.id_lokasi
       WHERE a.id_pengguna = ? AND a.tanggal = ?`,
      [req.user.id, today, req.user.id, today]
    );

    const [lokasiRows] = await query(
      `SELECT lk.latitude, lk.longitude, lk.radius_meter, lk.nama_lokasi
       FROM pegawai_lokasi pl
       JOIN lokasi_kerja lk ON lk.id_lokasi = pl.id_lokasi
       WHERE pl.id_pengguna = ? AND pl.is_primary = 1 AND lk.is_active = 1`,
      [req.user.id]
    );

    const result = rows.length ? rows[0] : null;
    return success(res, {
      ...(result || {}),
      laporan_terisi: result ? !!result.laporan_terisi : false,
      lokasi_lock: lokasiRows[0] || null,
    });
  } catch (e) {
    console.error(e);
    return error(res, 'Server error', 500);
  }
};

// ── Absen Masuk ───────────────────────────────────────────────
exports.absenMasuk = async (req, res) => {
  try {
    const cekJam = validasiJamAbsen('masuk');
    if (!cekJam.valid) return error(res, cekJam.pesan, 400);

    const { latitude, longitude, device_id } = req.body;
    const today = dayjs().format('YYYY-MM-DD');
    const now   = dayjs().format('YYYY-MM-DD HH:mm:ss');

    const [cek] = await query(
      'SELECT id_absensi, waktu_masuk FROM absensi WHERE id_pengguna = ? AND tanggal = ?',
      [req.user.id, today]
    );
    if (cek.length && cek[0].waktu_masuk)
      return error(res, 'Anda sudah absen masuk hari ini', 400);

    const [lokRows] = await query(
      `SELECT lk.* FROM pegawai_lokasi pl
       JOIN lokasi_kerja lk ON lk.id_lokasi = pl.id_lokasi
       WHERE pl.id_pengguna = ? AND pl.is_primary = 1 AND lk.is_active = 1`,
      [req.user.id]
    );

    let validLokasi = true;
    let jarakMeter  = 0;
    let idLokasi    = null;

    if (lokRows.length) {
      const lok  = lokRows[0];
      idLokasi   = lok.id_lokasi;
      const hasil = validasiRadius(
        parseFloat(latitude), parseFloat(longitude),
        parseFloat(lok.latitude), parseFloat(lok.longitude),
        lok.radius_meter
      );
      validLokasi = hasil.valid;
      jarakMeter  = hasil.jarakMeter;
      if (!hasil.valid) {
        return error(res,
          `Anda berada di luar area kerja. Jarak: ${hasil.jarakMeter}m, Radius izin: ${lok.radius_meter}m.`,
          400
        );
      }
    }

    const jamMasuk     = dayjs();
    const jamToleransi = dayjs().startOf('day').add(8, 'hour').add(15, 'minute');
    const isTerlambat  = jamMasuk.isAfter(jamToleransi);
    const menitTerlambat = isTerlambat
      ? jamMasuk.diff(dayjs().startOf('day').add(8, 'hour'), 'minute') : 0;

    const fotoUrl = req.file ? `/uploads/foto/${req.file.filename}` : null;

    if (cek.length) {
      await query(
        `UPDATE absensi SET waktu_masuk=?, lat_masuk=?, lng_masuk=?, foto_masuk=?,
         device_id_masuk=?, valid_lokasi_masuk=?, status='hadir',
         is_terlambat=?, menit_terlambat=?, id_lokasi=? WHERE id_absensi=?`,
        [now, latitude, longitude, fotoUrl, device_id, validLokasi ? 1 : 0,
         isTerlambat ? 1 : 0, menitTerlambat, idLokasi, cek[0].id_absensi]
      );
    } else {
      await query(
        `INSERT INTO absensi (id_pengguna, id_lokasi, tanggal, waktu_masuk, lat_masuk,
         lng_masuk, foto_masuk, device_id_masuk, valid_lokasi_masuk, status, is_terlambat, menit_terlambat)
         VALUES (?,?,?,?,?,?,?,?,?,'hadir',?,?)`,
        [req.user.id, idLokasi, today, now, latitude, longitude, fotoUrl,
         device_id, validLokasi ? 1 : 0, isTerlambat ? 1 : 0, menitTerlambat]
      );
    }

    return success(res, {
      waktu_masuk: now, valid_lokasi: validLokasi,
      jarak_meter: jarakMeter, is_terlambat: isTerlambat,
    }, 'Absen masuk berhasil');
  } catch (e) {
    console.error(e);
    return error(res, 'Server error', 500);
  }
};

// ── Absen Keluar ──────────────────────────────────────────────
exports.absenKeluar = async (req, res) => {
  try {
    const cekJam = validasiJamAbsen('keluar');
    if (!cekJam.valid) return error(res, cekJam.pesan, 400);

    const { latitude, longitude, device_id } = req.body;
    const today = dayjs().format('YYYY-MM-DD');
    const now   = dayjs().format('YYYY-MM-DD HH:mm:ss');

    const [rows] = await query(
      'SELECT * FROM absensi WHERE id_pengguna = ? AND tanggal = ? AND waktu_masuk IS NOT NULL',
      [req.user.id, today]
    );
    if (!rows.length)      return error(res, 'Anda belum absen masuk hari ini', 400);
    if (rows[0].waktu_keluar) return error(res, 'Anda sudah absen keluar hari ini', 400);

    const fotoUrl = req.file ? `/uploads/foto/${req.file.filename}` : null;

    const [lokRows] = await query(
      `SELECT lk.* FROM pegawai_lokasi pl
       JOIN lokasi_kerja lk ON lk.id_lokasi = pl.id_lokasi
       WHERE pl.id_pengguna = ? AND pl.is_primary = 1`,
      [req.user.id]
    );

    let validLokasi = true;
    if (lokRows.length) {
      const lok   = lokRows[0];
      const hasil = validasiRadius(
        parseFloat(latitude), parseFloat(longitude),
        parseFloat(lok.latitude), parseFloat(lok.longitude),
        lok.radius_meter
      );
      validLokasi = hasil.valid;
      if (!hasil.valid) {
        return error(res,
          `Anda berada di luar area kerja. Jarak: ${hasil.jarakMeter}m, Radius izin: ${lok.radius_meter}m.`,
          400
        );
      }
    }

    await query(
      `UPDATE absensi SET waktu_keluar=?, lat_keluar=?, lng_keluar=?,
       foto_keluar=?, device_id_keluar=?, valid_lokasi_keluar=?
       WHERE id_absensi=?`,
      [now, latitude, longitude, fotoUrl, device_id, validLokasi ? 1 : 0, rows[0].id_absensi]
    );

    return success(res, { waktu_keluar: now }, 'Absen keluar berhasil');
  } catch (e) {
    console.error(e);
    return error(res, 'Server error', 500);
  }
};

// ── Riwayat Absensi ───────────────────────────────────────────
exports.getRiwayat = async (req, res) => {
  try {
    const { bulan, tahun, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let where = 'WHERE a.id_pengguna = ?';
    const params = [req.user.id];

    if (bulan && tahun) {
      where += ' AND MONTH(a.tanggal) = ? AND YEAR(a.tanggal) = ?';
      params.push(bulan, tahun);
    }

    const [rows] = await query(
      `SELECT a.*, lk.nama_lokasi FROM absensi a
       LEFT JOIN lokasi_kerja lk ON lk.id_lokasi = a.id_lokasi
       ${where} ORDER BY a.tanggal DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [total] = await query(
      `SELECT COUNT(*) as total FROM absensi a ${where}`, params
    );

    return paginated(res, rows, {
      page: parseInt(page), limit: parseInt(limit),
      total: total[0].total,
      totalPages: Math.ceil(total[0].total / limit),
    });
  } catch (e) {
    console.error(e);
    return error(res, 'Server error', 500);
  }
};
