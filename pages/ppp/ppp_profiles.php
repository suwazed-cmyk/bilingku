<?php
need_ros('PPP Profiles');
$iso = (string)setting('isolir_profile');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $pk = packages();
    if (post('act') === 'delete') {
        $name = post('name');
        if (rdo('/ppp/profile/remove', ['.id' => post('id')])) {
            unset($pk[$name]); db_save(rkey('packages'), $pk);
            $pf = db_load(rkey('pfup')); unset($pf[$name]); db_save(rkey('pfup'), $pf);
            $n = fup_remove($name);
            $pools = array_column(rq('/ip/pool/print', ['?comment' => pool_tag($name), '.proplist' => '.id']), '.id');
            $np = rremove('/ip/pool', $pools);
            flash('Profil ' . $name . ' dihapus.' . ($n >= 0 ? ' Address-list, firewall, dan aturan web proxy isolirnya ikut dihapus (' . $n . ' aturan).' : '') . ($np ? ' IP pool-nya ikut dihapus.' : ''));
        }
        redirect('ppp_profiles');
    }
    $id = post('id'); $name = post('name'); $old = post('old');
    if ($name === '') { flash('Isi nama profil.', 'err'); back(); }
    $isPen = post('penalty') === '1';           // form Isolir Profile
    $isFup = $isPen;                            // profil isolir: selalu address-list + firewall + web proxy
    $pf = db_load(rkey('pfup'));                // daftar profil penalty jenis FUP (hanya kecepatan)
    $list = preg_replace('/[^a-zA-Z0-9_\-]/', '', post('list')) ?: 'isolir';
    $html = null;
    if ($isFup && !empty($_FILES['page']['name']) && is_uploaded_file($_FILES['page']['tmp_name'])) {
        if (!preg_match('/\.html?$/i', $_FILES['page']['name']) || $_FILES['page']['size'] > 524288) { flash('File halaman isolir harus .html dan paling besar 512 KB.', 'err'); back(); }
        $html = (string)file_get_contents($_FILES['page']['tmp_name']);
    }

    $remote = post('remote');

    $unset = [];
    $p = ['name' => $name, 'only-one' => in_array(post('only'), ['yes', 'no'], true) ? post('only') : 'default', 'comment' => post('comment')];
    $vals = ['local-address' => post('local'), 'remote-address' => $remote, 'rate-limit' => post('rate'), 'dns-server' => post('dns'),
        'parent-queue' => post('parent'), 'address-list' => $isFup ? $list : post('alist')];
    foreach ($vals as $k => $v) {
        if ($v !== '') $p[$k] = $v;
        elseif ($id !== '') $unset[] = $k;
    }
    $ok = $id !== '' ? rdo('/ppp/profile/set', ['.id' => $id] + $p) : rdo('/ppp/profile/add', $p);
    if (!$ok) back();
    foreach ($unset as $k) rdo('/ppp/profile/unset', ['.id' => $id, 'value-name' => $k], true);
    if ($old !== '' && $old !== $name) { unset($pk[$old]); fup_remove($old); }
    if ($isPen) unset($pk[$name]); else $pk[$name] = money_in(post('harga'));
    db_save(rkey('packages'), $pk);
    if ($old !== '' && $old !== $name) unset($pf[$old]);
    unset($pf[$name]);
    db_save(rkey('pfup'), $pf);

    $msg = 'Profil ' . $name . ' disimpan.';
    if ($remote === '' || post('local') === '') flash('Perhatian: profil ' . $name . ' tanpa ' . implode(' dan ', array_filter([$remote === '' ? 'IP pool (Remote Address)' : '', post('local') === '' ? 'Local Address' : '']))
        . '. Setiap secret yang memakainya wajib diisi alamatnya sendiri, kalau tidak PPPoE tidak bisa tersambung.', 'warn');
    if ($isFup) {
        if ($html !== null) db_save(rkey('isopage'), ['html' => $html, 'name' => basename($_FILES['page']['name']), 'at' => date('Y-m-d H:i')]);
        if (post('page_reset') === '1') db_delete(rkey('isopage'));
        if (fup_setup($name, $list)) flash($msg . ' Isolir dipasang: address-list ' . $list . ', firewall, dan web proxy.');
        else flash($msg . ' Tetapi sebagian aturan isolir gagal dipasang. Periksa pesan di atas lalu simpan ulang profil ini.', 'warn');
    } else {
        $n = fup_remove($name);
        flash($msg . ($n >= 0 ? ' Aturan isolirnya dihapus.' : ''));
    }
    // tetap di halaman edit profil yang baru disimpan
    $row = rq('/ppp/profile/print', ['?name' => $name, '.proplist' => '.id']);
    redirect('ppp_profiles', $row ? ['edit' => $row[0]['.id']] : []);
}

