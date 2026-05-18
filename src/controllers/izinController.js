const { query } = require('../config/db');
const { success, error, paginated } = require('../utils/response');
const dayjs = require('dayjs');

exports.ajukanIzin = async (req, res) => {
  try {
    const { jenis, tanggal_mulai, tanggal_akhir, alasan } = req.body;
    if (!jenis || !tanggal_mulai || !tanggal_akhir || !alasan)
      return error(res, 'Semua field wajib diisi', 400);
    if (!['izin','sakit','cuti'].includes(jenis))
      return error(res, 'Jenis izin tidak valid', 400);

    const lampiranUrl = req.file ? `/uploads/lampiran/${req.file.filename}` : null;

    const [result] = await query(
      `INSERT INTO pengajuan_izin (id_pengguna, jenis, tanggal_mulai, tanggal_akhir, alasan, lampiran)
       VALUES (?,?,?,?,?,?)`,
      [req.user.id, jenis, tanggal_mulai, tanggal_akhir, alasan, lampiranUrl]
    );

    // Buat record absensi dengan status izin untuk setiap tanggal
    let cur = dayjs(tanggal_mulai);
    const end = dayjs(tanggal_akhir);
    while (cur.isBefore(end) || cur.isSame(end, 'day')) {
      const tgl = cur.format('YYYY-MM-DD');
      await query(
        `INSERT INTO absensi (id_pengguna, tanggal, status, keterangan)
         VALUES (?,?,?,'Pengajuan izin #${result.insertId}')
         ON DUPLICATE KEY UPDATE status=?, keterangan='Pengajuan izin #${result.insertId}'`,
        [req.user.id, tgl, jenis, jenis]
      ).catch(() => {}); // ignore jika tanggal sudah ada
      cur = cur.add(1, 'day');
    }

    return success(res, { id_izin: result.insertId }, 'Pengajuan izin berhasil dikirim', 201);
  } catch (e) {
    console.error(e);
    return error(res, 'Server error', 500);
  }
};

exports.getRiwayatIzin = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const idCol = req.user.role === 'pegawai' ? 'WHERE pi.id_pengguna = ?' : '';
    const params = req.user.role === 'pegawai' ? [req.user.id] : [];

    const [rows] = await query(
      `SELECT pi.*, p.nama_lengkap, p.nik FROM pengajuan_izin pi
       JOIN pengguna p ON p.id_pengguna = pi.id_pengguna
       ${idCol} ORDER BY pi.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const [total] = await query(
      `SELECT COUNT(*) as total FROM pengajuan_izin pi ${idCol}`, params
    );
    return paginated(res, rows, { page: parseInt(page), limit: parseInt(limit), total: total[0].total });
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};

exports.approveIzin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, catatan } = req.body;
    if (!['disetujui','ditolak'].includes(status))
      return error(res, 'Status tidak valid', 400);

    const [rows] = await query('SELECT * FROM pengajuan_izin WHERE id_izin = ?', [id]);
    if (!rows.length) return error(res, 'Pengajuan tidak ditemukan', 404);
    if (rows[0].status !== 'pending')
      return error(res, 'Pengajuan sudah diproses sebelumnya', 400);

    await query(
      `UPDATE pengajuan_izin SET status=?, catatan_approver=?, approved_by=?, approved_at=NOW()
       WHERE id_izin=?`,
      [status, catatan, req.user.id, id]
    );

    // Jika ditolak, kembalikan status absensi ke alpha
    if (status === 'ditolak') {
      await query(
        `UPDATE absensi SET status='alpha', keterangan='Izin ditolak'
         WHERE id_pengguna=? AND tanggal BETWEEN ? AND ?`,
        [rows[0].id_pengguna, rows[0].tanggal_mulai, rows[0].tanggal_akhir]
      );
    }
    return success(res, null, `Pengajuan izin berhasil ${status}`);
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};