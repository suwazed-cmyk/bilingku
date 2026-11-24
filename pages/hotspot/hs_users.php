<?php
/** Vouchers: daftar pengguna hotspot, saring per profil / kelompok cetak, cetak dan hapus massal. */
need_ros('User List');
$PROPS = HSU_PROPS;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    hs_users_dirty(); // daftar voucher berubah: ambil ulang dari router
    $act = post('act');
    $ids = isset($_POST['ids']) && is_array($_POST['ids']) ? array_map('strval', $_POST['ids']) : [];
    if (post('id') !== '') $ids = [post('id')];

    if ($act === 'delete' || $act === 'delete_comment') {
        $all = rq('/ip/hotspot/user/print', ['.proplist' => '.id,name,comment']);
        $names = [];
        if ($act === 'delete_comment') {
            $ids = [];
            foreach ($all as $u) if (($u['comment'] ?? '') === post('comment') && post('comment') !== '') { $ids[] = $u['.id']; $names[$u['name']] = 1; }
        } else {
            foreach ($all as $u) if (in_array($u['.id'], $ids, true)) $names[$u['name']] = 1;
        }
        $n = rremove('/ip/hotspot/user', $ids);
        // putuskan juga yang sedang login
        $act_ids = [];
        foreach (rq('/ip/hotspot/active/print', ['.proplist' => '.id,user']) as $a) if (isset($names[$a['user'] ?? ''])) $act_ids[] = $a['.id'];
        rremove('/ip/hotspot/active', $act_ids);
        // scheduler per voucher dari versi lama panel
        $sch = [];
        foreach (rq('/system/scheduler/print', ['?comment' => 'bilingku-exp', '.proplist' => '.id,name']) as $s) {
            if (isset($names[substr($s['name'], 4)])) $sch[] = $s['.id'];
        }
        rremove('/system/scheduler', $sch);
        flash($n . ' voucher dihapus.');
        if ($act === 'delete_comment') redirect('hs_users');
    } elseif ($act === 'toggle' && $ids) {
        rdo('/ip/hotspot/user/set', ['.id' => $ids[0], 'disabled' => post('to') === 'yes' ? 'yes' : 'no']);
    } elseif ($act === 'reset' && $ids) {
        if (rdo('/ip/hotspot/user/reset-counters', ['.id' => $ids[0]])) flash('Pemakaian direset.');
    } elseif ($act === 'kick' && $ids) {
        $u = rq('/ip/hotspot/user/print', ['?.id' => $ids[0], '.proplist' => 'name']);
        if ($u) {
            rremove('/ip/hotspot/active', array_column(rq('/ip/hotspot/active/print', ['?user' => $u[0]['name'], '.proplist' => '.id']), '.id'));
            flash('Koneksi ' . $u[0]['name'] . ' diputuskan.');
        }
    }
    back();
}

/** Tanggal habis dari comment voucher yang ditulis script on-login: [teks tanggal jam, mode N/R] atau null. */
$expOf = function ($cm) {
    if (!preg_match('/^([a-z]{3}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})( ([NR]))?/', (string)$cm, $m)) return null;
    return [$m[1] . ' ' . $m[2], $m[4] ?? ''];
};
$used = function ($u) { $t = (string)($u['uptime'] ?? ''); return $t !== '' && dur_secs($t) > 0; };
$isExp = function ($u) { $lu = (string)($u['limit-uptime'] ?? ''); return $lu === '1s' || $lu === '00:00:01'; };

$fProfile = get('profile'); $fComment = get('comment'); $q = strtolower(get('q')); $pg = max(1, (int)get('pg', '1')); $per = in_array((int)get('per'), [25, 50, 100, 200], true) ? (int)get('per') : 50;
$f = in_array(get('f'), ['online', 'new', 'off', 'exp'], true) ? get('f') : '';

