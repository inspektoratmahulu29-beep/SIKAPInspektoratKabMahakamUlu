# SIKAP + Kertas Kerja Mahakam Ulu — V16

Paket ini berisi kode sumber untuk dua aplikasi yang sudah ada. Dashboard publik menampilkan ringkasan; aplikasi kertas kerja menyimpan data dan rumus melalui Google Sheets. Kedua aplikasi harus menggunakan spreadsheet pusat yang SAMA. Tidak ada kredensial yang ditanamkan dalam ZIP ini.

## Urutan pemasangan

1. Unduh cadangan spreadsheet produksi dan kode lama terlebih dahulu.
2. ZIP pertama adalah aplikasi dashboard `SIKAPInspektoratKabMahakamUlu-main`. ZIP kedua adalah aplikasi editor `KKKInerjaInspektoaratMahakamUlu-main`. Ekstrak masing-masing dan ganti isi repository yang sesuai. File `functions`, `src`, `package.json`, `package-lock.json`, dan konfigurasi build harus ikut diperbarui. Jangan menaruh satu ZIP/repository di dalam repository aplikasi lainnya.
3. Deploy kedua proyek Cloudflare Pages: build `npm run build`, output `dist`, root repository sesuai lokasi `package.json`. Folder `functions` harus tetap di root proyek. Untuk deploy lewat Git, jangan hanya mengunggah isi `dist`, karena endpoint backend juga diperlukan.
4. Pertahankan pengaturan autentikasi yang sudah ada. Pada KEDUA proyek pastikan `GOOGLE_SHEETS_SPREADSHEET_ID` berisi ID yang sama, serta `GOOGLE_SERVICE_ACCOUNT_JSON` valid. Service account editor harus memperoleh izin Editor atas spreadsheet pusat; akun dashboard cukup memiliki izin baca. Google Sheets API harus aktif. Drive API dipakai untuk deteksi perubahan langsung di Google Sheets.
5. Login di aplikasi kertas kerja, buka **Edit & Input → Template Excel 2026**. Periksa pratinjau lalu terapkan import ke TA 2026. Template tertanam berasal dari Excel lampiran: 14 sheet, 340 rumus, data, sel gabungan dan format angka. Import ini MENGGANTI isi sheet yang dipilih dengan data lampiran; jangan terapkan jika data produksi yang lebih baru ingin dipertahankan. Alternatif: import file Excel terbaru Anda melalui tombol Import Excel.
6. Tunggu import selesai dan indikator Tersimpan. Muat ulang kedua aplikasi. Dashboard mengambil data pusat dengan cache singkat; perubahan bukan jaminan tampil dalam milidetik.
7. Uji satu edit angka, sisip satu baris di dalam rentang detail, sisip satu kolom di tengah, kemudian periksa rumus dan KPI pada Google Sheets dan dashboard.

Tidak ada variable wajib baru. Pengaturan lama editor tetap: `ADMIN_USERNAME`, secret `ADMIN_PASSWORD`, `SESSION_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`, variable `GOOGLE_SHEETS_SPREADSHEET_ID`, dan `DEFAULT_YEAR`. Binding D1 `DB` tetap opsional untuk audit/revisi, dengan migrasi lama `migrations/0001_init.sql`.

Dua variable build opsional untuk tautan navigasi:
- Pada dashboard: `VITE_KERTAS_KERJA_URL`.
- Pada editor: `VITE_DASHBOARD_URL`.
Default mengikuti URL aplikasi yang tampak pada rekaman. Perubahan variable `VITE_` memerlukan build ulang. Jangan menaruh secret Google atau password dalam variable `VITE_`.

## Cara mengisi grid

- Klik sel untuk memilih. Alamat sel dan isi/rumus tampak pada bilah **fx**.
- Klik ganda atau F2 untuk mengedit. Enter menyelesaikan edit. Panah/Tab berpindah sel; Shift+klik memilih rentang.
- Salin rentang dengan Ctrl+C, tempel tabel tab-separated dari Excel dengan Ctrl+V (maksimal 1.000 sel sekali proses). Tambahkan baris/kolom terlebih dahulu jika area tempel melebihi tabel.
- Rumus terkunci secara default agar tidak tertimpa saat mengisi data. Nonaktifkan **Kunci rumus** untuk mengubah formula secara sengaja.
- Isi angka mengikuti locale spreadsheet Google tujuan. Angka dan persen ditampilkan menggunakan format sel sumber.
- Tarik batas judul kolom untuk mengubah lebar tampilan. Perubahan lebar ini berlaku pada tampilan sesi, bukan ukuran cetak Excel.
- **Sisipkan baris/kolom** menyediakan posisi dan jumlah, termasuk di tengah. Nomor kolom menggunakan urutan A=1, B=2, dan seterusnya. Pilih kosong, salin format, atau salin format+rumus sebelumnya.
- Penyalinan rumus mengikuti aturan relatif/absolut Google Sheets. Baris baru kosong tidak otomatis mengetahui hubungan bisnis baru: tinjau rumus yang disalin, terutama jika baris sebelumnya adalah subtotal/judul.
- Supaya total SUM mengikuti data tambahan, sisipkan di DALAM rentang detail yang sudah dijumlahkan. Menambah di luar batas SUM tidak otomatis memperluas semua rumus bisnis.
- Tunggu status Tersimpan sebelum mengubah struktur. Setelah struktur berubah, seluruh workbook dibaca ulang agar referensi rumus dan sel gabungan mengikuti Google Sheets.
- Ctrl+Z membatalkan edit sel dalam sesi editor. Penghapusan/penyisipan struktur tidak memiliki undo di aplikasi; gunakan cadangan atau riwayat versi Google Sheets jika perlu.

