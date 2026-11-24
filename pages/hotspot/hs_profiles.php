<?php
/** User Profiles hotspot: Expired Mode, Validity, harga, Lock User */
need_ros('User Profile');
$MODES = ['none' => 'None', 'rem' => 'Remove', 'ntf' => 'Notice', 'remc' => 'Remove & Record', 'ntfc' => 'Notice & Record'];
$MODECLS = ['rem' => 'bad', 'remc' => 'bad', 'ntf' => 'warn', 'ntfc' => 'warn'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $act = post('act');
    if ($act === 'delete') {
        if (rdo('/ip/hotspot/user/profile/remove', ['.id' => post('id')])) flash('Profil ' . post('name') . ' dihapus.');
        redirect('hs_profiles');
    }
    $id = post('id');
    $name = preg_replace('/[^A-Za-z0-9_.\-]/', '', str_replace(' ', '-', post('name')));
    $mode = isset($MODES[post('mode')]) ? post('mode') : 'none';
    $validity = strtolower(post('validity'));
    if ($name === '') { flash('Isi Name (huruf, angka, titik, garis).', 'err'); back(); }
    if ($mode !== 'none' && !preg_match('/^\d+[dhm]$/', $validity)) { flash('Validity ditulis seperti 30m, 12h, 1d, atau 30d (satu satuan saja).', 'err'); back(); }
    if ($mode !== 'none' && hs_tpl() === '') { flash('Kerangka script on-login tidak ditemukan (berkas inc/bundle/onlogin.txt hilang). Pulihkan berkas panel lalu ulangi.', 'err'); back(); }
    if ($mode === 'none') $validity = '';
    $p = [
        'name' => $name,
        'shared-users' => (string)max(1, (int)post('shared', '1')),
        'rate-limit' => post('rate'),
        'status-autorefresh' => '1m',
        'on-login' => hs_onlogin($name, $mode, money_in(post('price')), $validity, money_in(post('sprice')), post('lock') === '1'),
    ];
    if (post('pool') !== '') $p['address-pool'] = post('pool');
    if (post('parent') !== '') $p['parent-queue'] = post('parent');
    $ok = $id !== '' ? rdo('/ip/hotspot/user/profile/set', ['.id' => $id] + $p) : rdo('/ip/hotspot/user/profile/add', $p);
    if (!$ok) back();
    list($added, $miss, $fixed) = hs_mon_ensure(); // simpan profil = pasang / perbaiki scheduler Expire Monitor
    flash('Profil ' . $name . ' disimpan.' . ($added ? ' Dipasang di router: ' . implode(', ', $added) . '.' : '') . ($fixed ? ' Diperbaiki: ' . implode(', ', $fixed) . '.' : ''));
    if ($miss && $mode !== 'none') flash('Belum ada di router dan belum ada salinannya: ' . implode(', ', $miss) . '. Berkas bawaan inc/bundle/monitor.json tidak ditemukan; pulihkan berkas panel. Tanpa Expire-Monitor voucher tidak akan kedaluwarsa.', 'err');
    $row = rq('/ip/hotspot/user/profile/print', ['?name' => $name, '.proplist' => '.id']);
    redirect('hs_profiles', $row ? ['edit' => $row[0]['.id']] : []); // tetap di halaman edit, seperti PPP Profiles
}

$profiles = rq('/ip/hotspot/user/profile/print');
$editId = get('edit'); $form = get('add') !== ''; $e = null;
foreach ($profiles as $p) if ($editId !== '' && $p['.id'] === $editId) { $e = $p; $form = true; }

page_head('User Profile');

