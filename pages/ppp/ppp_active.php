<?php
/** PPP Active: koneksi PPP yang sedang tersambung. Bisa diputus satu per satu atau sekaligus. (?p=list&s=ppp_active) */
need_ros('PPP Active');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $ids = isset($_POST['ids']) && is_array($_POST['ids']) ? array_map('strval', $_POST['ids']) : [];
    if (post('id') !== '') $ids = [post('id')];
    $n = rremove('/ppp/active', $ids);
    if ($n) flash($n . ' koneksi diputuskan.');
    back();
}

$rows = rq('/ppp/active/print', ['.proplist' => '.id,name,service,caller-id,encoding,address,uptime,comment']);
$cs = customers(); // dibaca sekali, bukan per baris
$tot = count($rows);
page_head('PPP Active');
?>
<form method="post" id="pa-form"><?= csrf_field() ?>
<section class="card">
<div class="cardhead"><?= icon('link') ?><strong>PPP Active</strong><span class="muted hscnt"><?= (int)$tot ?> total</span>
<a class="hl" href="<?= h(url('list', ['s' => 'ppp_active'])) ?>" title="Reload Data" aria-label="Reload Data"><?= icon('reload') ?></a>
<span class="spacer"></span>
<button class="btn small bad" id="pa-bulk" data-confirm="Putuskan koneksi semua yang dicentang?">Remove 0</button>
<?php if ($rows) { ?><input type="search" class="filter" placeholder="Search" data-filter="#tbl" aria-label="Filter"><?php } ?>
</div>
<div class="cardbody">
<?php if (!$rows) { ?>
<div class="empty"><p class="emptytitle">Belum ada yang terhubung.</p></div>
<?php } else { ?>
<div class="tablewrap"><table id="tbl" class="grid-t sortable">
<thead><tr><th class="chk nosort"><input type="checkbox" data-checkall aria-label="Pilih semua"></th><th class="dotc nosort"></th><th>PPP</th><th>Service</th><th>Caller ID</th><th>Address</th><th>Uptime</th><th>Jatuh Tempo</th><th class="nosort"></th></tr></thead><tbody>
<?php foreach ($rows as $r) { $sv = strtolower($r['service'] ?? ''); $nm = $r['name'] ?? ''; $cc = $cs[$nm] ?? []; ?>
<tr>
<td class="chk"><input type="checkbox" name="ids[]" value="<?= h($r['.id']) ?>" aria-label="Pilih <?= h($nm) ?>"></td>
<td class="dotc"><span class="dot up" title="Online" aria-label="Online" role="img"></span></td>
<td class="key"><a class="namelink" href="<?= h(url('ppp_user', ['user' => $nm])) ?>"><?= h($nm) ?></a></td>
<td><?= h($sv === 'pppoe' ? 'PPPoE' : ($sv !== '' ? strtoupper($sv) : '-')) ?></td>
<td class="mono"><?= h($r['caller-id'] ?? '') ?></td>
<td class="mono"><?= h($r['address'] ?? '') ?></td>
<td class="mono"><?= h(dur_fmt($r['uptime'] ?? '')) ?></td>
<td><?= !empty($cc['due']) ? h(tgl($cc['due'])) : '-' ?></td>
<td class="acts"><button class="btn small bad" name="id" value="<?= h($r['.id']) ?>" data-confirm="Putuskan koneksi <?= h($nm) ?>?">Remove</button></td>
</tr>
<?php } ?>
</tbody></table></div>
<p class="count"><span data-count="#tbl"><?= $tot ?></span> dari <?= $tot ?> item</p>
<?php } ?>
</div>
</section>
</form>
<script>
(function () {
    var f = document.getElementById('pa-form'), b = document.getElementById('pa-bulk');
    var u = function () { setTimeout(function () { var n = f.querySelectorAll('tbody input[type=checkbox]:checked').length; b.classList.toggle('on', n > 0); b.textContent = 'Remove ' + n; }, 0); };
    f.addEventListener('change', u); f.addEventListener('click', u);
})();
</script>
<?php page_foot();