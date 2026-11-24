<?php
/** Terima pembayaran satu pelanggan: cukup pilih jumlah bulan, totalnya dihitung dari tarif. */
$METHODS = ['Tunai', 'Transfer', 'QRIS', 'Lainnya'];
$user = get('user'); $cs = customers();
if (!isset($cs[$user]) || !is_billed($cs[$user])) { flash('Pelanggan ini belum punya Jatuh Tempo. Atur dulu di PPP User.', 'err'); redirect('ppp_payment'); }
$c = $cs[$user]; $today = date('Y-m-d'); $tarif = (float)($c['tarif'] ?? 0);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $months = (int)post('months');
    if ($months < 1 || $months > 120) { flash('Jumlah bulan antara 1 dan 120.', 'err'); back(); }
    $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', post('date')) && post('date') <= $today ? post('date') : $today;
    $p = pay_add($user, $months, $tarif * $months, in_array(post('method'), $METHODS, true) ? post('method') : 'Tunai', $date);
    if (!$p) { flash('Pembayaran gagal disimpan. Periksa izin tulis folder data/.', 'err'); back(); }
    $after = customers()[$user];
    $msg = 'Pembayaran ' . $p['months'] . ' bulan (' . money($p['amount']) . ') dari ' . $p['nama'] . ' diterima. Jatuh tempo berikutnya ' . tgl($p['to']) . '.';
    if (!ros()) $msg .= ' Router tidak terhubung, jadi profil di router belum diperbarui.';
    elseif (!empty($c['isolated']) && empty($after['isolated'])) $msg .= ' Dikembalikan ke Main Profile.';
    elseif (is_late($after)) $msg .= ' Masih menunggak, belum dikembalikan ke Main Profile.';
    flash($msg, 'ok', ['Print Kwitansi', url('invoice_print', ['pay' => $p['id']])]);
    redirect('ppp_payment');
}

$st = bill_state($c); $owed = months_owed($c);
page_head('PPP Payment');
?>
<div class="split">
<form method="post" class="card pay" id="payform" data-due="<?= h($c['due']) ?>" data-jt="<?= (int)($c['jt'] ?? 0) ?>" data-tarif="<?= $tarif ?>" data-cur="<?= h(setting('currency')) ?>">
<?= csrf_field() ?><input type="hidden" id="amount" name="amount" value="<?= $tarif * $owed ?>">
<div class="cardhead"><?= icon('money') ?><strong>Terima pembayaran</strong><span class="spacer"></span><a class="x" href="<?= url('ppp_payment') ?>" title="Tutup" aria-label="Tutup">&times;</a></div>
<div class="cardbody">
<div class="frow"><label>Pelanggan</label><div><strong><?= h(($c['nama'] ?? '') !== '' ? $c['nama'] : $user) ?></strong> <span class="muted">(<?= h($user) ?>)</span></div></div>
<div class="frow"><label>Profile</label><div><?= h($c['paket'] ?? '') ?></div></div>
<div class="frow"><label>Tarif per bulan</label><div><?= money($tarif) ?></div></div>
<div class="frow"><label>Jatuh tempo sekarang</label><div><?= h(tgl($c['due'])) ?> <?= in_array($st[0], ['late', 'grace'], true) ? badge('Belum bayar', 'bad') : badge('Lunas', 'ok') ?></div></div>
<div class="fsep">Bayar untuk berapa bulan</div>
<div class="monthpick">
<div class="stepper">
<button type="button" class="btn" data-step="-1" aria-label="Kurangi satu bulan">&minus;</button>
<input id="months" name="months" type="number" min="1" max="120" value="<?= $owed ?>" required aria-label="Jumlah bulan">
<button type="button" class="btn" data-step="1" aria-label="Tambah satu bulan">+</button>
</div>
<div class="quick" role="group" aria-label="Pilihan cepat"><?php foreach ([1, 2, 3, 6, 12] as $q) echo '<button type="button" class="chip" data-months="' . $q . '">' . $q . ' bulan</button>'; ?></div>
</div>
<div class="result">
<div><span class="lbl">Total</span><strong id="total"><?= money($tarif * $owed) ?></strong></div>
<div><span class="lbl">Jatuh tempo berikutnya</span><strong id="newdue"><?= h(tgl(add_months($c['due'], $owed, $c['jt'] ?? 0))) ?></strong></div>
</div>
<?php if ($tarif <= 0) { ?><p class="msg warn"><span>Tarif per bulan pelanggan ini masih kosong, jadi totalnya Rp 0. Isi tarifnya di PPP User.</span></p><?php } ?>
<div class="frow"><label for="pm">Cara bayar</label><select id="pm" name="method"><?php foreach ($METHODS as $m) echo opt($m, 'Tunai'); ?></select></div>
<div class="frow"><label for="pd">Tanggal bayar</label><input id="pd" type="date" name="date" value="<?= $today ?>" max="<?= $today ?>"></div>
<div class="btnrow" style="margin:.9rem 0 0"><button class="btn primary"><?= icon('save') ?>Save Payment</button><a class="btn ghost" href="<?= url('ppp_payment') ?>">Cancel</a></div>
</div>
</form>
<section class="card">
<div class="cardhead"><?= icon('info') ?><strong>Read Me</strong></div>
<div class="cardbody"><table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody>
<tr><td>Jumlah bulan</td><td>Cukup pilih berapa bulan yang dibayar. Total dihitung otomatis dari tarif per bulan.</td></tr>
<tr><td>Jatuh Tempo</td><td>Jatuh Tempo maju sebanyak bulan yang dibayar, dengan tanggal yang sama tiap bulan.</td></tr>
<tr><td>Setelah bayar</td><td>Pelanggan yang sedang di profil FUP dikembalikan ke Main Profile dan comment-nya berisi tanggal baru.</td></tr>
</tbody></table></div>
</section>
</div>
<?php page_foot();