/* ---------- formulir tambah / ubah ---------- */
if ($form) {
    $m = hs_meta($e['on-login'] ?? '');
    $pools = rq('/ip/pool/print', ['.proplist' => 'name,ranges']);
    $queues = rq('/queue/simple/print', ['.proplist' => 'name']);
    $mode = isset($MODES[$m['mode']]) ? $m['mode'] : 'none';
    $def = ($e['default'] ?? '') === 'true';
    $nv = 0;
    if ($e) foreach (rq('/ip/hotspot/user/print', ['?profile' => $e['name'], '.proplist' => '.id']) as $_) $nv++;
    ?>
<div class="split">
<form method="post" class="card" id="hsprof">
<?= csrf_field() ?><input type="hidden" name="id" value="<?= h($e['.id'] ?? '') ?>">
<div class="cardhead"><?= icon('pie') ?><strong><?= $e ? 'Edit' : 'Add' ?> User Profile</strong><span class="spacer"></span><a class="x" href="<?= url('hs_profiles') ?>" title="Tutup" aria-label="Tutup">&times;</a></div>
<div class="cardbody">
<div class="btnrow">
<button class="btn primary" name="act" value="save"><?= icon('save') ?>Save</button>
<?php if ($e && !$def) { ?>
<input type="hidden" name="name_old" value="<?= h($e['name']) ?>">
<button class="btn bad" name="act" value="delete" formnovalidate data-confirm="Hapus profil <?= h($e['name']) ?>?<?= $nv ? ' Masih ada ' . $nv . ' voucher yang memakai profil ini.' : '' ?>"><?= icon('minus') ?>Remove</button>
<?php } ?>
<?php if ($e) { ?><a class="btn ghost" href="<?= h(url('hs_users', ['profile' => $e['name']])) ?>"><?= icon('ticket') ?><?= $nv ?> voucher</a><?php } ?>
</div>
<?php if ($e) { $mm = hs_mon_ensure(false); $hl = hs_profile_health($e, !$mm[1]); if ($hl[0] !== 'none') { ?><p class="msg <?= $hl[0] === 'ok' ? 'ok' : 'err' ?>" style="margin:0 0 .8rem"><span><?= h($hl[1]) ?></span></p><?php } } ?>
<div class="frow"><label for="h_name">Name</label><input id="h_name" name="name" value="<?= h($e['name'] ?? '') ?>" required pattern="[A-Za-z0-9_.\- ]+" placeholder="3jam-2000" autocomplete="off"<?= $def ? ' readonly' : '' ?>></div>
<div class="frow"><label for="h_pool">Address Pool</label><select id="h_pool" name="pool"><?= opt('none', $e['address-pool'] ?? 'none', 'none') ?><?php foreach ($pools as $x) echo opt($x['name'], $e['address-pool'] ?? ''); ?></select></div>
<div class="frow"><label for="h_shared">Shared Users</label><input id="h_shared" name="shared" type="number" min="1" value="<?= h($e['shared-users'] ?? 1) ?>"></div>
<div class="frow"><label for="h_rate">Rate limit [up/down]</label><input id="h_rate" name="rate" value="<?= h($e['rate-limit'] ?? '') ?>" placeholder="2M/5M"></div>
<div class="frow"><label for="h_mode">Expired Mode</label><select id="h_mode" name="mode"><?php foreach ($MODES as $k => $v) echo opt($k, $mode, $v); ?></select></div>
<div class="frow"><label for="h_val">Validity</label><input id="h_val" name="validity" value="<?= h($m['validity']) ?>" pattern="\d+[dhmDHM]" placeholder="1d"></div>
<div class="frow"><label for="h_price">Price <?= h(setting('currency')) ?></label><input id="h_price" name="price" type="text" inputmode="numeric" data-money value="<?= $m['price'] ? h(money($m['price'], false)) : '' ?>" placeholder="2.000"></div>
<div class="frow"><label for="h_sprice">Selling Price <?= h(setting('currency')) ?></label><input id="h_sprice" name="sprice" type="text" inputmode="numeric" data-money value="<?= $m['sprice'] ? h(money($m['sprice'], false)) : '' ?>" placeholder="3.000"></div>
<div class="frow"><label for="h_lock">Lock User</label><select id="h_lock" name="lock"><?= opt('0', $m['lock'], 'Disable') . opt('1', $m['lock'], 'Enable') ?></select></div>
<div class="frow"><label for="h_parent">Parent Queue</label><select id="h_parent" name="parent"><?= opt('none', $e['parent-queue'] ?? 'none', 'none') ?><?php foreach ($queues as $x) echo opt($x['name'], $e['parent-queue'] ?? ''); ?></select></div>
</div>
<script>
(function () {
    var md = document.getElementById('h_mode'), v = document.getElementById('h_val');
    var sync = function () { var on = md.value !== 'none'; v.disabled = !on; v.required = on; if (!on) v.value = ''; };
    md.addEventListener('change', function () { sync(); if (md.value !== 'none') v.focus(); });
    sync();
})();
</script>
</form>

<section class="card">
<div class="cardhead"><?= icon('info') ?><strong>Read Me</strong></div>
<div class="cardbody">
<table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody>
<tr><td>Expired Mode</td><td>Kontrol untuk user hotspot. Pilihan: Remove, Notice, Remove &amp; Record, Notice &amp; Record.</td></tr>
<tr><td>Remove</td><td>User dihapus saat masa aktifnya habis.</td></tr>
<tr><td>Notice</td><td>User tidak dihapus dan mendapat pemberitahuan setelah masa aktif habis (limit-uptime 1s, ditandai Expired).</td></tr>
<tr><td>Record</td><td>Menyimpan harga setiap user yang login, untuk menghitung total penjualan hotspot di Report.</td></tr>
<tr><td>Lock User</td><td>Username hanya bisa dipakai di 1 perangkat.</td></tr>
<tr><td>Format Validity</td><td>[dhm] Contoh: 30d = 30 hari, 12h = 12 jam, 30m = 30 menit.</td></tr>
</tbody></table>
<p class="hint">Saat Save, panel memastikan scheduler Expire Monitor (Expire-Monitor, Reset-Expire-Monitor, Reset-Expire-Monitor-Daily) ada dan utuh di router. Yang terhapus, rusak, atau dinonaktifkan dipasang lagi otomatis. Interval Expire-Monitor bawaannya 1 menit dan bisa diubah langsung di System &gt; Scheduler router; panel tidak mengubahnya.<br>
Masa habis hanya diberikan pada voucher yang comment-nya kosong atau diawali vc / up. Voucher dari Generate dan Add User di panel ini sudah otomatis begitu.</p>
</div>
</section>
</div>
<?php
    page_foot();
    exit;
}