$users = hs_users_cached($PROPS, get('fresh') === '1');
$online = [];
foreach (rq('/ip/hotspot/active/print', ['.proplist' => 'user,address']) as $a) $online[$a['user'] ?? ''] = $a['address'] ?? '';
$legacy = [];
// scheduler per voucher dari versi lama panel: hanya dicari sekali per sesi bila memang pernah ada (menghemat satu query berat tiap buka halaman)
$lk = 'legacy_exp_' . router_id();
if (!isset($_SESSION[$lk])) $_SESSION[$lk] = rcount('/system/scheduler', ['?comment' => 'bilingku-exp']) > 0;
if ($_SESSION[$lk]) foreach (rq('/system/scheduler/print', ['?comment' => 'bilingku-exp', '.proplist' => 'name,next-run']) as $s) $legacy[substr($s['name'], 4)] = $s['next-run'] ?? '';

$profiles = []; $comments = []; $rows = [];
$cnt = ['' => 0, 'online' => 0, 'new' => 0, 'off' => 0, 'exp' => 0];
foreach ($users as $u) {
    $pr = $u['profile'] ?? ''; $c = $u['comment'] ?? '';
    if ($pr !== '') $profiles[$pr] = 1;
    if ($c !== '' && !$expOf($c)) $comments[$c] = isset($comments[$c]) ? $comments[$c] + 1 : 1;
    $isOn = isset($online[$u['name']]); $isNew = !$used($u) && !$expOf($c); $isDead = $isExp($u);
    $tags = ['' => 1, 'online' => $isOn, 'new' => $isNew, 'off' => !$isOn && !$isNew && !$isDead, 'exp' => $isDead];
    foreach ($tags as $k => $v) if ($v) $cnt[$k]++;
    if (!$tags[$f]) continue;
    if ($fProfile !== '' && $pr !== $fProfile) continue;
    if ($fComment !== '' && $c !== $fComment) continue;
    if ($q !== '' && strpos(strtolower($u['name'] . ' ' . $c . ' ' . ($u['mac-address'] ?? '')), $q) === false) continue;
    $rows[] = $u;
}
ksort($profiles); krsort($comments);
$total = count($rows); $pages = max(1, (int)ceil($total / $per)); $pg = min($pg, $pages);
$view = array_slice($rows, ($pg - 1) * $per, $per);
$qs = array_filter(['profile' => $fProfile, 'comment' => $fComment, 'q' => get('q'), 'f' => $f], 'strlen');
$pqs = array_diff_key($qs, ['f' => 1]); // cetak: saringan dari router saja
if (in_array(get('export'), ['rsc', 'xlsx', 'csv'], true)) {
    $tag = preg_replace('/[^A-Za-z0-9_.\-]+/', '-', trim(($fProfile !== '' ? $fProfile : 'all') . ($fComment !== '' ? '-' . $fComment : ''), '-'));
    $fn = 'users-' . (router()['name'] ?? 'router') . '-' . $tag . '-' . date('Ymd-His');
    if (get('export') === 'rsc') {
        header('Content-Type: text/plain; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9_.\-]/', '', $fn) . '.rsc"');
        echo '# ' . count($rows) . ' hotspot user, ' . date('Y-m-d H:i') . "\n/ip hotspot user\n";
        foreach ($rows as $u) {
            $kv = ['server' => $u['server'] ?? 'all', 'name' => $u['name'], 'password' => $u['password'] ?? '', 'profile' => $u['profile'] ?? 'default'];
            $lu = (string)($u['limit-uptime'] ?? ''); if (!in_array($lu, ['', '0s', '00:00:00'], true)) $kv['limit-uptime'] = $lu;
            if ((float)($u['limit-bytes-total'] ?? 0) > 0) $kv['limit-bytes-total'] = $u['limit-bytes-total'];
            if (($u['comment'] ?? '') !== '') $kv['comment'] = $u['comment'];
            $line = 'add';
            foreach ($kv as $k => $v) $line .= ' ' . $k . '="' . addcslashes((string)$v, "\"\\$") . '"';
            echo $line . "\n";
        }
        exit;
    }
    $data = [];
    foreach ($rows as $u) $data[] = [$u['server'] ?? 'all', $u['name'], $u['password'] ?? '', $u['profile'] ?? '', $u['mac-address'] ?? '', dur_fmt($u['uptime'] ?? ''),
        (int)($u['bytes-in'] ?? 0), (int)($u['bytes-out'] ?? 0), $u['limit-uptime'] ?? '', (int)($u['limit-bytes-total'] ?? 0), $u['comment'] ?? ''];
    xlsx_send(preg_replace('/[^A-Za-z0-9_.\-]/', '', $fn) . '.xlsx', ['Server', 'Name', 'Password', 'Profile', 'MAC Address', 'Uptime', 'Bytes In', 'Bytes Out', 'Limit Uptime', 'Limit Bytes Total', 'Comment'], $data);
}
$tiles = ['' => ['Total Voucher', 'ticket', 'blue'], 'online' => ['Online', 'link', 'green'], 'new' => ['Belum Dipakai', 'wifi', 'gray'], 'exp' => ['Expired', 'clock', 'amber']];

