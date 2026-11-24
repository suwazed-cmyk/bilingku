<?php
/** Admin Settings: data usaha, isolir PPPoE, scheduler, backup & restore, dan kata sandi admin. */

/** Berkas logo voucher yang ikut backup. Data panel diambil dari database lewat db_export(). */
function backup_files()
{
    $f = [];
    foreach (glob(ROOT . '/assets/upload/logo.*') ?: [] as $x) $f['upload/' . basename($x)] = $x;
    return $f;
}

/** Tulis isi backup ke zip: data panel (format data/*.json.php, sama dengan versi lama) + logo. */
function backup_to_zip($z)
{
    foreach (db_export() as $name => $s) $z->addFromString('data/' . $name, $s);
    foreach (backup_files() as $name => $path) $z->addFile($path, $name);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $act = post('act');
    if ($act === 'save') {
        $iso = preg_replace('/[^A-Za-z0-9_.\-]/', '', post('isolir_profile')) ?: 'isolir';
        cfg_set('settings', [
            'panel' => post('panel') !== '' ? post('panel') : 'Bilingku', 'company' => post('company'), 'address' => post('address'), 'phone' => post('phone'),
            'currency' => post('currency', 'Rp'), 'tz' => setting('tz'),
            'isolir_profile' => $iso,
            'wa_tpl' => str_replace("\r", '', (string)($_POST['wa_tpl'] ?? '')), 'voucher_note' => post('voucher_note'),
        ]);
        $n = routers() ? ppp_sync_all() : -1;
        flash('Pengaturan disimpan.' . ($n >= 0 ? ' Scheduler isolir ' . $n . ' pelanggan diperbarui.' : ''));
    } elseif ($act === 'sync') {
        $n = ppp_sync_all();
        if ($n >= 0) flash('Profil dan scheduler isolir ' . $n . ' pelanggan sudah disamakan dengan data tagihan.');
        else flash('Router tidak terhubung: ' . ($GLOBALS['ROS_ERR'] ?? ''), 'err');
    } elseif ($act === 'password') {
        $a = cfg('admin'); $new = (string)($_POST['new'] ?? '');
        if (!password_verify((string)($_POST['cur'] ?? ''), $a['hash'])) flash('Kata sandi saat ini salah.', 'err');
        elseif (strlen($new) < 8) flash('Kata sandi baru minimal 8 karakter.', 'err');
        elseif ($new !== (string)($_POST['new2'] ?? '')) flash('Ulangi kata sandi baru dengan sama persis.', 'err');
        else { $a['hash'] = password_hash($new, PASSWORD_DEFAULT); cfg_set('admin', $a); flash('Kata sandi diganti.'); }
    } elseif ($act === 'backup') {
        if (!class_exists('ZipArchive')) { flash('Hosting tidak mendukung ZipArchive, backup tidak bisa dibuat.', 'err'); redirect('settings'); }
        $tmp = tempnam(sys_get_temp_dir(), 'bk');
        $z = new ZipArchive();
        $z->open($tmp, ZipArchive::OVERWRITE);
        backup_to_zip($z);
        $z->addFromString('bilingku-backup.txt', app_name() . ' ' . APP_VER . "\nDibuat " . date('Y-m-d H:i:s') . "\n");
        $z->close();
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="backup-' . app_slug() . '-' . date('Ymd-His') . '.zip"');
        header('Content-Length: ' . filesize($tmp));
        readfile($tmp);
        @unlink($tmp);
        exit;
    } elseif ($act === 'restore') {
        $f = $_FILES['zip'] ?? null;
        if (!class_exists('ZipArchive')) { flash('Hosting tidak mendukung ZipArchive.', 'err'); redirect('settings'); }
        if (!$f || empty($f['tmp_name']) || !is_uploaded_file($f['tmp_name'])) { flash('Pilih file backup (.zip) dulu.', 'err'); redirect('settings'); }
        $z = new ZipArchive();
        if ($z->open($f['tmp_name']) !== true || $z->locateName('bilingku-backup.txt') === false) { flash('File ini bukan backup ' . app_name() . '.', 'err'); redirect('settings'); }
        // periksa semua isi dulu; hanya file data panel dan logo yang diterima
        $take = []; $bad = 0;
        for ($i = 0; $i < $z->numFiles; $i++) {
            $n = $z->getNameIndex($i);
            if ($n === 'bilingku-backup.txt') continue;
            if (preg_match('~^data/([A-Za-z0-9_\-]+\.json\.php)$~', $n, $m)) {
                $s = (string)$z->getFromIndex($i);
                $p = strpos($s, "\n");
                if (strpos($s, DB_GUARD) !== 0 || !is_array(json_decode(substr($s, $p + 1), true))) { $bad++; continue; }
                $take[DATA . '/' . $m[1]] = $s;
            } elseif (preg_match('~^upload/(logo\.(png|jpg|gif|webp))$~', $n, $m)) {
                $take[ROOT . '/assets/upload/' . $m[1]] = (string)$z->getFromIndex($i);
            } else $bad++;
        }
        $z->close();
        if (!isset($take[DATA . '/config.json.php'])) { flash('Backup tidak berisi config.json.php, restore dibatalkan.', 'err'); redirect('settings'); }
        // simpan keadaan sekarang dulu, supaya restore bisa dibatalkan
        $keep = DATA . '/sebelum-restore-' . date('Ymd-His') . '.zip';
        $k = new ZipArchive();
        if ($k->open($keep, ZipArchive::CREATE) === true) { backup_to_zip($k); $k->addFromString('bilingku-backup.txt', 'otomatis sebelum restore ' . date('Y-m-d H:i:s')); $k->close(); }
        if (!is_dir(ROOT . '/assets/upload')) @mkdir(ROOT . '/assets/upload', 0755, true);
        $ok = 0;
        foreach ($take as $path => $s) {
            if (substr($path, -9) === '.json.php' && strpos($path, DATA . '/') === 0) { if (db_import_raw($path, $s)) $ok++; }
            elseif (@file_put_contents($path, $s, LOCK_EX) !== false) $ok++;
        }
        session_regenerate_id(true);
        flash('Restore selesai: ' . $ok . ' file dipulihkan' . ($bad ? ', ' . $bad . ' file diabaikan' : '') . '. Keadaan sebelumnya disimpan di data/' . basename($keep) . '.');
    }
    redirect('settings');
}