$profiles = rq('/ppp/profile/print');
$pk = packages(); $fm = fup_meta(); $pfl = db_load(rkey('pfup'));
$editId = get('edit'); $form = get('add') !== ''; $e = null;
foreach ($profiles as $p) if ($editId !== '' && $p['.id'] === $editId) { $e = $p; $form = true; }

page_head('PPP Profiles');
if ($form) {
    $pools = rq('/ip/pool/print', ['.proplist' => 'name,ranges']);
    $queues = rq('/queue/simple/print', ['.proplist' => 'name']);
    $m = $e ? ($fm[$e['name']] ?? null) : null;
    $isPen = $m !== null || isset($pfl[$e['name'] ?? '']) || get('add') === 'fup' || ($e && $e['name'] === $iso);
    $isFup = $isPen; // bagian form penalty
    $penIso = $m !== null || (!$e && get('add') === 'fup') || ($e && $e['name'] === $iso && !isset($pfl[$e['name']]));
    $curRemote = (string)($e['remote-address'] ?? '');
    $known = $curRemote === '' || in_array($curRemote, array_column($pools, 'name'), true);
    $pg = db_load(rkey('isopage'));
    ?>
<div class="split">
<form method="post" class="card" enctype="multipart/form-data">
<?= csrf_field() ?><input type="hidden" name="id" value="<?= h($e['.id'] ?? '') ?>"><input type="hidden" name="old" value="<?= h($e['name'] ?? '') ?>"><?php if ($isPen) { ?><input type="hidden" name="penalty" value="1"><?php } ?>
<div class="cardhead"><?= icon('pie') ?><strong><?= $e ? 'Edit' : 'Add' ?> <?= $isPen ? 'Isolir' : 'PPP' ?> Profile</strong><span class="spacer"></span><a class="x" href="<?= url('ppp_profiles') ?>" title="Tutup" aria-label="Tutup">&times;</a></div>
<div class="cardbody">
<div class="btnrow"><button class="btn primary" name="act" value="save"><?= icon('save') ?>Save</button></div>
<div class="frow"><label for="p_name">Name</label><input id="p_name" name="name" value="<?= h($e['name'] ?? '') ?>" required placeholder="<?= $isFup ? 'isolir' : '20M' ?>"></div>
<div class="frow"><label for="p_local">Local Address</label><input id="p_local" name="local" value="<?= h($e['local-address'] ?? '') ?>" placeholder="192.168.22.1"></div>
<div class="frow"><label for="p_remote">Remote Address</label><div class="join"><select id="p_remote" name="remote" class="grow"><option value="">(tanpa pool)</option><?php
    if (!$known) echo opt($curRemote, $curRemote, $curRemote . ' (alamat tetap)');
    foreach ($pools as $x) echo opt($x['name'], $curRemote, $x['name'] . ' (' . ($x['ranges'] ?? '') . ')'); ?></select><button type="button" class="btn" data-open="#pooldlg"><?= icon('plus') ?>Add</button></div></div>
<div class="frow"><label for="p_rate">Rate Limit</label><input id="p_rate" name="rate" value="<?= h($e['rate-limit'] ?? '') ?>" placeholder="<?= $isFup ? '1M/1M' : '20M/20M' ?>"></div>
<div class="frow"><label for="p_only">Only One</label><select id="p_only" name="only"><?= opt('default', $e['only-one'] ?? 'default') . opt('yes', $e['only-one'] ?? '') . opt('no', $e['only-one'] ?? '') ?></select></div>
<div class="frow"><label for="p_parent">Parent Queue</label><input id="p_parent" name="parent" value="<?= h(($e['parent-queue'] ?? '') === 'none' ? '' : ($e['parent-queue'] ?? '')) ?>" list="queues" placeholder="none"><datalist id="queues"><?php foreach ($queues as $x) echo '<option value="' . h($x['name']) . '">'; ?></datalist></div>
<div class="frow"><label for="p_dns">DNS Server</label><input id="p_dns" name="dns" value="<?= h($e['dns-server'] ?? '') ?>" placeholder="8.8.8.8,1.1.1.1"></div>
<div class="frow"><label for="p_cmt">Comment</label><input id="p_cmt" name="comment" value="<?= h($e['comment'] ?? '') ?>"></div>

<?php if ($isFup) { ?>
<div class="fsep">Isolir</div>
<p class="hint" style="margin:0 0 .6rem">Pelanggan di profil ini masuk Address List; internet dihentikan dan semua situs HTTP diarahkan ke halaman pemberitahuan pembayaran.</p>
<div class="isoonly">
<div class="frow"><label for="p_list">Address List</label><input id="p_list" name="list" value="<?= h($m['list'] ?? ($e['address-list'] ?? 'isolir')) ?>" pattern="[A-Za-z0-9_\-]+" placeholder="isolir"></div>
<div class="frow"><label for="p_page">Halaman isolir (.html)</label><input id="p_page" name="page" type="file" accept=".html,.htm,text/html" style="height:auto;padding:.4rem .5rem"></div>
<p class="hint" style="margin:0 0 .6rem"><?= !empty($pg['html']) ? 'Terpasang: ' . h($pg['name'] ?? 'halaman unggahan') . ' (' . h($pg['at'] ?? '') . ').' : 'Belum ada unggahan, jadi dipakai halaman bawaan.' ?>
 <a target="_blank" rel="noopener" href="<?= h(isopage_url()) ?>">Preview</a></p>
<?php if (!empty($pg['html'])) { ?><div class="frow"><label for="p_reset">Halaman bawaan</label><select id="p_reset" name="page_reset"><?= opt('0', '0', 'Tetap pakai unggahan') . opt('1', '0', 'Buang unggahan, pakai halaman bawaan') ?></select></div><?php } ?>
</div>

<?php } else { ?>
<div class="fsep">Tagihan</div>
<div class="frow"><label for="p_alist">Address List</label><input id="p_alist" name="alist" value="<?= h($e['address-list'] ?? '') ?>" placeholder="opsional"></div>
<div class="frow"><label for="p_harga">Harga per bulan</label><input id="p_harga" name="harga" type="text" inputmode="numeric" data-money value="<?= !empty($pk[$e['name'] ?? '']) ? h(money($pk[$e['name']], false)) : '' ?>" placeholder="100.000"></div>
<?php } ?>
</div>
</form>
<?= pool_dialog(true) ?>
<section class="card">
<div class="cardhead"><?= icon('info') ?><strong>Read Me</strong></div>
<div class="cardbody">
<table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody>
<tr><td>Rate Limit</td><td>Batas kecepatan rx/tx (unggah/unduh pelanggan), misalnya 20M/20M.</td></tr>
<tr><td>Remote Address</td><td>Pilih IP pool yang ada di router, atau klik Add untuk membuat pool baru. Pelanggan mendapat IP bergantian dari pool. Untuk IP tetap, isi Remote Address di secret dengan alamat di luar rentang pool.</td></tr>
<tr><td>Only One</td><td>yes = satu secret hanya boleh dipakai satu perangkat.</td></tr>
<?php if ($isFup) { ?>
<tr><td>Isolir</td><td>Pelanggan di profil ini masuk Address List. Firewall hanya mengizinkan DNS dan halaman pemberitahuan, lalu web proxy mengalihkan semua situs HTTP ke halaman pemberitahuan pembayaran.</td></tr>
<tr><td>Halaman isolir</td><td>Satu file .html yang berdiri sendiri (gambar ditanam di dalam file, bukan file terpisah). Satu halaman dipakai untuk semua profil isolir di router ini.</td></tr>
<tr><td>Situs HTTPS</td><td>Tidak bisa dialihkan, jadi hanya gagal dibuka. Ponsel biasanya tetap memunculkan halaman isolir lewat pemeriksaan koneksi otomatis.</td></tr>
<tr><td>Remove</td><td>Address-list, aturan firewall, dan aturan web proxy yang dibuat di sini ikut dihapus. IP pool tidak ikut dihapus; kelola di menu IP Pool. Web proxy dimatikan lagi bila panel yang menyalakannya.</td></tr>
<?php } else { ?>
<tr><td>Harga per bulan</td><td>Dipakai sebagai tarif bawaan saat menambah secret dengan profil ini.</td></tr>
<tr><td>Profil Isolir</td><td>Dibuat lewat tombol Add Isolir di daftar profil, lalu dipilih sebagai Isolir Profile di PPP User.<?php if ($e) { ?> <a href="<?= h(url('ppp_profiles', ['edit' => $e['.id'], 'add' => 'fup'])) ?>">Jadikan profil ini profil isolir</a><?php } ?></td></tr>
<?php } ?>
</tbody></table>
</div>
</section>
</div>
<?php } else {
    $cnt = [];
    foreach (rq('/ppp/secret/print', ['.proplist' => 'profile']) as $s) { $k = $s['profile'] ?? ''; $cnt[$k] = ($cnt[$k] ?? 0) + 1; }
    ?>
<section class="card">
<div class="cardhead"><?= icon('pie') ?><strong>PPP Profiles</strong>
<a class="hl" href="<?= url('ppp_profiles', ['add' => 1]) ?>"><?= icon('plus') ?>Add</a>
<a class="hl" href="<?= h(url('ppp_profiles', ['add' => 'fup'])) ?>"><?= icon('plus') ?>Add Isolir</a>
<a class="hl" href="<?= url('ppp_profiles') ?>" title="Reload Data" aria-label="Reload Data"><?= icon('reload') ?></a>
<span class="spacer"></span></div>
<div class="cardbody">
<div class="tablewrap"><table id="tbl" class="grid-t sortable">
<thead><tr><th>Name</th><th>Local Address</th><th>Remote Address</th><th>Rate Limit</th><th>Only One</th><th>Address List</th><th>Parent Queue</th><th class="r">Harga / bulan</th><th class="r">Secrets</th><th>Comment</th><th class="nosort"></th></tr></thead><tbody>
<?php foreach ($profiles as $p) { $def = ($p['default'] ?? '') === 'true'; $isF = isset($fm[$p['name']]); ?>
<tr>
<td class="key"><a class="namelink" href="<?= h(url('ppp_profiles', ['edit' => $p['.id']])) ?>"><?= h($p['name']) ?></a><?= $isF ? ' ' . badge('Isolir', 'bad') : ($p['name'] === $iso ? ' ' . badge('Isolir bawaan · belum lengkap', 'warn') : '') ?></td>
<td class="mono"><?= h($p['local-address'] ?? '') ?></td><td class="mono"><?= h($p['remote-address'] ?? '') ?></td>
<td><?= h($p['rate-limit'] ?? '') ?></td><td><?= h($p['only-one'] ?? '') ?></td><td><?= h($p['address-list'] ?? '') ?></td><td><?= h(($p['parent-queue'] ?? '') === 'none' ? '' : ($p['parent-queue'] ?? '')) ?></td>
<td class="r" data-v="<?= (float)($pk[$p['name']] ?? 0) ?>"><?= !empty($pk[$p['name']]) ? money($pk[$p['name']]) : '' ?></td><td class="r"><?= (int)($cnt[$p['name']] ?? 0) ?></td>
<td><?= h($p['comment'] ?? '') ?></td>
<td class="acts">
<?= row_menu([
    '<a href="' . h(url('ppp_profiles', ['edit' => $p['.id']])) . '">Edit</a>',
    $def ? '' : confirm_btn('Remove', 'delete', ['id' => $p['.id'], 'name' => $p['name']],
        'Hapus profil ' . $p['name'] . '?' . ($isF ? ' Address-list, firewall, dan aturan web proxy isolirnya ikut dihapus.' : ''), 'danger'),
]) ?>
</td>
</tr>
<?php } ?>
</tbody></table></div>
<p class="count"><span data-count="#tbl"><?= count($profiles) ?></span> dari <?= count($profiles) ?> item</p>
</div>
</section>
<?php }
page_foot();