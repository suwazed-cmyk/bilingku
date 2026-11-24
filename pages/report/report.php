<?php
/** Report: pendapatan Hotspot (penjualan voucher, dicatat saat login pertama) dan PPPoE (pembayaran tagihan) per bulan. */
$synced = ros() ? (get('sync') !== '' ? sales_sync() : (sales_sync_bg() ?? 0)) : null; // Reload Data = ambil sekarang; selain itu di latar belakang
$period = valid_period(get('period'));
$type = in_array(get('t'), ['hs', 'ppp'], true) ? get('t') : '';
$sales = sales($period);
usort($sales, function ($a, $b) { return strcmp($b['d'] . $b['t'], $a['d'] . $a['t']); });
$pays = [];
foreach (payments() as $i) if (substr((string)$i['paid_at'], 0, 7) === $period) $pays[] = $i;
usort($pays, function ($a, $b) { return strcmp($b['paid_at'] . $b['no'], $a['paid_at'] . $a['no']); });

/* rincian gabungan: [tanggal, jam, jenis, user, profil/paket, jumlah, keterangan, ip, mac] */
$rows = [];
if ($type !== 'ppp') foreach ($sales as $s) $rows[] = ['d' => $s['d'], 't' => $s['t'], 'k' => 'hs', 'u' => $s['u'], 'pr' => $s['pr'], 'a' => (float)$s['a'],
    'note' => trim(($s['v'] !== '' ? 'Validity ' . $s['v'] : '') . ($s['c'] !== '' ? ' · ' . $s['c'] : ''), ' ·'), 'ip' => $s['ip'], 'mac' => $s['mac']];
if ($type !== 'hs') foreach ($pays as $i) $rows[] = ['d' => $i['paid_at'], 't' => '', 'k' => 'ppp', 'u' => $i['nama'] !== '' ? $i['nama'] : $i['user'], 'user' => $i['user'], 'pr' => $i['paket'], 'a' => (float)$i['amount'],
    'note' => $i['no'] . ' · ' . (int)$i['months'] . ' bulan · ' . $i['method'] . ' · ' . tgl($i['from']) . ' – ' . tgl($i['to']), 'ip' => '', 'mac' => ''];
usort($rows, function ($a, $b) { return strcmp($b['d'] . $b['t'], $a['d'] . $a['t']); });

if (in_array(get('export'), ['csv', 'xlsx'], true)) {
    $head = ['Tanggal', 'Jam', 'Jenis', 'User / Pelanggan', 'Profil / Paket', 'Jumlah', 'Keterangan', 'IP', 'MAC'];
    $data = [];
    foreach ($rows as $r) $data[] = [$r['d'], $r['t'], $r['k'] === 'hs' ? 'Hotspot' : 'PPPoE', $r['u'], $r['pr'], (int)$r['a'], $r['note'], $r['ip'], $r['mac']];
    $fn = 'report-' . ($type === 'hs' ? 'hotspot-' : ($type === 'ppp' ? 'pppoe-' : '')) . $period;
    if (get('export') === 'xlsx') xlsx_send($fn . '.xlsx', $head, $data);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $fn . '.csv"');
    $o = fopen('php://output', 'w');
    fputcsv($o, $head);
    foreach ($data as $r) fputcsv($o, $r);
    exit;
}

$days = []; $byProfile = []; $byPaket = []; $vSum = 0; $pSum = 0;
foreach ($sales as $s) {
    $days[$s['d']]['v'] = ($days[$s['d']]['v'] ?? 0) + $s['a'];
    $days[$s['d']]['vn'] = ($days[$s['d']]['vn'] ?? 0) + 1;
    $byProfile[$s['pr']][0] = ($byProfile[$s['pr']][0] ?? 0) + 1;
    $byProfile[$s['pr']][1] = ($byProfile[$s['pr']][1] ?? 0) + $s['a'];
    $vSum += $s['a'];
}
foreach ($pays as $i) {
    $days[$i['paid_at']]['p'] = ($days[$i['paid_at']]['p'] ?? 0) + $i['amount'];
    $days[$i['paid_at']]['pn'] = ($days[$i['paid_at']]['pn'] ?? 0) + 1;
    $k = $i['paket'] !== '' ? $i['paket'] : '-';
    $byPaket[$k][0] = ($byPaket[$k][0] ?? 0) + 1;
    $byPaket[$k][1] = ($byPaket[$k][1] ?? 0) + (float)$i['amount'];
    $pSum += $i['amount'];
}
krsort($days); arsort($byProfile); uasort($byPaket, function ($a, $b) { return $b[1] <=> $a[1]; });
$max = 1;
foreach ($days as $d) $max = max($max, ($type !== 'ppp' ? ($d['v'] ?? 0) : 0) + ($type !== 'hs' ? ($d['p'] ?? 0) : 0));
$q = function ($x = []) use ($period, $type) { return url('report', $x + array_filter(['period' => $period, 't' => $type], 'strlen')); };
$prev = date('Y-m', strtotime($period . '-01 -1 month')); $next = date('Y-m', strtotime($period . '-01 +1 month'));

