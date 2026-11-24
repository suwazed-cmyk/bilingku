<?php
/**
 * Template voucher (Default, Thermal, Small) yang bisa diubah di Settings > Template Editor.
 * Template ditulis dengan sintaks PHP terbatas: variabel ($username, $price, ...),
 * if / elseif / else, dan fungsi yang diizinkan saja. Template diperiksa sebelum disimpan dan sebelum dijalankan.
 */

/** Tampilan dalam satu template voucher (QR = Default dengan kode QR). */
define('VTPL_NAMES', ['default' => 'Default', 'small' => 'Small']);
/** Template voucher bawaan; masing-masing berisi tampilan Default dan Small. */
define('VTPL_SETS', ['std' => 'Standar', 'klasik' => 'Klasik', 'tiket' => 'Tiket', 'warna' => 'Warna per Harga', 'mono' => 'Hitam Putih']);
/** Template dokumen PPPoE (Kwitansi dan Tagihan), diedit di Template Editor yang sama. */
define('VTPL_DOCS', ['receipt' => 'Kwitansi PPP', 'invoice' => 'Tagihan PPP']);
function vtpl_all() { return VTPL_NAMES + VTPL_DOCS; }

/** Template voucher buatan sendiri: ['s1a2b3c' => 'Nama']. */
function vtpl_custom() { $m = db_load('vtpl_sets'); return is_array($m) ? $m : []; }
/** Semua template voucher: bawaan + buatan sendiri. */
function vtpl_sets() { return VTPL_SETS + vtpl_custom(); }
function vtpl_is_custom($s) { return isset(vtpl_custom()[$s]); }

/** Kunci penyimpanan satu tampilan: template Standar memakai default / small (sama seperti sebelumnya). */
function vtpl_key($set, $part)
{
    if (isset(VTPL_DOCS[$part])) return $part;
    $part = $part === 'small' ? 'small' : 'default';
    return ($set === '' || $set === 'std') ? $part : $set . '_' . $part;
}

/** Template voucher yang dipakai saat Print. */
function vtpl_active()
{
    $all = db_load('vtpl');
    $s = (string)($all['_set'] ?? '');
    return isset(vtpl_sets()[$s]) ? $s : 'std';
}

function vtpl_set_active($s)
{
    if (!isset(vtpl_sets()[$s])) return false;
    $all = db_load('vtpl');
    $all['_set'] = $s;
    return db_save('vtpl', $all);
}

/** Tambah template baru, isinya disalin dari template $from. Mengembalikan kodenya, atau '' bila gagal. */
function vtpl_add_set($label, $from)
{
    $m = vtpl_custom();
    do { $s = 's' . substr(md5(uniqid('', true)), 0, 6); } while (isset($m[$s]) || isset(VTPL_SETS[$s]));
    $m[$s] = $label;
    if (!db_save('vtpl_sets', $m)) return '';
    foreach (array_keys(VTPL_NAMES) as $p) vtpl_save(vtpl_key($s, $p), vtpl_get(vtpl_key($from, $p)));
    return $s;
}

function vtpl_rename_set($s, $label)
{
    $m = vtpl_custom();
    if (!isset($m[$s])) return false;
    $m[$s] = $label;
    return db_save('vtpl_sets', $m);
}

function vtpl_delete_set($s)
{
    $m = vtpl_custom();
    if (!isset($m[$s])) return false;
    unset($m[$s]);
    $all = db_load('vtpl');
    foreach (array_keys(VTPL_NAMES) as $p) { $k = vtpl_key($s, $p); unset($all[$k], $all['_at_' . $k]); }
    if (($all['_set'] ?? '') === $s) unset($all['_set']);
    db_save('vtpl', $all);
    return db_save('vtpl_sets', $m);
}

/** Fungsi yang boleh dipakai di template (fungsi teks dan angka yang aman). */
function vtpl_funcs()
{
    return ['substr', 'strlen', 'strpos', 'explode', 'preg_replace', 'date', 'strtoupper', 'strtolower', 'intval', 'sprintf',
        'number_format', 'date_default_timezone_set', 'str_replace', 'ucfirst', 'ucwords', 'trim', 'round', 'floor', 'ceil',
        'implode', 'str_pad', 'htmlspecialchars', 'floatval', 'abs', 'min', 'max', 'nl2br', 'rtrim', 'ltrim', 'count'];
}

