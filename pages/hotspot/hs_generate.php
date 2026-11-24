<?php
/** Generate (banyak sekaligus), Add User (satu), dan Edit User hotspot */
$editId = get('id'); $one = get('one') || $editId !== '';
$title = $editId !== '' ? 'Edit User' : ($one ? 'Add User' : 'Generate');
need_ros($title);

function limit_bytes($n, $unit)
{
    $n = (float)str_replace(',', '.', $n);
    return $n > 0 ? (string)(int)round($n * ($unit === 'GB' ? 1073741824 : 1048576)) : '0';
}

$CHARS = hs_charsets();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    hs_users_dirty(); // daftar voucher berubah: User List mengambil ulang dari router
    if (post('act') === 'delete' && $editId !== '') {
        $u = rq('/ip/hotspot/user/print', ['?.id' => $editId, '.proplist' => 'name']);
        if (rdo('/ip/hotspot/user/remove', ['.id' => $editId])) {
            if ($u) rremove('/ip/hotspot/active', array_column(rq('/ip/hotspot/active/print', ['?user' => $u[0]['name'], '.proplist' => '.id']), '.id'));
            flash('User ' . ($u ? $u[0]['name'] : '') . ' dihapus.');
        }
        redirect('hs_users');
    }
    $base = ['profile' => post('profile'), 'server' => post('server', 'all') ?: 'all'];
    $lu = strtolower(post('limit_uptime'));
    // jawaban JSON untuk Generate bertahap (dipanggil dari JS di halaman ini)
    $jout = function ($d) { header('Content-Type: application/json; charset=utf-8'); echo json_encode($d); exit; };
    $isJob = in_array(post('act'), ['gen_start', 'gen_step', 'gen_finish'], true);
    if ($lu !== '' && !valid_interval($lu)) {
        if ($isJob) $jout(['ok' => false, 'error' => 'Time Limit ditulis seperti 1h, 30m, 1d, atau 4w3d.']);
        flash('Time Limit ditulis seperti 1h, 30m, 1d, atau 4w3d.', 'err'); back();
    }
    $base['limit-uptime'] = $lu === '' ? '0' : $lu;
    $base['limit-bytes-total'] = limit_bytes(post('limit_data'), post('limit_unit'));

    if (post('act') === 'save_one') {
        $name = post('name'); $pass = (string)($_POST['password'] ?? '');
        if ($name === '') { flash('Isi Name.', 'err'); back(); }
        $p = $base + ['name' => $name, 'password' => $pass, 'comment' => post('comment')];
        if ($editId !== '') { $ok = rdo('/ip/hotspot/user/set', ['.id' => $editId] + $p); }
        else {
            $cm = (string)$p['comment']; // comment diawali vc-/up- supaya masa aktif dihitung saat login pertama
            if ($cm !== '' && !preg_match('/^(vc|up)/', $cm)) $p['comment'] = ($name === $pass ? 'vc-' : 'up-') . $cm;
            $ok = rdo('/ip/hotspot/user/add', $p);
        }
        if ($ok) {
            flash('User ' . $name . ' disimpan.');
            $row = rq('/ip/hotspot/user/print', ['?name' => $name, '.proplist' => '.id']);
            redirect('hs_generate', $row ? ['id' => $row[0]['.id']] : []); // tetap di halaman edit
        }
        back();
    }

    // ringkasan hasil Generate, ditampilkan sebagai pop up di User List supaya bisa langsung dicetak
    $done = function ($comment, $made, $profile, $lu, $bytesLimit) {
        $pr = rq('/ip/hotspot/user/profile/print', ['?name' => $profile, '.proplist' => 'on-login']);
        $pm = hs_meta($pr ? ($pr[0]['on-login'] ?? '') : '');
        $cp = explode('-', $comment, 4);
        $lb = (float)$bytesLimit;
        $_SESSION['gen_done'] = [
            'comment' => $comment, 'code' => $cp[1] ?? '', 'date' => $cp[2] ?? '', 'note' => $cp[3] ?? '',
            'profile' => $profile, 'validity' => $pm['validity'] !== '' ? $pm['validity'] : '-',
            'uptime' => $lu !== '' ? $lu : '-', 'data' => $lb > 0 ? bytes($lb) : '-',
            'price' => $pm['price'], 'sprice' => $pm['sprice'], 'lock' => $pm['lock'] ? 'Enable' : 'Disable', 'qty' => $made,
        ];
    };
    $opts = ['qty' => post('qty', '1'), 'len' => post('len', '4'), 'prefix' => post('prefix'), 'charset' => post('charset'), 'mode' => post('mode'),
        'profile' => post('profile'), 'server' => post('server'), 'limit_uptime' => $lu, 'limit_bytes' => $base['limit-bytes-total'], 'comment' => post('comment')];

    // Generate bertahap dengan progres: mulai -> buat 25 user per langkah -> selesai
    if (post('act') === 'gen_start') {
        @set_time_limit(120);
        $job = hs_gen_job_start($opts);
        $job['lu'] = $lu; $job['err'] = ''; $job['rid'] = router_id();
        $_SESSION['gen_job'] = $job;
        $jout(['ok' => true, 'want' => $job['qty'], 'comment' => $job['comment']]);
    }
    if (post('act') === 'gen_step') {
        @set_time_limit(120);
        $job = $_SESSION['gen_job'] ?? null;
        if (!$job) $jout(['ok' => false, 'error' => 'Proses generate tidak ditemukan. Ulangi Generate.']);
        // router dipindah di tab lain selagi Generate berjalan: hentikan, jangan lanjut membuat voucher di router lain
        if (($job['rid'] ?? '') !== router_id()) { $job['err'] = 'router dipindah ke router lain saat Generate berjalan'; $_SESSION['gen_job'] = $job; $jout(['ok' => false, 'made' => $job['made'], 'want' => $job['qty'], 'done' => true, 'error' => 'Generate dihentikan: router di panel dipindah ke router lain. ' . $job['made'] . ' voucher sudah dibuat di router sebelumnya.']); }
        $r = hs_gen_job_step($job, 25);
        $job['err'] = $r['err']; $job['full'] = $r['full'];
        $_SESSION['gen_job'] = $job;
        $end = $job['made'] >= $job['qty'] || $r['full'] || $r['err'] !== '';
        $jout(['ok' => $r['err'] === '', 'made' => $job['made'], 'want' => $job['qty'], 'done' => $end, 'full' => $r['full'], 'error' => $r['err'] !== '' ? 'Router menolak: ' . $r['err'] : '']);
    }
    if (post('act') === 'gen_finish') {
        $job = $_SESSION['gen_job'] ?? null; unset($_SESSION['gen_job']);
        if (!$job) $jout(['ok' => true, 'url' => url('hs_users')]);
        if (!empty($job['err'])) flash('Router menolak setelah ' . $job['made'] . ' user: ' . $job['err'], 'err');
        elseif ($job['made'] < $job['qty']) flash('Hanya ' . $job['made'] . ' dari ' . $job['qty'] . ' user yang bisa dibuat: kombinasi nama dengan panjang dan Character ini hampir habis. Perbesar Length atau pakai Character campuran.', 'err');
        if ($job['made']) $done($job['comment'], $job['made'], $job['base']['profile'], $job['lu'], $job['base']['limit-bytes-total']);
        $jout(['ok' => true, 'url' => $job['made'] ? url('hs_users', ['comment' => $job['comment']]) : url('hs_generate')]);
    }

    // Generate biasa (tanpa JS): sekaligus, dibatasi 500 supaya tidak diputus hosting (lewat halaman biasa sampai 2000 dengan progres)
    $opts['qty'] = min(500, (int)$opts['qty']);
    $res = hs_generate_users($opts);
    $made = $res['made']; $comment = $res['comment']; $want = max(1, min(2000, (int)post('qty', '1')));
    if ($res['err'] !== '') flash('Router menolak setelah ' . $made . ' user: ' . $res['err'], 'err');
    elseif ($res['full']) flash('Hanya ' . $made . ' dari ' . $want . ' user yang bisa dibuat: kombinasi nama dengan panjang dan Character ini hampir habis. Perbesar Length atau pakai Character campuran.', 'err');
    if ($made) { $done($comment, $made, post('profile'), $lu, $base['limit-bytes-total']); redirect('hs_users', ['comment' => $comment]); }
    back();
}

