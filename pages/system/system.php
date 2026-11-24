<?php
/**
 * Menu System: Scheduler, Netwatch, dan Reboot router.
 * ?s=scheduler | netwatch | reboot.
 * Scheduler dan Netwatch hanya untuk memantau (plus Enable / Disable / Remove lewat menu baris);
 * menambah dan mengubah isinya tetap dilakukan di router. Isi script tidak diambil supaya daftar cepat terbuka.
 */
$S = [
    'scheduler' => ['Scheduler', '/system/scheduler', 'clock'],
    'netwatch' => ['Netwatch', '/tool/netwatch', 'pulse'],
    'reboot' => ['Reboot', '', 'reload'],
];
$s = get('s');
if (!isset($S[$s])) $s = 'scheduler';
list($title, $path, $ic) = $S[$s];
need_ros($title);

/** Scheduler milik panel / Mikhmon: diberi tanda dan peringatan sebelum dinonaktifkan atau dihapus. */
$own = function ($name) {
    $n = (string)$name;
    return $n === ppp_sched_name() || $n === ppp_sched_name() . '-boot' || $n === 'Expire-Monitor' || strpos($n, 'iso-') === 0;
};

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $act = post('act');
    $id = post('id');
    if ($s === 'reboot') {
        if ($act === 'reboot') {
            $a = ros();
            if (!$a) { flash('Router tidak terhubung, perintah reboot tidak terkirim.', 'err'); back(); }
            // router langsung memutus koneksi begitu menerima perintah, jadi balasan yang terpotong bukan kegagalan
            try { $a->comm('/system/reboot'); } catch (Exception $e) { }
            $a->close();
            flash('Perintah reboot terkirim ke ' . (router()['name'] ?? 'router') . '. Router menyala ulang; tunggu 1–2 menit lalu muat ulang halaman.');
        }
        redirect('system', ['s' => 'reboot']);
    }
    if ($act === 'toggle' && $id !== '') {
        $off = post('to') === 'disable';
        if (rdo($path . '/' . ($off ? 'disable' : 'enable'), ['.id' => $id])) flash($title . ($off ? ' dinonaktifkan.' : ' diaktifkan.'));
        if ($s === 'scheduler') ppp_sched_ok(true);
    } elseif ($act === 'delete' && $id !== '') {
        if (rdo($path . '/remove', ['.id' => $id])) flash($title . ' dihapus.');
        if ($s === 'scheduler') ppp_sched_ok(true);
    }
    redirect('system', ['s' => $s]);
}

/* ---------- Reboot ---------- */
if ($s === 'reboot') {
    $B = rq_many(['res' => ['/system/resource/print', []], 'id' => ['/system/identity/print', []],
        'ha' => ['/ip/hotspot/active/print', ['count-only' => '']], 'pa' => ['/ppp/active/print', ['count-only' => '']]]);
    $res = $B['res'] ? $B['res'][0] : [];
    $rname = (string)(router()['name'] ?? 'router');
    $ident = (string)($B['id'][0]['name'] ?? '');
    page_head('Reboot');
    ?>
<div class="split">
<form method="post" class="card">
<?= csrf_field() ?><input type="hidden" name="act" value="reboot">
<div class="cardhead"><?= icon('reload') ?><strong>Reboot</strong></div>
<div class="cardbody">
<div class="frow"><label for="rb_name">Router</label><input id="rb_name" value="<?= h($rname . ($ident !== '' && $ident !== $rname ? ' (' . $ident . ')' : '')) ?>" disabled></div>
<div class="frow"><label for="rb_up">Uptime</label><input id="rb_up" value="<?= h(dur_fmt($res['uptime'] ?? '') ?: '-') ?>" disabled></div>
<div class="frow"><label for="rb_ver">RouterOS</label><input id="rb_ver" value="<?= h($res['version'] ?? '-') ?>" disabled></div>
<div class="frow"><label for="rb_hs">Hotspot Active</label><input id="rb_hs" value="<?= (int)$B['ha'] ?> user" disabled></div>
<div class="frow"><label for="rb_ppp">PPP Active</label><input id="rb_ppp" value="<?= (int)$B['pa'] ?> user" disabled></div>
<div class="btnrow fend"><span class="spacer"></span><a class="btn" href="<?= h(url('dashboard')) ?>">Batal</a><button class="btn bad" data-ok="Ya, reboot" data-confirm="Reboot router <?= h($rname) ?> sekarang?&#10;<?= (int)$B['ha'] ?> user hotspot dan <?= (int)$B['pa'] ?> PPP yang sedang terhubung akan terputus sampai router menyala lagi."><?= icon('reload') ?>Reboot</button></div>
</div>
</form>

<section class="card">
<div class="cardhead"><?= icon('info') ?><strong>Read Me</strong></div>
<div class="cardbody">
<table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody>
<tr><td>Reboot</td><td>Router dimatikan lalu menyala lagi. Semua pelanggan hotspot dan PPPoE terputus selama itu, biasanya 1–2 menit.</td></tr>
<tr><td>Waktu yang tepat</td><td>Lakukan saat sepi pemakaian. Jumlah yang sedang terhubung terlihat di Hotspot Active dan PPP Active.</td></tr>
<tr><td>Setelah reboot</td><td>Panel akan menampilkan router tidak terhubung sampai router menyala. Tunggu sebentar lalu muat ulang halaman.</td></tr>
</tbody></table>
</div>
</section>
</div>
<?php
    page_foot();
    return;
}