/** Variabel yang disediakan untuk template; $type = nama template. */
function vtpl_vars_doc($type = 'default')
{
    if (isset(VTPL_DOCS[$type])) return ['$logo' => 'URL logo', '$company' => 'Nama usaha (Admin Settings)', '$address' => 'Alamat usaha', '$phone' => 'Telepon usaha',
        '$no' => 'Nomor kwitansi', '$nama' => 'Nama pelanggan', '$user' => 'ID pelanggan (secret)', '$alamat' => 'Alamat pelanggan', '$hp' => 'Nomor WhatsApp',
        '$paket' => 'Paket / Main Profile', '$tarif' => 'Tarif per bulan', '$months' => 'Jumlah bulan', '$from' => 'Berlaku mulai', '$to' => 'Berlaku sampai',
        '$paid_at' => 'Tanggal bayar', '$method' => 'Cara bayar', '$due' => 'Jatuh Tempo', '$total' => 'Jumlah (berformat)', '$gettotal' => 'Jumlah tanpa format',
        '$late' => 'yes = lewat jatuh tempo', '$date' => 'Tanggal cetak'];
    return ['$logo' => 'URL logo hotspot', '$hotspotname' => 'Nama hotspot', '$username' => 'Username / kode voucher', '$password' => 'Password',
        '$validity' => 'Validity profil', '$timelimit' => 'Time limit', '$datalimit' => 'Data limit', '$price' => 'Harga (Selling Price, atau Price bila kosong)',
        '$getprice' => 'Price tanpa format', '$getsprice' => 'Selling Price tanpa format', '$profile' => 'User profile', '$comment' => 'Comment / kelompok',
        '$dnsname' => 'DNS name hotspot', '$qrcode' => 'Kode QR (HTML)', '$qr' => 'yes / no', '$num' => 'Nomor voucher', '$usermode' => 'vc = user=pass, up = user & pass',
        '$status' => 'Status voucher: new / active / expired', '$statustext' => 'Status untuk ditampilkan: Baru / Dipakai / Expired'];
}

/** Template bawaan panel (untuk tombol Reset). */
function vtpl_default($name)
{
    $f = __DIR__ . '/vtpl/' . preg_replace('/[^a-z0-9_]/', '', $name) . '.txt';
    return is_file($f) ? (string)file_get_contents($f) : '';
}

/** Template yang dipakai sekarang (hasil edit, atau bawaan bila belum pernah diubah). */
function vtpl_get($name)
{
    $all = db_load('vtpl');
    return isset($all[$name]) && $all[$name] !== '' ? (string)$all[$name] : vtpl_default($name);
}

function vtpl_save($name, $src)
{
    $all = db_load('vtpl');
    $all[$name] = $src;
    $all['_at_' . $name] = date('Y-m-d H:i');
    return db_save('vtpl', $all);
}

/**
 * Periksa template: hanya sintaks yang diizinkan. Mengembalikan '' bila aman, atau pesan kesalahan.
 */
