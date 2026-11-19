# Pembaruan SIKAP Dashboard V22

- Tidak ada lagi link publik menuju aplikasi Kertas Kerja.
- Tombol Muat ulang memakai request `refresh=1` baru, memiliki status percobaan/waktu dan berfungsi walau polling otomatis aktif.
- Diagnostik koneksi berada di panel Dashboard; semua nilai credential tetap dirahasiakan.
- Cache data cadangan ditandai jelas; snapshot tahun/periode lain tidak ditampilkan sebagai data aktif.
- Pembacaan Google dibatasi 2 retry x 8,5 detik, untuk menghindari akumulasi request panjang.
- Tidak ada HTTP 304 yang meninggalkan UI tanpa data.
- Tampilan Monev resmi, panel error, kartu KPI, dan tata letak responsif diperbaiki agar teks/nilai tidak terpotong.

## Instalasi
Lihat `PANDUAN_V22_DASHBOARD_SIKAP.md` yang disertakan terpisah. Mulai dari backup, pasang PATCH hanya pada repository Dashboard, deploy Cloudflare Production, lalu periksa tombol `Muat ulang` dan `Periksa koneksi sumber`.

Perubahan ini **tidak** mengubah data atau rumus di Google Spreadsheet, serta **tidak** mengubah source aplikasi operator Kertas Kerja.