$profiles = rq('/ip/hotspot/user/profile/print', ['.proplist' => 'name,on-login']);
$servers = rq('/ip/hotspot/print', ['.proplist' => 'name']);
$e = ['name' => '', 'password' => '', 'profile' => get('profile'), 'server' => 'all', 'limit-uptime' => '', 'limit-bytes-total' => 0, 'comment' => ''];
$online = null;
if ($editId !== '') {
    $r = rq('/ip/hotspot/user/print', ['?.id' => $editId]);
    if (!$r) { flash('User tidak ditemukan.', 'err'); redirect('hs_users'); }
    $e = $r[0] + $e;
    $a = rq('/ip/hotspot/active/print', ['?user' => $e['name'], '.proplist' => 'address,uptime']);
    $online = $a ? $a[0] : null;
}
$lb = (float)$e['limit-bytes-total']; $unit = $lb >= 1073741824 ? 'GB' : 'MB';
$lbv = $lb > 0 ? rtrim(rtrim(number_format($lb / ($unit === 'GB' ? 1073741824 : 1048576), 2, '.', ''), '0'), '.') : '';
$lu = in_array($e['limit-uptime'], ['', '0s', '00:00:00'], true) ? '' : $e['limit-uptime'];

/** <option> profil dengan data Validity / Price / Selling Price / Lock User untuk baris info di bawah formulir. */
$popt = function ($p, $cur) {
    $m = hs_meta($p['on-login'] ?? '');
    return '<option value="' . h($p['name']) . '"' . ((string)$p['name'] === (string)$cur ? ' selected' : '')
        . ' data-val="' . h($m['validity']) . '" data-price="' . h($m['price'] ? money($m['price'], false) : '') . '"'
        . ' data-sprice="' . h($m['sprice'] ? money($m['sprice'], false) : '') . '" data-lock="' . ($m['lock'] ? 'Enable' : 'Disable') . '">' . h($p['name']) . '</option>';
};
$srvSel = '<select id="g_srv" name="server">' . opt('all', $e['server'], 'all');
foreach ($servers as $s) $srvSel .= opt($s['name'], $e['server']);
$srvSel .= '</select>';