function vtpl_check($src)
{
    try { $tk = token_get_all($src, TOKEN_PARSE); }
    catch (ParseError $e) { return 'Sintaks PHP salah di baris ' . $e->getLine() . ': ' . $e->getMessage(); }
    $ok = [T_INLINE_HTML, T_OPEN_TAG, T_OPEN_TAG_WITH_ECHO, T_CLOSE_TAG, T_WHITESPACE, T_COMMENT, T_DOC_COMMENT,
        T_VARIABLE, T_CONSTANT_ENCAPSED_STRING, T_ENCAPSED_AND_WHITESPACE, T_LNUMBER, T_DNUMBER, T_STRING, T_CURLY_OPEN,
        T_IF, T_ELSEIF, T_ELSE, T_ECHO, T_ISSET, T_EMPTY,
        T_IS_EQUAL, T_IS_NOT_EQUAL, T_IS_IDENTICAL, T_IS_NOT_IDENTICAL, T_IS_SMALLER_OR_EQUAL, T_IS_GREATER_OR_EQUAL,
        T_BOOLEAN_AND, T_BOOLEAN_OR, T_LOGICAL_AND, T_LOGICAL_OR, T_CONCAT_EQUAL, T_PLUS_EQUAL, T_MINUS_EQUAL, T_MUL_EQUAL, T_DIV_EQUAL,
        T_INC, T_DEC, T_INT_CAST, T_DOUBLE_CAST, T_STRING_CAST, T_BOOL_CAST, T_COALESCE];
    $chars = ';(){}.=+-*/%<>!?:,[]"&|\'';
    $funcs = vtpl_funcs();
    $n = count($tk);
    for ($i = 0; $i < $n; $i++) {
        $t = $tk[$i];
        $next = null;
        for ($j = $i + 1; $j < $n; $j++) { if (is_array($tk[$j]) && in_array($tk[$j][0], [T_WHITESPACE, T_COMMENT], true)) continue; $next = $tk[$j]; break; }
        if (!is_array($t)) {
            if (strpos($chars, $t) === false) return 'Tanda "' . $t . '" tidak diizinkan di template.'; if ($next === '(' && in_array($t, [')', ']', '"', '}'], true)) return 'Memanggil hasil ekspresi sebagai fungsi tidak diizinkan di template.'; // cegah ("sys"."tem")(...)
            continue;
        }
        $line = $t[2];
        if (!in_array($t[0], $ok, true)) return 'Baris ' . $line . ': "' . trim($t[1]) . '" tidak diizinkan di template.'; if ($next === '(' && in_array($t[0], [T_CONSTANT_ENCAPSED_STRING, T_ENCAPSED_AND_WHITESPACE], true)) return 'Baris ' . $line . ': memanggil teks sebagai fungsi tidak diizinkan.'; // cegah 'system'(...)
        if ($t[0] === T_VARIABLE) {
            $v = strtolower($t[1]);
            if ($v === '$this' || $v === '$globals' || strpos($v, '$_') === 0) return 'Baris ' . $line . ': variabel ' . $t[1] . ' tidak diizinkan.';
            if ($next === '(') return 'Baris ' . $line . ': memanggil variabel sebagai fungsi tidak diizinkan.';
        }
        if ($t[0] === T_STRING) {
            $w = strtolower($t[1]);
            if ($next === '(') { if (!in_array($w, $funcs, true)) return 'Baris ' . $line . ': fungsi ' . $t[1] . '() tidak diizinkan.'; }
            elseif (!in_array($w, ['true', 'false', 'null'], true)) return 'Baris ' . $line . ': "' . $t[1] . '" tidak dikenal.';
        }
    }
    if (preg_match('/<\s*input\b/i', $src)) return 'Tag <input> tidak diizinkan di template.';
    return '';
}

/** Jalankan template untuk satu voucher. */
function vtpl_run($__src, array $__vars)
{
    extract($__vars, EXTR_SKIP);
    ob_start();
    static $__ok = []; $__h = md5($__src); if (!isset($__ok[$__h])) $__ok[$__h] = vtpl_check($__src); if ($__ok[$__h] !== '') { ob_end_clean(); return '<div style="color:#c00;font:12px sans-serif">Template ditolak: ' . h($__ok[$__h]) . '</div>'; } try { eval('?>' . $__src); } // template diperiksa juga saat dijalankan (mis. dari restore backup)
    catch (Throwable $__e) { echo '<div style="color:#c00;font:12px sans-serif">Template error: ' . h($__e->getMessage()) . '</div>'; }
    return ob_get_clean();
}

/** URL logo voucher (unggahan di Settings > Upload Logo, atau logo bawaan). */
function vtpl_logo()
{
    foreach (['png', 'jpg', 'gif', 'webp'] as $x) {
        $f = ROOT . '/assets/upload/logo.' . $x;
        if (is_file($f)) return 'assets/upload/logo.' . $x . '?t=' . filemtime($f);
    }
    return 'assets/logo-default.svg';
}

/** Ubah limit-bytes menjadi teks singkat (mis. 1GB, 500MB). */
function vtpl_bytes($b)
{
    $b = (float)$b;
    if ($b <= 0) return '';
    foreach (['B', 'KB', 'MB', 'GB', 'TB'] as $u) {
        if ($b < 1024 || $u === 'TB') return rtrim(rtrim(number_format($b, 2, '.', ''), '0'), '.') . $u;
        $b /= 1024;
    }
}