$base = (req_https() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'domain-anda') . base_path();
$r = router();
$tz = date_default_timezone_get();
$bf = backup_files(); $bsize = 0; foreach ($bf as $p) $bsize += (int)@filesize($p);
$prev = glob(DATA . '/sebelum-restore-*.zip') ?: [];

page_head('Admin Settings');
?>
<div class="setgrid">
<form method="post" class="card">
<?= csrf_field() ?><input type="hidden" name="act" value="save">
<div class="cardhead"><?= icon('gear') ?><strong>General</strong></div>
<div class="cardbody">
<div class="btnrow"><button class="btn primary"><?= icon('save') ?>Save</button></div>
<div class="frow"><label for="s_panel">Panel Name</label><input id="s_panel" name="panel" value="<?= h(app_name()) ?>" maxlength="24" required></div>
<div class="frow"><label for="s_co">Company</label><input id="s_co" name="company" value="<?= h(setting('company')) ?>"></div>
<div class="frow"><label for="s_ph">Phone</label><input id="s_ph" name="phone" value="<?= h(setting('phone')) ?>"></div>
<div class="frow"><label for="s_ad">Address</label><input id="s_ad" name="address" value="<?= h(setting('address')) ?>"></div>
<div class="frow"><label for="s_cur">Currency</label><input id="s_cur" name="currency" value="<?= h(setting('currency')) ?>" maxlength="5"></div>

<div class="frow"><label for="s_vn">Voucher Note</label><input id="s_vn" name="voucher_note" value="<?= h(setting('voucher_note')) ?>" placeholder="Misalnya nomor pengaduan"></div>
<div class="fsep">Isolir PPPoE</div>
<div class="frow"><label for="s_iso">Isolir Profile</label><input id="s_iso" name="isolir_profile" value="<?= h(setting('isolir_profile')) ?>" required></div>
<div class="frow"><label for="s_wa">WhatsApp Message</label><textarea id="s_wa" name="wa_tpl" rows="4"><?= h(setting('wa_tpl')) ?></textarea></div>
<p class="hint" style="margin:0">Pesan bisa memakai {nama}, {jumlah}, {jatuh_tempo}, dan {perusahaan}. Paket isolir dibuat otomatis bila belum ada di router. Alur PPPoE: lewat jatuh tempo → pindah ke Isolir Profile → setelah Validity pelanggan habis (diisi per pelanggan di PPP User) secret di-disable, tidak dihapus → saat dibayar secret aktif lagi dan kembali ke paketnya.</p>
</div>
</form>

