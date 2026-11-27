# Bilingku

Billing PPPoE & Hotspot untuk MikroTik: voucher, paket, pelanggan, jatuh tempo, isolir otomatis, laporan penjualan.

**Versi 4 ditulis ulang dengan Node.js** — tidak perlu PHP lagi. Tanpa dependensi npm (memakai `node:sqlite` bawaan Node.js 22.13+).

- **Database:** SQLite (`data/bilingku.db`), tabel dan formatnya sama dengan versi PHP, jadi data lama langsung terbaca.
- **Data di router:** voucher, profil, dan secret tetap disimpan di MikroTik.
- **Script di router sama persis dengan versi PHP:** on-login profil hotspot (format Mikhmon), Expire Monitor, scheduler isolir PPP, firewall & web proxy isolir.
- **Template voucher** tetap ditulis dengan sintaks PHP terbatas seperti sebelumnya (`$username`, `if`, `substr`, …). Template lama dan template buatan sendiri tetap jalan; Bilingku membacanya dengan penerjemahnya sendiri (tanpa PHP, tanpa `eval`).

## Cara pasang

### Sebagai add-on ACS NETMAP Panel (dianjurkan)

Di [ACS NETMAP Panel](https://github.com/suwazed-cmyk/acs-netmap-panel): menu **Add-on → Bilingku → Install** (atau **Update** bila sudah terpasang versi PHP).

Panel mengunduh repo ini ke `/opt/addons/bilingku`, memasang Node.js bila perlu, dan menjalankan layanan `addon-bilingku`. Dibuka lewat panel utama, misalnya `https://domain-anda/billing/`.

- **Tambah router dari panel utama.** Di *Tambah Router*, pilih router di kolom **Dari panel utama** (L2TP / ZeroTier / WireGuard). Nama dan alamat VPN terisi otomatis.
- **API router tidak perlu dibuka ke internet.** Cukup izinkan dari IP VPS di jaringan VPN:

```
/ip service set api disabled=no address=IP-VPS-VPN/32
/user add name=bilingku group=full password=SANDI-KUAT address=IP-VPS-VPN/32
```

### Mandiri

```
node --disable-warning=ExperimentalWarning server.js
```

Environment: `PORT` (bawaan 8092), `HOST` (bawaan 127.0.0.1), `DATA_DIR` (bawaan `./data`).

## Pindah dari versi PHP

- Akun admin lama tetap bisa login. Saat login pertama, hash kata sandi lama diverifikasi sekali (lewat `php` atau `python3` bila ada) lalu diganti ke scrypt.
- Login router, pelanggan, pembayaran, penjualan, template, dan logo terbawa otomatis.
- Semua sesi lama berakhir: login ulang sekali.
- Backup `.zip` dari versi PHP bisa di-restore di versi ini, dan sebaliknya.
- Perbaikan: tanggal di comment secret PPP sekarang tepat sama dengan Jatuh Tempo (versi PHP menulis 2 hari lebih lambat karena bug pembacaan tanggal PHP). Comment diperbarui otomatis saat pelanggan disimpan / dibayar, atau lewat *Admin Settings → Reinstall Scheduler*.

Versi PHP terakhir tersimpan di tag `v3.5.7-php` (untuk shared hosting).

## Keamanan

- Folder `data/` **tidak ikut repo**: berisi akun admin, login router (terenkripsi), data pelanggan, dan penjualan.
- Hanya folder `assets/` yang bisa dibuka dari web; halaman isolir pelanggan (`isopage.php?r=…`) tanpa login dan tanpa script.
- Logout otomatis setelah 1 jam tanpa aktivitas, batas 5x salah login per 15 menit, CSRF di semua formulir.
