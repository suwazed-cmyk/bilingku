# Bilingku

Billing PPPoE & Hotspot untuk MikroTik: voucher, paket, pelanggan, jatuh tempo, isolir otomatis, laporan penjualan.

- **Database:** SQLite (`data/bilingku.db`). Tanpa MySQL. Bila `pdo_sqlite` tidak ada, otomatis memakai berkas JSON di `data/`.
- **Data di router:** voucher, profil, dan secret tetap disimpan di MikroTik.
- **Pindahan dari versi lama:** berkas `data/*.json.php` otomatis dimasukkan ke database saat pertama dibuka. Berkas lama disimpan di `data/json-lama/`.

## Cara pasang

### 1. Sebagai add-on ACS NETMAP Panel (dianjurkan)

Di [ACS NETMAP Panel](https://github.com/suwazed-cmyk/acs-netmap-panel): menu **Add-on → Bilingku → Install**.

Panel memasang PHP, mengunduh repo ini ke `/opt/addons/bilingku`, menyiapkan database, dan menjalankan layanan `addon-bilingku`. Bilingku dibuka lewat panel utama, misalnya:

```
http://IP-VPS/billing/
https://domain-anda/billing/
```

Kelebihannya:

- **Tambah router dari panel utama.** Di *Tambah Router*, pilih router di kolom **Dari panel utama**. Nama dan alamat VPN (L2TP/ZeroTier) terisi otomatis. Cukup isi username dan password API, nama hotspot, dan DNS name.
- **Alamat router selalu terbaru.** Bila IP VPN router berubah di panel utama, Bilingku ikut memakai alamat baru.
- **API router tidak perlu dibuka ke internet.** Cukup izinkan dari IP VPS di jaringan VPN:

```
/ip service set api disabled=no address=IP-VPS-VPN/32
/user add name=bilingku group=full password=SANDI-KUAT address=IP-VPS-VPN/32
```

(IP-VPS-VPN ditampilkan di form, misalnya `192.168.42.1` untuk L2TP.)

### 2. Di shared hosting

1. Unggah isi repo ke hosting, misalnya `public_html/bilingku`.
2. Pastikan folder `data/` bisa ditulis (755 atau 775).
3. Buka alamatnya, buat akun admin, lalu tambahkan router.

Router harus bisa dijangkau dari hosting (IP publik, VPN, atau port forwarding).

## Keamanan

- Folder `data/`, `inc/`, `pages/`, `bin/` tidak bisa dibuka dari web (`.htaccess` untuk Apache, `router.php` untuk server PHP bawaan).
- Folder `data/` **tidak ikut repo** (`.gitignore`): berisi akun admin, login router, data pelanggan, dan penjualan.
- Backup/restore lewat menu **Pengaturan**. Isi backup tetap kompatibel dengan versi lama.

Panduan lengkap fitur: [BACA-SAYA.txt](BACA-SAYA.txt).