/**
 * Variabel template untuk satu user hotspot. $u = baris /ip/hotspot/user, $m = hs_meta profilnya.
 */
function vtpl_vars($u, $m, $num, $qr, $r = null)
{
    $r = $r ?: router();
    $hs = trim((string)($r['hotspot_name'] ?? '')) !== '' ? $r['hotspot_name'] : ($r['name'] ?? app_name());
    $dns = trim((string)($r['dns_name'] ?? ''));
    $name = (string)($u['name'] ?? ''); $pass = (string)($u['password'] ?? '');
    $cm = (string)($u['comment'] ?? '');
    $mode = substr($cm, 0, 2);
    if ($mode !== 'vc' && $mode !== 'up') $mode = $name === $pass ? 'vc' : 'up';
    $gp = (int)($m['price'] ?? 0); $gs = (int)($m['sprice'] ?? 0);
    $cur = (string)setting('currency');
    $price = $gs > 0 ? $cur . ' ' . number_format($gs, 0, ',', '.') : ($gp > 0 ? $cur . ' ' . number_format($gp, 0, ',', '.') : '');
    $lu = (string)($u['limit-uptime'] ?? '');
    if (in_array($lu, ['', '0', '0s', '00:00:00'], true)) $lu = '';
    // status voucher: expired (limit-uptime 1 detik), active (sudah dipakai / masa aktif berjalan), new (belum dipakai)
    $ut = (string)($u['uptime'] ?? '');
    $isExp = in_array($lu, ['1s', '00:00:01'], true);
    $used = ($ut !== '' && !in_array($ut, ['0s', '00:00:00'], true)) || preg_match('/^([a-z]{3}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}/i', $cm);
    $status = $isExp ? 'expired' : ($used ? 'active' : 'new');
    if ($isExp) $lu = '';   // "1s" hanyalah penanda expired, bukan batas waktu sungguhan
    $login = ($dns !== '' ? 'http://' . $dns : '') . '/login?username=' . rawurlencode($name) . '&password=' . rawurlencode($pass);
    $qrcode = $qr === 'yes' ? '<img class="qrcode" alt="QR" data-qr="' . h($login) . '" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">' : '';
    return [
        'logo' => vtpl_logo(), 'hotspotname' => h($hs), 'username' => h($name), 'password' => h($pass),
        'validity' => (string)($m['validity'] ?? ''), 'timelimit' => $lu, 'datalimit' => vtpl_bytes($u['limit-bytes-total'] ?? 0),
        'price' => h($price), 'getprice' => (string)$gp, 'getsprice' => (string)$gs, 'profile' => h((string)($u['profile'] ?? '')),
        'comment' => h($cm), 'dnsname' => h($dns), 'qrcode' => $qrcode, 'qr' => $qr, 'num' => (int)$num, 'usermode' => $mode,
        'status' => $status, 'statustext' => ['new' => 'Baru', 'active' => 'Dipakai', 'expired' => 'Expired'][$status],
    ];
}

/** CSS halaman cetak voucher. */
function vtpl_page_css()
{
    return 'body{color:#000;background-color:#fff;font-size:14px;font-family:"Helvetica",arial,sans-serif;margin:0;-webkit-print-color-adjust:exact}'
        . 'table.voucher{display:inline-block;border:2px solid black;margin:2px}'
        . '.bk-voucher-print{display:inline-block;vertical-align:top;page-break-inside:avoid;break-inside:avoid;-webkit-column-break-inside:avoid}'
        . '.bk-voucher-print>table.voucher{display:block}'
        . '@page{size:auto;margin-left:7mm;margin-right:3mm;margin-top:9mm;margin-bottom:3mm}'
        . '@media print{html,body{height:auto}table{page-break-inside:auto}tr{page-break-inside:avoid;page-break-after:auto}thead{display:table-header-group}tfoot{display:table-footer-group}.noprint{display:none!important}}'
        . '#num{float:right;display:inline-block}.qrc{width:30px;height:30px;margin-top:1px}';
}

/** Skrip pembuat kode QR untuk semua <img data-qr>. */
function vtpl_qr_js()
{
    return '<script src="' . asset_url('qrcode.min.js') . '"></script><script>(function(){document.querySelectorAll("img[data-qr]").forEach(function(el){try{var q=qrcode(0,"L");q.addData(el.getAttribute("data-qr"));q.make();el.src=q.createDataURL(6,0);}catch(e){}});})();</script>';
}


