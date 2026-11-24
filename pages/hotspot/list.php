<?php
/** Daftar dari router: Hotspot Active, Hosts, IP Bindings, Cookies (PPP Active ada di pages/ppp/ppp_active.php). */
$S = [
    'hs_active' => ['Hotspot Active', '/ip/hotspot/active', 'Remove', 'link',
        ['user' => 'User', 'server' => 'Server', 'address' => 'Address', 'mac-address' => 'MAC Address', 'uptime' => 'Uptime', 'session-time-left' => 'Time Left', 'bytes-in' => 'Bytes In', 'bytes-out' => 'Bytes Out', 'login-by' => 'Login By', 'comment' => 'Comment']],
    'hs_hosts' => ['Hosts', '/ip/hotspot/host', 'Remove', 'router',
        ['mac-address' => 'MAC Address', 'address' => 'Address', 'to-address' => 'To Address', 'server' => 'Server', 'authorized' => 'Authorized', 'bypassed' => 'Bypassed', 'comment' => 'Comment']],
    'hs_bindings' => ['IP Bindings', '/ip/hotspot/ip-binding', 'Remove', 'lock',
        ['mac-address' => 'MAC Address', 'address' => 'Address', 'to-address' => 'To Address', 'server' => 'Server', 'type' => 'Type', 'comment' => 'Comment']],
    'hs_cookies' => ['Cookies', '/ip/hotspot/cookie', 'Remove', 'clock',
        ['user' => 'User', 'mac-address' => 'MAC Address', 'domain' => 'Domain', 'expires-in' => 'Expires In']],
];
$s = get('s');
if ($s === 'ppp_active') { require ROOT . '/pages/ppp/ppp_active.php'; exit; }
if (!isset($S[$s])) redirect('dashboard');
list($title, $path, $verb, $ic, $cols) = $S[$s];
need_ros($title);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $act = post('act');
    if ($act === 'add' && $s === 'hs_bindings') {
        $p = ['type' => in_array(post('type'), ['regular', 'bypassed', 'blocked'], true) ? post('type') : 'bypassed'];
        foreach (['mac-address' => 'mac', 'address' => 'address', 'to-address' => 'to', 'comment' => 'comment'] as $k => $f) if (post($f) !== '') $p[$k] = post($f);
        if (post('server') !== '') $p['server'] = post('server');
        if (post('mac') === '' && post('address') === '') { flash('Isi MAC Address atau Address.', 'err'); back(); }
        if (rdo($path . '/add', $p)) flash('IP binding ditambahkan.');
    } elseif ($act === 'bind' && $s === 'hs_hosts') {
        $h = rq('/ip/hotspot/host/print', ['?.id' => post('id'), '.proplist' => 'mac-address,address,server']);
        if ($h && rdo('/ip/hotspot/ip-binding/add', ['mac-address' => $h[0]['mac-address'], 'type' => post('to') === 'blocked' ? 'blocked' : 'bypassed', 'comment' => post('to') === 'blocked' ? 'blocked dari Hosts' : 'bypass dari Hosts'])) {
            flash($h[0]['mac-address'] . ' dijadikan IP binding ' . (post('to') === 'blocked' ? 'blocked' : 'bypassed') . '.');
        }
    } elseif ($act === 'type' && $s === 'hs_bindings') {
        if (in_array(post('to'), ['regular', 'bypassed', 'blocked'], true) && rdo($path . '/set', ['.id' => post('id'), 'type' => post('to')])) flash('Type diubah ke ' . post('to') . '.');
    } else {
        $ids = isset($_POST['ids']) && is_array($_POST['ids']) ? array_map('strval', $_POST['ids']) : [];
        if (post('id') !== '') $ids = [post('id')];
        $n = rremove($path, $ids);
        if ($n) flash($n . ' item ' . ($s === 'hs_active' ? 'diputuskan dari Hotspot Active' : 'dihapus') . '.');
    }
    back();
}

