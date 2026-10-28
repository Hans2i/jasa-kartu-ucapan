# Jasa Kartu Ucapan (versi Cloudflare)

Jalan sepenuhnya di Cloudflare (Workers + D1), kodenya disimpan di GitHub.
Semua bagian ini tersedia di paket gratis. Tampilan dan cara pakai sama seperti sebelumnya.

## Cara memasang

### 1. Taruh kode di GitHub
1. Buat repository baru di GitHub (boleh private).
2. Upload **seluruh isi folder ini** (`src`, `public`, `wrangler.toml`, `package.json`, dst.) ke repository itu.

### 2. Buat database D1
1. Buka dashboard Cloudflare, menu **Storage & Databases**, lalu **D1 SQL Database**, lalu **Create**.
2. Beri nama `portal-kartu`, lalu buat.
3. Salin **Database ID** (deretan huruf dan angka panjang).
4. Di GitHub, buka file `wrangler.toml`, ganti `GANTI-DENGAN-ID-DATABASE-D1` dengan ID tadi, lalu simpan (commit).

Tabel dibuat otomatis saat portal pertama kali dibuka. Tidak perlu menjalankan perintah apa pun.

### 3. Sambungkan GitHub ke Cloudflare
1. Di dashboard Cloudflare: **Workers & Pages**, lalu **Create**, lalu **Import a repository** (pilih Workers, bukan Pages).
2. Hubungkan akun GitHub, pilih repository tadi.
3. Isian build:
   - Build command: kosongkan
   - Deploy command: `npx wrangler deploy`
4. Klik **Save and Deploy**.

Selesai. Setiap kali kamu mengubah file di GitHub, Cloudflare otomatis memasang versi barunya.

### 4. Buat akun pemilik
Buka alamat `jasa-kartu-ucapan.<akun-kamu>.workers.dev`, masuk ke menu **Penjual**, lalu buat akun pemilik **segera**, sebelum orang lain. Setelah akun pemilik ada, halaman itu tidak bisa dipakai lagi.

### 5. Pakai domain sendiri (opsional)
Di Cloudflare: **Workers & Pages**, pilih portal, **Settings**, **Domains & Routes**, **Add**, **Custom domain**.

## Catatan

- **Cadangan data**: buka D1, pilih database, tab **Time Travel** untuk memulihkan data ke titik waktu sebelumnya (tersedia di paket gratis beberapa hari ke belakang).
- **Password** disimpan sebagai hash PBKDF2-SHA256 (100.000 putaran, batas maksimum Cloudflare). Karena lebih ringan dari scrypt versi lama, pakai password yang panjang untuk akun pemilik.
- **Akun lama tidak ikut pindah.** Format hash berbeda dan penyimpanan pindah dari file ke D1. Buat ulang akun pemilik, lalu tambahkan web dan reseller lagi.
- **Batas paket gratis** (100.000 permintaan Worker per hari, 100.000 tulis D1 per hari) sangat longgar untuk portal seperti ini.
- Admin panel kamu tetap perlu **login sendiri**, dan web contoh/admin harus mengizinkan ditampilkan di dalam web lain (header `X-Frame-Options` / `frame-ancestors`).
- Kalau muncul "Database D1 belum tersambung", periksa `database_id` di `wrangler.toml`.

## Mencoba di komputer (opsional)
```
npm install
npx wrangler dev
```