/* ---------- daftar ---------- */
$cnt = [];
// jumlah voucher per profil: dari cache User List bila ada (tanpa menunggu router), kalau tidak satu query ringan
$__us = hs_users_peek();
if ($__us === null) $__us = rq('/ip/hotspot/user/print', ['.proplist' => 'profile']);
foreach ($__us as $u) { $k = $u['profile'] ?? ''; $cnt[$k] = ($cnt[$k] ?? 0) + 1; } // satu query; count per profil justru lebih lambat di router
list(, $miss) = hs_mon_ensure(false); // periksa saja (tidak mengubah router); [.., yang hilang / perlu diperbaiki]
$mon = hs_mon_row();
$monOk = !$miss && $mon && ($mon['disabled'] ?? '') !== 'true';
?>
<section class="card">
<div class="cardhead"><?= icon('pie') ?><strong>User Profile</strong>
<a class="hl" href="<?= url('hs_profiles', ['add' => 1]) ?>"><?= icon('plus') ?>Add</a>
<a class="hl" href="<?= url('hs_profiles') ?>" title="Reload Data" aria-label="Reload Data"><?= icon('reload') ?></a>
<span class="spacer"></span></div>
<div class="cardbody">
<div class="tablewrap"><table id="tbl" class="grid-t sortable">
<thead><tr><th>Name</th><th class="sh">Shared <br>Users</th><th>Rate Limit</th><th>Expired Mode</th><th>Validity</th><th class="r">Price</th><th class="r">Selling Price</th><th class="r">Vouchers</th><th class="nosort"></th></tr></thead><tbody>
<?php foreach ($profiles as $p) { $m = hs_meta($p['on-login'] ?? ''); $def = ($p['default'] ?? '') === 'true'; $n = (int)($cnt[$p['name']] ?? 0); ?>
<tr>
<?php $hl = hs_profile_health($p, $monOk); ?><td class="key"><span class="dot<?= $hl[0] === 'ok' ? ' up' : ($hl[0] === 'bad' ? ' down' : '') ?>" title="<?= h($hl[1]) ?>" aria-label="<?= h($hl[1]) ?>" role="img" style="display:inline-block;vertical-align:middle;margin-right:.45rem;cursor:help"></span><a class="namelink" href="<?= h(url('hs_profiles', ['edit' => $p['.id']])) ?>"><?= h($p['name']) ?></a></td>
<td class="sh"><?= h($p['shared-users'] ?? '') ?></td>
<?php $rl = trim((string)($p['rate-limit'] ?? '')); $rlp = $rl === '' ? [] : preg_split('/\s+/', $rl, 2); ?>
<td class="rl" data-v="<?= h($rl) ?>"<?= isset($rlp[1]) ? ' title="' . h($rl) . '"' : '' ?>><?= $rlp ? '<span class="rl1">' . h($rlp[0]) . '</span>' . (isset($rlp[1]) ? '<span class="rl2">…</span>' : '') : '' ?></td>
<td><?= $m['mode'] === 'none' ? '<span class="muted">None</span>' : h($MODES[$m['mode']]) ?></td>
<td data-v="<?= dur_secs($m['validity']) ?>"><?= h($m['validity']) ?></td>
<td class="r" data-v="<?= (int)$m['price'] ?>"><?= $m['price'] ? money($m['price'], false) : '' ?></td>
<td class="r" data-v="<?= (int)$m['sprice'] ?>"><?= $m['sprice'] ? money($m['sprice'], false) : '' ?></td>

<td class="r"><?= $n ? '<a href="' . h(url('hs_users', ['profile' => $p['name']])) . '">' . $n . '</a>' : '0' ?></td>
<td class="acts"><?= row_menu([
    '<a href="' . h(url('hs_profiles', ['edit' => $p['.id']])) . '">Edit</a>',
    '<a href="' . h(url('hs_generate', ['profile' => $p['name']])) . '">Generate</a>',
    $n ? '<a href="' . h(url('hs_users', ['profile' => $p['name']])) . '">User List</a>' : '',
    $def ? '' : confirm_btn('Remove', 'delete', ['id' => $p['.id'], 'name' => $p['name']], 'Hapus profil ' . $p['name'] . '?' . ($n ? ' Masih ada ' . $n . ' voucher yang memakai profil ini.' : ''), 'danger'),
]) ?></td>
</tr>
<?php } ?>
</tbody></table></div>
<p class="count"><span data-count="#tbl"><?= count($profiles) ?></span> dari <?= count($profiles) ?> item</p>
<div class="count" style="display:flex;flex-wrap:wrap;gap:.4rem 1.1rem;align-items:center">
<span><span class="dot up" style="display:inline-block;vertical-align:middle;margin-right:.3rem"></span>Siap dipakai</span>
<span><span class="dot" style="display:inline-block;vertical-align:middle;margin-right:.3rem"></span>Tanpa Expired Mode</span>
<span><span class="dot down" style="display:inline-block;vertical-align:middle;margin-right:.3rem"></span>Bermasalah — buka profil lalu Save untuk memperbaiki (arahkan kursor ke titik untuk detail)</span>
</div>
</div>
</section>
<?php
page_foot();