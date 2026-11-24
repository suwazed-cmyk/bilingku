<?php
/** Informasi pelanggan: semua data satu pelanggan PPP dalam satu halaman. (?p=ppp_user&user=NAMA-PPP) */
need_ros('User Detail');
$user = (string)get('user');
$s = null;
foreach (rq('/ppp/secret/print') as $x) if (($x['name'] ?? '') === $user) { $s = $x; break; }
$cs = customers(); $c = isset($cs[$user]) && is_array($cs[$user]) ? $cs[$user] : [];
$pays = [];
foreach (payments() as $p) if (is_array($p) && ($p['user'] ?? '') === $user) $pays[] = $p;
usort($pays, function ($a, $b) { return strcmp((string)($b['paid_at'] ?? ''), (string)($a['paid_at'] ?? '')); });

if ($user === '' || (!$s && !$c && !$pays)) {
    page_head('User Detail', '', ['PPP User', url('ppp_secrets')]);
    echo '<div class="empty"><p class="emptytitle">Pelanggan tidak ditemukan.</p><p><a class="btn" href="' . h(url('ppp_secrets')) . '">Back to PPP User</a></p></div>';
    page_foot();
    exit;
}

$act = null;
foreach (rq('/ppp/active/print', ['.proplist' => 'name,service,caller-id,address,uptime']) as $a) if (($a['name'] ?? '') === $user) { $act = $a; break; }
$on = (bool)$act;
$off = $s && ($s['disabled'] ?? '') === 'true';
$st = bill_state($c);
$nama = ($c['nama'] ?? '') !== '' ? $c['nama'] : $user;
$stLabel = !$s ? 'Tidak ada di router' : ($off ? 'Disabled' : ($on ? 'Online' : 'Offline'));
$stCls = (!$s || $off) ? '' : ($on ? ' up' : ' down');
$llo = (string)($s['last-logged-out'] ?? '');
if (strpos($llo, '1970') !== false) $llo = '';
$fup = ppp_fup($c);
$paket = !empty($c['paket']) ? $c['paket'] : ($s['profile'] ?? '');
$edit = $s ? url('ppp_secrets', ['edit' => $s['.id']]) : '';
$bill = $st[0] === 'none' ? badge('Tanpa tagihan', 'warn') : (in_array($st[0], ['late', 'grace'], true) ? badge('Belum bayar', 'bad') : badge('Lunas', 'ok'));
$row = function ($label, $html) {
    if ($html === '' || $html === null) $html = '<span class="muted">-</span>';
    echo '<div class="frow"><label>' . h($label) . '</label><div>' . $html . '</div></div>';
};
$txt = function ($v) { return h((string)$v); };
$mono = function ($v) { return (string)$v === '' ? '' : '<span class="mono">' . h((string)$v) . '</span>'; };
$dt = function ($v) { return (string)$v === '' ? '' : h(tgl($v)); };

$joined = ppp_joined($c, $user);
$lama = lama_langganan($joined);
$ifname = $on ? '<' . strtolower((string)($act['service'] ?? 'pppoe')) . '-' . $user . '>' : '';
$ifrow = $ifname !== '' ? rq('/interface/print', ['?name' => $ifname, '.proplist' => 'name,rx-byte,tx-byte']) : [];
if ($on && !$ifrow) { // nama interface lain (mis. diubah manual): cari yang berakhiran -user>
    foreach (rq('/interface/print', ['?dynamic' => 'true', '.proplist' => 'name,rx-byte,tx-byte']) as $i) if (substr($i['name'] ?? '', -strlen($user) - 2) === '-' . $user . '>') { $ifrow = [$i]; $ifname = $i['name']; break; }
}
$wa = preg_replace('/\D/', '', (string)($c['hp'] ?? ''));
if ($wa !== '' && $wa[0] === '0') $wa = '62' . substr($wa, 1);
$init = strtoupper(mb_substr(trim($nama), 0, 1)) ?: '?';
$sum = 0; foreach ($pays as $p) $sum += (float)($p['amount'] ?? 0);
// keterangan tunggakan: sudah berapa lama, berapa tagihannya, kapan diisolir dan kapan secret dinonaktifkan
$lateInfo = ''; $soonInfo = '';
if (is_billed($c) && $st[0] === 'late') {
    $lateDays = max(0, -days_until($c['due'])); $mo = months_owed($c); $owed = $mo * (float)($c['tarif'] ?? 0);
    $parts = ['Menunggak <b>' . $lateDays . ' hari</b> sejak jatuh tempo ' . h(tgl($c['due']))];
    if ($owed > 0) $parts[] = 'tagihan ' . $mo . ' bulan <b>' . h(money($owed)) . '</b>';
    $parts[] = 'di ' . h(ppp_fup($c)) . ' sejak ' . h(tgl(iso_date($c)));
    $dz = dis_date($c); $s2 = ppp_stage2($c);
    $what = $s2 === 'dis' ? 'secret di-disable' : 'pindah ke ' . h((string)setting('isolir_profile'));
    if ($s2 !== 'none') $parts[] = date('Y-m-d') >= $dz ? '<b>' . ($s2 === 'dis' ? 'secret di-disable sejak ' : 'dipindah ke ' . h((string)setting('isolir_profile')) . ' sejak ') . h(tgl($dz)) . '</b>' : $what . ' ' . h(tgl($dz)) . ' (' . days_until($dz) . ' hari lagi)';
    $lateInfo = implode(' · ', $parts);
} elseif (is_billed($c) && $st[0] === 'soon') {
    $soonInfo = ucfirst($st[1]) . ' · jatuh tempo ' . h(tgl($c['due']));
}

