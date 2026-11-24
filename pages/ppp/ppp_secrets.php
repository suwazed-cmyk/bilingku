<?php
need_ros('PPP User');
$isoDef = (string)setting('isolir_profile');
$isDate = function ($d) { return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$d); };

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $act = post('act'); $user = post('user'); $cs = customers();
    if ($act === 'mksched') {
        if (ppp_sched_install()) flash('Scheduler ' . ppp_sched_name() . ' dibuat. Router memeriksa semua secret tiap hari pukul 00:01 dan tiap kali menyala.');
        back();
    }
    if ($act === 'runsched') {
        if (ppp_sched_run()) flash('Pemeriksaan dijalankan di router. Secret yang lewat tanggal dipindah ke Isolir Profile sekarang, koneksinya diputus 5 menit kemudian. Muat ulang daftar untuk melihat hasilnya.');
        back();
    }
    if ($act === 'save' || $act === 'reset') {
        $id = post('id'); $old = post('old'); $name = post('name');
        $c = isset($cs[$old]) ? $cs[$old] : [];
        if ($name === '') { flash('Isi Name (nama pengguna PPP).', 'err'); back(); }
        // Validity = berapa hari pelanggan masih boleh memakai Isolir Profile setelah jatuh tempo sebelum secret di-disable.
        // Kosong / 0 = tidak pernah di-disable. Boleh angka hari, atau 3d / 1w.
        $val = strtolower(trim((string)post('validity', '')));
        if ($val === '' || $val === '0') $isoOff = '';
        elseif (ctype_digit($val)) $isoOff = (string)(int)$val;
        elseif (preg_match('/^(\d+[wd])+$/', $val)) $isoOff = (string)ival_days($val);
        else { flash('Validity ditulis dalam hari, misalnya 3 atau 3d (1w = 7 hari). Kosongkan bila secret tidak perlu di-disable.', 'err'); back(); }
        $start = $isDate(post('start')) ? post('start') : date('Y-m-d');
        // Jatuh Tempo dari kalender: tanggal bebas (mis. langganan tgl 25 tetapi bayar tiap tgl 1), kosong = None (NON Expired)
        $due = $isDate(post('due')) ? post('due') : '';
        if ($act === 'reset') { $start = date('Y-m-d'); $due = ($due !== '' || !empty($c['due'])) ? add_months($start, 1) : ''; }

        // tanpa alamat di secret maupun di profil, PPPoE tidak akan bisa tersambung
        $profs = array_column(rq('/ppp/profile/print', ['.proplist' => 'name,local-address,remote-address']), null, 'name');
        $noip = function ($prof) use ($profs) {
            $m = [];
            foreach (['remote' => 'Remote Address', 'local' => 'Local Address'] as $f => $l) if (post($f) === '' && empty($profs[$prof][$f . '-address'])) $m[] = $l;
            return $m;
        };
        if ($act === 'save' && ($miss = $noip(post('profile')))) {
            flash(implode(' dan ', $miss) . ' belum ada: profil ' . post('profile') . ' tidak punya ' . (in_array('Remote Address', $miss, true) ? 'IP pool' : 'Local Address')
                . ' dan di secret juga kosong. Isi di secret ini, atau lengkapi profilnya di PPP Profiles.', 'err');
            back();
        }
        if (post('profile') === '') { flash('Pilih Main Profile (paket) pelanggan.', 'err'); back(); }
        $fupName = post('fup');
        if ($fupName !== '' && $fupName === post('profile')) { flash('Isolir Profile tidak boleh sama dengan Main Profile. Pilih profil isolir, misalnya ' . $isoDef . '.', 'err'); back(); }
        if ($fupName !== '' && $fupName !== post('profile') && isset($profs[$fupName]) && ($miss = $noip($fupName))) {
            flash('Perhatian: Isolir Profile ' . $fupName . ' tidak punya ' . implode(' dan ', $miss) . '. Setelah diisolir, ' . $name . ' tidak akan bisa tersambung sampai profil itu dilengkapi.', 'warn');
        }

        

    $p = ['name' => $name, 'service' => post('service', 'pppoe'), 'comment' => post('comment')];
        if ($id === '') $p['profile'] = post('profile');
        if ($id === '' || (string)($_POST['password'] ?? '') !== '') $p['password'] = (string)($_POST['password'] ?? '');
        $unset = [];
        foreach (['local-address' => 'local', 'remote-address' => 'remote'] as $k => $f) {
            if (post($f) !== '') $p[$k] = post($f);
            elseif ($id !== '') $unset[] = $k;
        }
        $ok = $id !== '' ? rdo('/ppp/secret/set', ['.id' => $id] + $p) : rdo('/ppp/secret/add', $p);
        if (!$ok) back();
        foreach ($unset as $k) rdo('/ppp/secret/unset', ['.id' => $id, 'value-name' => $k], true);

        $jt = ($due !== '' && $due === ($c['due'] ?? '') && !empty($c['jt'])) ? (int)$c['jt'] : (int)substr($due, 8, 2);
        $fup = post('fup') === $isoDef ? '' : post('fup');
        $c = ['nama' => (trim((string)post('nama')) !== '' ? trim((string)post('nama')) : $name), 'hp' => post('hp'), 'alamat' => post('alamat'), 'tarif' => money_in(post('tarif')),
            'cmt' => post('comment'), 'tagih' => $due !== '' ? 1 : 0, 'paket' => post('profile'), 'fup' => $fup, 'validity' => '', 'gracep' => '0', 'isooff' => $isoOff, 'after' => 'dis',
            'start' => $start, 'due' => $due, 'jt' => $jt,
                'joined' => !empty($c['joined']) ? $c['joined'] : ($isDate(post('joined')) ? post('joined') : date('Y-m-d'))] + $c;
        if ($old !== '' && $old !== $name) {
            unset($cs[$old]);
            $pays = payments();
            foreach ($pays as $k => $x) if ($x['user'] === $old) $pays[$k]['user'] = $name;
            db_save(rkey('payments'), $pays);
        }
        $cs[$name] = $c;
        customers_save($cs);
        if ($old !== '' && $old !== $name) ppp_sync($old); // buang scheduler nama lama
        ppp_sync($name, null, false, $act === 'reset');
        // profil isolir bawaan dipakai (sebagai Isolir Profile atau tahap setelah Validity): pastikan lengkap dengan halaman pemberitahuan
        if ($due !== '' && $fup === '') {
            $ir = ppp_isolir_ready(true);
            if ($ir === 'installed') flash('Profil ' . $isoDef . ' dipasang lengkap di router: address-list isolir, firewall, dan web proxy ke halaman pemberitahuan.');
            elseif ($ir === 'partial') flash('Profil ' . $isoDef . ' belum terpasang lengkap (firewall / web proxy). Buka PPP Profiles, edit profil ' . $isoDef . ' lalu Save supaya aturan isolirnya dipasang ulang.', 'warn');
        }
        if (ppp_sched_ok(true) === false && ppp_sched_install()) flash('Scheduler ' . ppp_sched_name() . ' belum ada di router ini, jadi dibuat otomatis.');
        flash($act === 'reset'
            ? 'Start Date ' . $name . ' diatur ulang ke hari ini' . ($due !== '' ? ', Jatuh Tempo ' . tgl($due) . '.' : '.')
            : 'Secret ' . $name . ' disimpan.' . ($due !== '' ? ' Jatuh Tempo ' . tgl($due) . '.' : ''));
        $row = rq('/ppp/secret/print', ['?name' => $name, '.proplist' => '.id']);
        redirect('ppp_secrets', $row ? ['edit' => $row[0]['.id']] : []); // tetap di halaman edit
    }
    if ($act === 'bulk_delete') {
        $ids = isset($_POST['ids']) && is_array($_POST['ids']) ? array_map('strval', $_POST['ids']) : [];
        $names = [];
        foreach (rq('/ppp/secret/print', ['.proplist' => '.id,name']) as $x) if (in_array($x['.id'], $ids, true)) $names[$x['.id']] = $x['name'];
        $n = 0;
        foreach ($names as $id => $u) {
            if (!rdo('/ppp/secret/remove', ['.id' => $id], true)) continue;
            ppp_kick($u);
            unset($cs[$u]);
            $n++;
        }
        customers_save($cs);
        foreach ($names as $u) ppp_sync($u);
        flash($n . ' secret dihapus. Riwayat pembayarannya tetap tersimpan.');
        redirect('ppp_secrets');
    }
    if ($act === 'delete') {
        if (rdo('/ppp/secret/remove', ['.id' => post('id')])) {
            ppp_kick($user);
            unset($cs[$user]); customers_save($cs);
            ppp_sync($user);
            flash('Secret ' . $user . ' dihapus. Riwayat pembayarannya tetap tersimpan.');
        }
        redirect('ppp_secrets');
    } elseif ($act === 'toggle') {
        $dis = post('to') === 'disable';
        if (rdo('/ppp/secret/' . ($dis ? 'disable' : 'enable'), ['.id' => post('id')])) {
            if ($dis) ppp_kick($user);
            if (isset($cs[$user])) { $cs[$user]['expired'] = 0; customers_save($cs); }
            flash('Secret ' . $user . ($dis ? ' dinonaktifkan.' : ' diaktifkan.'));
        }
    } elseif ($act === 'isolir' || $act === 'buka') {
        $c = isset($cs[$user]) ? $cs[$user] : [];
        if ($act === 'isolir') $c['manual_iso'] = 1; else unset($c['manual_iso']);
        $cs[$user] = $c; customers_save($cs);
        if (ppp_sync($user)) {
            if ($act === 'isolir') flash($user . ' dipindahkan ke profil ' . ppp_fup($c) . ' dan koneksinya diputuskan.');
            elseif (is_late($c)) flash($user . ' masih lewat Jatuh Tempo. Terima pembayarannya untuk mengembalikan ke Main Profile.', 'warn');
            else flash($user . ' dikembalikan ke Main Profile.');
        }
    } elseif ($act === 'kick') {
        ppp_kick($user);
        flash('Koneksi ' . $user . ' diputuskan.');
    }
    back();
}

