/**
 * Hitung jarak dua koordinat GPS menggunakan formula Haversine
 * @returns jarak dalam meter
 */
const hitungJarak = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const validasiRadius = (latAbsen, lonAbsen, latLokasi, lonLokasi, radiusMeter) => {
  const jarak = hitungJarak(latAbsen, lonAbsen, latLokasi, lonLokasi);
  return { valid: jarak <= radiusMeter, jarakMeter: Math.round(jarak) };
};

module.exports = { hitungJarak, validasiRadius };