page_head('User Detail', '', ['PPP User', url('ppp_secrets')]);
?>
<div class="pinfo">
<section class="card wide">
<div class="phero">
<div class="who"><h2><span class="pic" aria-hidden="true"><?= icon('user') ?></span><?= h($nama) ?> <?= $bill ?></h2>
<?php if ($lateInfo !== '') { ?><p class="plate"><?= $lateInfo ?></p><?php } elseif ($soonInfo !== '') { ?><p class="psoon"><?= $soonInfo ?></p><?php } ?></div>
<div class="pacts">
<?php if ($edit !== '') { ?><a class="btn small primary" href="<?= h($edit) ?>"><?= icon('edit') ?>Edit</a>
<a class="btn small" href="<?= h(url('ppp_pay', ['user' => $user])) ?>"><?= icon('money') ?>Bayar</a><?php } ?>
<?php if (is_billed($c)) { ?><a class="btn small" target="_blank" href="<?= h(url('invoice_print', ['user' => $user])) ?>"><?= icon('print') ?>Print Invoice</a><?php } ?>
<?php if ($wa !== '') { ?><a class="btn small" target="_blank" rel="noopener" href="https://wa.me/<?= h($wa) ?>"><?= icon('phone') ?>WhatsApp</a><?php } ?>
<a class="pclose" href="<?= h(url('ppp_secrets')) ?>" title="Tutup, kembali ke PPP User" aria-label="Tutup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></a>
</div>
</div>
<div class="pfacts">
<div><small>Tanggal daftar</small><b><?= $joined !== '' ? h(tgl($joined)) : '-' ?><?php if ($joined !== '' && empty($c['joined'])) { ?> <?php if ($edit !== '') { ?><a href="<?= h($edit) ?>#f_joined" style="font-size:.78rem;font-weight:500" title="Tanggal ini perkiraan. Klik untuk mengisi Tanggal Daftar yang benar.">(perkiraan · atur)</a><?php } else { ?><span class="muted" style="font-size:.78rem;font-weight:500">(perkiraan)</span><?php } ?><?php } ?></b></div>
<div><small>Lama berlangganan</small><b><?= $lama !== '' ? h($lama) : '-' ?></b></div>
<div><small>Jatuh Tempo</small><b><?= is_billed($c) ? h(tgl($c['due'])) : '-' ?></b></div>
<div><small>Total dibayar</small><b><?= h(money($sum)) ?> <span class="muted" style="font-size:.8rem;font-weight:500">(<?= count($pays) ?>x)</span></b></div>
</div>
</section>

<div class="pcol">
<section class="card">
<div class="cardhead"><?= icon('user') ?><strong>Pelanggan &amp; tagihan</strong></div>
<div class="cardbody">
<?php
$row('Nomor WhatsApp', $wa !== '' ? '<a href="https://wa.me/' . h($wa) . '" target="_blank" rel="noopener">' . h($c['hp']) . '</a>' : '');
$row('Alamat', nl2br($txt($c['alamat'] ?? '')));
$row('Tarif per bulan', !empty($c['tarif']) ? h(money($c['tarif'])) : '');
$io = iso_off_days($c);
$row('Validity', is_billed($c) ? ($io ? $io . ' hari di isolir, lalu secret di-disable' : '<span class="muted">Tidak diisi (tetap di isolir sampai bayar)</span>') : '');
?>
</div>
</section>