$secrets = rq('/ppp/secret/print');
$cs = customers(); $pk = packages();
$editId = get('edit'); $form = get('add') !== ''; $e = null;
foreach ($secrets as $s) if ($editId !== '' && $s['.id'] === $editId) { $e = $s; $form = true; }

/* ---------- formulir tambah / ubah ---------- */
if ($form) {
    $profiles = rq('/ppp/profile/print', ['.proplist' => 'name,local-address,remote-address,address-list']);
    $c = ($e && isset($cs[$e['name']]) ? $cs[$e['name']] : []) + ['nama' => '', 'hp' => '', 'alamat' => '', 'tarif' => '', 'due' => '',
        'gracep' => '0', 'start' => date('Y-m-d'), 'fup' => ''];
    if (!$e && $c['due'] === '') $c['due'] = add_months($c['start'], 1); // pelanggan baru: jatuh tempo 1 bulan setelah Start Date
    $cur = !empty($c['paket']) ? $c['paket'] : ($e['profile'] ?? '');
    $fup = $c['fup'] !== '' ? $c['fup'] : $isoDef;
    $names = array_column($profiles, 'name');
    $isoMissing = $isoDef !== '' && !in_array($isoDef, $names, true); // paket isolir belum ada di router: dibuat otomatis saat Save
    if ($isoMissing) $names[] = $isoDef;
    $fmeta = fup_meta();
    // profil isolir buatan sendiri (address-list berisi "isolir") ikut dianggap profil isolir
    foreach ($profiles as $x) if (stripos((string)($x['address-list'] ?? ''), 'isolir') !== false && !isset($fmeta[$x['name']])) $fmeta[$x['name']] = ['list' => $x['address-list'], 'own' => 1];
    $pfup = db_load(rkey('pfup')); $after = ppp_after($c);
    $plabel = function ($n) use ($fmeta, $pfup, $isoDef, $isoMissing) {
        if ($n === $isoDef && $isoMissing) return $n . ' (bawaan, dibuat otomatis saat Save)';
        return $n . ($n === $isoDef ? ' (bawaan)' : '');
    };
    $lim = function ($b) { $b = (float)$b; return $b >= 1073741824 && fmod($b, 1073741824) == 0 ? [$b / 1073741824, 'GB'] : [round($b / 1048576, 2), 'MB']; };
    $li = $lim($e['limit-bytes-in'] ?? 0); $lo = $lim($e['limit-bytes-out'] ?? 0);
    page_head('PPP User');
    ?>
<div class="split">
<form method="post" class="card" id="secretform">
<?= csrf_field() ?><input type="hidden" name="id" value="<?= h($e['.id'] ?? '') ?>"><input type="hidden" name="old" value="<?= h($e['name'] ?? '') ?>"><input type="hidden" name="user" value="<?= h($e['name'] ?? '') ?>">
<div class="cardhead"><?= icon('user') ?><strong><?= $e ? 'Edit' : 'Add' ?> PPP User</strong><span class="spacer"></span><a class="x" href="<?= url('ppp_secrets') ?>" title="Tutup" aria-label="Tutup">&times;</a></div>
<div class="cardbody">
<p class="msg err" id="ipwarn" hidden></p>
<div class="fsep first">Data pelanggan</div>
<div class="frow"><label for="f_nama">Nama pelanggan</label><input id="f_nama" name="nama" value="<?= h($c['nama']) ?>" placeholder="Kosong = memakai PPP Name"></div>
<div class="frow"><label for="f_hp">Nomor WhatsApp</label><input id="f_hp" name="hp" value="<?= h($c['hp']) ?>" inputmode="tel" placeholder="0812…"></div>
<div class="frow"><label for="f_alamat">Alamat</label><input id="f_alamat" name="alamat" value="<?= h($c['alamat']) ?>"></div>
<?php if ($e) { $jd = $c['joined'] ?? ppp_joined($c, $e['name']); ?><div class="frow"><label for="f_joined">Tanggal Daftar</label><input id="f_joined" value="<?= h(tgl($jd)) ?>" disabled title="Terisi otomatis saat pelanggan pertama kali dibuat"><input type="hidden" name="joined" value="<?= h($jd) ?>"></div><?php } ?>
<div class="frow"><label for="tarif">Tarif per bulan</label><input name="tarif" id="tarif" type="text" inputmode="numeric" data-money value="<?= $c['tarif'] !== '' ? h(money($c['tarif'], false)) : '' ?>" placeholder="100.000"></div>
<div class="frow"><label for="f_start">Start Date</label><div class="join"><input id="f_start" name="start" type="date" value="<?= h($c['start']) ?>"><?php if ($e) { ?><button type="button" class="btn" data-today="#f_start" data-recalc="#f_due" data-months="1" title="Start Date = hari ini, Jatuh Tempo = 1 bulan setelahnya"><?= icon('reload') ?>Reset</button><?php } ?></div></div>
<div class="frow"><label for="f_due_btn">Jatuh Tempo</label><div class="dpk" data-follow="#f_start" data-fresh="<?= $e ? '0' : '1' ?>"><button type="button" class="dpk-btn" id="f_due_btn" aria-haspopup="dialog"><?= icon('cal') ?><span></span></button><input type="hidden" name="due" id="f_due" value="<?= h($c['due']) ?>"></div></div>
<div class="fsep">Akun PPP</div>
<div class="frow"><label for="f_svc">Services</label><select id="f_svc" name="service"><?php foreach (['any', 'pppoe', 'l2tp', 'pptp', 'sstp', 'ovpn'] as $x) echo opt($x, $e['service'] ?? 'pppoe'); ?></select></div>
<div class="frow"><label for="f_name">PPP Name</label><input id="f_name" name="name" value="<?= h($e['name'] ?? '') ?>" required autocomplete="off"></div>
<div class="frow"><label for="f_pass">Password</label><div class="join"><input id="f_pass" name="password" type="password" value="<?= h($e['password'] ?? '') ?>" autocomplete="new-password" <?= $e ? '' : 'required' ?>><button type="button" class="btn eye" data-eye="#f_pass" title="Lihat kata sandi" aria-label="Lihat kata sandi"><?= icon('eye') ?></button><button type="button" class="btn" id="f_gen" title="Buat kata sandi acak" aria-label="Buat kata sandi acak"><?= icon('reload') ?></button></div></div>
<div class="frow"><label for="paket">Main Profile</label><select name="profile" id="paket" required><?php if (!$e) echo '<option value="" disabled' . ($cur === '' ? ' selected' : '') . '>Pilih paket…</option>';
foreach ($profiles as $p) {
    if ($p['name'] !== $cur && (isset($fmeta[$p['name']]) || $p['name'] === $isoDef || $p['name'] === 'default-encryption')) continue; // profil isolir tidak dipakai sebagai paket
    echo '<option value="' . h($p['name']) . '" data-harga="' . h($pk[$p['name']] ?? '') . '"' . (!empty($p['remote-address']) ? ' data-remote="1"' : '') . (!empty($p['local-address']) ? ' data-local="1"' : '') . ($p['name'] === $cur ? ' selected' : '') . '>' . h($p['name']) . '</option>'; } ?></select></div>
<div class="frow isorow"><label for="f_fup">Isolir Profile</label><select id="f_fup" name="fup"><?php foreach ($names as $n) if (isset($fmeta[$n]) || $n === $isoDef || $n === $fup) echo opt($n, $fup, $plabel($n)); ?></select></div>
<div class="frow isorow"><label for="f_val">Validity</label><input id="f_val" name="validity" value="<?= h($c['isooff'] ?? '') ?>" pattern="0|\d+|(\d+[wdWD])+" placeholder="Jumlah hari di isolir, mis. 3" inputmode="numeric"></div>
<div class="frow"><label for="f_local">Local Address</label><input id="f_local" name="local" value="<?= h($e['local-address'] ?? '') ?>" placeholder="Ikut profil"></div>
<div class="frow"><label for="f_remote">Remote Address</label><input id="f_remote" name="remote" value="<?= h($e['remote-address'] ?? '') ?>" placeholder="Ikut profil"></div>
<div class="frow"><label for="f_cmt">Comment</label><input id="f_cmt" name="comment" value="<?= h($c['cmt'] ?? ppp_cmt_strip($e['comment'] ?? '')) ?>" placeholder="Kosong = memakai PPP Name"></div>
<div class="btnrow fend"><?php if ($e) { ?><button class="btn bad" name="act" value="delete" formnovalidate data-confirm="Hapus secret <?= h($e['name']) ?> dari router?"><?= icon('minus') ?>Remove</button><?php } ?><span class="spacer"></span><a class="btn" href="<?= url('ppp_secrets') ?>">Batal</a><button class="btn primary" id="f_save" name="act" value="save" data-ok="Ya, simpan" data-confirm="<?= $e ? 'Simpan perubahan ' . h($e['name']) . '?' : 'Simpan pelanggan baru?' ?>"><?= icon('save') ?>Save</button></div>
</div>
<script>
(function(){
var f=document.currentScript.parentNode,idEl=f.querySelector('input[name=id]');
if(!idEl||idEl.value!=='')return;
var NL=String.fromCharCode(10);
f.addEventListener('submit',function(e){
var b=e.submitter;if(b&&b.value!=='save')return;
var t=f.querySelector('#tarif'),v=t?t.value.replace(/[^0-9]/g,''):'';
if(!b)return;
if(!b.dataset.base)b.dataset.base=b.dataset.confirm||'';
if(v===''||parseInt(v,10)===0){b.dataset.confirm='Tarif per bulan belum diisi'+NL+'Pelanggan akan disimpan tanpa tarif, sehingga tagihannya Rp 0. Tetap simpan?';}
else{b.dataset.confirm=b.dataset.base;}
});
})();
</script>
<script>
(function () {
    // ringkasan alur bila pelanggan belum bayar, berubah langsung mengikuti isian
    var out = document.getElementById('flowsum');
    var due = document.getElementById('f_due'), pen = document.getElementById('f_fup'), val = document.getElementById('f_val'), main = document.getElementById('paket');
    var days = function (v) { v = (v || '').trim().toLowerCase(); if (/^\d+$/.test(v)) return +v; var t = 0, ok = false; v.replace(/(\d+)([wd])/g, function (_, n, u) { ok = true; t += +n * (u === 'w' ? 7 : 1); }); return ok ? t : 0; };
    var b = function (t) { var x = document.createElement('b'); x.textContent = t; return x.outerHTML; };
    var draw = function () {
        var n = days(val.value);
        var none = !due.value;
        document.querySelectorAll('#secretform .isorow').forEach(function (r) { r.hidden = none; });
        if (!out) return;
        if (none) { out.innerHTML = b('NON Expired') + ': tanpa jatuh tempo, pelanggan tidak pernah diisolir maupun di-disable.'; return; }
        var s = 'Lewat jatuh tempo → pindah ke ' + b(pen.value) + ' (internet berhenti, halaman pemberitahuan)';
        s += n ? ' selama ' + n + ' hari → lalu ' + b('secret di-disable') : ' sampai membayar';
        out.innerHTML = s + '. Setelah bayar → kembali ke ' + b(main.value || 'Main Profile') + '.';
    };
    // kata sandi acak (tanpa huruf yang mirip: 0/O, 1/l/I)
    var gen = document.getElementById('f_gen'), pw = document.getElementById('f_pass');
    if (gen && pw) gen.addEventListener('click', function () {
        var cs = 'abcdefghjkmnpqrstuvwxyz23456789', a = new Uint32Array(8), s = '';
        (window.crypto || window.msCrypto).getRandomValues(a);
        for (var i = 0; i < a.length; i++) s += cs[a[i] % cs.length];
        pw.value = s; pw.type = 'text';
    });
    // pelanggan baru: Tanggal Daftar mengikuti Start Date selama belum diubah sendiri
    var st = document.getElementById('f_start'), jn = document.getElementById('f_joined'), idEl = document.querySelector('#secretform input[name=id]');
    if (st && jn && idEl && idEl.value === '') {
        var own = false;
        jn.addEventListener('input', function () { own = true; });
        st.addEventListener('change', function () { if (!own) jn.value = st.value; });
    }
    [due, pen, val, main].forEach(function (el) { if (el) { el.addEventListener('change', draw); el.addEventListener('input', draw); } });
    draw();
})();
</script>
</form>

<section class="card">
<div class="cardhead"><?= icon('info') ?><strong>Read Me</strong></div>
<div class="cardbody">
<table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody>
<tr><td>Main Profile</td><td>Paket pelanggan selama belum melewati jatuh tempo. Profil isolir tidak ditampilkan di sini.</td></tr>
<tr><td>Tarif per bulan</td><td>Jumlah tagihan tiap bulan. Ikut harga Main Profile bila diisi di PPP Profiles.</td></tr>
<tr><td>Start Date</td><td>Tanggal mulai berlangganan.</td></tr>
<tr><td>Jatuh Tempo</td><td>Batas waktu pembayaran. Otomatis terisi 1 bulan setelah Start Date dan bisa diubah lewat kalender, misalnya pelanggan mulai berlangganan tanggal 25 tetapi ingin membayar tiap tanggal 1. Maju 1 bulan setiap pembayaran diterima. Pilih None di kalender untuk pelanggan tanpa jatuh tempo (NON Expired).</td></tr>
<tr><td>Isolir Profile</td><td>Profil yang diterapkan setelah melewati jatuh tempo: internet berhenti dan pelanggan diarahkan ke halaman pemberitahuan pembayaran. Bawaan: <?= h($isoDef) ?>. Jika belum tersedia di router, panel membuatnya otomatis saat Save, lengkap dengan Address List isolir, firewall, dan web proxy.</td></tr>
<tr><td>Validity</td><td>Jangka waktu yang diberikan kepada pelanggan (secret) di isolir sebelum status layanan dinonaktifkan (di-disable). Kosong = tetap di isolir sampai membayar.</td></tr>
<tr><td>Setelah bayar</td><td>Pelanggan otomatis kembali ke Main Profile, secret aktif lagi, dan Jatuh Tempo maju 1 bulan.</td></tr>
<tr><td>NON Expired</td><td>Pilih None di kalender Jatuh Tempo lalu Save: tanpa tagihan, tidak pernah dipindah ke Isolir Profile maupun dinonaktifkan.</td></tr>
<tr><td>Reset</td><td>Hanya saat Edit. Tombol di kolom Start Date: Start Date diisi hari ini dan Jatuh Tempo 1 bulan setelahnya. Berlaku setelah Save.</td></tr>
</tbody></table>
<p class="hint">Format Validity: jumlah hari, boleh angka saja atau dengan satuan d (hari) / w (minggu). Contoh: 3 atau 3d = 3 hari, 1w = 7 hari, 1w3d = 10 hari.<br>
Satu scheduler di router (<?= h(ppp_sched_name()) ?>) memeriksa semua secret tiap hari: yang lewat jatuh tempo dipindah ke Isolir Profile dan comment-nya jadi "expired"; bila Validity habis, secret di-disable. Koneksinya diputus 5 menit kemudian supaya profil baru berlaku.</p>
</div>
</section>
</div>
<?php
    page_foot();
    exit;
}

