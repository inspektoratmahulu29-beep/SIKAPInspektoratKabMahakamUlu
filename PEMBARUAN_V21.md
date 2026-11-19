# Dashboard SIKAP V21 — Catatan pembaruan

- KPI cards, Monev resmi, cakupan sheet, realisasi, dan penugasan: panel interaktif dengan grafik SVG.
- Responsive layout, tampilan angka besar, animasi dengan dukungan reduced motion.
- Public dashboard mengambil Google Sheets tanpa tergantung tab operator Kertas Kerja. Refresh berkala saat tab tampak (sekitar 12 detik), pemeriksaan daftar tahun (sekitar 30 detik), manual refresh melewati cache.
- Diagnostic tahun per API /api/public/connection?year=2027, daftar tahun /api/public/years?refresh=1 dan /api/public/dashboard?year=2027&period=annual&refresh=1.
- Tahun dan periode dibaca dari pilihan pengguna; situs tidak berpindah otomatis hanya karena sebuah tahun baru dibuat.

Peringatan: data yang belum tersimpan di Google tidak dapat muncul; Google Sheets API dan konfigurasi kedua proyek harus tersedia. Ini tidak mengaktifkan push WebSocket realtime.
