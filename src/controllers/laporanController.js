/**
 * UPDATE laporanController.js
 * Tambah support upload foto/file bukti di laporan harian
 */

const { query } = require('../config/db');
const { success, error, paginated } = require('../utils/response');
const dayjs = require('dayjs');
const path = require('path');
const fs = require('fs');

exports.getCekHariIni = async (req, res) => {
  try {
    const today = require('dayjs')().format('YYYY-MM-DD');
    const [rows] = await query(
      'SELECT * FROM laporan_kegiatan WHERE id_pengguna = ? AND tanggal = ?',
      [req.user.id, today]
    );
    return success(res, rows[0] || null);
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};
// ── Submit Laporan dengan bukti ──────────────────────────────
exports.submitLaporan = async (req, res) => {
  try {
    const { isi_laporan, target_kerja, hasil_kerja, kendala, rencana_besok } = req.body;

    if (!isi_laporan?.trim())
      return error(res, 'Isi laporan wajib diisi', 400);

    const today = dayjs().format('YYYY-MM-DD');

    // Cek laporan hari ini sudah ada?
    const [cek] = await query(
      'SELECT id_laporan FROM laporan_kegiatan WHERE id_pengguna = ? AND tanggal = ?',
      [req.user.id, today]
    );
    if (cek.length)
      return error(res, 'Laporan hari ini sudah ada. Gunakan endpoint update.', 400);

    // Proses file bukti jika ada
    let buktiFotoUrl = null;
    let buktiFileUrl = null;

    if (req.files) {
      if (req.files.bukti_foto?.[0]) {
        buktiFotoUrl = `/uploads/laporan/foto/${req.files.bukti_foto[0].filename}`;
      }
      if (req.files.bukti_file?.[0]) {
        buktiFileUrl = `/uploads/laporan/file/${req.files.bukti_file[0].filename}`;
      }
    }

    const [result] = await query(
      `INSERT INTO laporan_kegiatan
        (id_pengguna, tanggal, isi_laporan, target_kerja, hasil_kerja,
         kendala, rencana_besok, bukti_foto, bukti_file, status)
       VALUES (?,?,?,?,?,?,?,?,?,'submitted')`,
      [req.user.id, today, isi_laporan, target_kerja, hasil_kerja,
       kendala, rencana_besok, buktiFotoUrl, buktiFileUrl]
    );

    return success(res, { id_laporan: result.insertId }, 'Laporan berhasil disimpan', 201);
  } catch (e) {
    console.error(e);
    return error(res, 'Server error', 500);
  }
};

// ── Update Laporan dengan bukti ──────────────────────────────
exports.updateLaporan = async (req, res) => {
  try {
    const { id } = req.params;
    const { isi_laporan, target_kerja, hasil_kerja, kendala, rencana_besok } = req.body;

    const [rows] = await query(
      'SELECT * FROM laporan_kegiatan WHERE id_laporan = ? AND id_pengguna = ?',
      [id, req.user.id]
    );
    if (!rows.length) return error(res, 'Laporan tidak ditemukan', 404);
    if (rows[0].status === 'reviewed')
      return error(res, 'Laporan yang sudah direview tidak dapat diubah', 400);

    // Proses file bukti baru jika ada
    let buktiFotoUrl = rows[0].bukti_foto;
    let buktiFileUrl = rows[0].bukti_file;

    if (req.files) {
      if (req.files.bukti_foto?.[0]) {
        // Hapus file lama
        if (rows[0].bukti_foto) {
          const oldPath = path.join(__dirname, '../../', rows[0].bukti_foto);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        buktiFotoUrl = `/uploads/laporan/foto/${req.files.bukti_foto[0].filename}`;
      }
      if (req.files.bukti_file?.[0]) {
        if (rows[0].bukti_file) {
          const oldPath = path.join(__dirname, '../../', rows[0].bukti_file);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        buktiFileUrl = `/uploads/laporan/file/${req.files.bukti_file[0].filename}`;
      }
    }

    await query(
      `UPDATE laporan_kegiatan SET isi_laporan=?, target_kerja=?, hasil_kerja=?,
       kendala=?, rencana_besok=?, bukti_foto=?, bukti_file=?
       WHERE id_laporan=?`,
      [isi_laporan, target_kerja, hasil_kerja, kendala, rencana_besok,
       buktiFotoUrl, buktiFileUrl, id]
    );

    return success(res, null, 'Laporan berhasil diperbarui');
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};
exports.getRiwayat = async (req, res) => {
  try {
    const { bulan, tahun, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = 'WHERE id_pengguna = ?';
    const params = [req.user.id];
    if (bulan && tahun) {
      where += ' AND MONTH(tanggal) = ? AND YEAR(tanggal) = ?';
      params.push(bulan, tahun);
    }
    const [rows] = await query(
      `SELECT * FROM laporan_kegiatan ${where} ORDER BY tanggal DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const [total] = await query(
      `SELECT COUNT(*) as total FROM laporan_kegiatan ${where}`, params
    );
    return paginated(res, rows, {
      page: parseInt(page), limit: parseInt(limit), total: total[0].total
    });
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};

exports.getDetail = async (req, res) => {
  try {
    const [rows] = await query(
      `SELECT lk.*, p.nama_lengkap FROM laporan_kegiatan lk
       JOIN pengguna p ON p.id_pengguna = lk.id_pengguna
       WHERE lk.id_laporan = ?`, [req.params.id]
    );
    if (!rows.length) return error(res, 'Laporan tidak ditemukan', 404);
    if (req.user.role === 'pegawai' && rows[0].id_pengguna !== req.user.id)
      return error(res, 'Akses ditolak', 403);
    return success(res, rows[0]);
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};