/* ---------- daftar ---------- */
$profs = array_column(rq('/ppp/profile/print', ['.proplist' => 'name,local-address,remote-address']), null, 'name');
$online = [];
foreach (rq('/ppp/active/print', ['.proplist' => 'name,address,caller-id']) as $a) $online[$a['name']] = $a;

$f = in_array(get('f'), ['online', 'offline', 'disabled', 'late', 'soon', 'iso'], true) ? get('f') : '';
$cnt = ['' => 0, 'online' => 0, 'offline' => 0, 'disabled' => 0, 'late' => 0, 'soon' => 0, 'iso' => 0]; $rows = [];
foreach ($secrets as $s) {
    $n = $s['name']; $c = $cs[$n] ?? [];
    $st = bill_state($c);
    $fup = ppp_fup($c); $paket = !empty($c['paket']) ? $c['paket'] : '';
    $isIso = $fup !== '' && ($s['profile'] ?? '') === $fup && $fup !== $paket && ($paket !== '' || $fup === $isoDef);
    $off = ($s['disabled'] ?? '') === 'true';
    $on = isset($online[$n]);
    $tags = ['' => 1, 'online' => $on, 'offline' => !$on && !$off, 'disabled' => $off,
        'late' => $st[0] === 'late', 'soon' => $st[0] === 'soon' || $st[0] === 'grace', 'iso' => $isIso];
    foreach ($tags as $k => $v) if ($v) $cnt[$k]++;
    if ($tags[$f]) $rows[] = [$s, $c, $st, $isIso, $on, $off];
}
$tiles = ['' => ['Total User', 'user', 'blue'], 'online' => ['Total Online', 'link', 'green'], 'offline' => ['Total Offline', 'wifi', 'gray'], 'disabled' => ['Total Disabled', 'lock', 'amber']];
$tabs = ['late' => 'Menunggak', 'soon' => 'Segera jatuh tempo', 'iso' => 'Diisolir'];

