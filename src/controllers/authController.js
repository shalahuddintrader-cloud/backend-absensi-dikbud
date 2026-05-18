const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { signToken } = require('../utils/jwt');
const { success, error } = require('../utils/response');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return error(res, 'Username dan password wajib diisi', 400);

    const [rows] = await query(
      `SELECT p.*, j.nama_jabatan, d.nama_departemen,
              lk.nama_lokasi as lokasi_kerja
       FROM pengguna p
       LEFT JOIN jabatan j ON j.id_jabatan = p.id_jabatan
       LEFT JOIN departemen d ON d.id_departemen = p.id_departemen
       LEFT JOIN pegawai_lokasi pl ON pl.id_pengguna = p.id_pengguna AND pl.is_primary = 1
       LEFT JOIN lokasi_kerja lk ON lk.id_lokasi = pl.id_lokasi
       WHERE p.username = ? AND p.is_active = 1 LIMIT 1`,
      [username]
    );

    if (!rows.length)
      return error(res, 'Username atau password salah', 401);

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch)
      return error(res, 'Username atau password salah', 401);

    // Update last_login
    await query('UPDATE pengguna SET last_login = NOW() WHERE id_pengguna = ?', [user.id_pengguna]);

    const token = signToken({
      id: user.id_pengguna, username: user.username, role: user.role,
    });

    const { password_hash, ...userData } = user;
    return success(res, { token, user: userData }, 'Login berhasil');
  } catch (e) {
    console.error(e);
    return error(res, 'Server error', 500);
  }
};

exports.logout = async (req, res) => {
  return success(res, null, 'Logout berhasil');
};

exports.getProfile = async (req, res) => {
  try {
    const [rows] = await query(
      `SELECT p.id_pengguna, p.username, p.nama_lengkap, p.email, p.no_hp,
              p.nik, p.role, p.foto_profil, p.last_login,
              j.nama_jabatan, d.nama_departemen, lk.nama_lokasi as lokasi_kerja,
              lk.latitude, lk.longitude, lk.radius_meter
       FROM pengguna p
       LEFT JOIN jabatan j ON j.id_jabatan = p.id_jabatan
       LEFT JOIN departemen d ON d.id_departemen = p.id_departemen
       LEFT JOIN pegawai_lokasi pl ON pl.id_pengguna = p.id_pengguna AND pl.is_primary = 1
       LEFT JOIN lokasi_kerja lk ON lk.id_lokasi = pl.id_lokasi
       WHERE p.id_pengguna = ?`,
      [req.user.id]
    );
    if (!rows.length) return error(res, 'User tidak ditemukan', 404);
    return success(res, rows[0]);
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password)
      return error(res, 'Field wajib diisi', 400);
    if (new_password.length < 8)
      return error(res, 'Password minimal 8 karakter', 400);

    const [rows] = await query(
      'SELECT password_hash FROM pengguna WHERE id_pengguna = ?', [req.user.id]
    );
    if (!rows.length) return error(res, 'User tidak ditemukan', 404);

    const isMatch = await bcrypt.compare(old_password, rows[0].password_hash);
    if (!isMatch) return error(res, 'Password lama salah', 400);

    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE pengguna SET password_hash = ? WHERE id_pengguna = ?', [hash, req.user.id]);
    return success(res, null, 'Password berhasil diubah');
  } catch (e) {
    return error(res, 'Server error', 500);
  }
};