## Perbaikan yang diterapkan

- Rumus asli tidak lagi diganti oleh perhitungan hardcode pada saat membaca, mengimpor, atau mengedit. Sel E pada Realisasi Fisik & Keu tidak lagi dibuang formulanya saat import.
- Seed lama diganti dengan data Excel lampiran. Sel formula bersama Excel dibaca lengkap menjadi 340 rumus individual yang setara.
- Dashboard dan editor memakai modul perhitungan KPI yang identik. Persentase fisik 0,5 berarti 0,5 poin persen sesuai template, bukan otomatis menjadi 50%. Nilai nol valid tidak diganti dengan angka keuangan.
- Capaian Sasaran Program memakai kolom sumber yang benar. Identifikasi header menghindari ketergantungan pada posisi lama. Baris total tidak dihitung lagi sebagai item detail.
- Import memasang named range `KKCOL_...` dan `KKVIEW_...` untuk menandai kolom dan area editor. Google menggeser penanda ini saat struktur berubah. Jangan menghapus/merename penanda sistem tersebut.
- Baris/kolom di tengah diproses dengan API struktur Google Sheets, bukan memotong/menyambung array lokal. Referensi antar-sheet ikut mengikuti perubahan posisi.
- Sheet bertahun `2026__...` diprioritaskan secara konsisten di kedua aplikasi bila ada bersama nama tanpa awalan. Tahun lain tidak membaca data TA 2026 secara tidak sengaja. Referensi formula antar-sheet dipetakan ke tahun tujuan saat menulis, dan dinormalkan untuk ekspor.
- Error formula ditampilkan, bukan diam-diam diganti dengan formula lain saat GET.
- Laporan Monev Renaksi tambahan yang sudah ada tidak dibangun ulang sehingga input bulanan tidak hilang ketika jumlah sumber berubah. KPI yang cocok dengan indikator sumber dapat ditautkan sebagai formula; penambahan indikator baru tetap perlu penyesuaian baris laporan tambahan. Ke-14 sheet sumber Excel tidak mendapat tautan bisnis baru yang tidak ada di Excel.
- Perubahan sel dikirim sebagai batch kecil; tempel banyak sel memperbarui state sekali per batch. Penyisipan tidak di-retry otomatis saat hasil permintaan tidak pasti agar tidak menggandakan baris.
- Tautan dua arah dashboard ↔ editor ditambahkan. Tautan tetap melewati login editor; kredensial tidak dikirim melalui URL.

## Hasil validasi lokal

Build produksi kedua aplikasi berhasil. Pemeriksaan sintaks mencakup 20 file backend editor dan 7 file backend dashboard. `npm test` pada editor menjalankan:

1. 699 assertion: 14 sheet, 340 rumus dipertahankan saat serialisasi, evaluasi independen 340 rumus dibandingkan cached value Excel, serta pemetaan kolom dan struktur.
2. Mock API Google: import, referensi tahun, penanda kolom, round-trip formula, baris kosong yang disisipkan, penolakan dimensi lama, dan tidak menggandakan mutasi saat respons koneksi hilang.
3. Render server komponen grid untuk seluruh 14 sheet, termasuk sel gabungan, bilah rumus, dan toolbar.

Nilai referensi dari Excel lampiran (bukan klaim isi spreadsheet produksi saat ini):

| Indikator | Nilai |
|---|---:|
| Anggaran | Rp28.172.392.109 |
| Realisasi keuangan | Rp22.873.934.360 |
| Fisik / serapan keuangan | 81,1927303564% |
| Sisa dana | Rp5.298.457.749 |
| Penugasan PKPT | 76 |
| Selesai | 29 |
| Berjalan | 11 |
| Belum | 36 |
| Output utama / penunjang | 35 / 18 |

Angka status dapat berbeda dari rekaman karena paket mengikuti file Excel lampiran. Satu sumber yang sama digunakan untuk kedua dashboard.

## Batas verifikasi dan penggunaan

Belum dilakukan deployment atau perubahan data pada Cloudflare/Google Sheets produksi Anda. Pengujian Google menggunakan respons simulasi karena secret produksi tidak tersedia di lingkungan pengerjaan. Browser headless lokal tidak dapat dijalankan akibat pembatasan socket lingkungan; validasi UI yang berhasil adalah build dan render server, bukan uji interaksi browser penuh. Jalankan langkah uji setelah deploy sebelum pemakaian operasional.

Grid ini menyediakan operasi spreadsheet utama yang diminta; bukan implementasi seluruh fitur Microsoft Excel. Macro VBA, pivot/chart editor, conditional formatting kompleks, drag-fill, undo struktur, dan kesamaan tata cetak/pixel 100% tidak dijanjikan. Rumus sumber tetap utuh; perhitungan produksi dilakukan Google Sheets sehingga fungsi Excel yang tidak didukung Google perlu diperiksa jika template kelak diganti. Dalam template lampiran ini fungsi yang ditemukan adalah IF, OR, IFERROR, SUM, AVERAGE, dan SUMPRODUCT.

Simpan serentak pada sel yang sama mengikuti perubahan terakhir yang diterima Google Sheets. Pemeriksaan dimensi mendeteksi sebagian konflik struktur; tidak ada penguncian transaksi lintas seluruh operator. Koordinasikan penyuntingan struktur dan import besar antaroperator. Import beberapa batch tidak bersifat transaksi atomik: jika gagal, periksa kondisi pusat lalu ulangi dari cadangan terverifikasi.
