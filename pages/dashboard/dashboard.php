<?php
if (!routers()) redirect('routers');
need_ros('Dashboard');

// semua data dashboard diminta sekaligus: satu perjalanan ke router, bukan delapan
$B = rq_many([
    'res' => ['/system/resource/print', []], 'clk' => ['/system/clock/print', []], 'rb' => ['/system/routerboard/print', []],
    'if' => ['/interface/print', ['.proplist' => 'name,running,type']],
    'hu' => ['/ip/hotspot/user/print', ['count-only' => '']], 'ha' => ['/ip/hotspot/active/print', ['count-only' => '']],
    'ps' => ['/ppp/secret/print', ['count-only' => '']], 'pa' => ['/ppp/active/print', ['count-only' => '']],
]);
$res = $B['res'] ? $B['res'][0] : [];
$clk = $B['clk'] ? $B['clk'][0] : [];
$rb = $B['rb'] ? $B['rb'][0] : [];
$ifaces = $B['if'];
$hsUsers = max(0, $B['hu'] - 1); // dikurangi default-trial (bawaan RouterOS)
$hsActive = $B['ha'];
$pppAll = $B['ps']; $pppActive = $B['pa'];

sales_sync_bg(); // penjualan baru diambil dari router setelah halaman tampil (paling sering tiap 2 menit)
$today = date('Y-m-d'); $ym = date('Y-m');
$vDay = $vMon = $pDay = $pMon = 0; $nDay = $nMon = 0;
foreach (sales($ym) as $s) { $vMon += $s['a']; $nMon++; if ($s['d'] === $today) { $vDay += $s['a']; $nDay++; } }
foreach (payments() as $i) {
    if (substr($i['paid_at'], 0, 7) === $ym) { $pMon += $i['amount']; $nMon++; }
    if ($i['paid_at'] === $today) { $pDay += $i['amount']; $nDay++; }
}
$late = $soon = 0; $lateSum = 0;
foreach (customers() as $c) {
    $st = bill_state($c);
    if ($st[0] === 'late') { $late++; $lateSum += (float)($c['tarif'] ?? 0) * months_owed($c); }
    elseif ($st[0] === 'soon' || $st[0] === 'grace') $soon++;
}
$pct = function ($a, $b) { return $b > 0 ? (int)round($a / $b * 100) : 0; };
$tm = (float)($res['total-memory'] ?? 0); $fm = (float)($res['free-memory'] ?? 0);
$th = (float)($res['total-hdd-space'] ?? 0); $fh = (float)($res['free-hdd-space'] ?? 0);
$cpu = (int)($res['cpu-load'] ?? 0);
    $um = max(0, $tm - $fm); $uh = max(0, $th - $fh); // yang terpakai
    $lvl = function ($p) { return $p >= 90 ? ' r' : ($p >= 70 ? ' o' : ' g'); }; // warna bar: hijau aman, oranye mulai penuh, merah hampir penuh
$nf = function ($n) { return number_format($n, 0, ',', '.'); };

page_head('Dashboard');
?>
<div class="dash3">
<section class="card info"><b class="bigic"><?= icon('clock') ?></b><dl>
<dt>Date</dt><dd><?= h(tgl(ros_date($clk['date'] ?? '')) ?: ($clk['date'] ?? '-')) ?></dd>
<dt>Time</dt><dd data-tick="clock" data-secs="<?= dur_secs(preg_replace('/^(\d+):(\d+):(\d+).*$/', '$1h$2m$3s', $clk['time'] ?? '')) ?>"><?= h(substr($clk['time'] ?? '-', 0, 8)) ?></dd>
<dt>Uptime</dt><dd data-tick="up" data-secs="<?= dur_secs($res['uptime'] ?? '') ?>"><?= h(dur_fmt($res['uptime'] ?? '') ?: '-') ?></dd>
<dt>Time Zone</dt><dd><?= h($clk['time-zone-name'] ?? '-') ?></dd></dl></section>
<section class="card info"><b class="bigic"><?= icon('chip') ?></b><dl>
<dt>Board Name</dt><dd><?= h($res['board-name'] ?? '-') ?></dd>
<dt>Model</dt><dd><?= h($rb['model'] ?? ($res['platform'] ?? '-')) ?></dd>
<dt>Router OS</dt><dd><?= h($res['version'] ?? '-') ?></dd>
<dt>Arch</dt><dd><?= h($res['architecture-name'] ?? '-') ?></dd></dl></section>
<section class="card info"><b class="bigic"><?= icon('pulse') ?></b><dl>
                <dt>CPU Load</dt><dd><span class="pbar<?= $lvl($cpu) ?>"><i style="width:<?= $cpu ?>%"></i><em><?= $cpu ?>%</em></span></dd>
                <dt>Memory</dt><dd><span class="pbar<?= $lvl($pct($um, $tm)) ?>" title="Bebas <?= h(bytes($fm)) ?>"><i style="width:<?= $pct($um, $tm) ?>%"></i><em><?= bytes($um) ?> / <?= bytes($tm) ?> (<?= $pct($um, $tm) ?>%)</em></span></dd>
                <dt>HDD</dt><dd><span class="pbar<?= $lvl($pct($uh, $th)) ?>" title="Bebas <?= h(bytes($fh)) ?>"><i style="width:<?= $pct($uh, $th) ?>%"></i><em><?= bytes($uh) ?> / <?= bytes($th) ?> (<?= $pct($uh, $th) ?>%)</em></span></dd>
