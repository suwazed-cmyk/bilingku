<?php
/** Alamat halaman tidak dikenal (?p= salah ketik atau tautan lama). */
http_response_code(404);
page_head('Halaman tidak ditemukan');
?>
<section class="card nf">
<div class="cardbody">
<div class="nfcode" aria-hidden="true">404</div>
<h2>Halaman tidak ditemukan</h2>
<p>Alamat <code><?= h(mb_substr((string)($_SERVER['QUERY_STRING'] ?? ''), 0, 80)) ?></code> tidak ada di panel ini. Mungkin salah ketik atau tautannya sudah lama.</p>
<div class="btnrow" style="justify-content:center"><a class="btn primary" href="<?= h(url('dashboard')) ?>"><?= icon('dash') ?>Ke Dashboard</a><a class="btn" href="javascript:history.back()">Kembali</a></div>
</div>
</section>
<?php page_foot();
