<?php
/** Log router: bawaan menampilkan log Hotspot & PPP sekaligus, seperti log di dashboard. */
need_ros('Log');
$T = ['hspp' => 'Hotspot & PPP', 'hotspot' => 'Hotspot', 'ppp' => 'PPP', 'all' => 'Semua topik'];
$topic = isset($T[get('t')]) ? get('t') : 'hspp';

/** Jenis log dari topics: hotspot, ppp, atau lain. */
$kind = function ($tp) {
    if (strpos($tp, 'hotspot') !== false) return 'hotspot';
    if (strpos($tp, 'ppp') !== false || strpos($tp, 'pppoe') !== false || strpos($tp, 'l2tp') !== false || strpos($tp, 'pptp') !== false || strpos($tp, 'sstp') !== false) return 'ppp';
    return 'other';
};
/** Pisahkan user dan IP dari pesan: "user (10.5.50.2): logged in" / "<pppoe-user>: authenticated". */
$split = function ($msg, $k) {
    $msg = (string)$msg;
    if ($k === 'hotspot' && preg_match('/^(?:->:\s*)?(\S+)\s+\(([^)]*)\):\s*(.*)$/', $msg, $m)) return [$m[1], $m[2], $m[3]];
    if ($k === 'ppp' && preg_match('/^<(?:pppoe|l2tp|pptp|sstp|ovpn)-([^>]+)>:\s*(.*)$/', $msg, $m)) return [$m[1], '', $m[2]];
    if ($k === 'ppp' && preg_match('/^(\S+) logged (in|out)(?:, (\S+))?/', $msg, $m)) return [$m[1], $m[3] ?? '', 'logged ' . $m[2]];
    return ['', '', $msg];
};

$rows = []; $cnt = ['hotspot' => 0, 'ppp' => 0, 'other' => 0];
foreach (rq('/log/print', ['.proplist' => 'time,topics,message']) as $l) {
    $k = $kind($l['topics'] ?? '');
    $cnt[$k]++;
    if ($topic === 'hspp' && $k === 'other') continue;
    if (($topic === 'hotspot' || $topic === 'ppp') && $k !== $topic) continue;
    $l['k'] = $k;
    $rows[] = $l;
}
$rows = array_slice(array_reverse($rows), 0, 500);

page_head('Log');
?>
<section class="card">
<div class="cardhead"><?= icon('log') ?><strong>Log</strong><span class="muted hscnt"><?= count($rows) ?> total</span>
<span class="spacer"></span>
<a class="hl" href="<?= h(url('log', $topic === 'hspp' ? [] : ['t' => $topic])) ?>" title="Reload Data" aria-label="Reload Data"><?= icon('reload') ?></a>
</div>
<div class="cardbody">
<div class="hsfilter">
<?php if ($rows) { ?><input type="search" class="filter" placeholder="Search log…" data-filter="#tbl" aria-label="Search"><?php } ?>
<select aria-label="Topik log" onchange="location.href=this.value"><?php foreach ($T as $k => $v) echo '<option value="' . h(url('log', $k === 'hspp' ? [] : ['t' => $k])) . '"' . ($k === $topic ? ' selected' : '') . '>' . h($v) . '</option>'; ?></select>
</div>
<?php if (!$rows) { ?>
<div class="empty"><p class="emptytitle">Belum ada log <?= h($T[$topic]) ?> di router.</p>
<p class="muted">Bila log hotspot atau PPP tidak pernah muncul, aktifkan lewat terminal router:<br><code>/system logging add topics=hotspot,info action=memory</code><br><code>/system logging add topics=pppoe,ppp,info action=memory</code></p></div>
<?php } else { ?>
<div class="tablewrap"><table id="tbl" class="grid-t sortable">
<thead><tr><th>Time</th><th>Topik</th><th>User</th><th>IP</th><th>Messages</th></tr></thead><tbody>
<?php foreach ($rows as $l) { list($u, $ip, $msg) = $split($l['message'] ?? '', $l['k']);
    $bad = preg_match('/fail|error|invalid|wrong|denied|terminat|disconnect|logged out|timeout/i', $msg); ?>
<tr>
<td class="mono nowrap" data-v="<?= h($l['time'] ?? '') ?>"><?= h(ros_dt($l['time'] ?? '')) ?></td>
<td><?= $l['k'] === 'hotspot' ? badge('Hotspot', 'ok') : ($l['k'] === 'ppp' ? badge('PPP', 'warn') : '<span class="muted">' . h($l['topics'] ?? '') . '</span>') ?></td>
<td class="key"><?php if ($u !== '') { $to = $l['k'] === 'hotspot' ? url('hs_users', ['q' => $u]) : url('ppp_user', ['user' => $u]); ?><a class="namelink" href="<?= h($to) ?>"><?= h($u) ?></a><?php } ?></td>
<td class="mono"><?= h($ip) ?></td>
<td<?= $bad ? ' style="color:var(--bad)"' : '' ?>><?= h($msg) ?></td>
</tr>
<?php } ?>
</tbody></table></div>
<p class="count" hidden><span data-count="#tbl"><?= count($rows) ?></span> dari <?= count($rows) ?> item</p>
<?php } ?>
</div>
</section>
<?php page_foot();