page_head('PPP User');
$sched = ppp_sched_ok() ? ppp_sched_state() : ['ok' => false]; // status tersimpan 60 detik; detail hanya diambil bila scheduler terpasang
?>

<section class="card">
<div class="cardhead"><?= icon('user') ?><strong>PPP User</strong><span class="muted hscnt"><?= (int)$cnt[''] ?> total</span>
<span class="spacer"></span>
<button type="button" class="btn small bad" id="ps-bulk" data-ask="Hapus secret yang dicentang dari router? Riwayat pembayarannya tetap tersimpan.">Remove 0</button>
<a class="hl" href="<?= h(url('ppp_secrets', $f === '' ? [] : ['f' => $f])) ?>" title="Reload Data" aria-label="Reload Data"><?= icon('reload') ?></a>
<a class="hl" href="<?= url('ppp_secrets', ['add' => 1]) ?>"><?= icon('plus') ?>Add</a>
</div>
<div class="cardbody">
<div class="hsfilter">
<?php if ($rows) { ?><input type="search" class="filter" placeholder="Search user, profile…" data-filter="#tbl" aria-label="Search"><?php } ?>
<select aria-label="Saring status" onchange="location.href=this.value"<?= $f !== '' ? ' style="border-color:var(--accent);color:var(--accent);font-weight:600"' : '' ?>><?php
    $fl = ['' => 'Semua status', 'online' => 'Online', 'offline' => 'Offline', 'disabled' => 'Disabled', 'late' => 'Menunggak', 'soon' => 'Segera jatuh tempo', 'iso' => 'Diisolir'];
    foreach ($fl as $k => $v) echo '<option value="' . h(url('ppp_secrets', $k === '' ? [] : ['f' => $k])) . '"' . ($k === $f ? ' selected' : '') . '>' . h($v) . ' (' . (int)$cnt[$k] . ')</option>'; ?></select>