page_head('User List');

// pop up hasil Generate (sekali tampil), dengan tombol cetak langsung
$gd = $_SESSION['gen_done'] ?? null; unset($_SESSION['gen_done']);
if ($gd) {
    $pu = function ($tpl, $qr) use ($gd) { return url('voucher_print', ['comment' => $gd['comment'], 'tpl' => $tpl, 'qr' => $qr]); };
    $rows = ['Generate Code' => $gd['code'], 'Date' => $gd['date'], 'Profile' => $gd['profile'], 'Validity' => $gd['validity'],
        'Time Limit' => $gd['uptime'], 'Data Limit' => $gd['data'], 'Price' => $gd['price'] ? money($gd['price']) : '-',
        'Selling Price' => $gd['sprice'] ? money($gd['sprice']) : '-', 'Lock User' => $gd['lock'], 'Qty' => $gd['qty']];
    if ($gd['note'] !== '') $rows = array_slice($rows, 0, 2, true) + ['Comment' => $gd['note']] + array_slice($rows, 2, null, true);
    echo '<dialog class="dlg gendlg" id="gendlg" aria-labelledby="gendlg-t"><div class="genhead">' . icon('ticket') . '<h3 id="gendlg-t">' . h($gd['code'] . ' - ' . $gd['date']) . '</h3>'
        . '<button type="button" class="genx" aria-label="Tutup" onclick="this.closest(\'dialog\').close()">×</button></div>'
        . '<p class="genok">' . h($gd['qty']) . ' voucher berhasil dibuat.</p><table class="gentbl"><tbody>';
    foreach ($rows as $k => $v) echo '<tr><th>' . h($k) . '</th><td>' . h((string)$v) . '</td></tr>';
    echo '</tbody></table><div class="genfoot">'
        . '<a class="btn primary" target="_blank" autofocus href="' . h($pu('default', 'no')) . '">' . icon('print') . 'Print</a>'
        . '<a class="btn" target="_blank" href="' . h($pu('default', 'yes')) . '">' . icon('print') . 'QR</a>'
        . '<a class="btn" target="_blank" href="' . h($pu('small', 'no')) . '">' . icon('print') . 'Small</a></div></dialog>'
        . '<script>(function(){var d=document.getElementById("gendlg");if(d&&d.showModal){d.showModal();d.addEventListener("click",function(e){if(e.target===d)d.close();});}})();</script>';
}
?>