/* Last Generate: kelompok dari comment vc-/up-<kode>-<tanggal>- */
$last = [];
if (!$one) {
    $prof = [];
    foreach (rq('/ip/hotspot/user/print', ['.proplist' => 'profile,comment']) as $u) {
        if (!preg_match('/^(vc|up)-(\d+)-(\d{2}\.\d{2}\.\d{2})-/', (string)($u['comment'] ?? ''), $m)) continue;
        $k = $m[2] . '|' . $m[3];
        if (!isset($last[$k])) $last[$k] = ['code' => $m[2], 'date' => $m[3], 'profile' => $u['profile'] ?? '', 'qty' => 0, 'comment' => $u['comment'],
            'sort' => '20' . substr($m[3], 6, 2) . substr($m[3], 0, 2) . substr($m[3], 3, 2)];
        $last[$k]['qty']++;
    }
    uasort($last, function ($a, $b) { return strcmp($b['sort'], $a['sort']) ?: strcmp($b['code'], $a['code']); });
    $last = array_slice($last, 0, 10);
}

page_head($title, '', ['User List', url('hs_users')]);
?>
<div class="split">
<form method="post" class="card" id="genform">
<?= csrf_field() ?>
<div class="cardhead"><?= icon($one ? 'user' : 'ticket') ?><strong><?= $editId !== '' ? 'Edit User' : ($one ? 'Add User' : 'Generate User') ?></strong><span class="spacer"></span><a class="x" href="<?= url('hs_users') ?>" title="Tutup" aria-label="Tutup">&times;</a></div>
<div class="cardbody">
<div class="btnrow">
<?php if (!$one) { ?><a class="btn" href="<?= url('hs_users') ?>"><?= icon('user') ?>User List</a><?php } ?>
<button class="btn primary" name="act" value="<?= $one ? 'save_one' : 'generate' ?>"><?= icon('save') ?><?= $one ? 'Save' : 'Generate' ?></button>
<?php if ($editId !== '') { ?>
<button class="btn bad" name="act" value="delete" formnovalidate data-confirm="Hapus user <?= h($e['name']) ?> dari router?"><?= icon('trash') ?>Remove</button>
<a class="btn ghost" target="_blank" href="<?= h(url('voucher_print', ['id' => $editId])) ?>"><?= icon('ticket') ?>Print</a>
<?php } ?>
</div>
<?php if ($one) { ?>
<div class="frow"><label for="g_srv">Server</label><?= $srvSel ?></div>
<div class="frow"><label for="g_name">Name</label><input id="g_name" name="name" value="<?= h($e['name']) ?>" required autocomplete="off"></div>
<div class="frow"><label for="g_pass">Password</label><div class="join"><input id="g_pass" name="password" type="password" value="<?= h($e['password']) ?>" autocomplete="new-password"><button type="button" class="btn eye" data-eye="#g_pass" title="Lihat kata sandi" aria-label="Lihat kata sandi"><?= icon('eye') ?></button></div></div>
<?php } else { ?>
<div class="frow"><label for="g_qty">Qty</label><input id="g_qty" name="qty" type="number" min="1" max="2000" value="1" required></div>
<div class="frow"><label for="g_srv">Server</label><?= $srvSel ?></div>
<div class="frow"><label for="g_mode">User Mode</label><select id="g_mode" name="mode"><option value="up">Username &amp; Password</option><option value="vc">Username = Password</option></select></div>
<div class="frow"><label for="g_len">Name Length</label><select id="g_len" name="len"><?php foreach ([4, 3, 4, 5, 6, 7, 8] as $i => $n) if ($i) echo opt($n, 4); ?></select></div>
<div class="frow"><label for="g_prefix">Prefix</label><input id="g_prefix" name="prefix" maxlength="6" pattern="[A-Za-z0-9]*" autocomplete="off"></div>
<div class="frow"><label for="g_set">Character</label><select id="g_set" name="charset"><?php foreach ($CHARS as $k => $v) echo opt($k, 'lower', $v); ?></select></div>
<?php } ?>
<div class="frow"><label for="g_prof">Profile</label><select id="g_prof" name="profile" required><?php foreach ($profiles as $p) echo $popt($p, $e['profile']); ?></select></div>
<div class="frow"><label for="g_lu">Time Limit</label><input id="g_lu" name="limit_uptime" value="<?= h($lu) ?>" pattern="(\d+[wdhmsWDHMS])+|\d{1,2}:\d{2}:\d{2}"></div>
<div class="frow"><label for="g_ld">Data Limit</label><div class="join"><input id="g_ld" name="limit_data" inputmode="decimal" value="<?= h($lbv) ?>"><select name="limit_unit" aria-label="Satuan"><?= opt('MB', $unit) . opt('GB', $unit) ?></select></div></div>
<div class="frow"><label for="g_cmt">Comment</label><input id="g_cmt" name="comment" value="<?= h($e['comment']) ?>" autocomplete="off"></div>
<p id="g_info" hidden></p>
</div>
<script>
(function () {
    var s = document.getElementById('g_prof'), info = document.getElementById('g_info');
    var show = function () {
        var o = s.options[s.selectedIndex], d = o ? o.dataset : {};
        info.textContent = 'Validity: ' + (d.val || '-') + '   Price: ' + (d.price || '-') + '   Selling Price: ' + (d.sprice || '-') + '   Lock User: ' + (d.lock || '-');
    };
    s.addEventListener('change', show); show();
})();
(function () {
    // Generate dengan progres: persentase, jumlah yang sudah dibuat, dan catatan tiap kelipatan 100
    var f = document.getElementById('genform');
    if (!f || !f.querySelector('button[value=generate]')) return;
    var d = document.createElement('dialog');
    d.className = 'dlg genprog';
    d.innerHTML = '<div class="gphead"><span class="gpspin" aria-hidden="true"></span><h3>Generate voucher</h3></div>'
        + '<div class="gpbody"><div class="gpnums"><b class="gppct">0%</b><span class="gpcnt"></span></div>'
        + '<div class="gpbar"><i></i></div><ul class="gplog"></ul><p class="gperr" hidden></p></div>'
        + '<div class="gpfoot" hidden><button type="button" class="btn primary gpgo">View Voucher</button></div>';
    document.body.appendChild(d);
    var pct = d.querySelector('.gppct'), cnt = d.querySelector('.gpcnt'), bar = d.querySelector('.gpbar i'), log = d.querySelector('.gplog'), err = d.querySelector('.gperr'), foot = d.querySelector('.gpfoot');
    var running = false, goUrl = '';
    d.addEventListener('cancel', function (e) { if (running) e.preventDefault(); });
    var nf = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
    var line = function (t, cls) { var li = document.createElement('li'); li.textContent = t; if (cls) li.className = cls; log.appendChild(li); log.scrollTop = log.scrollHeight; };
    var post = function (act) {
        var fd = new FormData(f); fd.set('act', act);
        return fetch(location.href, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (r) { return r.json(); });
    };
    var show = function (made, want) {
        var p = want ? Math.floor(made / want * 100) : 0;
        pct.textContent = p + '%'; bar.style.width = p + '%';
        cnt.textContent = nf(made) + ' dari ' + nf(want) + ' voucher dibuat';
    };
    var finish = function () {
        post('gen_finish').then(function (r) { goUrl = r.url || ''; if (!err.hidden) { foot.hidden = false; running = false; d.querySelector('.gpspin').hidden = true; } else location.href = goUrl; })
            .catch(function () { location.reload(); });
    };
    var fail = function (t) { err.textContent = t; err.hidden = false; running = false; d.classList.add('bad'); finish(); };
    d.querySelector('.gpgo').addEventListener('click', function () { location.href = goUrl || location.href; });
    f.addEventListener('submit', function (e) {
        var b = e.submitter;
        if (e.defaultPrevented || !b || b.value !== 'generate' || !window.fetch || !d.showModal) return;
        e.preventDefault();
        log.textContent = ''; err.hidden = true; foot.hidden = true; d.classList.remove('bad'); d.querySelector('.gpspin').hidden = false;
        running = true; d.showModal();
        cnt.textContent = 'Menyiapkan…'; pct.textContent = '0%'; bar.style.width = '0%';
        var mark = 0;
        post('gen_start').then(function (r) {
            if (!r.ok) return fail(r.error || 'Generate gagal dimulai.');
            var want = r.want; show(0, want);
            line('Mulai membuat ' + nf(want) + ' voucher (comment ' + r.comment + ')');
            var step = function () {
                post('gen_step').then(function (s) {
                    show(s.made, s.want);
                    while (mark + 100 <= s.made) { mark += 100; line('✓ ' + nf(mark) + ' voucher berhasil dibuat', 'ok'); }
                    if (!s.ok) return fail(s.error || 'Router menolak.');
                    if (s.done) {
                        if (s.made > mark) line('✓ ' + nf(s.made) + ' voucher berhasil dibuat', 'ok');
                        if (s.full) return fail('Hanya ' + nf(s.made) + ' dari ' + nf(s.want) + ' voucher yang bisa dibuat: kombinasi nama hampir habis. Perbesar Length atau pakai Character campuran.');
                        line('Selesai. Membuka daftar voucher…');
                        running = false; return finish();
                    }
                    step();
                }).catch(function () { fail('Koneksi ke panel terputus. Voucher yang sudah dibuat tetap tersimpan di router.'); });
            };
            step();
        }).catch(function () { fail('Tidak ada jawaban dari panel. Coba lagi.'); });
    });
})();
</script>
</form>