/** Pilihan Character untuk username / password. */
function hs_charsets()
{
    return ['lower' => 'Random abcd', 'upper' => 'Random ABCD', 'upplow' => 'Random aBcD',
        'lower1' => 'Random abcd2345', 'upper1' => 'Random ABCD2345', 'upplow1' => 'Random aBcD2345',
        'mix' => 'Random 5ab2c34d', 'mix1' => 'Random 5AB2C34D', 'mix2' => 'Random 5aB2c34D', 'num' => 'Random 1234'];
}

/** Nama acak sesuai Character: "abcd2345" = huruf lalu angka, "5ab2c34d" = huruf dan angka campur. */
function hs_rand_name($len, $cs)
{
    $set = ['lower' => 'lower', 'upper' => 'upper', 'upplow' => 'lower+upper', 'mix' => 'lower+num', 'mix1' => 'upper+num', 'mix2' => 'lower+upper+num', 'num' => 'num'];
    if (isset($set[$cs])) return rand_str($len, $set[$cs]);
    $base = ['lower1' => 'lower', 'upper1' => 'upper', 'upplow1' => 'lower+upper'];
    $nd = intdiv($len, 2);
    return rand_str($len - $nd, $base[$cs] ?? 'lower') . rand_str($nd, 'num');
}

/**
 * Buat banyak user hotspot sekaligus (Generate). Comment: vc-123-11.13.26-catatan.
 * $o: qty, len, prefix, charset, mode (vc|up), profile, server, limit_uptime, limit_bytes, comment.
 * Mengembalikan ['made' => jumlah, 'comment' => comment, 'names' => [nama]].
 */
function hs_generate_users(array $o)
{
    @set_time_limit(300);
    $job = hs_gen_job_start($o);
    $res = hs_gen_job_step($job, $job['qty']);
    return ['made' => $job['made'], 'comment' => $job['comment'], 'names' => $job['names'], 'err' => $res['err'], 'full' => $res['full']];
}

/**
 * Siapkan Generate bertahap: baca nama & kode comment yang sudah ada di router (sekali saja), pilih kode batch.
 * Hasilnya disimpan di sesi lalu dikerjakan sedikit-sedikit dengan hs_gen_job_step() supaya ada progres
 * dan proses panjang tidak diputus hosting.
 */
function hs_gen_job_start(array $o)
{
    $qty = max(1, min(2000, (int)($o['qty'] ?? 1)));
    $len = max(3, min(8, (int)($o['len'] ?? 4)));
    $prefix = preg_replace('/[^A-Za-z0-9]/', '', (string)($o['prefix'] ?? ''));
    $cs = isset(hs_charsets()[$o['charset'] ?? '']) ? $o['charset'] : 'lower';
    $mode = ($o['mode'] ?? '') === 'vc' ? 'vc' : 'up';
    $note = preg_replace('/[^A-Za-z0-9 _.]/', '', (string)($o['comment'] ?? ''));
    $base = ['profile' => (string)($o['profile'] ?? 'default'), 'server' => ($o['server'] ?? '') !== '' ? $o['server'] : 'all',
        'limit-uptime' => ($o['limit_uptime'] ?? '') !== '' ? $o['limit_uptime'] : '0', 'limit-bytes-total' => (string)($o['limit_bytes'] ?? '0')];
    // nama dan kode comment yang sudah ada di router, supaya tidak ada yang kembar
    $taken = []; $codes = [];
    foreach (rq('/ip/hotspot/user/print', ['.proplist' => 'name,comment']) as $u) {
        $taken[strtolower($u['name'])] = 1;
        if (preg_match('/^(?:vc|up)-(\d+)-(\d\d\.\d\d\.\d\d)-/', (string)($u['comment'] ?? ''), $m)) $codes[$m[1] . '|' . $m[2]] = 1;
    }
    // kode batch (vc-123-...) yang belum dipakai di tanggal yang sama, supaya Print per comment tidak tercampur batch lain
    $day = date('m.d.y'); $code = random_int(100, 999);
    for ($i = 0; $i < 50 && isset($codes[$code . '|' . $day]); $i++) $code = random_int(100, 999);
    if (isset($codes[$code . '|' . $day])) $code = random_int(1000, 9999);
    return ['qty' => $qty, 'len' => $len, 'prefix' => $prefix, 'cs' => $cs, 'mode' => $mode, 'base' => $base,
        'comment' => $mode . '-' . $code . '-' . $day . '-' . $note, 'taken' => $taken, 'made' => 0, 'tries' => 0, 'names' => []];
}