<form method="post" id="hv-form"><?= csrf_field() ?>
<input type="hidden" name="act" value="delete"><input type="hidden" name="to" value="">
<section class="card">
<div class="cardhead"><?= icon('user') ?><strong>Users</strong><span class="muted hscnt"><?= (int)$total ?> total</span>
<span class="spacer"></span>
<button class="btn small bad" id="hv-bulk" data-confirm="Hapus voucher yang dicentang?" data-comment="<?= h($fComment) ?>" data-total="<?= (int)$total ?>">Remove 0</button><?php if ($fComment !== '') { ?><input type="hidden" name="comment" value="<?= h($fComment) ?>"><?php } ?>
<a class="hl" href="<?= h(url('hs_users', $qs + ['fresh' => 1])) ?>" title="Reload Data" aria-label="Reload Data"><?= icon('reload') ?></a><span class="muted hsuat" title="Waktu data diambil dari router. Klik Reload untuk mengambil ulang sekarang.">Data <?= date('H:i:s', hs_users_at() ?: time()) ?></span>
<?php if ($view) { ?>
<details class="xdd printdd"><summary class="btn small" title="Mencetak voucher yang dicentang. Bila tidak ada yang dicentang, semua voucher yang tampil di tabel dicetak."><?= icon('print') ?>Print<?= icon('chev') ?></summary><div class="xmenu">
<div class="xhint">Yang dicentang, atau semua yang tampil</div>
<button type="button" data-print="default" data-qr="no">Default<small>Kartu voucher standar</small></button>
<button type="button" data-print="default" data-qr="yes">QR<small>Voucher dengan kode QR</small></button>
<button type="button" data-print="small" data-qr="no">Small<small>Ringkas, cocok untuk thermal</small></button>
</div></details>
<?php } ?>
<?= export_btn('hs_users', $qs) ?>
<a class="hl" href="<?= h(url('hs_generate', $fProfile !== '' ? ['profile' => $fProfile] : [])) ?>"><?= icon('plus') ?>Generate</a>
<a class="hl" href="<?= url('hs_generate', ['one' => 1]) ?>"><?= icon('plus') ?>Add User</a>
</div>
<div class="cardbody">
<div class="hsfilter">
<input type="search" class="filter" form="hv-search" name="q" id="hv-q" value="<?= h(get('q')) ?>" placeholder="Search name, comment…" title="Menyaring sambil mengetik; tekan Enter untuk mencari di semua voucher" aria-label="Search"<?= $view ? ' data-filter="#tbl"' : '' ?>>
<select aria-label="Profile" onchange="location.href=this.value"><?php
    $base = array_diff_key($qs, ['profile' => 1, 'pg' => 1]);
    echo '<option value="' . h(url('hs_users', $base)) . '">All Profile</option>';
    foreach ($profiles as $k => $_) echo '<option value="' . h(url('hs_users', ['profile' => $k] + $base)) . '"' . ($k === $fProfile ? ' selected' : '') . '>' . h($k) . '</option>'; ?></select>
<select aria-label="Comment" onchange="location.href=this.value"><?php
    $base = array_diff_key($qs, ['comment' => 1, 'pg' => 1]);
    echo '<option value="' . h(url('hs_users', $base)) . '">All Comment</option>';
    foreach ($comments as $k => $n) echo '<option value="' . h(url('hs_users', ['comment' => $k] + $base)) . '"' . ($k === $fComment ? ' selected' : '') . '>' . h($k . ' (' . $n . ')') . '</option>'; ?></select>
<select aria-label="Status" onchange="location.href=this.value"<?= $f !== '' ? ' style="border-color:var(--accent);color:var(--accent);font-weight:600"' : '' ?>><?php
    $base = array_diff_key($qs, ['f' => 1, 'pg' => 1]);
    foreach (['' => 'All Status', 'online' => 'Online', 'new' => 'Belum dipakai', 'off' => 'Offline', 'exp' => 'Expired'] as $k => $v)
        echo '<option value="' . h(url('hs_users', ($k === '' ? [] : ['f' => $k]) + $base)) . '"' . ($k === $f ? ' selected' : '') . '>' . h($v) . ' (' . (int)$cnt[$k] . ')</option>'; ?></select>
<?php if ($qs) { ?><a class="btn small ghost" href="<?= url('hs_users') ?>">Clear Filter</a><?php } ?>

