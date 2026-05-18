const XLSX    = require('xlsx');
const bcrypt  = require('bcryptjs');
const { query } = require('../config/db');
const { success, error } = require('../utils/response');
const path = require('path');
const fs   = require('fs');

exports.importPegawai = async (req, res) => {
  try {
    if (!req.file) return error(res, 'File Excel wajib diupload', 400);

    // Baca file Excel
    const workbook  = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const rows      = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) return error(res, 'File Excel kosong', 400);

    // Ambil master data
    const [jabatanList]    = await query('SELECT id_jabatan, nama_jabatan FROM jabatan');
    const [departemenList] = await query('SELECT id_departemen, nama_departemen FROM departemen');
    const [lokasiList]     = await query('SELECT id_lokasi, nama_lokasi FROM lokasi_kerja WHERE is_active=1');

    const jabatanMap    = {};
    const departemenMap = {};
    const lokasiMap     = {};

    jabatanList.forEach(j => {
      jabatanMap[j.nama_jabatan.toLowerCase()] = j.id_jabatan;
    });
    departemenList.forEach(d => {
      departemenMap[d.nama_departemen.toLowerCase()] = d.id_departemen;
    });
    lokasiList.forEach(l => {
      lokasiMap[l.nama_lokasi.toLowerCase()] = l.id_lokasi;
    });

    const hasil = { berhasil: 0, gagal: 0, detail: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const noRow = i + 2; // +2 karena header di baris 1

      try {
        // Validasi kolom wajib
        const nama     = String(row['Nama Lengkap'] || row['nama_lengkap'] || '').trim();
        const username = String(row['Username']     || row['username']     || '').trim();
        const email    = String(row['Email']        || row['email']        || '').trim();
        const nik      = String(row['NIK']          || row['nik']          || '').trim();
        const noHp     = String(row['No HP']        || row['no_hp']        || '').trim();
        const jabatan  = String(row['Jabatan']      || row['jabatan']      || '').trim();
        const dept     = String(row['Departemen']   || row['departemen']   || '').trim();
        const lokasi   = String(row['Lokasi Kerja'] || row['lokasi_kerja'] || '').trim();
        const password = String(row['Password']     || row['password']     || 'Pegawai1234').trim();

        if (!nama || !username || !email) {
          hasil.gagal++;
          hasil.detail.push({
            baris: noRow, status: 'gagal',
            pesan: 'Nama, username, dan email wajib diisi',
            data: { nama, username, email },
          });
          continue;
        }

        // Cek duplikat username/email
        const [cek] = await query(
          'SELECT id_pengguna FROM pengguna WHERE username=? OR email=? OR (nik != "" AND nik=?)',
          [username, email, nik || '___']
        );
        if (cek.length) {
          hasil.gagal++;
          hasil.detail.push({
            baris: noRow, status: 'gagal',
            pesan: 'Username, email, atau NIK sudah digunakan',
            data: { nama, username, email, nik },
          });
          continue;
        }

        // Hash password
        const hash = await bcrypt.hash(password, 10);

        // Lookup ID jabatan, departemen, lokasi
        const idJabatan    = jabatanMap[jabatan.toLowerCase()]    || null;
        const idDepartemen = departemenMap[dept.toLowerCase()]    || null;
        const idLokasi     = lokasiMap[lokasi.toLowerCase()]      || null;

        // Insert pegawai
        const [result] = await query(
          `INSERT INTO pengguna (username, password_hash, nama_lengkap, email,
           no_hp, nik, role, id_jabatan, id_departemen)
           VALUES (?,?,?,?,?,?,'pegawai',?,?)`,
          [username, hash, nama, email, noHp, nik || null, idJabatan, idDepartemen]
        );

        // Set lokasi kerja jika ada
        if (idLokasi && result.insertId) {
          await query(
            'INSERT INTO pegawai_lokasi (id_pengguna, id_lokasi, is_primary) VALUES (?,?,1)',
            [result.insertId, idLokasi]
          );
        }

        hasil.berhasil++;
        hasil.detail.push({
          baris: noRow, status: 'berhasil',
          pesan: 'Pegawai berhasil ditambahkan',
          data: { nama, username, email, nik },
        });

      } catch (rowErr) {
        hasil.gagal++;
        hasil.detail.push({
          baris: noRow, status: 'gagal',
          pesan: rowErr.message || 'Error tidak diketahui',
          data: row,
        });
      }
    }

    // Hapus file setelah diproses
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    return success(res, hasil,
      `Import selesai: ${hasil.berhasil} berhasil, ${hasil.gagal} gagal`
    );
  } catch (e) {
    console.error('[Import]', e);
    return error(res, 'Gagal memproses file Excel', 500);
  }
};

// Download template Excel kosong
exports.downloadTemplate = async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const wb   = XLSX.utils.book_new();

    // Header kolom
    const headers = [[
      'Nama Lengkap', 'Username', 'Email', 'No HP', 'NIK',
      'Password', 'Jabatan', 'Departemen', 'Lokasi Kerja',
    ]];

    // Contoh data
    const contoh = [
      ['Budi Santoso', 'budi.santoso', 'budi@perusahaan.com', '08123456789',
       '19850101001', 'Pegawai1234', 'Staff', 'SDM', 'Kantor Pusat'],
      ['Siti Rahayu', 'siti.rahayu', 'siti@perusahaan.com', '08234567890',
       '19880315002', 'Pegawai1234', 'Supervisor', 'Keuangan', 'Kantor Pusat'],
    ];

    const ws = XLSX.utils.aoa_to_sheet([...headers, ...contoh]);

    // Set lebar kolom
    ws['!cols'] = [
      { wch: 25 }, { wch: 18 }, { wch: 28 }, { wch: 15 }, { wch: 16 },
      { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 20 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Data Pegawai');

    // Sheet panduan
    const panduan = XLSX.utils.aoa_to_sheet([
      ['PANDUAN PENGISIAN'],
      [''],
      ['Kolom', 'Keterangan', 'Wajib?'],
      ['Nama Lengkap', 'Nama lengkap pegawai', 'YA'],
      ['Username', 'Username untuk login (unik)', 'YA'],
      ['Email', 'Email pegawai (unik)', 'YA'],
      ['No HP', 'Nomor HP (untuk notif WhatsApp)', 'tidak'],
      ['NIK', 'Nomor Induk Kependudukan (unik)', 'tidak'],
      ['Password', 'Password awal (default: Pegawai1234)', 'tidak'],
      ['Jabatan', 'Harus sesuai dengan data jabatan di sistem', 'tidak'],
      ['Departemen', 'Harus sesuai dengan data departemen di sistem', 'tidak'],
      ['Lokasi Kerja', 'Harus sesuai dengan nama lokasi di sistem', 'tidak'],
    ]);
    XLSX.utils.book_append_sheet(wb, panduan, 'Panduan');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Template_Import_Pegawai.xlsx"');
    res.send(buffer);
  } catch (e) {
    return error(res, 'Gagal generate template', 500);
  }
};