<dt>CPU</dt><dd><?= h(trim(($res['cpu-count'] ?? '') . ' × ' . ($res['cpu'] ?? ''), ' ×')) ?></dd></dl></section>
</div>

<div class="dashrow">
<div class="ctiles">
<a class="ctile blue" href="<?= url('hs_users') ?>"><div><span>Users</span><b><?= $nf($hsUsers) ?></b></div><div><span>Active</span><b><?= $nf($hsActive) ?></b></div><?= icon('wifi') ?><em>Hotspot</em></a>
<a class="ctile green" href="<?= url('ppp_secrets') ?>"><div><span>Clients</span><b><?= $nf($pppAll) ?></b></div><div><span>Active</span><b><?= $nf($pppActive) ?></b></div><?= icon('ppp') ?><em>PPP</em></a>
<a class="ctile amber" href="<?= h(url('ppp_secrets', ['f' => 'offline'])) ?>"><div><span>Hotspot</span><b><?= $nf(max(0, $hsUsers - $hsActive)) ?></b></div><div><span>PPP</span><b><?= $nf(max(0, $pppAll - $pppActive)) ?></b></div><?= icon('link') ?><em>Offline</em></a>
<a class="ctile red" href="<?= h(url('ppp_secrets', ['f' => 'late'])) ?>"><div><span>Menunggak</span><b><?= $nf($late) ?></b></div><div><span>Segera</span><b><?= $nf($soon) ?></b></div><?= icon('money') ?><em>Tagihan</em></a>
</div>
<section class="card income"><b class="bigic" title="Income"><?= icon('money') ?></b><dl>
<dt>Today [<?= $nDay ?>]</dt><dd><?= money($vDay + $pDay) ?></dd>
<dt>This month [<?= $nMon ?>]</dt><dd><?= money($vMon + $pMon) ?></dd>
<dt>Tunggakan</dt><dd><?= money($lateSum) ?></dd></dl>
<small class="muted" title="Diperbarui <?= date('d/m/Y H:i') ?>"><b>Income bulan ini</b> · Voucher <?= money($vMon) ?> · PPP <?= money($pMon) ?></small></section>
</div>

<div class="dashmain">
<section class="card">
<div class="cardhead"><?= icon('pulse') ?><strong>Traffic</strong><span class="spacer"></span>
<span class="legend"><b class="tx"></b>Tx <span id="txv">–</span><b class="rx"></b>Rx <span id="rxv">–</span></span>
<select id="iface" aria-label="Interface"><?php foreach ($ifaces as $i) echo opt($i['name'], $ifaces[0]['name'] ?? ''); ?></select></div>
<div class="cardbody"><canvas id="traffic" height="260" data-url="<?= h(url('api', ['a' => 'traffic'])) ?>"></canvas></div>
</section>
<section class="card">
<div class="cardhead"><?= icon('log') ?><strong>Hotspot &amp; PPP Log</strong><span class="spacer"></span><a class="hl" href="<?= url('log') ?>">View All</a></div>
<div class="cardbody"><table class="grid-t" id="dlog" data-url="<?= h(url('api', ['a' => 'log'])) ?>"><thead><tr><th>Time</th><th>Messages</th></tr></thead>
<tbody><tr><td colspan="2" class="muted">Memuat…</td></tr></tbody></table></div>
</section>
</div>
<?php page_foot();
