<?php
/** About: penjelasan aplikasi dan ucapan terima kasih kepada Mikhmon beserta pengembangnya. */
$ext = function ($url, $text) { return '<a href="' . h($url) . '" target="_blank" rel="noopener">' . h($text) . '</a>'; };
page_head('About');
?>
<div class="split">
<section class="card">
<div class="cardhead"><?= icon('info') ?><strong>About</strong><span class="badge"><?= h(app_name()) ?> <?= h(APP_VER) ?></span></div>
<div class="cardbody">
<p class="lead"><b><?= h(app_name()) ?></b> adalah panel web untuk mengelola usaha hotspot dan PPPoE berbasis MikroTik: dari membuat voucher, menagih pelanggan bulanan, sampai melihat laporan pendapatan, semuanya dari satu tempat.</p>
<p>Aplikasi ini dipersembahkan untuk pengusaha hotspot di mana pun Anda berada. Semoga usahanya makin lancar dan makin sukses.</p>

<div class="fsep">Yang bisa dilakukan</div>
<table class="readme"><thead><tr><th>Menu</th><th>Kegunaan</th></tr></thead><tbody>
<tr><td>Hotspot</td><td>Membuat voucher satuan atau massal, mengatur User Profile (harga, masa aktif, batas kecepatan), memantau user yang sedang terhubung, Hosts, IP Bindings, dan Cookies.</td></tr>
<tr><td>Cetak voucher</td><td>Beberapa pilihan template dengan tampilan Default, QR, dan Small. Template bisa ditambah dan diubah sendiri di Template Editor.</td></tr>
<tr><td>PPP</td><td>Data pelanggan PPPoE, tarif dan jatuh tempo, isolir otomatis dengan halaman pemberitahuan, pembayaran, kwitansi, dan tagihan.</td></tr>
<tr><td>Report</td><td>Pendapatan voucher dan PPPoE per hari, per profil, dan per paket, lengkap dengan ekspor XLSX / CSV.</td></tr>
<tr><td>System</td><td>Memantau Scheduler dan Netwatch, serta Reboot router dari panel.</td></tr>
<tr><td>Multi router</td><td>Beberapa MikroTik dikelola dari satu panel; data tiap router disimpan terpisah.</td></tr>
</tbody></table>

<div class="fsep">Informasi</div>
<table class="readme"><tbody>
<tr><td>Aplikasi</td><td><?= h(app_name()) ?></td></tr>
<tr><td>Versi</td><td><?= h(APP_VER) ?></td></tr>
<tr><td>Kompatibel</td><td>RouterOS v6 dan v7 lewat API MikroTik. Catatan penjualan voucher memakai format yang sama dengan Mikhmon, jadi laporannya tetap terbaca di Mikhmon.</td></tr>
<tr><td>Server</td><td>PHP <?= h(PHP_VERSION) ?></td></tr>
</tbody></table>
</div>
</section>

<section class="card">
<div class="cardhead"><?= icon('user') ?><strong>Terima Kasih</strong></div>
<div class="cardbody">
<p class="lead">Terima kasih yang sebesar-besarnya kepada <b>Mikhmon</b> (MikroTik Hotspot Monitor) dan pengembangnya, <b>Laksamadi Guko</b>.</p>
<p>Mikhmon adalah aplikasi yang selama bertahun-tahun membantu banyak pengusaha hotspot mengelola voucher dengan mudah dan gratis. Cara kerja voucher, script masa aktif, format laporan penjualan, dan template cetak di panel ini mengikuti dan terinspirasi dari Mikhmon. Tanpa karya beliau, aplikasi ini tidak akan ada.</p>

<div class="fsep">Mikhmon</div>
<table class="readme"><tbody>
<tr><td>Author</td><td>Laksamadi Guko</td></tr>
<tr><td>Licence</td><td><?= $ext('https://github.com/laksa19/mikhmonv2/blob/master/LICENSE', 'GPLv2') ?></td></tr>
<tr><td>API Class</td><td><?= $ext('https://github.com/BenMenking/routeros-api', 'routeros-api') ?></td></tr>
<tr><td>Website</td><td><?= $ext('https://laksa19.github.io/', 'laksa19.github.io') ?></td></tr>
<tr><td>Facebook</td><td><?= $ext('https://fb.com/laksamadi', 'fb.com/laksamadi') ?></td></tr>
<tr><td>Source</td><td><?= $ext('https://github.com/laksa19/mikhmonv2', 'github.com/laksa19/mikhmonv2') ?></td></tr>
</tbody></table>
<p class="hint" style="margin:.9rem 0 0">Terima kasih juga untuk semua yang telah mendukung pengembangan Mikhmon dan aplikasi ini: para pengguna, penguji, dan komunitas MikroTik Indonesia.</p>
</div>
</section>
</div>
<?php page_foot();
