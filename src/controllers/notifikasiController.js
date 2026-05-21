const { query } = require('../config/db');
const { success, error } = require('../utils/response');

exports.getNotifikasi = async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const [data] = await query(
      'SELECT * FROM notifikasi WHERE id_pengguna = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.user.id, parseInt(limit), parseInt(offset)]
    );
    success(res, data);
  } catch (e) { error(res, e.message); }
};

exports.tandaiDibaca = async (req, res) => {
  try {
    await query('UPDATE notifikasi SET is_read = 1 WHERE id_notif = ? AND id_pengguna = ?', [req.params.id, req.user.id]);
    success(res, null, 'Notifikasi ditandai dibaca');
  } catch (e) { error(res, e.message); }
};

exports.tandaiSemuaDibaca = async (req, res) => {
  try {
    await query('UPDATE notifikasi SET is_read = 1 WHERE id_pengguna = ?', [req.user.id]);
    success(res, null, 'Semua notifikasi ditandai dibaca');
  } catch (e) { error(res, e.message); }
};

exports.getJumlahBelumDibaca = async (req, res) => {
  try {
    const [rows] = await query('SELECT COUNT(*) as count FROM notifikasi WHERE id_pengguna = ? AND is_read = 0', [req.user.id]);
    success(res, rows[0]);
  } catch (e) { error(res, e.message); }
};

exports.simpanFcmToken = async (req, res) => {
  try {
    const { fcm_token, platform, device_info } = req.body;
    if (!fcm_token) return error(res, 'fcm_token wajib diisi', 400);

    const [existing] = await query('SELECT id_token FROM device_tokens WHERE id_pengguna = ? AND fcm_token = ?', [req.user.id, fcm_token]);
    if (existing.length) {
      await query('UPDATE device_tokens SET platform = ?, device_info = ?, updated_at = NOW() WHERE id_token = ?', [platform, JSON.stringify(device_info), existing[0].id_token]);
    } else {
      await query('INSERT INTO device_tokens (id_pengguna, fcm_token, platform, device_info) VALUES (?, ?, ?, ?)', [req.user.id, fcm_token, platform, JSON.stringify(device_info)]);
    }
    success(res, null, 'Token tersimpan');
  } catch (e) { error(res, e.message); }
};
