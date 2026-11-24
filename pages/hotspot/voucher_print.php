<?php
/**
 * Cetak voucher dengan template Default / Thermal / Small (Settings > Template Editor).
 * ?id=<.id> atau ?user=<nama>   : satu user (bawaan template Thermal, dari tombol print di daftar user)
 * ?ids=a,b / POST ids[]          : user yang dicentang
 * ?profile= / ?comment= / ?q=    : semua user hasil saringan
 * &tpl=default|thermal|small &qr=yes|no
 * POST act=preview               : pratinjau template dari Template Editor (tanpa mencetak)
 */
need_ros('Print');

$preview = $_SERVER['REQUEST_METHOD'] === 'POST' && post('act') === 'preview';
$ids = isset($_POST['ids']) && is_array($_POST['ids']) ? array_map('strval', $_POST['ids']) : [];
if (!$ids && get('ids') !== '') $ids = array_filter(explode(',', get('ids')), 'strlen');
$single = get('id') !== '' || get('user') !== '';
if (get('id') !== '') $ids = [get('id')];
$fProfile = get('profile'); $fComment = get('comment'); $q = strtolower(get('q')); $uname = get('user');
$fs = in_array(get('f'), ['online', 'new', 'exp'], true) ? get('f') : ''; // saringan status dari User List
$set = isset(vtpl_sets()[get('set')]) ? get('set') : vtpl_active();
$tpl = (get('tpl') === 'small' || get('small') === 'yes') ? 'small' : 'default'; // tpl lama (thermal) ikut Default
$qr = get('qr') === 'yes' ? 'yes' : 'no';
if ($preview) { $tpl = post('part') === 'small' ? 'small' : 'default'; $set = isset(vtpl_sets()[post('set')]) ? post('set') : 'std'; $qr = post('qr') === 'yes' ? 'yes' : 'no'; }

$meta = [];
foreach (rq('/ip/hotspot/user/profile/print', ['.proplist' => 'name,on-login']) as $p) $meta[$p['name']] = hs_meta($p['on-login'] ?? '');

$users = [];
// ambil seperlunya: per comment / per nama langsung dari router (jauh lebih cepat daripada semua voucher)
$uq = ['.proplist' => '.id,name,password,profile,limit-uptime,limit-bytes-total,comment,uptime,mac-address'];
if (!$preview && !$ids) { if ($uname !== '') $uq['?name'] = $uname; elseif ($fComment !== '') $uq['?comment'] = $fComment; }
$all = rq('/ip/hotspot/user/print', $uq);
$online = [];
if ($fs === 'online') foreach (rq('/ip/hotspot/active/print', ['.proplist' => 'user']) as $a) $online[$a['user'] ?? ''] = 1;
$expOf = function ($cm) { return (bool)preg_match('/^([a-z]{3}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}/', (string)$cm); };
foreach ($all as $u) {
    if (($u['name'] ?? '') === 'default-trial') continue;
    if ($preview) { $users[] = $u; if (count($users) >= (int)post('n', '1')) break; continue; }
    if ($uname !== '') { if ($u['name'] !== $uname) continue; }
    elseif ($ids) { if (!in_array($u['.id'], $ids, true)) continue; }
    else {
        if ($fProfile === '' && $fComment === '' && $q === '' && $fs === '') continue;
        if ($fs === 'online' && !isset($online[$u['name']])) continue;
        if ($fs === 'new' && ((($t = (string)($u['uptime'] ?? '')) !== '' && dur_secs($t) > 0) || $expOf($u['comment'] ?? ''))) continue;
        if ($fs === 'exp' && !in_array((string)($u['limit-uptime'] ?? ''), ['1s', '00:00:01'], true)) continue;
        if ($fProfile !== '' && ($u['profile'] ?? '') !== $fProfile) continue;
        if ($fComment !== '' && ($u['comment'] ?? '') !== $fComment) continue;
        if ($q !== '' && strpos(strtolower($u['name'] . ' ' . ($u['comment'] ?? '') . ' ' . ($u['mac-address'] ?? '')), $q) === false) continue;
    }
    $users[] = $u;
}
if ($preview && !$users) $users[] = ['name' => 'contoh123', 'password' => '1234', 'profile' => 'default', 'comment' => 'up-123-' . date('m.d.y') . '-', 'limit-uptime' => '', 'limit-bytes-total' => 0];