$rows = rq($path . '/print', ['.proplist' => '.id,' . implode(',', array_keys($cols)) . ($s === 'hs_bindings' ? ',disabled' : '')]);
$servers = $s === 'hs_bindings' ? rq('/ip/hotspot/print', ['.proplist' => 'name']) : [];
$tot = count($rows);
page_head($title);
?>
<?php if ($s === 'hs_bindings') { ?>
<details class="card addcard"<?= $rows ? '' : ' open' ?>>
<summary class="cardhead" style="cursor:pointer"><?= icon('plus') ?><strong>Add IP Binding</strong></summary>
<div class="cardbody">
<form method="post" class="addrow">
<?= csrf_field() ?><input type="hidden" name="act" value="add">
<input name="mac" placeholder="MAC Address" aria-label="MAC Address" pattern="[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}" autocomplete="off">
<input name="address" placeholder="Address (opsional)" aria-label="Address" autocomplete="off">
<input name="to" placeholder="To Address (opsional)" aria-label="To Address" autocomplete="off">
<select name="server" aria-label="Server"><option value="">all</option><?php foreach ($servers as $x) echo opt($x['name'], ''); ?></select>
<select name="type" aria-label="Type"><option value="bypassed">bypassed</option><option value="regular">regular</option><option value="blocked">blocked</option></select>
<input name="comment" placeholder="Comment" aria-label="Comment" autocomplete="off">
<button class="btn primary"><?= icon('save') ?>Save</button>
</form>
</div>
</details>
<?php } ?>
<form method="post" id="ls-form"><?= csrf_field() ?><input type="hidden" name="act" value="delete"><input type="hidden" name="to" value="">
<section class="card">
<div class="cardhead"><?= icon($ic) ?><strong><?= h($title) ?></strong><span class="muted hscnt"><?= (int)$tot ?> total</span>
<a class="hl" href="<?= h(url('list', ['s' => $s])) ?>" title="Reload Data" aria-label="Reload Data"><?= icon('reload') ?></a>
<span class="spacer"></span>
<button class="btn small bad" id="ls-bulk" onclick="this.form.act.value='delete'" data-confirm="<?= $s === 'hs_active' ? 'Putuskan koneksi semua yang dicentang?' : 'Hapus semua yang dicentang?' ?>"><?= $verb ?> 0</button>
<?php if ($rows) { ?><input type="search" class="filter" placeholder="Search" data-filter="#tbl" aria-label="Filter"><?php } ?>
</div>
<div class="cardbody">
<?php if (!$rows) { ?>
<div class="empty"><p class="emptytitle"><?= $s === 'hs_active' ? 'Belum ada user yang terhubung.' : 'Belum ada data.' ?></p></div>
<?php } else { ?>
<div class="tablewrap"><table id="tbl" class="grid-t sortable">
<thead><tr><th class="chk nosort"><input type="checkbox" data-checkall aria-label="Pilih semua"></th><?php foreach ($cols as $k => $l) echo '<th' . (strpos($k, 'bytes') === 0 ? ' class="r"' : '') . '>' . h($l) . '</th>'; ?><th class="nosort"></th></tr></thead><tbody>
<?php foreach ($rows as $r) { $off = ($r['disabled'] ?? '') === 'true'; ?>
<tr<?= $off ? ' class="off"' : '' ?>><td class="chk"><input type="checkbox" name="ids[]" value="<?= h($r['.id']) ?>" aria-label="Pilih"></td>
<?php $first = true; foreach ($cols as $k => $l) {
    $v = $r[$k] ?? '';
    if ($first) {
        $first = false;
        if ($k === 'user' && !isset($uid)) $uid = array_column(rq('/ip/hotspot/user/print', ['.proplist' => '.id,name']) ?: [], '.id', 'name'); // klik user: Edit User bila ada, Add User bila tidak
        $lnk = $k === 'user' ? (isset($uid[$v]) ? url('hs_generate', ['id' => $uid[$v]]) : url('hs_generate', ['one' => 1])) : ''; echo '<td class="key' . ($k === 'mac-address' ? ' mono' : '') . '">' . ($lnk !== '' && $v !== '' ? '<a class="namelink" href="' . h($lnk) . '">' . h($v) . '</a>' : h($v)) . '</td>';
        continue;
    }
    if (strpos($k, 'bytes') === 0) echo '<td class="r" data-v="' . (float)$v . '">' . bytes($v) . '</td>';
    elseif (in_array($k, ['uptime', 'session-time-left', 'expires-in'], true)) echo '<td class="mono" data-v="' . dur_secs($v) . '">' . h(dur_fmt($v)) . '</td>';
    elseif ($v === 'true' || $v === 'false') echo '<td>' . ($v === 'true' ? badge('Yes', 'ok') : '<span class="muted">No</span>') . '</td>';
    elseif ($k === 'type') echo '<td>' . badge($v, $v === 'blocked' ? 'bad' : ($v === 'bypassed' ? 'ok' : '')) . '</td>';
    else echo '<td' . (in_array($k, ['mac-address', 'address', 'to-address'], true) ? ' class="mono"' : '') . '>' . h($v) . '</td>';
} ?>
<td class="acts"><?php
    if ($s === 'hs_active') {
        echo '<button class="btn small bad" name="id" value="' . h($r['.id']) . '" data-confirm="Putuskan koneksi ' . h($r['user'] ?? '') . '?" onclick="this.form.act.value=\'delete\'">Remove</button>';
    } else {
        // tombol di dalam form daftar (bukan form bersarang): aksi dan nilainya diisi saat diklik
        $btn = function ($label, $act, $to, $ask = '', $cls = '') use ($r) {
            return '<button' . ($cls !== '' ? ' class="' . $cls . '"' : '') . ' name="id" value="' . h($r['.id']) . '"' . ($ask !== '' ? ' data-confirm="' . h($ask) . '"' : '')
                . ' onclick="this.form.act.value=\'' . $act . '\';this.form.to.value=\'' . $to . '\'">' . h($label) . '</button>';
        };
        $items = [];
        if ($s === 'hs_hosts' && !empty($r['mac-address'])) {
            $items[] = $btn('Make Bypassed', 'bind', 'bypassed', 'Buat IP binding bypassed untuk ' . $r['mac-address'] . '? Perangkat ini bisa internet tanpa login.');
            $items[] = $btn('Make Blocked', 'bind', 'blocked', 'Blokir ' . $r['mac-address'] . ' lewat IP binding?');
        }
        if ($s === 'hs_bindings') foreach (['regular', 'bypassed', 'blocked'] as $t) if (($r['type'] ?? '') !== $t) $items[] = $btn('Set ' . ucfirst($t), 'type', $t);
        $items[] = $btn('Remove', 'delete', '', 'Hapus item ini?', 'danger');
        echo row_menu($items);
    } ?></td></tr>
<?php } ?>
</tbody></table></div>
<p class="count"><span data-count="#tbl"><?= $tot ?></span> dari <?= $tot ?> item</p>
<?php } ?>
</div>
</section>
</form>
<script>
(function () {
    var f = document.getElementById('ls-form'), b = document.getElementById('ls-bulk');
    if (!f || !b) return;
    var u = function () { setTimeout(function () { var n = f.querySelectorAll('tbody input[type=checkbox]:checked').length; b.classList.toggle('on', n > 0); b.textContent = <?= json_encode($verb) ?> + ' ' + n; }, 0); };
    f.addEventListener('change', u); f.addEventListener('click', u);
})();
</script>
<?php
page_foot();