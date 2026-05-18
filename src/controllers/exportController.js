const ExcelJS = require('exceljs');
const { query } = require('../config/db');
const dayjs = require('dayjs');

const BULAN_ID = ['','Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'];

exports.exportRekapBulanan = async (req, res) => {
  try {
    const { tahun, bulan, id_departemen } = req.query;
    const y = parseInt(tahun) || dayjs().year();
    const m = parseInt(bulan) || dayjs().month() + 1;
    const awal  = `${y}-${String(m).padStart(2,'0')}-01`;
    const akhir = dayjs(awal).endOf('month').format('YYYY-MM-DD');

    let deptFilter = '';
    const params = [awal, akhir];
    if (id_departemen) { deptFilter = 'AND p.id_departemen = ?'; params.push(id_departemen); }

    const [rows] = await query(
      `SELECT p.nik, p.nama_lengkap, d.nama_departemen, j.nama_jabatan,
              COUNT(a.id_absensi) AS total_hari,
              SUM(a.status='hadir') AS hadir,
              SUM(a.status='izin') AS izin,
              SUM(a.status='sakit') AS sakit,
              SUM(a.status='cuti') AS cuti,
              SUM(a.status='alpha') AS alpha,
              SUM(a.is_terlambat=1) AS terlambat,
              SUM(a.menit_terlambat) AS total_menit,
              ROUND(SUM(a.status='hadir')/NULLIF(COUNT(a.id_absensi),0)*100,1) AS persen_hadir
       FROM pengguna p
       LEFT JOIN absensi a ON a.id_pengguna=p.id_pengguna AND a.tanggal BETWEEN ? AND ?
       LEFT JOIN departemen d ON d.id_departemen=p.id_departemen
       LEFT JOIN jabatan j ON j.id_jabatan=p.id_jabatan
       WHERE p.role='pegawai' AND p.is_active=1 ${deptFilter}
       GROUP BY p.id_pengguna ORDER BY d.nama_departemen, p.nama_lengkap`,
      params
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = 'AbsensiKu';

    // ── Sheet 1: Rekap Per Pegawai ────────────────────────────
    const ws = wb.addWorksheet('Rekap Pegawai');
    const blue  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1A5CFF' } };
    const sub   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFEEF3FF' } };
    const alt   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF9FAFB' } };
    const thin  = { style:'thin', color:{ argb:'FFCCCCCC' } };
    const bdr   = { top:thin, left:thin, bottom:thin, right:thin };
    const ctr   = { horizontal:'center', vertical:'middle' };
    const lft   = { horizontal:'left',   vertical:'middle' };

    // Judul
    ws.mergeCells('A1:N1');
    const t = ws.getCell('A1');
    t.value = `REKAP ABSENSI ${BULAN_ID[m].toUpperCase()} ${y}`;
    t.font  = { bold:true, size:14, name:'Arial' };
    t.alignment = ctr; t.fill = sub;
    ws.getRow(1).height = 28;

    ws.mergeCells('A2:N2');
    const s = ws.getCell('A2');
    s.value = `Periode: 1 ${BULAN_ID[m]} ${y} s/d ${dayjs(akhir).format('D')} ${BULAN_ID[m]} ${y}  |  Dicetak: ${dayjs().format('D MMMM YYYY, HH:mm')}`;
    s.font  = { size:10, color:{ argb:'FF6B7280' }, name:'Arial' };
    s.alignment = ctr;
    ws.getRow(2).height = 16;

    const headers = ['No','NIK','Nama Lengkap','Departemen','Jabatan','Hadir','Izin','Sakit','Cuti','Alpha','Terlambat','Total Menit','Hari Kerja','% Hadir'];
    const widths  = [5,16,28,20,18,8,7,7,7,7,10,13,10,9];
    headers.forEach((h,i) => {
      const c = ws.getCell(3, i+1);
      c.value = h; c.font = { bold:true, color:{ argb:'FFFFFFFF' }, size:10, name:'Arial' };
      c.fill  = blue; c.alignment = ctr; c.border = bdr;
      ws.getColumn(i+1).width = widths[i];
    });
    ws.getRow(3).height = 30;

    // Kelompokkan per departemen
    let currentDept = null;
    let rowNum = 4;

    rows.forEach((row, i) => {
      // Header departemen
      if (row.nama_departemen !== currentDept) {
        currentDept = row.nama_departemen;
        ws.mergeCells(`A${rowNum}:N${rowNum}`);
        const dRow = ws.getCell(`A${rowNum}`);
        dRow.value = `🏢 ${currentDept || 'Tanpa Departemen'}`;
        dRow.font  = { bold:true, color:{ argb:'FF1A5CFF' }, size:11, name:'Arial' };
        dRow.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFEEF3FF' } };
        dRow.alignment = lft;
        ws.getRow(rowNum).height = 22;
        rowNum++;
      }

      const af = (i % 2 === 1) ? alt : null;
      const vals = [
        i+1, row.nik||'-', row.nama_lengkap, row.nama_departemen||'-', row.nama_jabatan||'-',
        row.hadir||0, row.izin||0, row.sakit||0, row.cuti||0, row.alpha||0,
        row.terlambat||0, row.total_menit||0, row.total_hari||0, parseFloat(row.persen_hadir)||0,
      ];
      const aligns = [ctr,lft,lft,lft,lft,...Array(9).fill(ctr)];
      vals.forEach((v,col) => {
        const c = ws.getCell(rowNum, col+1);
        c.value = v; c.border = bdr;
        c.font  = { size:10, name:'Arial', bold: col===2 };
        c.alignment = aligns[col];
        if (af) c.fill = af;
      });
      const pc = ws.getCell(rowNum, 14);
      pc.numFmt = '0.0"%"';
      pc.font = { bold:true, size:10, name:'Arial',
        color:{ argb: (row.persen_hadir||0)>=80 ? 'FF00C896' : 'FFFF4757' } };
      ws.getRow(rowNum).height = 18;
      rowNum++;
    });

    // Total
    ws.mergeCells(`A${rowNum}:E${rowNum}`);
    ws.getCell(`A${rowNum}`).value = 'TOTAL';
    ws.getCell(`A${rowNum}`).font  = { bold:true, color:{ argb:'FF1A5CFF' }, name:'Arial' };
    ws.getCell(`A${rowNum}`).fill  = sub;
    ws.getCell(`A${rowNum}`).alignment = lft;
    for (let col = 6; col <= 14; col++) {
      const c = ws.getCell(rowNum, col);
      c.value = { formula: `SUM(${String.fromCharCode(64+col)}4:${String.fromCharCode(64+col)}${rowNum-1})` };
      c.font  = { bold:true, color:{ argb:'FF1A5CFF' }, name:'Arial' };
      c.fill  = sub; c.border = bdr; c.alignment = ctr;
      if (col === 14) c.numFmt = '0.0"%"';
    }
    ws.getRow(rowNum).height = 22;
    ws.freeze_panes = 'A4';

    // ── Sheet 2: Rekap Per Departemen ─────────────────────────
    const ws2 = wb.addWorksheet('Rekap Per Departemen');
    const deptMap = {};
    rows.forEach(r => {
      const d = r.nama_departemen || 'Tanpa Departemen';
      if (!deptMap[d]) deptMap[d] = { pegawai:0, hadir:0, izin:0, sakit:0, alpha:0, terlambat:0, total:0 };
      deptMap[d].pegawai++;
      deptMap[d].hadir     += parseInt(r.hadir||0);
      deptMap[d].izin      += parseInt(r.izin||0);
      deptMap[d].sakit     += parseInt(r.sakit||0);
      deptMap[d].alpha     += parseInt(r.alpha||0);
      deptMap[d].terlambat += parseInt(r.terlambat||0);
      deptMap[d].total     += parseInt(r.total_hari||0);
    });

    ws2.mergeCells('A1:H1');
    const t2 = ws2.getCell('A1');
    t2.value = `REKAP PER DEPARTEMEN — ${BULAN_ID[m].toUpperCase()} ${y}`;
    t2.font  = { bold:true, size:13, name:'Arial' };
    t2.alignment = ctr; t2.fill = sub;
    ws2.getRow(1).height = 26;

    const h2 = ['Departemen','Jumlah Pegawai','Hadir','Izin','Sakit','Alpha','Terlambat','% Kehadiran'];
    const w2 = [28,16,10,10,10,10,12,14];
    h2.forEach((h,i) => {
      const c = ws2.getCell(2, i+1);
      c.value = h; c.font = { bold:true, color:{ argb:'FFFFFFFF' }, size:10, name:'Arial' };
      c.fill  = blue; c.alignment = ctr; c.border = bdr;
      ws2.getColumn(i+1).width = w2[i];
    });
    ws2.getRow(2).height = 28;

    Object.entries(deptMap).forEach(([dept, d], i) => {
      const pct = d.total > 0 ? Math.round(d.hadir/d.total*100) : 0;
      const af  = i%2===1 ? alt : null;
      const vals = [dept, d.pegawai, d.hadir, d.izin, d.sakit, d.alpha, d.terlambat, pct];
      vals.forEach((v,col) => {
        const c = ws2.getCell(i+3, col+1);
        c.value = v; c.border = bdr;
        c.font  = { size:10, name:'Arial', bold: col===0 };
        c.alignment = col===0 ? lft : ctr;
        if (af) c.fill = af;
      });
      const pc = ws2.getCell(i+3, 8);
      pc.numFmt = '0"%"';
      pc.font = { bold:true, size:10, name:'Arial',
        color:{ argb: pct>=80 ? 'FF00C896' : 'FFFF4757' } };
      ws2.getRow(i+3).height = 20;
    });

    // ── Kirim file ────────────────────────────────────────────
    const deptName = id_departemen ? `_${id_departemen}` : '';
    const filename = `Rekap_${BULAN_ID[m]}_${y}${deptName}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('[Export]', e);
    res.status(500).json({ status:'error', message:'Gagal generate Excel' });
  }
};

// Export laporan harian per departemen
exports.exportLaporanHarian = async (req, res) => {
  try {
    const { tanggal, id_departemen } = req.query;
    const tgl   = tanggal || dayjs().format('YYYY-MM-DD');

    let deptFilter = '';
    const params = [tgl];
    if (id_departemen) { deptFilter = 'AND p.id_departemen = ?'; params.push(id_departemen); }

    const [rows] = await query(
      `SELECT p.nik, p.nama_lengkap, d.nama_departemen,
              lk.isi_laporan, lk.target_kerja, lk.hasil_kerja, lk.kendala, lk.rencana_besok,
              lk.status, a.waktu_masuk, a.waktu_keluar, a.status as status_absen
       FROM pengguna p
       LEFT JOIN laporan_kegiatan lk ON lk.id_pengguna=p.id_pengguna AND lk.tanggal=?
       LEFT JOIN absensi a ON a.id_pengguna=p.id_pengguna AND a.tanggal=?
       LEFT JOIN departemen d ON d.id_departemen=p.id_departemen
       WHERE p.role='pegawai' AND p.is_active=1 ${deptFilter}
       ORDER BY d.nama_departemen, p.nama_lengkap`,
      [tgl, tgl, ...params.slice(1)]
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Laporan Harian');

    const blue = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1A5CFF' } };
    const sub  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFEEF3FF' } };
    const alt  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF9FAFB' } };
    const thin = { style:'thin', color:{ argb:'FFCCCCCC' } };
    const bdr  = { top:thin, left:thin, bottom:thin, right:thin };
    const ctr  = { horizontal:'center', vertical:'middle', wrapText:true };
    const lft  = { horizontal:'left',   vertical:'middle', wrapText:true };

    ws.mergeCells('A1:J1');
    const t = ws.getCell('A1');
    t.value = `LAPORAN HARIAN PEGAWAI — ${dayjs(tgl).format('D MMMM YYYY')}`;
    t.font  = { bold:true, size:13, name:'Arial' };
    t.alignment = { horizontal:'center', vertical:'middle' };
    t.fill = sub;
    ws.getRow(1).height = 26;

    const headers = ['No','NIK','Nama','Departemen','Absen','Kegiatan','Target','Hasil','Kendala','Rencana Besok'];
    const widths  = [5, 16, 24, 18, 10, 40, 30, 30, 25, 30];
    headers.forEach((h,i) => {
      const c = ws.getCell(2, i+1);
      c.value = h; c.font = { bold:true, color:{ argb:'FFFFFFFF' }, size:10, name:'Arial' };
      c.fill  = blue; c.alignment = ctr; c.border = bdr;
      ws.getColumn(i+1).width = widths[i];
    });
    ws.getRow(2).height = 28;

    rows.forEach((row, i) => {
      const af = i%2===1 ? alt : null;
      const statusAbsen = row.status_absen ? row.status_absen.toUpperCase() : 'ALPHA';
      const vals = [
        i+1, row.nik||'-', row.nama_lengkap, row.nama_departemen||'-',
        statusAbsen,
        row.isi_laporan || '(Belum diisi)',
        row.target_kerja || '-',
        row.hasil_kerja || '-',
        row.kendala || '-',
        row.rencana_besok || '-',
      ];
      vals.forEach((v,col) => {
        const c = ws.getCell(i+3, col+1);
        c.value = v; c.border = bdr;
        c.font  = { size:10, name:'Arial', bold: col===2 };
        c.alignment = col<=4 ? ctr : lft;
        if (af) c.fill = af;
      });
      // Warnai status absen
      const sc = ws.getCell(i+3, 5);
      const colors = { HADIR:'00C896', ALPHA:'FF4757', IZIN:'FFA502', SAKIT:'FF6B35' };
      sc.font = { bold:true, size:10, name:'Arial', color:{ argb:'FF'+(colors[statusAbsen]||'888888') } };
      // Warnai laporan belum diisi
      if (!row.isi_laporan) {
        ws.getCell(i+3, 6).font = { italic:true, color:{ argb:'FFADB5BD' }, size:10, name:'Arial' };
      }
      ws.getRow(i+3).height = 50;
    });

    const filename = `Laporan_Harian_${tgl}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('[Export Laporan]', e);
    res.status(500).json({ status:'error', message:'Gagal generate Excel' });
  }
};

/**
 * Export Laporan Bulanan Per Pegawai
 * Format: Lembar Penilaian Kinerja + Rekap Absensi + Tanda Tangan
 * Tambahkan ke exportController.js
 */


// Nilai predikat
const getPredikat = (nilai) => {
  if (nilai >= 90) return 'SANGAT BAIK';
  if (nilai >= 75) return 'BAIK';
  if (nilai >= 60) return 'CUKUP';
  return 'KURANG';
};

exports.exportLaporanBulananPegawai = async (req, res) => {
  try {
    const { tahun, bulan, id_pengguna } = req.query;
    const y = parseInt(tahun) || dayjs().year();
    const m = parseInt(bulan) || dayjs().month() + 1;
    const awal  = `${y}-${String(m).padStart(2,'0')}-01`;
    const akhir = dayjs(awal).endOf('month').format('YYYY-MM-DD');

    // Ambil data pegawai
    let whereUser = '';
    const params = [awal, akhir];
    if (id_pengguna) { whereUser = 'AND p.id_pengguna = ?'; params.push(id_pengguna); }

    const [pegawaiList] = await query(
      `SELECT p.id_pengguna, p.nik, p.nama_lengkap, p.no_hp,
              j.nama_jabatan, d.nama_departemen,
              lk.nama_lokasi, lk2.nama_lengkap as nama_kepala
       FROM pengguna p
       LEFT JOIN jabatan j ON j.id_jabatan = p.id_jabatan
       LEFT JOIN departemen d ON d.id_departemen = p.id_departemen
       LEFT JOIN pegawai_lokasi pl ON pl.id_pengguna = p.id_pengguna AND pl.is_primary = 1
       LEFT JOIN lokasi_kerja lk ON lk.id_lokasi = pl.id_lokasi
       LEFT JOIN pengguna lk2 ON lk2.role = 'pimpinan' AND lk2.is_active = 1
       WHERE p.role = 'pegawai' AND p.is_active = 1 ${whereUser}
       ORDER BY d.nama_departemen, p.nama_lengkap`,
      params
    );

    if (!pegawaiList.length) {
      return res.status(404).json({ status:'error', message:'Data pegawai tidak ditemukan' });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'AbsensiKu';

    for (const pegawai of pegawaiList) {
      // Ambil data absensi bulan ini
      const [absensi] = await query(
        `SELECT * FROM absensi
         WHERE id_pengguna = ? AND tanggal BETWEEN ? AND ?
         ORDER BY tanggal`,
        [pegawai.id_pengguna, awal, akhir]
      );

      // Ambil laporan kegiatan
      const [laporan] = await query(
        `SELECT * FROM laporan_kegiatan
         WHERE id_pengguna = ? AND tanggal BETWEEN ? AND ?
         ORDER BY tanggal`,
        [pegawai.id_pengguna, awal, akhir]
      );

      // Hitung statistik absensi
      const totalHari   = absensi.length;
      const totalHadir  = absensi.filter(a => a.status === 'hadir').length;
      const totalIzin   = absensi.filter(a => a.status === 'izin').length;
      const totalSakit  = absensi.filter(a => a.status === 'sakit').length;
      const totalAlpha  = absensi.filter(a => a.status === 'alpha').length;
      const totalTerlambat = absensi.filter(a => a.is_terlambat).length;
      const totalMenitTerlambat = absensi.reduce((s, a) => s + (a.menit_terlambat || 0), 0);
      const persenHadir = totalHari > 0 ? Math.round(totalHadir / totalHari * 100) : 0;
      const totalLaporan = laporan.length;

      // Hitung nilai kinerja otomatis
      const nilaiKehadiran  = Math.min(100, persenHadir);
      const nilaiKedisiplinan = totalHari > 0
        ? Math.max(0, Math.round(100 - (totalTerlambat / totalHari * 100)))
        : 100;
      const nilaiLaporan = totalHadir > 0
        ? Math.min(100, Math.round(totalLaporan / totalHadir * 100))
        : 0;

      // Nama sheet (max 31 char, no special chars)
      const sheetName = pegawai.nama_lengkap.substring(0, 28).replace(/[\/*?:[\]]/g, '');

      const ws = wb.addWorksheet(sheetName);

      // ── Styles ─────────────────────────────────────────────
      const headerFill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1A5CFF' } };
      const titleFill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFEEF3FF' } };
      const altFill    = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF5F7FF' } };
      const greenFill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE6F9F4' } };
      const redFill    = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFFEEF0' } };
      const yellowFill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFFF9E6' } };

      const thin  = { style:'thin',   color:{ argb:'FFCCCCCC' } };
      const med   = { style:'medium', color:{ argb:'FF1A5CFF' } };
      const bdrThin = { top:thin, left:thin, bottom:thin, right:thin };
      const bdrMed  = { top:med, left:med, bottom:med, right:med };
      const ctr = { horizontal:'center', vertical:'middle', wrapText:true };
      const lft = { horizontal:'left',   vertical:'middle', wrapText:true };
      const rgt = { horizontal:'right',  vertical:'middle' };

      // Lebar kolom
      ws.columns = [
        { width:5 },  // A - No
        { width:22 }, // B - Kriteria/Label
        { width:40 }, // C - Keterangan
        { width:12 }, // D
        { width:12 }, // E
        { width:12 }, // F
        { width:14 }, // G - Nilai
        { width:14 }, // H - Total
      ];

      let r = 1;

      // ══════════════════════════════════════════════════════
      // HEADER DOKUMEN
      // ══════════════════════════════════════════════════════
      ws.mergeCells(`A${r}:H${r}`);
      const judul = ws.getCell(`A${r}`);
      judul.value = 'LAPORAN BULANAN KINERJA PEGAWAI';
      judul.font  = { bold:true, size:14, name:'Arial', color:{ argb:'FF1A1D2E' } };
      judul.alignment = ctr; judul.fill = titleFill; judul.border = bdrMed;
      ws.getRow(r).height = 30; r++;

      ws.mergeCells(`A${r}:H${r}`);
      const sub = ws.getCell(`A${r}`);
      sub.value = `${BULAN_ID[m].toUpperCase()} ${y}`;
      sub.font  = { bold:true, size:12, name:'Arial', color:{ argb:'FF1A5CFF' } };
      sub.alignment = ctr; sub.fill = titleFill; sub.border = bdrMed;
      ws.getRow(r).height = 22; r++;

      r++; // spasi

      // ══════════════════════════════════════════════════════
      // DATA PEGAWAI
      // ══════════════════════════════════════════════════════
      ws.mergeCells(`A${r}:H${r}`);
      const infoHeader = ws.getCell(`A${r}`);
      infoHeader.value = 'DATA PEGAWAI';
      infoHeader.font  = { bold:true, size:11, name:'Arial', color:{ argb:'FFFFFFFF' } };
      infoHeader.alignment = lft; infoHeader.fill = headerFill; infoHeader.border = bdrThin;
      ws.getRow(r).height = 20; r++;

      const infoRows = [
        ['Nama Lengkap', pegawai.nama_lengkap],
        ['NIK',          pegawai.nik || '-'],
        ['Jabatan',      pegawai.nama_jabatan || '-'],
        ['Departemen',   pegawai.nama_departemen || '-'],
        ['Lokasi Kerja', pegawai.nama_lokasi || '-'],
        ['Periode',      `${BULAN_ID[m]} ${y} (${awal} s/d ${akhir})`],
      ];

      infoRows.forEach(([label, val], i) => {
        ws.mergeCells(`C${r}:H${r}`);
        const la = ws.getCell(`A${r}`);
        const lb = ws.getCell(`B${r}`);
        const lc = ws.getCell(`C${r}`);
        la.value = i + 1 + '.'; la.alignment = ctr; la.border = bdrThin;
        la.font  = { size:10, name:'Arial' };
        lb.value = label; lb.alignment = lft; lb.border = bdrThin;
        lb.font  = { bold:true, size:10, name:'Arial' };
        lc.value = val;   lc.alignment = lft; lc.border = bdrThin;
        lc.font  = { size:10, name:'Arial' };
        if (i % 2 === 1) {
          [la, lb, lc].forEach(c => c.fill = altFill);
        }
        ws.getRow(r).height = 18; r++;
      });

      r++; // spasi

      // ══════════════════════════════════════════════════════
      // REKAP ABSENSI
      // ══════════════════════════════════════════════════════
      ws.mergeCells(`A${r}:H${r}`);
      const absenHeader = ws.getCell(`A${r}`);
      absenHeader.value = 'REKAP KEHADIRAN';
      absenHeader.font  = { bold:true, size:11, name:'Arial', color:{ argb:'FFFFFFFF' } };
      absenHeader.alignment = lft; absenHeader.fill = headerFill; absenHeader.border = bdrThin;
      ws.getRow(r).height = 20; r++;

      // Summary kehadiran
      const absenStats = [
        ['Hari Kerja',        totalHari,            '#1A5CFF'],
        ['Hadir',             totalHadir,           '#00C896'],
        ['Izin',              totalIzin,            '#FFA502'],
        ['Sakit',             totalSakit,           '#FF6B35'],
        ['Alpha/Tidak Hadir', totalAlpha,           '#FF4757'],
        ['Terlambat',         totalTerlambat,       '#7C3AED'],
        ['Total Menit Terlambat', `${totalMenitTerlambat} menit`, '#7C3AED'],
        ['Laporan Diisi',     `${totalLaporan} laporan`, '#00C896'],
        ['Persentase Kehadiran', `${persenHadir}%`, persenHadir >= 80 ? '#00C896' : '#FF4757'],
      ];

      absenStats.forEach(([label, val, color], i) => {
        ws.mergeCells(`C${r}:D${r}`);
        ws.mergeCells(`E${r}:H${r}`);
        const la = ws.getCell(`A${r}`);
        const lb = ws.getCell(`B${r}`);
        const lc = ws.getCell(`C${r}`);
        const ld = ws.getCell(`E${r}`);
        la.value = i + 1 + '.'; la.alignment = ctr; la.border = bdrThin;
        la.font  = { size:10, name:'Arial' };
        lb.value = label; lb.alignment = lft; lb.border = bdrThin;
        lb.font  = { bold:true, size:10, name:'Arial' };
        lc.value = ':'; lc.alignment = ctr; lc.border = bdrThin;
        lc.font  = { size:10, name:'Arial' };
        ld.value = val; ld.alignment = lft; ld.border = bdrThin;
        ld.font  = { bold:true, size:11, name:'Arial', color:{ argb:'FF'+color.replace('#','') } };
        if (i % 2 === 1) {
          [la, lb, lc, ld].forEach(c => c.fill = altFill);
        }
        ws.getRow(r).height = 18; r++;
      });

      r++; // spasi

      // ══════════════════════════════════════════════════════
      // DETAIL ABSENSI HARIAN
      // ══════════════════════════════════════════════════════
      ws.mergeCells(`A${r}:H${r}`);
      const detailHeader = ws.getCell(`A${r}`);
      detailHeader.value = 'DETAIL KEHADIRAN HARIAN';
      detailHeader.font  = { bold:true, size:11, name:'Arial', color:{ argb:'FFFFFFFF' } };
      detailHeader.alignment = lft; detailHeader.fill = headerFill; detailHeader.border = bdrThin;
      ws.getRow(r).height = 20; r++;

      // Header tabel absensi
      const absenColHeaders = ['No','Tanggal','Hari','Jam Masuk','Jam Keluar','Status','Terlambat','Laporan'];
      const absenColWidths  = [5, 14, 12, 11, 11, 10, 10, 10];
      absenColHeaders.forEach((h, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = h; c.font = { bold:true, size:10, name:'Arial', color:{ argb:'FFFFFFFF' } };
        c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF334155' } };
        c.alignment = ctr; c.border = bdrThin;
        ws.getColumn(i + 1).width = absenColWidths[i];
      });
      ws.getRow(r).height = 22; r++;

      // Data harian
      const statusColors = { hadir:'FF00C896', alpha:'FFFF4757', izin:'FFFFA502', sakit:'FFFF6B35', cuti:'FF7C3AED' };
      const hariNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

      absensi.forEach((a, i) => {
        const tgl  = dayjs(a.tanggal);
        const hariIdx = tgl.day();
        const adaLaporan = laporan.find(l => l.tanggal === a.tanggal);
        const af = i % 2 === 1
          ? { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF8FAFF' } }
          : null;

        const rowData = [
          i + 1,
          tgl.format('DD/MM/YYYY'),
          hariNames[hariIdx],
          a.waktu_masuk  ? dayjs(a.waktu_masuk).format('HH:mm')  : '-',
          a.waktu_keluar ? dayjs(a.waktu_keluar).format('HH:mm') : '-',
          (a.status || 'alpha').toUpperCase(),
          a.is_terlambat ? `${a.menit_terlambat} mnt` : '-',
          adaLaporan ? '✓' : '✗',
        ];

        rowData.forEach((v, col) => {
          const c = ws.getCell(r, col + 1);
          c.value = v; c.alignment = ctr; c.border = bdrThin;
          c.font  = { size:10, name:'Arial' };
          if (af) c.fill = af;
        });

        // Warnai status
        const sc = ws.getCell(r, 6);
        const statusColor = statusColors[a.status] || 'FF888888';
        sc.font = { bold:true, size:10, name:'Arial', color:{ argb:statusColor } };

        // Warnai laporan
        const lc = ws.getCell(r, 8);
        lc.font = { bold:true, size:10, name:'Arial',
          color:{ argb: adaLaporan ? 'FF00C896' : 'FFFF4757' } };

        ws.getRow(r).height = 18; r++;
      });

      r++; // spasi

      // ══════════════════════════════════════════════════════
      // PENILAIAN KINERJA
      // ══════════════════════════════════════════════════════
      ws.mergeCells(`A${r}:H${r}`);
      const nilaiHeader = ws.getCell(`A${r}`);
      nilaiHeader.value = 'PENILAIAN KINERJA';
      nilaiHeader.font  = { bold:true, size:11, name:'Arial', color:{ argb:'FFFFFFFF' } };
      nilaiHeader.alignment = lft; nilaiHeader.fill = headerFill; nilaiHeader.border = bdrThin;
      ws.getRow(r).height = 20; r++;

      // Header tabel penilaian
      ['No','Kriteria Penilaian','','','','','Skor (1-100)','Nilai'].forEach((h, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = h; c.font = { bold:true, size:10, name:'Arial', color:{ argb:'FFFFFFFF' } };
        c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF334155' } };
        c.alignment = ctr; c.border = bdrThin;
      });
      ws.getRow(r).height = 22; r++;

      const kriteriaStart = r;
      const kriteriaData = [
        { no:'1.', label:'Kehadiran & Ketepatan Waktu',
          indikator: [
            ['a)', 'Persentase kehadiran bulan ini', nilaiKehadiran],
            ['b)', 'Kedisiplinan jam masuk kerja', nilaiKedisiplinan],
          ]
        },
        { no:'2.', label:'Kualitas & Produktivitas Kerja',
          indikator: [
            ['a)', 'Kelengkapan pengisian laporan harian', nilaiLaporan],
            ['b)', 'Kualitas laporan kegiatan', Math.min(100, nilaiLaporan + 5)],
          ]
        },
        { no:'3.', label:'Perilaku & Tanggung Jawab',
          indikator: [
            ['a)', 'Kepatuhan terhadap aturan instansi', 80],
            ['b)', 'Tanggung jawab terhadap tugas', 80],
            ['c)', 'Kerjasama dan komunikasi', 80],
          ]
        },
      ];

      let nilaiTotal = 0;
      let jumlahKriteria = 0;

      kriteriaData.forEach((k, ki) => {
        let sumSkor = 0;
        const indStart = r;

        k.indikator.forEach((ind, ii) => {
          ws.mergeCells(`C${r}:F${r}`);
          const ca = ws.getCell(`A${r}`);
          const cb = ws.getCell(`B${r}`);
          const cc = ws.getCell(`C${r}`);
          const cg = ws.getCell(`G${r}`);

          ca.value = ii === 0 ? k.no : '';
          cb.value = ii === 0 ? k.label : '';
          cc.value = `${ind[0]} ${ind[1]}`;
          cg.value = ind[2];

          [ca, cb, cc, cg].forEach(c => {
            c.alignment = lft; c.border = bdrThin;
            c.font = { size:10, name:'Arial' };
          });
          ca.alignment = ctr;
          cb.font = { bold: ii===0, size:10, name:'Arial' };
          cg.alignment = ctr;
          cg.font = { bold:true, size:11, name:'Arial' };

          if (r % 2 === 0) {
            [ca, cb, cc, cg].forEach(c => c.fill = altFill);
          }

          sumSkor += ind[2];
          ws.getRow(r).height = 18; r++;
        });

        // Nilai rata-rata kriteria
        const nilaiKriteria = Math.round(sumSkor / k.indikator.length);
        nilaiTotal += nilaiKriteria;
        jumlahKriteria++;

        ws.mergeCells(`C${r}:F${r}`);
        const na = ws.getCell(`A${r}`);
        const nb = ws.getCell(`B${r}`);
        const nh = ws.getCell(`H${r}`);
        na.value = ''; nb.value = `Nilai Kriteria ${ki + 1}`;
        nh.value = nilaiKriteria;
        [na, nb, nh].forEach(c => {
          c.font = { bold:true, size:10, name:'Arial', color:{ argb:'FF1A5CFF' } };
          c.alignment = c === nh ? ctr : lft;
          c.border = bdrThin;
          c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFEEF3FF' } };
        });
        ws.getRow(r).height = 18; r++;
      });

      // Nilai akhir
      const nilaiAkhir = Math.round(nilaiTotal / jumlahKriteria);
      const predikat   = getPredikat(nilaiAkhir);

      r++; // spasi
      ws.mergeCells(`A${r}:F${r}`);
      const naLabel = ws.getCell(`A${r}`);
      const naVal   = ws.getCell(`G${r}`);
      const naPred  = ws.getCell(`H${r}`);

      naLabel.value = 'NILAI KINERJA AKHIR';
      naVal.value   = nilaiAkhir;
      naPred.value  = predikat;

      [naLabel, naVal, naPred].forEach(c => {
        c.font  = { bold:true, size:12, name:'Arial', color:{ argb:'FFFFFFFF' } };
        c.fill  = { type:'pattern', pattern:'solid',
          fgColor:{ argb: nilaiAkhir >= 75 ? 'FF00A878' : 'FFFF4757' } };
        c.alignment = ctr; c.border = bdrMed;
      });
      ws.getRow(r).height = 26; r++;

      // Keterangan predikat
      r++;
      ws.mergeCells(`A${r}:H${r}`);
      const ketCell = ws.getCell(`A${r}`);
      ketCell.value = 'Keterangan: Nilai < 60 = Kurang  |  60-74 = Cukup  |  75-89 = Baik  |  ≥ 90 = Sangat Baik';
      ketCell.font  = { italic:true, size:9, name:'Arial', color:{ argb:'FF6B7280' } };
      ketCell.alignment = lft;
      ws.getRow(r).height = 16; r++;

      r++; // spasi

      // ══════════════════════════════════════════════════════
      // TANDA TANGAN
      // ══════════════════════════════════════════════════════
      const kota = 'Purwakarta';
      const tglCetak = dayjs().format('D MMMM YYYY');

      ws.mergeCells(`A${r}:H${r}`);
      const ttHeader = ws.getCell(`A${r}`);
      ttHeader.value = 'PENGESAHAN';
      ttHeader.font  = { bold:true, size:11, name:'Arial', color:{ argb:'FFFFFFFF' } };
      ttHeader.alignment = lft; ttHeader.fill = headerFill; ttHeader.border = bdrThin;
      ws.getRow(r).height = 20; r++;

      r++; // spasi sebelum tanda tangan

      // Kolom tanda tangan: Pegawai | Mengetahui Kepala Lokasi
      ws.mergeCells(`A${r}:D${r}`);
      ws.mergeCells(`E${r}:H${r}`);
      const tt1 = ws.getCell(`A${r}`);
      const tt2 = ws.getCell(`E${r}`);
      tt1.value = `Yang Bersangkutan,`;
      tt2.value = `${kota}, ${tglCetak}`;
      [tt1, tt2].forEach(c => {
        c.font = { size:10, name:'Arial' };
        c.alignment = ctr;
      });
      ws.getRow(r).height = 16; r++;

      ws.mergeCells(`A${r}:D${r}`);
      ws.mergeCells(`E${r}:H${r}`);
      const tt3 = ws.getCell(`A${r}`);
      const tt4 = ws.getCell(`E${r}`);
      tt3.value = '';
      tt4.value = 'Kepala Lokasi/PPK,';
      [tt3, tt4].forEach(c => {
        c.font = { bold:true, size:10, name:'Arial' };
        c.alignment = ctr;
      });
      ws.getRow(r).height = 16; r++;

      // Ruang tanda tangan (4 baris kosong)
      for (let i = 0; i < 4; i++) {
        ws.mergeCells(`A${r}:D${r}`);
        ws.mergeCells(`E${r}:H${r}`);
        ws.getRow(r).height = 18; r++;
      }

      // Nama & NIP pegawai
      ws.mergeCells(`A${r}:D${r}`);
      ws.mergeCells(`E${r}:H${r}`);
      const nm1 = ws.getCell(`A${r}`);
      const nm2 = ws.getCell(`E${r}`);
      nm1.value = pegawai.nama_lengkap.toUpperCase();
      nm2.value = (pegawai.nama_kepala || '..............................').toUpperCase();
      [nm1, nm2].forEach(c => {
        c.font = { bold:true, size:10, name:'Arial' };
        c.alignment = ctr;
      });
      ws.getRow(r).height = 18; r++;

      ws.mergeCells(`A${r}:D${r}`);
      ws.mergeCells(`E${r}:H${r}`);
      const nip1 = ws.getCell(`A${r}`);
      const nip2 = ws.getCell(`E${r}`);
      nip1.value = `NIK. ${pegawai.nik || '-'}`;
      nip2.value = 'NIP. ..............................';
      [nip1, nip2].forEach(c => {
        c.font = { size:10, name:'Arial' };
        c.alignment = ctr;
      });
      ws.getRow(r).height = 16; r++;

      // Print setup
      ws.pageSetup = {
        paperSize: 9, orientation: 'portrait',
        fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left:0.7, right:0.7, top:0.75, bottom:0.75, header:0.3, footer:0.3 },
      };
    }

    // Kirim file
    const namaDept = pegawaiList[0]?.nama_departemen || 'Semua';
    const filename = id_pengguna
      ? `Laporan_${pegawaiList[0]?.nama_lengkap}_${BULAN_ID[m]}_${y}.xlsx`
      : `Laporan_Bulanan_${namaDept}_${BULAN_ID[m]}_${y}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    await wb.xlsx.write(res);
    res.end();

  } catch (e) {
    console.error('[Export Laporan Bulanan]', e);
    res.status(500).json({ status:'error', message:'Gagal generate laporan' });
  }
};