<?php if ($f !== '') { ?><a class="btn small ghost" href="<?= url('ppp_secrets') ?>">Clear Filter</a><?php } ?>
</div>
<?php if (!$rows) { ?>
<div class="empty"><p class="emptytitle"><?= $secrets ? 'Tidak ada secret di saringan ini.' : 'Belum ada PPP user di router ini.' ?></p></div>
<?php } else { ?>
<div class="tablewrap"><table id="tbl" class="grid-t sortable">
<thead><tr><th class="chk nosort"><input type="checkbox" data-checkall aria-label="Pilih semua"></th><th class="dotc nosort"></th><th>User</th><th>Profile</th><th>Remote Address</th><th>Last Logged Out</th><th>Jatuh Tempo</th><th class="r">Tarif / bulan</th><th>Status</th><th class="nosort"></th></tr></thead><tbody>
<?php
    foreach ($rows as $row) {
        list($s, $c, $st, $isIso, $on, $off) = $row; $n = $s['name'];
        $wa = $st[0] !== 'none' && $st[0] !== 'ok' ? wa_link($c, (float)($c['tarif'] ?? 0) * months_owed($c)) : '';
        $llo = (string)($s['last-logged-out'] ?? '');
        if (strpos($llo, '1970') !== false) $llo = '';
        $edit = url('ppp_secrets', ['edit' => $s['.id']]);
        ?>
<tr<?= $off ? ' class="off"' : '' ?>>
<td class="chk"><input type="checkbox" name="ids[]" value="<?= h($s['.id']) ?>" aria-label="Pilih <?= h($n) ?>"></td>
<td class="dotc"><span class="dot<?= $off ? '' : ($on ? ' up' : ' down') ?>" title="<?= $off ? 'Disabled' : ($on ? 'Online' : 'Offline') ?>" aria-label="<?= $off ? 'Disabled' : ($on ? 'Online' : 'Offline') ?>" role="img"></span></td>
<td class="key"><a class="namelink" href="<?= h(url('ppp_user', ['user' => $n])) ?>" title="PPP: <?= h($n) ?>"><?= h(($c['nama'] ?? '') !== '' ? $c['nama'] : $n) ?></a>
<?= $isIso ? badge('Isolir', 'bad') : '' ?>
</td>
<td><?= h($s['profile'] ?? '') ?></td>
<td class="mono"><?= h($on ? ($online[$n]['address'] ?? '') : ($s['remote-address'] ?? '')) ?></td>
<td><?= h(ros_dt($llo)) ?></td>
<td data-v="<?= h($c['due'] ?? '') ?>"><?= is_billed($c) ? h(tgl($c['due'])) : '' ?></td><td class="r"><?= !empty($c['tarif']) ? money($c['tarif']) : '-' ?></td><td><?= $st[0] === 'none' ? '<span class="muted">Tanpa tagihan</span>' : (in_array($st[0], ['late', 'grace'], true) ? badge('Belum bayar', 'bad') : badge('Lunas', 'ok')) ?></td>
<td class="acts">
<?= row_menu([
            '<a href="' . h($edit) . '">Edit</a>',
			 '<a href="' . h(url('ppp_pay', ['user' => $n])) . '">Bayar</a>',
            confirm_btn($off ? 'Enable' : 'Disable', 'toggle', ['id' => $s['.id'], 'user' => $n, 'to' => $off ? 'enable' : 'disable'], $off ? '' : 'Nonaktifkan secret ' . $n . '?', ''),
            is_billed($c) ? '<a target="_blank" href="' . h(url('invoice_print', ['user' => $n])) . '">Print Invoice</a>' : '',
            $wa ? '<a target="_blank" rel="noopener" href="' . h($wa) . '">Send WhatsApp</a>' : '',
            $on ? confirm_btn('Remove Active', 'kick', ['user' => $n], '', '') : '',
            !empty($c['manual_iso']) ? confirm_btn('Restore Main Profile', 'buka', ['user' => $n], '', '')
                : (!$isIso ? confirm_btn('Move to Isolir', 'isolir', ['user' => $n], 'Pindahkan ' . $n . ' ke profil ' . ppp_fup($c) . ' dan putuskan koneksinya?', '') : ''),
            confirm_btn('Remove', 'delete', ['id' => $s['.id'], 'user' => $n], 'Hapus secret ' . $n . ' dari router?', 'danger'),
        ]) ?>
</td>
</tr>
<?php } ?>
</tbody></table></div>
<p class="count"><span data-count="#tbl"><?= count($rows) ?></span> dari <?= count($rows) ?> item</p>
<?php } ?>
<?php if ($sched['ok']) { ?>
<form method="post" class="count" style="display:flex;flex-wrap:wrap;gap:.4rem .8rem;align-items:center"><?= csrf_field() ?>
<span><?= badge('Scheduler aktif', 'ok') ?> <?= h(ppp_sched_name()) ?> jalan tiap hari pukul 00:01<?= !empty($sched['daily']['next-run']) ? ', berikutnya ' . h(ros_dt($sched['daily']['next-run'])) : '' ?>. Sudah jalan <?= (int)($sched['daily']['run-count'] ?? 0) ?> kali.</span>
<button class="linkbtn" name="act" value="runsched" data-confirm="Jalankan pemeriksaan sekarang? Secret yang lewat tanggal langsung dipindah ke Isolir Profile.">Run Now</button></form>
<?php } ?>
</div>
</section>
<form method="post" id="ps-form" hidden data-confirm=""><?= csrf_field() ?><input type="hidden" name="act" value="bulk_delete"></form>
<script>
(function () {
    var t = document.getElementById('tbl'), b = document.getElementById('ps-bulk'), f = document.getElementById('ps-form');
    if (!t || !b) { if (b) b.remove(); return; }
    var picked = function () { return Array.prototype.filter.call(t.querySelectorAll('tbody input[name="ids[]"]'), function (c) { return c.checked && c.closest('tr').style.display !== 'none'; }); };
    var u = function () { setTimeout(function () { var n = picked().length; b.classList.toggle('on', n > 0); b.textContent = 'Remove ' + n; }, 0); };
    t.addEventListener('change', u); t.addEventListener('click', u);
    b.addEventListener('click', function () {
        var p = picked();
        if (!p.length) return;
        f.querySelectorAll('input[name="ids[]"]').forEach(function (x) { x.remove(); });
        p.forEach(function (c) { var i = document.createElement('input'); i.type = 'hidden'; i.name = 'ids[]'; i.value = c.value; f.appendChild(i); });
        f.setAttribute('data-confirm', 'Hapus ' + p.length + ' secret dari router?' + String.fromCharCode(10) + 'Koneksinya diputus dan data pelanggannya dihapus. Riwayat pembayaran tetap tersimpan.');
        if (f.requestSubmit) f.requestSubmit(); else f.submit();
    });
})();
</script>
<?php
page_foot();