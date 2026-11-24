<?php
/** IP Pool di router: daftar, tambah (popup), ubah, hapus. */
$ajax = post('ajax') === '1';
if ($ajax) { session_write_close(); header('Content-Type: application/json'); header('Cache-Control: no-store'); }
$fail = function ($m) use ($ajax) {
    if ($ajax) { echo json_encode(['ok' => false, 'error' => $m]); exit; }
    flash($m, 'err'); back();
};
if (!$ajax) need_ros('IP Pool');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (post('act') === 'delete') {
        if (rdo('/ip/pool/remove', ['.id' => post('id')])) flash('IP pool ' . post('name') . ' dihapus.');
        redirect('ip_pools');
    }
    $api = ros();
    if (!$api) $fail($GLOBALS['ROS_ERR'] ?? 'Router tidak terhubung.');
    $id = post('id'); $name = post('name'); $ranges = str_replace(' ', '', post('ranges'));
    if (!preg_match('/^[A-Za-z0-9_.\-]+$/', $name)) $fail('Name hanya boleh huruf, angka, titik, garis bawah, dan tanda hubung.');
    if (!preg_match('/^\d{1,3}(\.\d{1,3}){3}([\-\/][0-9.]+)?(,\d{1,3}(\.\d{1,3}){3}([\-\/][0-9.]+)?)*$/', $ranges)) $fail('Format Ranges salah. Contoh: 192.168.22.10-192.168.22.250');
    $p = ['name' => $name, 'ranges' => $ranges, 'comment' => post('comment')];
    if ($id !== '') $p['next-pool'] = post('next') !== '' ? post('next') : 'none';
    try { $api->comm($id !== '' ? '/ip/pool/set' : '/ip/pool/add', ($id !== '' ? ['.id' => $id] : []) + $p); }
    catch (Exception $e) { $fail('Router menolak: ' . $e->getMessage()); }
    if ($ajax) { echo json_encode(['ok' => true, 'name' => $name, 'ranges' => $ranges]); exit; }
    flash('IP pool ' . $name . ' disimpan.');
    redirect('ip_pools');
}

$pools = rq('/ip/pool/print');
$e = null;
foreach ($pools as $x) if (get('edit') !== '' && $x['.id'] === get('edit')) $e = $x;

page_head('IP Pool');
if ($e) { ?>
<div class="split">
<form method="post" class="card">
<?= csrf_field() ?><input type="hidden" name="act" value="save"><input type="hidden" name="id" value="<?= h($e['.id']) ?>">
<div class="cardhead"><?= icon('dash') ?><strong>Edit IP Pool</strong><span class="spacer"></span><a class="x" href="<?= url('ip_pools') ?>" title="Tutup" aria-label="Tutup">&times;</a></div>
<div class="cardbody">
<div class="btnrow"><button class="btn primary"><?= icon('save') ?>Save</button></div>
<div class="frow"><label for="e_name">Name</label><input id="e_name" name="name" value="<?= h($e['name']) ?>" required pattern="[A-Za-z0-9_.\-]+"></div>
<div class="frow"><label for="e_ranges">Ranges</label><input id="e_ranges" name="ranges" value="<?= h($e['ranges'] ?? '') ?>" required></div>
<div class="frow"><label for="e_next">Next Pool</label><select id="e_next" name="next"><option value="">none</option><?php foreach ($pools as $x) if ($x['.id'] !== $e['.id']) echo opt($x['name'], $e['next-pool'] ?? ''); ?></select></div>
<div class="frow"><label for="e_cmt">Comment</label><input id="e_cmt" name="comment" value="<?= h($e['comment'] ?? '') ?>"></div>
</div>
</form>
<section class="card">
<div class="cardhead"><?= icon('info') ?><strong>Read Me</strong></div>
<div class="cardbody"><table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody>
<tr><td>Ranges</td><td>Rentang alamat, misalnya 192.168.22.10-192.168.22.250. Beberapa rentang dipisah koma.</td></tr>
<tr><td>Next Pool</td><td>Pool cadangan yang dipakai bila pool ini habis.</td></tr>
<tr><td>Rename</td><td>Profil yang memakai pool ini ikut memakai nama barunya.</td></tr>
</tbody></table></div>
</section>
</div>
<?php } else {
    $used = [];
    foreach (rq('/ppp/profile/print', ['.proplist' => 'name,remote-address']) as $p) if (($p['remote-address'] ?? '') !== '') $used[$p['remote-address']][] = $p['name'];
    ?>
<section class="card">
<div class="cardhead"><?= icon('dash') ?><strong>IP Pool</strong>
<a class="hl" href="#" role="button" data-open="#pooldlg"><?= icon('plus') ?>Add</a>
<a class="hl" href="<?= url('ip_pools') ?>" title="Reload Data" aria-label="Reload Data"><?= icon('reload') ?></a>
<span class="spacer"></span></div>
<div class="cardbody">
<?php if (!$pools) { ?>
<div class="empty"><p class="emptytitle">Belum ada IP pool di router ini.</p><p><button type="button" class="btn primary" data-open="#pooldlg">Add IP Pool</button></p></div>
<?php } else { ?>
<div class="tablewrap"><table id="tbl" class="grid-t sortable">
<thead><tr><th>Name</th><th>Ranges</th><th>Next Pool</th><th>Dipakai profil PPP</th><th>Comment</th><th class="nosort"></th></tr></thead><tbody>
<?php foreach ($pools as $x) { $u = $used[$x['name']] ?? []; ?>
<tr>
<td class="key"><a class="namelink" href="<?= h(url('ip_pools', ['edit' => $x['.id']])) ?>"><?= h($x['name']) ?></a></td>
<td class="mono"><?= h($x['ranges'] ?? '') ?></td><td><?= h(($x['next-pool'] ?? '') === 'none' ? '' : ($x['next-pool'] ?? '')) ?></td>
<td><?= h(implode(', ', $u)) ?></td><td><?= h($x['comment'] ?? '') ?></td>
<td class="acts">
<?= row_menu([
    '<a href="' . h(url('ip_pools', ['edit' => $x['.id']])) . '">Edit</a>',
    confirm_btn('Remove', 'delete', ['id' => $x['.id'], 'name' => $x['name']],
        'Hapus IP pool ' . $x['name'] . '?' . ($u ? ' Pool ini masih dipakai profil ' . implode(', ', $u) . '.' : ''), 'danger'),
]) ?>
</td>
</tr>
<?php } ?>
</tbody></table></div>
<p class="count"><span data-count="#tbl"><?= count($pools) ?></span> dari <?= count($pools) ?> item</p>
<?php } ?>
</div>
</section>
<?= pool_dialog(false) ?>
<?php }
page_foot();