<section class="card">
<?php if (!$one) { ?>
<div class="cardhead"><?= icon('ticket') ?><strong>Last Generate</strong></div>
<div class="cardbody">
<?php if ($last) { ?>
<div class="tablewrap"><table class="readme"><thead><tr><th>Generate Code</th><th>Date</th><th>Profile</th><th>Comment</th><th class="r">Qty</th></tr></thead><tbody>
<?php foreach ($last as $g) { ?>
<tr><td><a class="namelink" href="<?= h(url('hs_users', ['comment' => $g['comment']])) ?>"><b><?= h($g['code']) ?></b></a></td><td><?= h($g['date']) ?></td><td><?= h($g['profile']) ?></td><td><?php $note = trim(preg_replace('/^(vc|up)-\d+-\d{2}\.\d{2}\.\d{2}-?/', '', $g['comment'])); // comment yang diisi manual saat Generate; kosong = pakai comment otomatis
echo $note !== '' ? h($note) : '<span class="mono">' . h($g['comment']) . '</span>'; ?></td><td class="r"><?= (int)$g['qty'] ?></td></tr>
<?php } ?>
</tbody></table></div>
<?php } else { ?><p class="muted">Belum ada hasil Generate di router.</p><?php } ?>
<p class="hint">Format Time Limit.<br>[wdhm] Contoh: 30d = 30 hari, 12h = 12 jam, 4w3d = 31 hari.</p>
<p class="hint">Add User dengan Time Limit.<br>Sebaiknya Time Limit &lt; Validity.</p>
</div>
<?php } else { ?>
<?php if ($editId !== '') { ?>
<div class="cardhead"><?= icon('user') ?><strong>Pemakaian</strong></div><div class="cardbody">
<table class="kv"><tbody>
<tr><th>Status</th><td><?php
    $stExp = in_array((string)($e['limit-uptime'] ?? ''), ['1s', '00:00:01'], true);
    $stUp = (string)($e['uptime'] ?? '');
    $stNew = ($stUp === '' || dur_secs($stUp) <= 0) && !preg_match('/^([a-z]{3}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}/', (string)($e['comment'] ?? ''));
    if ($online) echo badge('Online', 'ok') . ' ' . h($online['address'] ?? '');
    elseif (($e['disabled'] ?? '') === 'true') echo badge('Disabled', 'warn');
    elseif ($stExp) echo badge('Expired', 'bad');
    elseif ($stNew) echo badge('Belum dipakai', 'info');
    else echo '<span class="muted">Offline</span>';
?></td></tr>
<tr><th>MAC Address</th><td class="mono"><?= h($e['mac-address'] ?? '') ?: '<span class="muted">-</span>' ?></td></tr>
<tr><th>Uptime</th><td class="mono"><?= h(dur_fmt($e['uptime'] ?? '')) ?></td></tr>
<tr><th>Bytes In / Out</th><td><?= bytes($e['bytes-in'] ?? 0) ?> / <?= bytes($e['bytes-out'] ?? 0) ?></td></tr>
</tbody></table></div>
<?php } ?>
<div class="cardhead"><?= icon('info') ?><strong>Read Me</strong></div>
<div class="cardbody">
<p class="hint">Format Time Limit.<br>[wdhm] Contoh: 30d = 30 hari, 12h = 12 jam, 4w3d = 31 hari.</p>
<p class="hint">Add User dengan Time Limit.<br>Sebaiknya Time Limit &lt; Validity.</p>
<p class="hint">Comment kosong atau diawali vc / up supaya masa aktif profil dihitung saat login pertama. Comment lain otomatis diberi awalan up- (atau vc- bila Name = Password).</p>
</div>
<?php } ?>
</section>
</div>
<?php page_foot();