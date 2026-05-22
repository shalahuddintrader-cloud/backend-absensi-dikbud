require('dotenv').config();
const mysql = require('mysql2/promise');

const migrate = async () => {
  let cfg;
  if (process.env.DATABASE_URL) {
    const parsed = new URL(process.env.DATABASE_URL);
    cfg = {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 3306,
      user: parsed.username,
      password: parsed.password,
      database: parsed.pathname.replace('/', ''),
      multipleStatements: true,
    };
    if (parsed.searchParams.has('sslmode')) cfg.ssl = {};
  } else {
    cfg = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true,
    };
  }
  const db = await mysql.createConnection(cfg);

  const dbName = cfg.database || process.env.DB_NAME || 'db_absensi';

  await db.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await db.query(`USE \`${dbName}\``);

  const schema = `
    CREATE TABLE IF NOT EXISTS jabatan (
      id_jabatan INT AUTO_INCREMENT PRIMARY KEY,
      nama_jabatan VARCHAR(100) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS departemen (
      id_departemen INT AUTO_INCREMENT PRIMARY KEY,
      nama_departemen VARCHAR(100) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS lokasi_kerja (
      id_lokasi INT AUTO_INCREMENT PRIMARY KEY,
      nama_lokasi VARCHAR(200) NOT NULL,
      latitude DECIMAL(10,7) NOT NULL,
      longitude DECIMAL(10,7) NOT NULL,
      radius_meter INT NOT NULL DEFAULT 100,
      is_active TINYINT(1) DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS pengguna (
      id_pengguna INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      nama_lengkap VARCHAR(150) NOT NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      no_hp VARCHAR(20),
      nik VARCHAR(30) UNIQUE,
      role ENUM('pegawai','admin','pimpinan') NOT NULL DEFAULT 'pegawai',
      id_jabatan INT,
      id_departemen INT,
      is_active TINYINT(1) DEFAULT 1,
      foto_profil VARCHAR(255),
      last_login DATETIME,
      FOREIGN KEY (id_jabatan) REFERENCES jabatan(id_jabatan),
      FOREIGN KEY (id_departemen) REFERENCES departemen(id_departemen)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS pegawai_lokasi (
      id_pengguna INT NOT NULL,
      id_lokasi INT NOT NULL,
      is_primary TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (id_pengguna, id_lokasi),
      FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna),
      FOREIGN KEY (id_lokasi) REFERENCES lokasi_kerja(id_lokasi)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS absensi (
      id_absensi INT AUTO_INCREMENT PRIMARY KEY,
      id_pengguna INT NOT NULL,
      id_lokasi INT,
      tanggal DATE NOT NULL,
      waktu_masuk DATETIME,
      waktu_keluar DATETIME,
      lat_masuk DECIMAL(10,7),
      lng_masuk DECIMAL(10,7),
      lat_keluar DECIMAL(10,7),
      lng_keluar DECIMAL(10,7),
      foto_masuk VARCHAR(255),
      foto_keluar VARCHAR(255),
      device_id_masuk VARCHAR(100),
      device_id_keluar VARCHAR(100),
      valid_lokasi_masuk TINYINT(1),
      valid_lokasi_keluar TINYINT(1),
      status ENUM('hadir','izin','sakit','cuti','alpha') NOT NULL DEFAULT 'alpha',
      is_terlambat TINYINT(1) DEFAULT 0,
      menit_terlambat INT DEFAULT 0,
      keterangan TEXT,
      UNIQUE KEY unique_absensi (id_pengguna, tanggal),
      FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna),
      FOREIGN KEY (id_lokasi) REFERENCES lokasi_kerja(id_lokasi)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS pengajuan_izin (
      id_izin INT AUTO_INCREMENT PRIMARY KEY,
      id_pengguna INT NOT NULL,
      jenis ENUM('izin','sakit','cuti') NOT NULL,
      tanggal_mulai DATE NOT NULL,
      tanggal_akhir DATE NOT NULL,
      alasan TEXT NOT NULL,
      lampiran VARCHAR(255),
      status ENUM('pending','disetujui','ditolak') NOT NULL DEFAULT 'pending',
      catatan_approver TEXT,
      approved_by INT,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna),
      FOREIGN KEY (approved_by) REFERENCES pengguna(id_pengguna)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS laporan_kegiatan (
      id_laporan INT AUTO_INCREMENT PRIMARY KEY,
      id_pengguna INT NOT NULL,
      tanggal DATE NOT NULL,
      isi_laporan TEXT NOT NULL,
      target_kerja TEXT,
      hasil_kerja TEXT,
      kendala TEXT,
      rencana_besok TEXT,
      bukti_foto VARCHAR(255),
      bukti_file VARCHAR(255),
      status ENUM('submitted','reviewed') NOT NULL DEFAULT 'submitted',
      UNIQUE KEY unique_laporan (id_pengguna, tanggal),
      FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS notifikasi (
      id_notif INT AUTO_INCREMENT PRIMARY KEY,
      id_pengguna INT NOT NULL,
      judul VARCHAR(200) NOT NULL,
      pesan TEXT NOT NULL,
      tipe ENUM('absensi','izin','laporan','sistem') NOT NULL DEFAULT 'sistem',
      is_read TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS device_tokens (
      id_token INT AUTO_INCREMENT PRIMARY KEY,
      id_pengguna INT NOT NULL,
      fcm_token TEXT NOT NULL,
      platform VARCHAR(20),
      device_info TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  await db.query(schema);
  console.log('✅ Migration completed successfully');
  process.exit(0);
};

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