/** Buat sampai $n user berikutnya dari $job. Mengembalikan ['err' => pesan router, 'full' => kombinasi nama habis]. */
function hs_gen_job_step(array &$job, $n)
{
    $target = min($job['qty'], $job['made'] + max(1, (int)$n)); $err = '';
    $limit = $job['qty'] * 30;
    while ($job['made'] < $target && $job['tries'] < $limit) {
        $job['tries']++;
        $name = $job['prefix'] . hs_rand_name($job['len'], $job['cs']);
        $k = strtolower($name); // dianggap sama walau beda huruf besar/kecil, supaya voucher tidak tertukar saat diketik
        if (isset($job['taken'][$k])) continue;
        $job['taken'][$k] = 1;
        $pass = $job['mode'] === 'vc' ? $name : rand_str($job['len'], 'num');
        if (!rdo('/ip/hotspot/user/add', $job['base'] + ['name' => $name, 'password' => $pass, 'comment' => $job['comment']], true)) {
            $e = (string)($GLOBALS['ROS_ERR'] ?? '');
            if (stripos($e, 'already') !== false) continue; // dibuat bersamaan dari tempat lain: lewati, cari nama lain
            $err = $e; break;
        }
        $job['made']++; $job['names'][] = $name;
    }
    return ['err' => $err, 'full' => $err === '' && $job['made'] < $job['qty'] && $job['tries'] >= $limit];
}

/** Satu tombol Export dengan pilihan CSV / XLSX. */ function export_btn($page, array $qs = []) { return '<details class="xdd"><summary class="btn small dark" title="Export">' . icon('save') . 'Export</summary><div class="xmenu"><a href="' . h(url($page, $qs + ['export' => 'csv'])) . '">CSV</a><a href="' . h(url($page, $qs + ['export' => 'xlsx'])) . '">XLSX</a></div></details>'; } /** Kirim file .xlsx sederhana (satu sheet). Tanpa ZipArchive di hosting, dikirim sebagai .csv. */
function xlsx_send($filename, array $head, array $rows)
{
    if (!class_exists('ZipArchive') || (string)($_GET['export'] ?? '') === 'csv') {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . preg_replace('/\.xlsx$/', '.csv', $filename) . '"');
        $o = fopen('php://output', 'w');
        fputcsv($o, $head);
        foreach ($rows as $r) fputcsv($o, $r);
        exit;
    }
    $x = function ($s) { return htmlspecialchars((string)$s, ENT_XML1 | ENT_QUOTES, 'UTF-8'); };
    $col = function ($i) { $s = ''; for ($i++; $i > 0; $i = intdiv($i - 1, 26)) $s = chr(65 + ($i - 1) % 26) . $s; return $s; };
    $sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    foreach (array_merge([$head], $rows) as $ri => $r) {
        $sheet .= '<row r="' . ($ri + 1) . '">';
        foreach (array_values($r) as $ci => $v) {
            $ref = $col($ci) . ($ri + 1);
            $sheet .= is_int($v) || is_float($v) ? '<c r="' . $ref . '"><v>' . $v . '</v></c>' : '<c r="' . $ref . '" t="inlineStr"' . ($ri ? '' : ' s="1"') . '><is><t>' . $x($v) . '</t></is></c>';
        }
        $sheet .= '</row>';
    }
    $sheet .= '</sheetData></worksheet>';
    $tmp = tempnam(sys_get_temp_dir(), 'xl');
    $z = new ZipArchive();
    $z->open($tmp, ZipArchive::OVERWRITE);
    $z->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
    $z->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    $z->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Users" sheetId="1" r:id="rId1"/></sheets></workbook>');
    $z->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    $z->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>');
    $z->addFromString('xl/worksheets/sheet1.xml', $sheet);
    $z->close();
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($tmp));
    readfile($tmp);
    @unlink($tmp);
    exit;
}
