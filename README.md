# Backend API — Sistem Absensi

## Tech Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MySQL 8+ atau PostgreSQL 14+
- **Auth**: JWT (jsonwebtoken)
- **Upload**: Multer
- **Password**: bcryptjs
- **Notif**: Firebase Admin SDK

## Struktur
```
backend-absensi/
├── src/
│   ├── index.js            # Entry point
│   ├── config/
│   │   └── db.js           # Koneksi MySQL/PostgreSQL
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── absensiController.js
│   │   ├── laporanController.js
│   │   ├── izinController.js
│   │   └── rekapController.js
│   ├── middleware/
│   │   ├── auth.js         # JWT verify + role check
│   │   └── upload.js       # Multer file upload
│   ├── routes/
│   │   └── index.js        # Semua route v1
│   └── utils/
│       ├── jwt.js
│       ├── gps.js          # Haversine GPS distance
│       └── response.js     # Standard JSON response
├── uploads/
│   ├── foto/               # Foto absensi
│   └── lampiran/           # Lampiran izin
├── .env.example
└── package.json
```

## Cara Menjalankan

```bash
# Install dependencies
npm install

# Salin dan isi .env
cp .env.example .env

# Jalankan database schema terlebih dahulu
# (gunakan schema_mysql.sql atau schema_postgresql.sql)

# Development
npm run dev

# Production
npm start
```

## Environment Variables (.env)
```
PORT=3000
DB_TYPE=mysql           # atau postgresql
DB_HOST=localhost
DB_NAME=db_absensi
DB_USER=root
DB_PASSWORD=secret
JWT_SECRET=random_secret_panjang
ALLOWED_ORIGINS=http://localhost:5173
```

## Endpoint Lengkap

### Auth
- POST   /v1/auth/login
- POST   /v1/auth/logout
- GET    /v1/auth/me
- PUT    /v1/auth/change-password

### Absensi (Pegawai)
- GET    /v1/absensi/hari-ini
- POST   /v1/absensi/masuk      (multipart: foto + lat + lng)
- POST   /v1/absensi/keluar     (multipart: foto + lat + lng)
- GET    /v1/absensi/riwayat

### Laporan
- GET    /v1/laporan/hari-ini
- POST   /v1/laporan
- PUT    /v1/laporan/:id
- GET    /v1/laporan/riwayat
- GET    /v1/laporan/:id

### Izin
- POST   /v1/izin               (multipart)
- GET    /v1/izin/riwayat
- PATCH  /v1/izin/:id/approve   (Admin/Pimpinan)

### Rekap & Dashboard (Admin/Pimpinan)
- GET    /v1/rekap/bulanan
- GET    /v1/rekap/mingguan
- GET    /v1/rekap/semua
- GET    /v1/dashboard/summary