/* total semua waktu: Hotspot dari semua file penjualan di data/, PPPoE dari semua pembayaran */
$allHs = 0; $allHsN = 0; $allPp = 0; $allPpN = 0;
foreach (glob(DATA . '/' . rkey('sales_') . '*.json.php') ?: [] as $f) {
    $nm = basename($f, '.json.php');
    foreach (db_load($nm) as $x) { $allHs += (float)$x['a']; $allHsN++; }
}
foreach (payments() as $i) { $allPp += (float)$i['amount']; $allPpN++; }

page_head('Report');
if ($synced === null) echo '<div class="msg warn">Router tidak terhubung, jadi penjualan voucher terbaru belum diambil dari router. Data di bawah adalah yang sudah tersimpan.</div>';
$tiles = [
    ['url' => url('report', ['period' => $period]), 'on' => $type === '', 'num' => money($vSum + $pSum), 'lbl' => 'Total ' . bulan($period), 'sub' => (count($sales) + count($pays)) . ' transaksi', 'ic' => 'report', 'c' => 'blue'],
    ['url' => url('report', ['period' => $period, 't' => 'hs']), 'on' => $type === 'hs', 'num' => money($vSum), 'lbl' => 'Hotspot', 'sub' => count($sales) . ' voucher terjual', 'ic' => 'wifi', 'c' => 'green'],
    ['url' => url('report', ['period' => $period, 't' => 'ppp']), 'on' => $type === 'ppp', 'num' => money($pSum), 'lbl' => 'PPPoE', 'sub' => count($pays) . ' pembayaran', 'ic' => 'ppp', 'c' => 'amber'],
    ['url' => '', 'on' => false, 'num' => money($allHs + $allPp), 'lbl' => 'Total semua', 'sub' => 'Hotspot ' . money($allHs, false) . ' · PPPoE ' . money($allPp, false), 'ic' => 'money', 'c' => 'gray'],
];
$typeOpt = ['' => 'Hotspot & PPPoE', 'hs' => 'Hotspot', 'ppp' => 'PPPoE'];
?>
<div class="rtiles">
<?php foreach ($tiles as $t) { $tag = $t['url'] !== '' ? 'a' : 'div'; ?>
<<?= $tag ?> class="tile <?= $t['c'] ?><?= $t['on'] ? ' on' : '' ?>"<?= $t['url'] !== '' ? ' href="' . h($t['url']) . '"' : '' ?>><span class="lbl"><?= h($t['lbl']) ?></span><span class="num"><?= h($t['num']) ?></span><small class="tsub"><?= h($t['sub']) ?></small><?= icon($t['ic']) ?></<?= $tag ?>>
<?php } ?>
</div>

<section class="card">
<div class="cardhead"><?= icon('report') ?><strong>Report <?= h(bulan($period)) ?></strong><a class="hl" href="<?= h($q(['sync' => 1])) ?>" title="Reload Data" aria-label="Reload Data"><?= icon('reload') ?></a>
<div class="rtools">
<span class="rmonth"><a href="<?= h(url('report', array_filter(['period' => $prev, 't' => $type], 'strlen'))) ?>" title="Bulan sebelumnya" aria-label="Bulan sebelumnya">&lsaquo;</a><input type="month" value="<?= h($period) ?>" aria-label="Periode" data-go="<?= h(url('report', array_filter(['t' => $type], 'strlen'))) ?>" onchange="if(this.value)location.href=this.dataset.go+'&period='+this.value"><a href="<?= h(url('report', array_filter(['period' => $next, 't' => $type], 'strlen'))) ?>" title="Bulan berikutnya" aria-label="Bulan berikutnya">&rsaquo;</a></span>
<select aria-label="Jenis pendapatan" onchange="location.href=this.value"><?php foreach ($typeOpt as $k => $v) echo '<option value="' . h(url('report', array_filter(['period' => $period, 't' => $k], 'strlen'))) . '"' . ($k === $type ? ' selected' : '') . '>' . h($v) . '</option>'; ?></select>

