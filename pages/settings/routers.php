<?php
/** Router: daftar router MikroTik dan koneksi API-nya. */
$rs = routers();
if ($_SERVER['REQUEST_METHOD'] !== 'POST' && !get('add') && !get('edit')) unset($_SESSION['rid']); // buka daftar router = mode Admin (seperti Mikhmon)

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $act = post('act'); $id = post('id');
    // kolom "Address : Port" -> [host, port]; port boleh kosong (bawaan 8728)
    $splitHp = function ($v) {
        $v = trim((string)$v); $pt = 0;
        if (preg_match('/^\[([0-9a-fA-F:.]+)\]:(\d{1,5})$/', $v, $m) || (substr_count($v, ':') === 1 && preg_match('/^([^:\s]+):(\d{1,5})$/', $v, $m))) { $v = $m[1]; $pt = (int)$m[2]; }
        return [$v, $pt === 0 ? 8728 : $pt];
    };
    if ($act === 'ping') { // cek apakah port API router terjangkau (tanpa menyimpan, tanpa login)
        list($ph, $pp) = $splitHp(post('host'));
        header('Content-Type: application/json; charset=utf-8');
        if ($ph === '' || $pp < 1 || $pp > 65535) { echo json_encode(['ok' => false, 'msg' => 'Isi Address dulu, misalnya 103.10.20.30:8728']); exit; }
        $t0 = microtime(true);
        $fp = @fsockopen($ph, $pp, $en, $es, 3);
        $ms = (int)round((microtime(true) - $t0) * 1000);
        if ($fp) { fclose($fp); echo json_encode(['ok' => true, 'msg' => 'Terjangkau: ' . $ph . ':' . $pp . ' (' . $ms . ' ms)']); }
        else echo json_encode(['ok' => false, 'msg' => 'Tidak terjangkau: ' . $ph . ':' . $pp . ($es ? ' (' . $es . ')' : '')]);
        exit;
    }
    if ($act === 'select' && isset($rs[$id])) {
        $_SESSION['rid'] = $id;
        $back = preg_replace('/[\r\n]/', '', post('back'));
		if ($back === '' || strpos($back, 'p=routers') !== false) $back = 'p=dashboard'; // Buka router langsung ke Dashboard
        parse_str($back, $bq); unset($bq['session']); header('Location: ./?' . http_build_query(['session' => cur_session($id)] + $bq)); // alamat jadi ?session=NAMA_ROUTER seperti Mikhmon
        exit;
    }
    if ($act === 'delete' && isset($rs[$id])) {
        unset($rs[$id]);
        cfg_set('routers', $rs);
        flash('Router dihapus dari daftar. Data tagihannya tetap ada di folder data/.');
        redirect('routers');
    }
    if ($act === 'save' || $act === 'connect') {
        $old = isset($rs[$id]) ? $rs[$id] : null;
        list($hostIn, $portIn) = $splitHp(post('host'));
        $r = [
            'name' => post('name'), 'host' => $hostIn, 'port' => $portIn,
            'user' => post('user'), 'ssl' => 0,
            'hotspot_name' => post('hotspot_name'), 'dns_name' => post('dns_name'),
        ] + ($old ? array_intersect_key($old, ['tz' => 1]) : []);
        // Router dari panel utama: alamat VPN diambil otomatis setiap terhubung
        $pid = preg_replace('/[^a-f0-9]/', '', post('panel_id'));
        if ($pid !== '' && panel_router($pid)) $r['panel_id'] = $pid;
        $pass = (string)($_POST['pass'] ?? '');
        $r['pass'] = $pass !== '' ? enc($pass) : ($old ? $old['pass'] : enc(''));
        if ($r['name'] === '' || $r['host'] === '' || $r['user'] === '' || $r['port'] < 1 || $r['port'] > 65535 || $r['hotspot_name'] === '' || $r['dns_name'] === '' || (!$old && $pass === '')) {
            flash('Semua kolom wajib diisi: Router Name, Address:Port, Username, Password, Hotspot Name, dan DNS Name. Port harus 1-65535.', 'err');
            redirect('routers', $old ? ['edit' => $id] : ['add' => 1]);
        }
        if (!$old) $id = bin2hex(random_bytes(3));
        $rs[$id] = $r;
        cfg_set('routers', $rs);
        unset($_SESSION['tzchk_' . $id]);
        if ($act === 'save') { flash('Router disimpan.'); redirect('routers'); }
        // Connect: simpan, uji koneksi API, lalu langsung masuk ke router (sama seperti tombol Connect di daftar)
        $api = ros_open($r);
        if ($api) {
            tz_sync($api); $api->close();
            $_SESSION['rid'] = $id;
            flash('Router disimpan dan berhasil terhubung. Zona waktu: ' . date_default_timezone_get() . '.');
            header('Location: ./?' . http_build_query(['session' => cur_session($id), 'p' => 'dashboard']));
            exit;
        }
        flash('Router disimpan, tetapi gagal terhubung: ' . $GLOBALS['ROS_ERR'], 'err');
        redirect('routers', ['edit' => $id]);
    }
    redirect('routers');
}