<section class="card">
<div class="cardhead"><?= icon('pulse') ?><strong>Pemakaian Bandwidth</strong><?php if ($ifname !== '') { ?><span class="muted mono" style="font-size:.85rem"><?= h($ifname) ?></span><?php } ?></div>
<div class="cardbody">
<?php if (!$on) { ?>
<div class="empty"><p class="emptytitle">Pelanggan sedang offline.</p><p class="muted">Pemakaian diambil dari interface PPP pelanggan dan tampil saat ia terhubung.</p></div>
<?php } elseif (!$ifrow) { ?>
<div class="empty"><p class="emptytitle">Interface <?= h($ifname) ?> tidak ditemukan di router.</p></div>
<?php } else { $ir = $ifrow[0]; ?>
<div class="bwstat">
<div class="dl"><small><?= icon('down') ?>Download</small><b><?= h(bytes($ir['tx-byte'] ?? 0)) ?></b></div>
<div class="ul"><small><?= icon('up') ?>Upload</small><b><?= h(bytes($ir['rx-byte'] ?? 0)) ?></b></div>
<div><small><?= icon('pulse') ?>Total pemakaian</small><b><?= h(bytes((float)($ir['tx-byte'] ?? 0) + (float)($ir['rx-byte'] ?? 0))) ?></b></div>
<div><small><?= icon('clock') ?>Lama terhubung</small><b><?= h(dur_fmt($act['uptime'] ?? '')) ?></b></div>
</div>
<p class="hint" style="margin:0">Pemakaian sesi saat ini dari interface <?= h($ifname) ?>, dihitung sejak pelanggan terakhir kali terhubung. Download = data ke pelanggan, Upload = data dari pelanggan.</p>
<?php } ?>
</div>
</section>

</div>

<section class="card">
<div class="cardhead"><?= icon('link') ?><strong>Koneksi</strong></div>
<div class="cardbody">
<?php
$row('Status', '<span class="dot' . $stCls . '" role="img" aria-label="' . h($stLabel) . '"></span>' . h($stLabel) . ($fup !== '' && $s && ($s['profile'] ?? '') === $fup && $fup !== $paket ? ' ' . badge('Isolir', 'bad') : ''));
$row('Secret', $mono($user));
$row('Service', $txt($s['service'] ?? ''));
$row('Main Profile', $txt($paket));
if (($s['profile'] ?? '') !== $paket) $row('Profile di router', $txt($s['profile'] ?? '')); // hanya bila berbeda (mis. sedang di FUP)
$row('Isolir Profile', $txt($fup));
$row('Local Address', $mono($s['local-address'] ?? ''));
$row('Remote Address', $mono($s['remote-address'] ?? ''));
$row('IP saat ini', $mono($act['address'] ?? ''));
$row('Caller ID', $mono($act['caller-id'] ?? ($s['last-caller-id'] ?? '')));
$row('Last Logged Out', $llo !== '' ? $txt(ros_dt($llo)) : '');
$row('Comment', $txt($s['comment'] ?? ''));
?>
</div>
</section>

<section class="card wide">
<div class="cardhead"><?= icon('money') ?><strong>Riwayat pembayaran</strong><span class="spacer"></span><?php if ($pays) { ?><span class="muted"><?= h(money($sum)) ?></span><?php } ?></div>
<div class="cardbody">
<?php if (!$pays) { ?>
<div class="empty"><p class="emptytitle">Belum ada pembayaran.</p></div>
<?php } else { ?>
<div class="tablewrap"><table class="grid-t">
<thead><tr><th>Nomor</th><th>Tanggal</th><th class="r">Bulan</th><th>Periode</th><th class="r">Jumlah</th><th>Cara bayar</th><th class="nosort"></th></tr></thead><tbody>
<?php foreach ($pays as $p) { ?>
<tr>
<td class="key mono"><?= h($p['no'] ?? '') ?></td><td><?= $dt($p['paid_at'] ?? '') ?></td><td class="r"><?= h($p['months'] ?? '') ?></td>
<td><?= $dt($p['from'] ?? '') ?> – <?= $dt($p['to'] ?? '') ?></td>
<td class="r"><?= h(money($p['amount'] ?? 0)) ?></td><td><?= h($p['method'] ?? '') ?></td>
<td class="acts"><?php if (isset($p['id'])) { ?><a class="icbtn print" target="_blank" href="<?= h(url('invoice_print', ['pay' => $p['id']])) ?>" title="Print kwitansi <?= h($p['no'] ?? '') ?>" aria-label="Print kwitansi <?= h($p['no'] ?? '') ?>"><?= icon('print') ?></a><?php } ?></td>
</tr>
<?php } ?>
</tbody></table></div>
<?php } ?>
</div>
</section>
</div>
<?php page_foot();
