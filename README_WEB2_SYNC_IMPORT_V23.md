# WEB 2 — PENYESUAIAN DASHBOARD UNTUK IMPOR EXCEL WEB 1 (V23)

Web 2 membaca Google Spreadsheet yang sama dengan Web 1. Perubahan yang dibutuhkan untuk kasus impor Excel ini terbatas pada:

- `functions/api/public/dashboard.js`: deteksi dan hitung nilai error Google Sheets seperti `#REF!`, `#DIV/0!`, `#ERROR!`, `#VALUE!`, `#N/A`, dll.; contoh alamat sel diperlihatkan; metrik KPI yang bergantung pada sheet bermasalah tidak dipaksakan bernilai 0. Cache versi data dinaikkan agar cache lama tidak dipakai sesudah pembaruan.
- `src/main.jsx`: banner peringatan error rumus, berisi nama sheet/baris/kolom dan tindakan memeriksa ulang setelah diperbaiki pada Web 1.
- `tests/import-formula-health.mjs`: uji perlindungan dashboard terhadap error formula.
- `package.json` dan `package-lock.json`: versi 23.0.0 dan memasukkan uji baru ke `npm test`.

Tidak mengubah sistem login, routing utama, rumus KPI yang valid, ataupun pemisahan periode laporan.

## Deploy
1. Cadangkan repository Web 2. Salin hanya file patch Web 2 dengan path tetap, atau gunakan paket seluruh repository Web 2.
2. Deploy ulang pada proyek Cloudflare Pages **Web 2**, bukan Web 1.
3. Pertahankan variabel `GOOGLE_SHEETS_SPREADSHEET_ID` dan `GOOGLE_SERVICE_ACCOUNT_JSON` yang selama ini digunakan. Pastikan kedua web mengarah ke Spreadsheet yang sama.
4. Setelah Web 1 berhasil impor, klik muat ulang Dashboard/Web 2 untuk melewati cache. Jika masih error, lihat sel yang ditandai di Google Sheets.

Pengujian `npm test` lulus dengan Google Sheets tiruan, bukan data langsung dari akun produksi. ZIP tidak menyertakan file Excel atau kredensial.
