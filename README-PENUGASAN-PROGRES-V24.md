# SIKAP V24 — Explorer Progress Penugasan (Web 2)

## Perubahan

Saat pengguna mengklik **Progress Penugasan** di dashboard, atau **Penugasan PKPT** pada kartu KPI, muncul jendela **Pusat Kendali Penugasan** dengan:

- angka status sesuai master (Sudah, Sedang Berjalan, Belum, Lainnya);
- diagram donat status yang bergerak, diagram batang berdasarkan Irban, Jenis Kegiatan, dan Jenis Pengawasan;
- daftar rincian pelaksanaan pembinaan dan pengawasan yang bisa dicari, difilter, dan diklik untuk melihat rincian;
- nama kegiatan, status pemantauan, Irban pengampu, jenis kegiatan/pengawasan, dasar penugasan, subkegiatan, target/realisasi output, dan jadwal Triwulan I-IV;
- ringkasan grafik Irban dan Jenis Kegiatan langsung di beranda dashboard dan halaman **Penugasan**.

Semua data diperoleh dari sheet `Rekap realisasi PKPT` di Google Spreadsheet yang **sama** dengan Web 1; tidak ada database baru, salinan manual, simulasi data, atau kredensial Google pada browser. Cloudflare Pages Function membaca sheet tersebut menggunakan Service Account di backend Web 2. Apabila ada penugasan ditambahkan/diedit di Web 1 kemudian disimpan ke Google Sheets, snapshot Web 2 berikutnya menampilkan data terbaru sesuai cache. Pemilihan tahun dan periode tetap mempertahankan isolasi sumber yang sebelumnya sudah diterapkan.

Baris kegiatan dibaca di bagian atas sheet PKPT, berhenti **sebelum** bagian `REALISASI OUTPUT PENUGASAN / SATUAN HASIL`. Kategori jenis pengawasan yang dipakai sebagai judul kelompok diwariskan ke baris rincian di bawahnya. Kolom master yang bergeser saat disisipkan kolom tetap ditangani dengan metadata `KKCOL_` / named ranges Web 1. Jika named range tidak ada, header kolom digunakan untuk menemukan posisi data. Jika nilai kosong, ditampilkan `Belum diisi` atau `—`; tidak diciptakan angka 0. Status bersumber dari kolom Pemantauan Realisasi, bukan dihitung dari output/jadwal.

Satu kegiatan dengan Irban pengampu gabungan (mis. `Irban I, II & III`) dihitung sekali dalam **total penugasan**, tetapi ditampilkan dalam masing-masing batang Irban. Total pada grafik Irban karenanya dapat melampaui jumlah penugasan. Baris dengan jenis kegiatan kosong digolongkan sebagai `Belum ditentukan` alih-alih diasumsikan Reviu/Audit.

## File yang diubah/ditambahkan (khusus Web 2)

| File | Perubahan |
| --- | --- |
| `functions/lib/pkpt-details.js` | **Baru:** proyeksi read-only rincian PKPT; pengelompokan status, Irban, Jenis Kegiatan, Jenis Pengawasan dan mapping kolom fleksibel |
| `functions/api/public/dashboard.js` | Tambah `pkpt` ke respons API dari Google Sheets; konsistensi angka KPI dan daftar; cache versi 24 |
| `src/PkptExplorer.jsx` | **Baru:** grafik, filter, pencarian, detail tugas, modal interaktif |
| `src/pkpt-explorer.css` | **Baru:** tampilan dan animasi grafik, responsif, reduced-motion |
| `src/main.jsx` | Integrasi klik panel/kartu PKPT dan panel ringkasan baru tanpa mengubah tampilan indikator lainnya |
| `tests/pkpt-details.mjs` | **Baru:** uji struktur master, judul kelompok, status, Irban gabungan, pergeseran kolom, respons API |
| `tests/import-formula-health.mjs` | Sesuaikan penanda versi API V24 |
| `package.json`, `package-lock.json` | Bump versi V24, penambahan pengujian |

**Tidak diperlukan file pengganti untuk Web 1.** `KKKInerjaInspektoaratMahakamUlu-main (15).zip` dipakai sebagai referensi struktur master, bukan dimodifikasi.

## Cara pasang di GitHub dan Cloudflare Pages

1. Sebelum mengganti, cadangkan repository Web 2 saat ini.
2. Unggah dan timpa file-file di atas ke repository **SIKAPInspektoratKabMahakamUlu-main**, **bukan** repository Web 1. Paket lengkap disediakan agar bisa diunggah ke repository Web 2 tanpa memilah file satu per satu.
3. Pastikan di Cloudflare Pages Web 2 ada Secret `GOOGLE_SERVICE_ACCOUNT_JSON` dan Variable `GOOGLE_SHEETS_SPREADSHEET_ID` yang **merujuk ke Google Spreadsheet yang sama** dengan Web 1. Berikan Service Account Web 2 izin `Viewer` ke Spreadsheet tersebut. Jangan menaruh private key di GitHub atau JS frontend.
4. Build Command: `npm run build`; Output Directory: `dist`; Root Directory: root repository. Biarkan Functions ikut diterbitkan melalui Git integration.
5. Setelah deploy, buka SIKAP, pilih TA/periode yang sama dengan Web 1, dan klik **Progress Penugasan** → cek rincian/filternya. Uji juga kartu **Penugasan PKPT** serta menu **Penugasan**.
6. Ubah satu status kegiatan di Web 1 lalu **simpan sampai masuk Google Sheets**, klik **Muat ulang** di Web 2, dan cek bahwa angka KPI, grafik, dan rincian berubah bersama. Bila hasil tidak segera berubah, periksa cache Cloudflare dan endpoint `/api/public/dashboard?year=2026&period=annual&refresh=1` (jika diperlukan).

## Pemeriksaan otomatis dan batasan

- Jalankan `npm ci`, `npm run build`, kemudian `npm test` pada komputer/pipeline yang mempunyai akses npm.
- Tes backend dijalankan tanpa menghubungi kredensial Google produksi menggunakan mock API; **uji live setelah deploy** tetap diperlukan untuk memastikan environment dan data Google Sheets aktual.
- Seluruh detail PKPT di sini ditampilkan pada **dashboard publik** Web 2; informasi pada kolom catatan bebas (`Ket`), metadata pengguna, dan kredensial tidak dikirimkan dalam respons publik. Evaluasi kembali apakah semua nama kegiatan PKPT memang boleh dipublikasikan; apabila hanya untuk internal, dashboard perlu autentikasi sebelum penggunaan produksi.
- Kelengkapan master mengikuti data yang tersimpan. Pengubahan rumus Excel, upload, dan autosave Web 1 tidak termasuk ruang lingkup pembaruan ini.