/* ---------- Scheduler / Netwatch: daftar (pantau saja) ---------- */
$props = $s === 'scheduler'
    ? '.id,name,start-date,start-time,interval,next-run,run-count,disabled'
    : '.id,host,interval,timeout,status,since,comment,disabled';
$rows = rq($path . '/print', ['.proplist' => $props]);
$cols = $s === 'scheduler'
    ? ['name' => 'Name', 'start-date' => 'Start Date', 'start-time' => 'Start Time', 'interval' => 'Interval', 'next-run' => 'Next Run', 'run-count' => 'Run Count']
    : ['host' => 'Host', 'status' => 'Status', 'since' => 'Since', 'interval' => 'Interval', 'timeout' => 'Timeout', 'comment' => 'Comment'];
page_head($title);
?>
<section class="card">
<div class="cardhead"><?= icon($ic) ?><strong><?= h($title) ?></strong>
<span class="spacer"></span>
<?php if ($rows) { ?><input type="search" class="filter" placeholder="Search" data-filter="#tbl" aria-label="Filter"><?php } ?>
</div>
<div class="cardbody">
<?php if (!$rows) { ?>
<div class="empty"><p class="emptytitle">Belum ada <?= h(strtolower($title)) ?> di router ini.</p></div>
<?php } else { ?>
<div class="tablewrap"><table id="tbl" class="grid-t sortable">
<thead><tr><th class="dotc nosort"></th><?php foreach ($cols as $k => $l) echo '<th>' . h($l) . '</th>'; ?><th class="nosort"></th></tr></thead><tbody>
<?php foreach ($rows as $r) {
    $off = ($r['disabled'] ?? '') === 'true';
    $label = (string)($r[$s === 'scheduler' ? 'name' : 'host'] ?? '');
    $mine = $s === 'scheduler' && $own($label);
    $st = $off ? 'Disabled' : 'Enabled';
    echo '<tr><td class="dotc"><span class="dot ' . ($off ? 'down' : 'up') . '" title="' . $st . '" aria-label="' . $st . '" role="img"></span></td>';
    foreach ($cols as $k => $l) {
        $v = (string)($r[$k] ?? '');
        if ($k === 'name' || $k === 'host') echo '<td class="key">' . h($v) . ($mine ? ' ' . badge('Panel', 'warn') : '') . '</td>';
        elseif ($k === 'status') echo '<td>' . ($off || $v === '' ? '<span class="muted">-</span>' : badge(ucfirst($v), $v === 'up' ? 'ok' : ($v === 'down' ? 'bad' : ''))) . '</td>';
        elseif ($k === 'comment' || $k === 'run-count') echo '<td>' . ($v !== '' ? h($v) : '<span class="muted">-</span>') . '</td>';
        else echo '<td class="mono">' . ($v !== '' ? h($v) : '<span class="muted">-</span>') . '</td>';
    }
    $warn = $mine ? 'Scheduler ' . $label . ' dipakai panel (isolir PPP / masa aktif voucher).' . "\n" : '';
    echo '<td class="acts">' . row_menu([
        $off ? confirm_btn('Enable', 'toggle', ['id' => $r['.id'], 'to' => 'enable'])
             : confirm_btn('Disable', 'toggle', ['id' => $r['.id'], 'to' => 'disable'], $warn . 'Nonaktifkan ' . $label . '?'),
        confirm_btn('Remove', 'delete', ['id' => $r['.id']], $warn . 'Hapus ' . $label . ' dari router?', 'danger'),
    ]) . '</td></tr>';
} ?>
</tbody></table></div>
<?php } ?>
</div>
</section>
<?php page_foot();