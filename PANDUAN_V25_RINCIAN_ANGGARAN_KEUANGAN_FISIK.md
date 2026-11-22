# SIKAP V25 — Rincian Anggaran, Keuangan, Serapan, dan Fisik

## Lingkup perubahan

Pembaruan hanya pada aplikasi **Web 2 — SIKAP**. Web 1 Kertas Kerja, rumus Excel, akun, koneksi Google, dan fitur **Penugasan Progres V24** tidak diubah. Perubahan ini adalah pembacaan *read-only* dari data master Web 1.

Dari **Dashboard** atau menu **Realisasi**, klik salah satu dari empat indikator:

1. **Total Anggaran**: panel terbuka pada tab pagu dan menampilkan nilai setiap program serta rincian kegiatan/subkegiatan.
2. **Realisasi Keuangan**: panel terbuka pada tab rupiah terealisasi; menampilkan pagu, realisasi, dan sisa dana.
3. **Serapan Keuangan**: panel khusus persentase realisasi keuangan dibanding pagu; grafik per program memakai satuan persen, **bukan rupiah**.
4. **Realisasi Fisik**: panel khusus realisasi fisik sesuai nilai master; tidak mengganti angka fisik dengan estimasi dari keuangan.

Dalam setiap panel, pengguna dapat berpindah tab, melihat grafik animasi per program, menelusuri rincian, memilih program, mencari nama kegiatan/subkegiatan, mengurutkan data, membuka/tutup seluruh program, melihat lima indikator per baris, serta menutup menggunakan tombol X/Escape. Grafik juga ditampilkan ringkas di Dashboard dan menu Realisasi.

## Sumber data dan aturan perhitungan

Sumber adalah Google Sheets yang sama dengan Web 1, pada sheet **`Realisasi Fisik & Keu`** untuk tahun/periode yang dipilih. Kolom sumber normal: **B** nama; **C** anggaran; **E** realisasi fisik (%); **G** realisasi keuangan (Rp); **H** persentase keuangan; **J** sisa dana (Rp). Pembacaan menggunakan pencarian header dan pemetaan `KKCOL_*` agar penambahan/pergeseran kolom yang terdaftar tidak merusak pemetaan.

- Baris `INSPEKTORAT` atau `JUMLAH BELANJA`: **total induk**, bukan kegiatan transaksi.
- Baris `PROGRAM ...`: **subtotal** untuk program tersebut, bukan penambah rincian anak.
- Baris kegiatan/subkegiatan: hanya rincian di bawah program; **tidak dijumlah ulang** ke subtotal program atau total induk.
- Urutan baris dengan kode (contoh `1.1`) diidentifikasi sebagai kegiatan. Baris tanpa nomor setelah kegiatan bernomor ditampilkan sebagai subkegiatan turunan **berdasarkan urutan**, dan ditandai sebagai klasifikasi inferensi (bukan kode resmi). Jika sumber tidak punya penanda klasifikasi, tampil dengan label **Rincian kegiatan/subkegiatan** tanpa menebak jenisnya.
- Nilai kosong atau tidak valid tidak disulap menjadi Rp0. Jika kolom J kosong sedangkan C dan G terisi, sisa dana dihitung dengan `C - G` dan diberi tanda bahwa nilai tersebut berasal dari perhitungan.
- Grafik tingkat program membandingkan nilai baris program, tidak menjumlahkan turunan. Apabila selisih total induk dan jumlah subtotal program lebih dari Rp1, UI menampilkan peringatan rekonsiliasi.
- Kolom K **PERMASALAHAN** serta keterangan bebas lain tidak dikirim ke publik.

## File sumber yang baru / diubah

- `src/FinanceExplorer.jsx` — panel rincian, 4 tab dan grafik, filter/pencarian, interaksi per program/baris.
- `src/finance-explorer.css` — gaya gelap modern, progress bar bergerak dan layar ponsel; dukungan reduced motion.
- `src/main.jsx` — memasang panel dan penautan klik semua kartu ke tab masing-masing.
- `functions/lib/financial-details.js` — parser sheet detail dan aturan rekonsiliasi.
- `functions/api/public/dashboard.js` — menambahkan `financialDetails` pada respons dashboard dengan sumber yang sama seperti KPI induk.
- `tests/financial-details.mjs` — uji angka, penambahan baris/kolom, pengelompokan, API, dan pengecualian kolom internal.
- `package.json` dan `package-lock.json` — metadata rilis dan skrip pengujian.

## Pemasangan GitHub / Cloudflare Pages

**Metode A (seluruh sumber):** ekstrak ZIP Lengkap, lalu salin semua isi ekstraksi ke **root** repo SIKAP lama, bukan membuat folder baru di dalamnya. **Metode B (paling aman)**: ekstrak ZIP File Pengganti, lalu timpa hanya file sesuai path-nya dalam root repo GitHub.

1. Cadangkan commit versi sebelumnya agar mudah rollback.
2. Pastikan `GOOGLE_SHEETS_SPREADSHEET_ID` dan `GOOGLE_SERVICE_ACCOUNT_JSON` di Cloudflare Pages **Web 2** tetap mengarah ke spreadsheet master Web 1 dan service account memiliki akses baca. Jangan memasukkan rahasia ke source GitHub.
3. Commit dan push file. Pengaturan build: **`npm run build`**, direktori output **`dist`**. Jika instalasi dependensi belum dijalankan: Cloudflare akan menjalankan `npm install` / `npm ci` sesuai setelannya.
4. Buka Web 2, pilih tahun & periode, lalu klik keempat kartu di Dashboard. Periksa grafik, rincian, dan nilai total terhadap sheet Web 1 setelah penyimpanan berhasil. Gunakan **Muat ulang** jika cache belum berganti.
5. Periksa juga fitur Penugasan Progres V24 dan halaman lain sebelum dipakai secara luas.

Tidak diperlukan environment variable baru atau migrasi database.

## Status pengujian lokal

Semua skrip pengujian Node backend lulus (`npm test`). Seluruh file JSX utama termasuk panel baru telah lolos pemeriksaan parser TypeScript (uji sintaks). Pengujian build bundler Vite di lingkungan penyusunan ini **belum bisa diselesaikan** karena paket npm tidak tersedia saat instalasi offline, sehingga deploy Cloudflare Pages dan pembacaan Google Sheets produksi masih memerlukan pengujian pada proyek Anda.