$edit = get('edit'); $form = get('add') || isset($rs[$edit]);
$e = isset($rs[$edit]) ? $rs[$edit] : ['name' => '', 'host' => '', 'port' => '', 'user' => '', 'ssl' => 0, 'hotspot_name' => '', 'dns_name' => ''];
$hp = (string)$e['host'] === '' ? '' : ((strpos((string)$e['host'], ':') !== false ? '[' . $e['host'] . ']' : $e['host']) . ((string)$e['port'] !== '' ? ':' . $e['port'] : ''));

if ($form) {
    page_head(isset($rs[$edit]) ? 'Edit Router' : 'Add Router', '', $rs ? ['Router', url('routers')] : null); ?>
<div class="split">
<form method="post" class="card">
<?= csrf_field() ?><input type="hidden" name="id" value="<?= h($edit) ?>">
<div class="cardhead"><?= icon('router') ?><strong><?= isset($rs[$edit]) ? 'Edit Router' : 'Add Router' ?></strong><span class="spacer"></span><?php if ($rs) { ?><a class="x" href="<?= url('routers') ?>" title="Tutup" aria-label="Tutup">&times;</a><?php } ?></div>
<div class="cardbody">
<div class="btnrow">
<span id="r_pingres" class="muted" role="status" aria-live="polite" style="margin-right:auto"></span>
<button type="submit" name="act" value="save" class="btn"><?= icon('save') ?>Save</button>
<button type="submit" name="act" value="connect" class="btn primary"><?= icon('link') ?>Connect</button>
<button type="button" id="r_ping" class="btn"><?= icon('wifi') ?>Ping</button>
</div>
<script>
(function () {
    var b = document.getElementById('r_ping'), o = document.getElementById('r_pingres');
    if (!b || !o) return;
    b.addEventListener('click', function () {
        var f = b.closest('form'), d = new FormData(f);
        d.set('act', 'ping');
        o.textContent = 'Mengecek…'; o.style.color = ''; b.disabled = true;
        fetch(location.href, { method: 'POST', body: d, credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (j) { o.textContent = j.msg; o.style.color = j.ok ? 'var(--ok)' : 'var(--bad)'; })
            .catch(function () { o.textContent = 'Gagal mengecek.'; o.style.color = 'var(--bad)'; })
            .then(function () { b.disabled = false; });
    });
})();
</script>
<?php $PR = panel_link() ? panel_routers() : null; if ($PR) { $vpsTun = (string)($PR['panel']['tunnelLocal'] ?? ''); ?>
<div class="frow"><label for="r_panel">Dari panel utama</label><select id="r_panel" name="panel_id">
<option value="">— Isi manual —</option>
<?php foreach ($PR['routers'] as $pr) { ?><option value="<?= h($pr['id']) ?>" data-name="<?= h($pr['name']) ?>" data-addr="<?= h($pr['address']) ?>" data-vps="<?= h($pr['vpsAddress']) ?>" data-tr="<?= h($pr['transport']) ?>"<?= (string)($e['panel_id'] ?? '') === (string)$pr['id'] ? ' selected' : '' ?>><?= h($pr['name'] . ' · ' . ($pr['transport'] === 'zt' ? 'ZeroTier' : 'L2TP') . ' · ' . ($pr['address'] ?: 'belum ada alamat') . ' · ' . ($pr['online'] ? 'tersambung' : ($pr['state'] === 'pending' ? 'menunggu pemasangan' : 'terputus'))) ?></option><?php } ?>
</select></div>
<?php if ($PR['error']) { ?><p class="muted" style="margin:-4px 0 10px;color:var(--bad)"><?= h($PR['error']) ?></p><?php } ?>
<div id="r_panelhint" class="muted" style="margin:-4px 0 12px;font-size:12.5px<?= empty($e['panel_id']) ? ';display:none' : '' ?>">Alamat router diambil dari panel utama setiap terhubung (lewat VPN), jadi tidak perlu membuka API ke internet. Di MikroTik, izinkan API dari VPS:
<pre class="code" id="r_cmd" style="margin:6px 0 0;white-space:pre-wrap;font-size:12px"></pre></div>
<script>
document.addEventListener('DOMContentLoaded', function () {
    var sel = document.getElementById('r_panel'); if (!sel) return;
    var nm = document.getElementById('r_name'), hp = document.getElementById('r_host'), hint = document.getElementById('r_panelhint'), cmd = document.getElementById('r_cmd'), ph = document.getElementById('r_porthint');
    function upd(fill) {
        var o = sel.options[sel.selectedIndex], on = !!sel.value;
        hint.style.display = on ? '' : 'none';
        if (ph) ph.style.display = on ? '' : 'none';
        if (!on) return;
        var vps = o.dataset.vps || 'IP-VPS';
        cmd.textContent = '/ip service set api disabled=no address=' + vps + '/32\n/user add name=bilingku group=full password=SANDI-KUAT address=' + vps + '/32';
        if (fill) {
            if (!nm.value) nm.value = o.dataset.name;
            // port yang sudah diisi dipertahankan; bila kosong dipakai port API bawaan MikroTik 8728
            var m = hp.value.match(/:(\d{1,5})\s*$/);
            hp.value = (o.dataset.addr || '') + ':' + (m ? m[1] : '8728');
        }
    }
    sel.addEventListener('change', function () { upd(true); });
    upd(false);
});
</script>
<?php } ?>
<div class="frow"><label for="r_name">Router Name</label><input id="r_name" name="name" value="<?= h($e['name']) ?>" required placeholder="Kantor pusat"></div>
<div class="frow"><label for="r_host">Address : Port</label><input id="r_host" name="host" value="<?= h($hp) ?>" required placeholder="103.10.20.30:8728 atau id-1.tunnel.com:8728"></div>
<?php if (!empty($PR)) { ?><p id="r_porthint" class="muted" style="margin:-4px 0 12px;font-size:12.5px<?= empty($e['panel_id']) ? ';display:none' : '' ?>">IP diisi otomatis dari VPN panel utama. <b>:8728</b> adalah port API bawaan MikroTik (Winbox → IP → Services → <b>api</b>). Bila port API router Anda diganti, ubah angka setelah titik dua. Tidak perlu port forwarding: Bilingku menghubungi router langsung lewat VPN.</p><?php } ?>
<div class="frow"><label for="r_user">Username</label><input id="r_user" name="user" value="<?= h($e['user']) ?>" required></div>
<div class="frow"><label for="r_pass">Password</label><div class="join"><input id="r_pass" name="pass" type="password" autocomplete="new-password"<?= isset($rs[$edit]) ? '' : ' required' ?> placeholder="<?= isset($rs[$edit]) ? 'Kosongkan bila tidak diganti' : '' ?>"><button type="button" class="btn eye" data-eye="#r_pass" title="Lihat kata sandi" aria-label="Lihat kata sandi"><?= icon('eye') ?></button></div></div>
<div class="fsep">Voucher</div>
<div class="frow"><label for="r_hs">Hotspot Name</label><input id="r_hs" name="hotspot_name" value="<?= h($e['hotspot_name']) ?>" required placeholder="WiFi Kampung"></div>
<div class="frow"><label for="r_dns">DNS Name</label><input id="r_dns" name="dns_name" value="<?= h($e['dns_name']) ?>" required placeholder="wifi.net"></div>
</div>
</form>
<section class="card">
<div class="cardhead"><?= icon('info') ?><strong>Read Me</strong></div>
<div class="cardbody">
<table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody>
<tr><td>Address : Port</td><td>IP publik, domain, atau alamat VPN/tunnel router yang bisa dijangkau dari hosting, diikuti port API, misalnya <code>103.10.20.30:8728</code>. Port boleh dikosongkan (bawaan 8728). Aktifkan service api di IP › Services dan batasi Available From ke IP hosting.</td></tr>
<tr><td>Username</td><td>Sebaiknya pengguna khusus panel dengan group full.</td></tr>
<tr><td>Hotspot Name</td><td>Nama yang tercetak di voucher (<code>$hotspotname</code>).</td></tr>
<tr><td>DNS Name</td><td>DNS name server hotspot, dipakai untuk alamat login dan kode QR (<code>$dnsname</code>).</td></tr>
<tr><td>Time Zone</td><td>Diambil otomatis dari System › Clock router setiap kali panel terhubung.</td></tr>
</tbody></table>
</div>
</section>
</div>
<?php } else { page_head('Daftar Router'); echo '<style>.rgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}.rcard{position:relative;border:1px solid rgba(127,127,127,.22);border-left:4px solid #2b7bb9;border-radius:10px;padding:10px 12px;background:var(--panel,#fff);display:flex;flex-direction:column;gap:8px;transition:box-shadow .15s,transform .15s}.rcard:hover{box-shadow:0 6px 18px rgba(15,23,42,.12);transform:translateY(-1px)}.rcard .rt{display:flex;align-items:center;gap:10px}.rcard .av{flex:none;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:rgba(43,123,185,.12);color:#2b7bb9}.rcard .av .ic{width:18px;height:18px}.rcard .nm{flex:1;min-width:0}.rcard .nm strong{display:block;font-size:1rem;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rcard .nm small{display:block;color:var(--muted,#6b7a89);font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rcard .no{flex:none;background:#2b7bb9;color:#fff;border-radius:999px;min-width:22px;padding:1px 7px;font-size:.72rem;font-weight:700;text-align:center}.rcard .ri{font-size:.8rem;color:var(--muted,#6b7a89);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rcard .ri b{font-weight:600}.rcard .ra{display:flex;gap:6px;align-items:stretch;height:32px}.rcard .ra>*,.rcard .ra form{height:32px;margin:0}.rcard .ra .btn,.rcard .ra button,.rcard .ra .icbtn{height:32px!important;min-height:0!important;box-sizing:border-box;line-height:1;display:inline-flex;align-items:center;justify-content:center}.rcard .ra .icbtn,.rcard .ra form:not(.go) button{width:36px!important;padding:0!important;border-radius:8px}.rcard .ra .icbtn .ic,.rcard .ra form:not(.go) button .ic{width:16px;height:16px}.rcard .ra form{margin:0;display:inline}.rcard .ra form.go{flex:1}.rcard .ra .go button{width:100%;justify-content:center;padding:5px 10px;min-height:0;font-size:.85rem}.rcard.radd{border:1.5px dashed rgba(127,127,127,.4);align-items:center;justify-content:center;text-decoration:none;color:inherit;opacity:.7;min-height:118px}.rcard.radd:hover{opacity:1}.rcard.radd .ic{width:28px;height:28px}</style>'; echo '<section class="card"><div class="cardhead">' . icon('router') . '<strong>Daftar Router</strong><span class="spacer"></span><a class="hl" href="' . h(url('routers', ['add' => 1])) . '">' . icon('plus') . 'Tambah Router</a></div><div class="cardbody"><div class="rgrid">'; $n = 0; foreach ($rs as $id => $r) { $n++; $hs = trim((string)($r['hotspot_name'] ?? '')); echo '<div class="rcard"><div class="rt"><span class="av">' . icon('router') . '</span><div class="nm"><strong title="' . h($r['name']) . '">' . h($r['name']) . '</strong><small>' . h($r['host']) . ':' . h($r['port']) . '</small></div><span class="no">' . $n . '</span></div><div class="ri"><b>Sesi:</b> ' . h(cur_session($id)) . ($hs !== '' ? ' &middot; <b>Hotspot:</b> ' . h($hs) : '') . '</div><div class="ra"><form method="post" class="go">' . csrf_field() . '<input type="hidden" name="act" value="select"><input type="hidden" name="id" value="' . h($id) . '"><input type="hidden" name="back" value="p=dashboard"><button class="btn primary">' . icon('link') . 'Connect</button></form><a class="icbtn" href="' . h(url('routers', ['edit' => $id])) . '" title="Edit" aria-label="Edit">' . icon('edit') . '</a>' . icon_btn('trash', 'Hapus', 'delete', ['id' => $id], 'Hapus router ' . $r['name'] . ' dari daftar?', 'bad') . '</div></div>'; } echo '<a class="rcard radd" href="' . h(url('routers', ['add' => 1])) . '">' . icon('plus') . '<span>Tambah Router</span></a>'; echo '</div><p class="count">' . count($rs) . ' router</p></div></section>'; } page_foot();