<?php if ($view) { ?><span class="hsnote">Print memakai baris yang dicentang, atau semua yang tampil</span><?php } ?>
</div>
<?php if (!$view) { ?>
<div class="empty"><p class="emptytitle"><?= $qs ? 'Tidak ada voucher yang cocok dengan saringan ini.' : 'Belum ada voucher.' ?></p><?php if (!$qs) { ?><p><a class="btn primary" href="<?= url('hs_generate') ?>">Generate voucher</a></p><?php } ?></div>
<?php } else { ?>
<div class="tablewrap"><table id="tbl" class="grid-t sortable" data-no-start="<?= ($pg - 1) * $per ?>">
<thead><tr><th class="chk nosort"><input type="checkbox" data-checkall aria-label="Pilih semua"></th><th>Server</th><th>Name</th><th>Profile</th><th>Uptime</th><th class="r">Bytes In</th><th class="r">Bytes Out</th><th>Comment</th><th class="nosort"></th></tr></thead>
<tbody>
<?php foreach ($view as $u) {
    $off = ($u['disabled'] ?? '') === 'true'; $n = $u['name']; $on = isset($online[$n]); $cm = (string)($u['comment'] ?? '');
    $ex = $expOf($cm); $dead = $isExp($u);
    $st = $off ? 'Disabled' : ($on ? 'Online ' . $online[$n] : ($dead ? 'Expired' : 'Offline'));
    ?>
<tr data-href="<?= h(url('hs_generate', ['id' => $u['.id']])) ?>"<?= $off || $dead ? ' class="off"' : '' ?>>
<td class="chk"><input type="checkbox" name="ids[]" value="<?= h($u['.id']) ?>" aria-label="Pilih <?= h($n) ?>"></td>
<td><?= h($u['server'] ?? 'all') ?></td>
<td class="key mono" data-v="<?= h($n) ?>"><a class="namelink" href="<?= h(url('hs_generate', ['id' => $u['.id']])) ?>"><?= h($n) ?></a><?= $off ? '<span class="stb">' . badge('Disabled', 'warn') . '</span>' : '' ?></td>
<td><?= h($u['profile'] ?? '') ?></td>
<td class="mono" data-v="<?= dur_secs($u['uptime'] ?? '') ?>"><?= h(dur_fmt($u['uptime'] ?? '')) ?></td>
<td class="r" data-v="<?= (float)($u['bytes-in'] ?? 0) ?>"><?= bytes($u['bytes-in'] ?? 0) ?></td>
<td class="r" data-v="<?= (float)($u['bytes-out'] ?? 0) ?>"><?= bytes($u['bytes-out'] ?? 0) ?></td>
<td data-v="<?= h($ex ? ros_date($ex[0]) . substr($ex[0], -8) : $cm) ?>"><?php if ($cm !== '') { ?><a href="<?= h(url('hs_users', ['comment' => $cm])) ?>" title="Saring comment ini" aria-label="Saring comment <?= h($cm) ?>" style="margin-right:.3rem;text-decoration:none">&#128269;</a><?php } ?><span class="ell" title="<?= h($cm) ?>"><?= h($cm) ?></span><?= !$ex && isset($legacy[$n]) && $legacy[$n] !== '' ? ' <span class="muted">(habis ' . h($legacy[$n]) . ')</span>' : '' ?></td>
<td class="acts"><?= row_menu([
    '<a href="' . h(url('hs_generate', ['id' => $u['.id']])) . '">Edit</a>',
    '<a target="_blank" href="' . h(url('voucher_print', ['user' => $n, 'qr' => 'no'])) . '">Print</a>',
    '<a target="_blank" href="' . h(url('voucher_print', ['user' => $n, 'qr' => 'yes'])) . '">Print QR</a>',
        $on ? '<button name="id" value="' . h($u['.id']) . '" onclick="this.form.act.value=\'kick\'">Remove Active</button>' : '',
    '<button name="id" value="' . h($u['.id']) . '" onclick="this.form.act.value=\'toggle\';this.form.to.value=\'' . ($off ? 'no' : 'yes') . '\'">' . ($off ? 'Enable' : 'Disable') . '</button>',
    '<button name="id" value="' . h($u['.id']) . '" onclick="this.form.act.value=\'reset\'">Reset counters</button>',
    '<button class="danger" name="id" value="' . h($u['.id']) . '" data-confirm="Hapus voucher ' . h($n) . '?" onclick="this.form.act.value=\'delete\'">Remove</button>',
]) ?></td>
</tr>
<?php } ?>
</tbody>
</table></div>
<?= pager_html($total, $pg, $per, function ($p, $s) use ($qs) { return url('hs_users', $qs + ['pg' => $p, 'per' => $s]); }) ?>
<?php } ?>
</div>
</section>
</form>
<form method="get" id="hv-search"><input type="hidden" name="p" value="hs_users"><?php foreach (array_diff_key($qs, ['q' => 1, 'pg' => 1]) as $k => $v) echo '<input type="hidden" name="' . h($k) . '" value="' . h($v) . '">'; ?></form>
<script>
(function () {
    var f = document.getElementById('hv-form'), b = document.getElementById('hv-bulk');
    if (!f || !b) return;
    // satu tombol Remove: ada yang dicentang = hapus yang dicentang; tidak ada tetapi daftar disaring per comment = hapus semua voucher comment itu
    var cm = b.dataset.comment || '', tot = b.dataset.total || '0';
    var picked = function () { return f.querySelectorAll('tbody input[type=checkbox]:checked').length; };
    b.addEventListener('click', function () {
        var n = picked();
        f.act.value = n || !cm ? 'delete' : 'delete_comment';
        b.dataset.confirm = n || !cm ? 'Hapus ' + n + ' voucher yang dicentang?' : 'Hapus semua ' + tot + ' voucher dengan comment ' + cm + '?';
    });
    // Print: yang dicentang; bila tidak ada yang dicentang dan daftar disaring (comment / profil / pencarian),
    // cetak SEMUA voucher hasil saringan itu (semua halaman), bukan hanya 50 yang tampil di halaman ini
    var flt = <?= json_encode(array_filter(['comment' => $fComment, 'profile' => $fProfile, 'q' => get('q'), 'f' => $f], 'strlen')) ?>;
    document.querySelectorAll('[data-print]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var all = Array.prototype.slice.call(f.querySelectorAll('tbody input[name="ids[]"]'));
            var boxes = all.filter(function (c) { return c.closest('tr').style.display !== 'none'; });
            var pick = boxes.filter(function (c) { return c.checked; });
            if (!pick.length && Object.keys(flt).length && boxes.length === all.length) {
                var qs = Object.keys(flt).map(function (k) { return k + '=' + encodeURIComponent(flt[k]); }).join('&');
                window.open(<?= json_encode(url('voucher_print')) ?> + '&' + qs + '&tpl=' + btn.dataset.print + '&qr=' + btn.dataset.qr, '_blank');
                return;
            }
            if (!pick.length) pick = boxes;
            if (!pick.length) return;
            var pf = document.createElement('form');
            pf.method = 'post'; pf.target = '_blank';
            pf.action = <?= json_encode(url('voucher_print')) ?> + '&tpl=' + btn.dataset.print + '&qr=' + btn.dataset.qr;
            var add = function (n, v) { var i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; pf.appendChild(i); };
            add('_t', f.querySelector('input[name=_t]').value); add('act', 'print');
            pick.forEach(function (c) { add('ids[]', c.value); });
            document.body.appendChild(pf); pf.submit(); pf.remove();
        });
    });
    var q = document.getElementById('hv-q');
    if (q) q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('hv-search').submit(); } });
    var u = function () { setTimeout(function () { var n = picked(); b.classList.toggle('on', n > 0 || cm !== ''); b.textContent = n || !cm ? 'Remove ' + n : 'Remove by Comment'; }, 0); };
    u();
    f.addEventListener('change', u); f.addEventListener('click', u);
})();
</script>
<script>
document.querySelectorAll('.printdd [data-print]').forEach(function (b) { b.addEventListener('click', function () { var d = b.closest('details'); if (d) d.removeAttribute('open'); }); });
</script>
<?php
page_foot();