<div class="setcol">
<section class="card">
<div class="cardhead bkhead"><span class="bkhic"><?= icon('save') ?></span><div><strong>Backup &amp; Restore</strong><small>Manajemen cadangan data panel</small></div></div><div class="cardbody"><style>.bkhead small{display:block;font-size:.78rem;color:var(--muted,#6b7a89);font-weight:400}.bkhic{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:rgba(43,123,185,.12);color:#2b7bb9;flex:none}.bkhic .ic{width:20px;height:20px}.bkban{position:relative;overflow:hidden;display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:14px;color:#fff;background:linear-gradient(120deg,#1e9bd7,#2b7bb9 55%,#4f5bd5);box-shadow:0 8px 20px rgba(43,123,185,.25);margin:1rem 0}.bkban:after{content:"";position:absolute;right:-30px;bottom:-40px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.12)}.bkban.bad{background:linear-gradient(120deg,#ef4444,#c2410c);box-shadow:0 8px 20px rgba(220,38,38,.22)}.bkbic{width:48px;height:48px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.2);flex:none}.bkbic .ic{width:24px;height:24px}.bkban small{display:block;font-size:.75rem;letter-spacing:.08em;font-weight:600;opacity:.9}.bkban small em{font-style:normal;margin-left:6px;padding:1px 7px;border-radius:20px;background:rgba(255,255,255,.22)}.bkban b{font-size:1.5rem;line-height:1.3}.bkban b span{font-size:.85rem;font-weight:500;opacity:.9}.bklbl{margin:0 0 .5rem;font-size:.85rem;color:var(--muted,#6b7a89)}.bkchips{display:flex;flex-wrap:wrap;gap:8px}.bkchips span{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:9px;border:1px solid rgba(127,127,127,.2);background:rgba(127,127,127,.07);font-size:.85rem}.bkchips span:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--c)}.bkbig{width:100%;justify-content:center;height:46px;font-size:.95rem;margin-top:1.1rem}.bknote{text-align:center;margin:.6rem 0 0;font-size:.78rem;color:var(--muted,#6b7a89)}.bkfile{width:100%;box-sizing:border-box;height:auto!important;padding:.7rem!important;border:2px dashed rgba(127,127,127,.35)!important;border-radius:10px}</style><div class="seg"><button type="button" class="on" data-tab="bk_b">Backup</button><button type="button" data-tab="bk_r">Restore</button></div><div id="bk_b" class="segpane"><div class="bkban"><span class="bkbic"><?= icon('save') ?></span><div><small>PAKET CADANGAN<em>.ZIP</em></small><b><?= h(bytes($bsize)) ?> <span>&bull; <?= count($bf) ?> file</span></b></div></div><p class="bklbl">Data yang disertakan dalam arsip:</p><div class="bkchips"><span style="--c:#0ea5e9">Router</span><span style="--c:#10b981">Pelanggan</span><span style="--c:#f59e0b">Pembayaran</span><span style="--c:#a855f7">Voucher</span><span style="--c:#6366f1">Template &amp; Logo</span></div><form method="post"><?= csrf_field() ?><button class="btn primary bkbig" name="act" value="backup"><?= icon('save') ?>Unduh File Backup (.zip)</button></form><p class="bknote">Simpan file cadangan di penyimpanan eksternal atau cloud yang aman.</p></div><div id="bk_r" class="segpane" hidden><form method="post" enctype="multipart/form-data" data-confirm="Restore backup ini?&#10;Data panel sekarang akan diganti isi backup. Keadaan sekarang disimpan otomatis dulu."><?= csrf_field() ?><input type="hidden" name="act" value="restore"><div class="bkban bad"><span class="bkbic"><?= icon('reload') ?></span><div><small>PULIHKAN DATA<em>.ZIP</em></small><b>Restore <span>&bull; dari file backup</span></b></div></div><p class="bklbl">Pilih file backup (.zip):</p><input id="s_zip" class="bkfile" name="zip" type="file" accept=".zip,application/zip" required><button class="btn bad bkbig"><?= icon('reload') ?>Restore Sekarang</button></form><p class="bknote">Data sekarang disimpan otomatis sebelum diganti isi backup.<?php if ($prev) { ?><br>Cadangan terakhir: data/<?= h(basename(end($prev))) ?><?php } ?></p></div>
</div>
</section>

<section class="card">
<div class="cardhead"><?= icon('clock') ?><strong>Scheduler Isolir</strong></div>
<div class="cardbody">
<p class="hint" style="margin:0 0 .7rem">Satu scheduler di router (<code><?= h(ppp_sched_name()) ?></code>) memeriksa semua PPP secret tiap hari. Secret yang tanggal di comment-nya sudah lewat dipindah ke Isolir Profile, lalu koneksinya diputus 5 menit kemudian. Pakai tombol ini bila scheduler terhapus atau data di router diubah dari luar panel.</p>
<div class="btnrow"><?= confirm_btn('Reinstall Scheduler', 'sync', [], '', 'btn') ?></div>
</div>
</section>


<form method="post" class="card">
<?= csrf_field() ?><input type="hidden" name="act" value="password">
<div class="cardhead"><?= icon('lock') ?><strong>Admin Password</strong></div>
<div class="cardbody">
<div class="frow"><label for="s_cur_pw">Current Password</label><input id="s_cur_pw" type="password" name="cur" required autocomplete="off"></div>
<div class="frow"><label for="s_new_pw">New Password</label><input id="s_new_pw" type="password" name="new" required minlength="8" autocomplete="new-password"></div>
<div class="frow"><label for="s_new_pw2">Confirm Password</label><input id="s_new_pw2" type="password" name="new2" required minlength="8" autocomplete="new-password"></div>
<div class="btnrow" style="margin:0"><button class="btn primary"><?= icon('lock') ?>Change Password</button></div>
</div>
</form>
</div>
</div>
<?php page_foot();