<details class="xdd"><summary class="btn small primary"><?= icon('save') ?>Export</summary><div class="xmenu"><a href="<?= h($q(['export' => 'csv'])) ?>">CSV</a><a href="<?= h($q(['export' => 'xlsx'])) ?>">XLSX</a></div></details>

</div></div>
</section>

<?php if (!$days) { ?>
<section class="card"><div class="cardbody"><div class="empty"><p class="emptytitle">Belum ada pendapatan <?= h($typeOpt[$type]) ?> pada <?= h(bulan($period)) ?>.</p></div></div></section>
<?php } else { ?>
<div class="rgrid">
<section class="card">
<div class="cardhead"><?= icon('clock') ?><strong>Per hari</strong><span class="rlegend"><?php if ($type !== 'ppp') { ?><span><i style="background:var(--ok)"></i>Hotspot</span><?php } if ($type !== 'hs') { ?><span><i style="background:#f0a020"></i>PPPoE</span><?php } ?></span></div>
<div class="cardbody">
<div class="tablewrap"><table class="grid-t sortable t2" data-pgsize="14"><thead><tr><th>Tanggal</th><?php if ($type !== 'ppp') { ?><th class="r">Hotspot</th><?php } if ($type !== 'hs') { ?><th class="r">PPPoE</th><?php } ?><th class="r">Total</th><th class="nosort" style="min-width:110px">Proporsi</th></tr></thead><tbody>
<?php
// semua tanggal di bulan ini sampai hari ini (bulan lalu: sampai akhir bulan), termasuk hari tanpa pendapatan
$lastDay = $period === date('Y-m') ? (int)date('j') : ($period < date('Y-m') ? (int)date('t', strtotime($period . '-01')) : 0);
$list = [];
for ($i = $lastDay; $i >= 1; $i--) { $dd = $period . '-' . sprintf('%02d', $i); $list[$dd] = $days[$dd] ?? []; }
foreach ($days as $dd => $v) if (!isset($list[$dd])) $list[$dd] = $v; // jaga-jaga: tanggal di luar rentang tetap tampil
krsort($list);
foreach ($list as $d => $v) {
    $hv = $type !== 'ppp' ? (float)($v['v'] ?? 0) : 0; $pv = $type !== 'hs' ? (float)($v['p'] ?? 0) : 0; $t = $hv + $pv;
    $hn = $type !== 'ppp' ? (int)($v['vn'] ?? 0) : 0; $pn = $type !== 'hs' ? (int)($v['pn'] ?? 0) : 0;
    if (!$hn && !$pn) continue; // hanya hari yang ada pendapatannya
    $zero = false; ?>
<tr<?= $zero ? ' class="rzero"' : '' ?>><td data-v="<?= h($d) ?>"><?= h(tgl($d)) ?></td>
<?php if ($type !== 'ppp') { ?><td class="r" data-v="<?= $hv ?>"><?= $hn ? '<span class="amt">' . money($hv) . '</span><span class="sub">' . $hn . ' voucher</span>' : '<span class="muted">-</span>' ?></td><?php } ?>
<?php if ($type !== 'hs') { ?><td class="r" data-v="<?= $pv ?>"><?= $pn ? '<span class="amt">' . money($pv) . '</span><span class="sub">' . $pn . ' bayar</span>' : '<span class="muted">-</span>' ?></td><?php } ?>
<td class="r" data-v="<?= $t ?>"><?= $t ? '<b>' . money($t) . '</b>' : '<span class="muted">-</span>' ?></td>
<td><div class="rbar"><?php if ($hv) { ?><i class="h" style="width:<?= round($hv / $max * 100, 1) ?>%"></i><?php } if ($pv) { ?><i class="p" style="width:<?= round($pv / $max * 100, 1) ?>%"></i><?php } ?></div></td></tr>
<?php } ?>
</tbody></table></div>
</div>
</section>
<div class="rstack">
<?php if ($type !== 'ppp') { ?>
<section class="card">
<div class="cardhead"><?= icon('wifi') ?><strong>Hotspot per profil</strong><span class="spacer"></span><span class="muted"><?= money($vSum) ?></span></div>
<div class="cardbody"><?php if (!$byProfile) { ?><p class="muted" style="margin:0">Tidak ada penjualan voucher.</p><?php } else { ?>
<div class="tablewrap"><table class="grid-t sortable" data-nopager><thead><tr><th>Profil</th><th class="r">Terjual</th><th class="r">Jumlah</th></tr></thead><tbody>
<?php foreach ($byProfile as $k => $v) { ?><tr><td class="key"><?= h($k) ?></td><td class="r"><?= (int)$v[0] ?></td><td class="r" data-v="<?= (float)$v[1] ?>"><?= money($v[1]) ?></td></tr><?php } ?>
</tbody></table></div><?php } ?></div>
</section>
<?php } if ($type !== 'hs') { ?>
<section class="card">
<div class="cardhead"><?= icon('ppp') ?><strong>PPPoE per paket</strong><span class="spacer"></span><span class="muted"><?= money($pSum) ?></span></div>
<div class="cardbody"><?php if (!$byPaket) { ?><p class="muted" style="margin:0">Tidak ada pembayaran PPPoE.</p><?php } else { ?>
<div class="tablewrap"><table class="grid-t sortable" data-nopager><thead><tr><th>Paket</th><th class="r">Pembayaran</th><th class="r">Jumlah</th></tr></thead><tbody>
<?php foreach ($byPaket as $k => $v) { ?><tr><td class="key"><?= h($k) ?></td><td class="r"><?= (int)$v[0] ?></td><td class="r" data-v="<?= (float)$v[1] ?>"><?= money($v[1]) ?></td></tr><?php } ?>
</tbody></table></div><?php } ?></div>
</section>
<?php } ?>
</div>
</div>

<section class="card">
<div class="cardhead"><?= icon('log') ?><strong>Rincian</strong><span class="spacer"></span><input type="search" class="filter" placeholder="Search" data-filter="#tbl" aria-label="Search"></div>
<div class="cardbody">
<div class="tablewrap"><table id="tbl" class="grid-t sortable">
<thead><tr><th>Tanggal</th><th>Jenis</th><th>User / Pelanggan</th><th>Profil / Paket</th><th class="r">Jumlah</th><th>Keterangan</th></tr></thead><tbody>
<?php foreach (array_slice($rows, 0, 500) as $r) {
    $note = $r['k'] === 'hs' ? implode(' · ', array_filter([$r['note'], $r['ip'] !== '' ? 'IP ' . $r['ip'] : '', $r['mac'] !== '' ? 'MAC ' . $r['mac'] : ''])) : $r['note']; ?>
<tr><td data-v="<?= h($r['d'] . ' ' . $r['t']) ?>" class="nowrap"><?= h(tgl($r['d'])) ?><?= $r['t'] !== '' ? ' <span class="muted mono">' . h($r['t']) . '</span>' : '' ?></td>
<td><?= $r['k'] === 'hs' ? badge('Hotspot', 'ok') : badge('PPPoE', 'warn') ?></td>
<td class="key"><?php if ($r['k'] === 'ppp') { ?><a class="namelink" href="<?= h(url('ppp_user', ['user' => $r['user']])) ?>"><?= h($r['u']) ?></a><?php } else { ?><span class="mono"><?= h($r['u']) ?></span><?php } ?></td>
<td><?= h($r['pr']) ?></td><td class="r nowrap" data-v="<?= $r['a'] ?>"><?= money($r['a']) ?></td><td class="rnote"><span class="ell" title="<?= h($note) ?>"><?= h($note) ?></span></td></tr>
<?php } ?>
</tbody></table></div>
<p class="count"><span data-count="#tbl"><?= min(500, count($rows)) ?></span> dari <?= count($rows) ?> transaksi<?= count($rows) > 500 ? ' (500 terbaru; unduh XLSX untuk semuanya)' : '' ?></p>
</div>
</section>
<?php }
page_foot();
