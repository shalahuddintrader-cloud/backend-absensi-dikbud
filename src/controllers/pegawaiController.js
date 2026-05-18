const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { success, error, paginated } = require('../utils/response');

// ── GET semua pegawai ────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const { search, id_departemen, role = 'pegawai', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let where = 'WHERE p.role = ?';
    const params = [role];

    if (search) {
      where += ' AND (p.nama_lengkap LIKE ? OR p.nik LIKE ? OR p.username LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (id_departemen) {
      where += ' AND p.id_departemen = ?';
      params.push(id_departemen);
    }

    const [rows] = await query(
      `SELECT p.id_pengguna, p.username, p.nama_lengkap, p.email, p.no_hp,
              p.nik, p.role, p.is_active, p.last_login, p.foto_profil,
              j.nama_jabatan, d.nama_departemen,
              lk.nama_lokasi as lokasi_kerja, lk.id_lokasi,
              pl.is_primary
       FROM pengguna p
       LEFT JOIN jabatan j    ON j.id_jabatan    = p.id_jabatan
       LEFT JOIN departemen d ON d.id_departemen = p.id_departemen
       LEFT JOIN pegawai_lokasi pl ON pl.id_pengguna = p.id_pengguna AND pl.is_primary = 1
       LEFT JOIN lokasi_kerja lk  ON lk.id_lokasi   = pl.id_lokasi
       ${where} ORDER BY p.nama_lengkap
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [total] = await query(
      `SELECT COUNT(*) as total FROM pengguna p ${where}`, params
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

// ── GET detail pegawai ───────────────────────────────────────
exports.getDetail = async (req, res) => {
  try {
    const [rows] = await query(
      `SELECT p.*, j.nama_jabatan, d.nama_departemen,
              lk.id_lokasi, lk.nama_lokasi, lk.latitude, lk.longitude, lk.radius_meter
       FROM pengguna p
       LEFT JOIN jabatan j    ON j.id_jabatan    = p.id_jabatan
       LEFT JOIN departemen d ON d.id_departemen = p.id_departemen
       LEFT JOIN pegawai_lokasi pl ON pl.id_pengguna = p.id_pengguna AND pl.is_primary = 1
       LEFT JOIN lokasi_kerja lk  ON lk.id_lokasi   = pl.id_lokasi
       WHERE p.id_pengguna = ?`, [req.params.id]
    );
    if (!rows.length) return error(res, 'Pegawai tidak ditemukan', 404);
    const { password_hash, ...data } = rows[0];
    return success(res, data);
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};

// ── CREATE pegawai baru ──────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const {
      username, password, nama_lengkap, email, no_hp, nik,
      role = 'pegawai', id_jabatan, id_departemen, id_lokasi,
    } = req.body;

    if (!username || !password || !nama_lengkap || !email)
      return error(res, 'Field wajib: username, password, nama_lengkap, email', 400);

    // Cek duplikat username/email/nik
    const [cek] = await query(
      'SELECT id_pengguna FROM pengguna WHERE username = ? OR email = ? OR (nik IS NOT NULL AND nik = ?)',
      [username, email, nik || '']
    );
    if (cek.length) return error(res, 'Username, email, atau NIK sudah digunakan', 400);

    const hash = await bcrypt.hash(password, 12);

    const [result] = await query(
      `INSERT INTO pengguna (username, password_hash, nama_lengkap, email, no_hp,
       nik, role, id_jabatan, id_departemen) VALUES (?,?,?,?,?,?,?,?,?)`,
      [username, hash, nama_lengkap, email, no_hp, nik, role, id_jabatan || null, id_departemen || null]
    );

    const id = result.insertId;

    // Set lokasi kerja jika disertakan
    if (id_lokasi) {
      await query(
        'INSERT INTO pegawai_lokasi (id_pengguna, id_lokasi, is_primary) VALUES (?,?,1)',
        [id, id_lokasi]
      );
    }

    return success(res, { id_pengguna: id }, 'Pegawai berhasil ditambahkan', 201);
  } catch (e) {
    console.error(e);
    return error(res, 'Server error', 500);
  }
};

// ── UPDATE pegawai ───────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nama_lengkap, email, no_hp, nik, role,
      id_jabatan, id_departemen, id_lokasi, is_active,
    } = req.body;

    const [rows] = await query('SELECT id_pengguna FROM pengguna WHERE id_pengguna = ?', [id]);
    if (!rows.length) return error(res, 'Pegawai tidak ditemukan', 404);

    await query(
      `UPDATE pengguna SET nama_lengkap=?, email=?, no_hp=?, nik=?, role=?,
       id_jabatan=?, id_departemen=?, is_active=? WHERE id_pengguna=?`,
      [nama_lengkap, email, no_hp, nik, role, id_jabatan || null, id_departemen || null,
       is_active !== undefined ? is_active : 1, id]
    );

    // Update lokasi kerja
    if (id_lokasi) {
      await query('DELETE FROM pegawai_lokasi WHERE id_pengguna = ?', [id]);
      await query(
        'INSERT INTO pegawai_lokasi (id_pengguna, id_lokasi, is_primary) VALUES (?,?,1)',
        [id, id_lokasi]
      );
    }

    return success(res, null, 'Data pegawai berhasil diperbarui');
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};

// ── RESET PASSWORD ───────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8)
      return error(res, 'Password minimal 8 karakter', 400);

    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE pengguna SET password_hash = ? WHERE id_pengguna = ?', [hash, id]);
    return success(res, null, 'Password berhasil direset');
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};

// ── TOGGLE AKTIF/NONAKTIF ────────────────────────────────────
exports.toggleAktif = async (req, res) => {
  try {
    const [rows] = await query(
      'SELECT is_active FROM pengguna WHERE id_pengguna = ?', [req.params.id]
    );
    if (!rows.length) return error(res, 'Pegawai tidak ditemukan', 404);
    const newStatus = rows[0].is_active ? 0 : 1;
    await query('UPDATE pengguna SET is_active = ? WHERE id_pengguna = ?', [newStatus, req.params.id]);
    return success(res, { is_active: newStatus },
      `Pegawai berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`);
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};

// ── GET master data (jabatan, departemen, lokasi) ────────────
exports.getMasterData = async (req, res) => {
  try {
    const [jabatan]    = await query('SELECT * FROM jabatan ORDER BY nama_jabatan');
    const [departemen] = await query('SELECT * FROM departemen ORDER BY nama_departemen');
    const [lokasi]     = await query('SELECT * FROM lokasi_kerja WHERE is_active=1 ORDER BY nama_lokasi');
    return success(res, { jabatan, departemen, lokasi });
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};