# PERBAIKAN V17 — DASHBOARD

Baca **PANDUAN_PENGGANTIAN_GITHUB_V17.md** yang terpisah.

File ZIP PATCH berisi hanya file baru/diubah, relatif terhadap root repository.
Pastikan repo ini tetap merupakan aplikasi terpisah dan memakai Google spreadsheet pusat yang sama dengan proyek pendamping.

## File diperbarui

```text
functions/api/public/dashboard.js
package-lock.json
package.json
src/main.jsx
src/styles.css
tests/public-period.mjs
wrangler.toml
```

## Validasi

Pengujian sintaks dan mock API berhasil. Full build dan uji login/Google di Cloudflare nyata harus dilakukan setelah deploy.