$src = $preview ? str_replace("\r", '', (string)($_POST['src'] ?? '')) : vtpl_get(vtpl_key($set, $tpl));
$err = vtpl_check($src);
$title = 'Voucher-' . (router()['name'] ?? '') . '-' . ($fProfile !== '' ? $fProfile : ($users[0]['profile'] ?? '')) . '-' . $fComment;

header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: SAMEORIGIN');
?>
<!DOCTYPE html>
<html lang="id" translate="no" class="notranslate">
<head><link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<meta name="google" content="notranslate" />
<title><?= h($title) ?></title>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta http-equiv="pragma" content="no-cache" />
<meta name="viewport" content="width=device-width,initial-scale=1">
<style><?= vtpl_page_css() ?>
.noprint{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;margin:0 0 8px;background:#f4f7fa;border-bottom:1px solid #dde3ea;font:13px system-ui,sans-serif}
.noprint a,.noprint button{font:inherit;padding:5px 11px;border-radius:6px;border:1px solid #c9d3de;background:#fff;color:#1f2d3a;text-decoration:none;cursor:pointer}
.noprint .on{background:#1b76ad;border-color:#1b76ad;color:#fff}.noprint .pr{background:#1b76ad;border-color:#1b76ad;color:#fff;font-weight:600}
.noprint span{color:#6b7a89;margin-left:auto}
.noprint select{font:inherit;padding:5px 8px;border-radius:6px;border:1px solid #c9d3de;background:#fff;color:#1f2d3a;min-width:180px}
.noprint b{font-weight:600;color:#6b7a89;font-size:12px;letter-spacing:.04em;text-transform:uppercase}
.tplerr{margin:12px;padding:10px 12px;border-radius:8px;background:#fde5e2;color:#9b2c20;font:13px system-ui,sans-serif}
</style>
</head>
<body<?= !$preview && !$err && $users && get('noprint') !== '1' ? ' onload="window.print()"' : '' ?>>
<?php if (!$preview) {
    $base = array_filter(['id' => get('id'), 'user' => $uname, 'ids' => $ids && !$single ? implode(',', $ids) : '', 'profile' => $fProfile, 'comment' => $fComment, 'q' => get('q')], 'strlen');
    $sel = '<select aria-label="Template voucher" onchange="location.href=this.value">';
    foreach (vtpl_sets() as $k => $v) $sel .= '<option value="' . h(url('voucher_print', $base + ['set' => $k, 'tpl' => $tpl, 'qr' => $qr])) . '"' . ($k === $set ? ' selected' : '') . '>' . h($v) . '</option>';
    $sel .= '</select>';
    $lnk = function ($t, $qq, $label) use ($base, $set, $tpl, $qr) {
        return '<a class="' . ($t === $tpl && $qq === $qr ? 'on' : '') . '" href="' . h(url('voucher_print', $base + ['set' => $set, 'tpl' => $t, 'qr' => $qq])) . '">' . h($label) . '</a>';
    };
    echo '<div class="noprint"><b>Template</b>' . $sel . $lnk('default', 'no', 'Default') . $lnk('default', 'yes', 'QR') . $lnk('small', 'no', 'Small')
        . '<button class="pr" onclick="window.print()">Print ' . count($users) . ' voucher</button><span>Tambah atau ubah template di Settings &rsaquo; Template Editor</span></div>';
}
if ($err) { echo '<div class="tplerr">Template ' . h(vtpl_sets()[$set] . ' ' . VTPL_NAMES[$tpl]) . ' tidak bisa dipakai: ' . h($err) . '</div>'; }
elseif (!$users) { echo '<p class="tplerr" style="background:#f4f7fa;color:#465666">Tidak ada voucher yang dipilih.</p>'; }
else {
    $seen = [];
    foreach ($users as $i => $u) {
        $m = $meta[$u['profile'] ?? ''] ?? ['price' => 0, 'sprice' => 0, 'validity' => ''];
        // CSS template cukup sekali di halaman, tidak diulang untuk tiap voucher
        $html = preg_replace_callback('#<style\b[^>]*>.*?</style>\s*#is', function ($x) use (&$seen) {
            $k = md5($x[0]);
            if (isset($seen[$k])) return '';
            $seen[$k] = 1;
            return $x[0];
        }, vtpl_run($src, vtpl_vars($u, $m, $i + 1, $qr)));
        echo '<div class="bk-voucher-print">' . $html . '</div>';
    }
    if ($qr === 'yes') echo vtpl_qr_js();
}
?>
</body>
</html>
