<?php
/**
 * Bilingku — billing PPPoE & Hotspot MikroTik.
 * Data panel disimpan di database SQLite (data/bilingku.db); voucher, profil, dan secret tetap di router.
 * Jika hosting tidak punya pdo_sqlite, otomatis kembali ke berkas JSON di folder data/.
 */
define('APP_NAME', 'Bilingku');
define('APP_VER', '3.5.7');
define('ROOT', dirname(__DIR__));
define('DATA', ROOT . '/data');
define('DB_GUARD', "<?php http_response_code(403); exit; ?>\n");

error_reporting(getenv('BILINGKU_DEBUG') ? E_ALL : E_ALL & ~E_NOTICE & ~E_WARNING & ~E_DEPRECATED);
ini_set('display_errors', '0');

require __DIR__ . '/routeros.php';

/* ---------- penyimpanan: SQLite (bawaan) atau berkas JSON (cadangan) ---------- */

define('DB_SQLITE', DATA . '/bilingku.db');

function db_file($name)
{
    return DATA . '/' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $name) . '.json.php';
}

/** Koneksi SQLite, atau null bila hosting tidak mendukung (memakai berkas JSON). */
function sql()
{
    static $pdo = false;
    if ($pdo !== false) return $pdo;
    if (!extension_loaded('pdo_sqlite') || getenv('BILINGKU_JSON')) return $pdo = null;
    try {
        if (!is_dir(DATA)) { @mkdir(DATA, 0755, true); @file_put_contents(DATA . '/.htaccess', 'Require all denied' . PHP_EOL); @file_put_contents(DATA . '/index.php', '<?php http_response_code(403);'); }
        $pdo = new PDO('sqlite:' . DB_SQLITE);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
        $v = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
        if ($v < 1) {
            $pdo->exec('CREATE TABLE IF NOT EXISTS docs (name TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL); PRAGMA user_version = 1;');
            db_import_files($pdo);
        }
    } catch (Exception $e) {
        error_log('Bilingku: SQLite tidak bisa dipakai, kembali ke berkas JSON: ' . $e->getMessage());
        $pdo = null;
    }
    return $pdo;
}

/** Pindahan satu kali: semua data/*.json.php dimasukkan ke database, berkas lama disimpan di data/json-lama/. */
function db_import_files($pdo)
{
    $files = glob(DATA . '/*.json.php') ?: [];
    if (!$files) return;
    $st = $pdo->prepare('INSERT OR REPLACE INTO docs (name, data, updated) VALUES (?, ?, ?)');
    $pdo->beginTransaction();
    foreach ($files as $f) {
        $s = (string)@file_get_contents($f);
        $p = strpos($s, "\n");
        $json = $p === false ? $s : substr($s, $p + 1);
        if (!is_array(json_decode($json, true))) continue;
        $st->execute([basename($f, '.json.php'), $json, (int)@filemtime($f)]);
    }
    $pdo->commit();
    $old = DATA . '/json-lama';
    if (!is_dir($old)) @mkdir($old, 0700, true);
    @file_put_contents($old . '/.htaccess', "Require all denied\n");
    foreach ($files as $f) @rename($f, $old . '/' . basename($f));
}

function db_exists($name)
{
    if ($pdo = sql()) { $st = $pdo->prepare('SELECT 1 FROM docs WHERE name = ?'); $st->execute([$name]); return (bool)$st->fetchColumn(); }
    return is_file(db_file($name));
}

function db_delete($name)
{
    if ($pdo = sql()) return $pdo->prepare('DELETE FROM docs WHERE name = ?')->execute([$name]);
    return @unlink(db_file($name));
}

function db_rename($from, $to)
{
    if ($pdo = sql()) return $pdo->prepare('UPDATE OR REPLACE docs SET name = ? WHERE name = ?')->execute([$to, $from]);
    return @rename(db_file($from), db_file($to));
}

/** Semua data untuk backup: nama berkas => isi (format data/*.json.php, sama dengan versi lama). */
function db_export()
{
    $out = [];
    if ($pdo = sql()) {
        foreach ($pdo->query('SELECT name, data FROM docs ORDER BY name') as $r) if ($r['name'] !== 'login_fail') $out[$r['name'] . '.json.php'] = DB_GUARD . $r['data'];
        return $out;
    }
    foreach (glob(DATA . '/*.json.php') ?: [] as $x) if (basename($x) !== 'login_fail.json.php') $out[basename($x)] = (string)file_get_contents($x);
    return $out;
}

/** Simpan isi satu berkas backup (DB_GUARD + JSON) ke penyimpanan. */
function db_import_raw($file, $s)
{
    $name = basename($file, '.json.php');
    $p = strpos($s, "\n");
    $d = json_decode($p === false ? $s : substr($s, $p + 1), true);
    return is_array($d) ? db_save($name, $d) : false;
}

function db_load($name, $def = [])
{
    if ($pdo = sql()) {
        $st = $pdo->prepare('SELECT data FROM docs WHERE name = ?');
        $st->execute([$name]);
        $j = $st->fetchColumn();
        if ($j === false) return $def;
        $d = json_decode($j, true);
        return is_array($d) ? $d : $def;
    }
    $f = db_file($name);
    if (!is_file($f)) return $def;
    $s = @file_get_contents($f);
    if ($s === false) return $def;
    $p = strpos($s, "\n");
    $d = json_decode($p === false ? $s : substr($s, $p + 1), true);
    return is_array($d) ? $d : $def;
}

function db_save($name, $data)
{
    if ($pdo = sql()) {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_PARTIAL_OUTPUT_ON_ERROR);
        try { return $pdo->prepare('INSERT OR REPLACE INTO docs (name, data, updated) VALUES (?, ?, ?)')->execute([$name, $json, time()]); }
        catch (Exception $e) { error_log('Bilingku db_save ' . $name . ': ' . $e->getMessage()); return false; }
    }
    if (!is_dir(DATA)) { @mkdir(DATA, 0755, true); @file_put_contents(DATA . '/.htaccess', 'Require all denied' . PHP_EOL); @file_put_contents(DATA . '/index.php', '<?php http_response_code(403);'); } // folder data baru (instal baru) langsung dikunci
    $f = db_file($name);
    $tmp = $f . '.' . mt_rand() . '.tmp';
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_PARTIAL_OUTPUT_ON_ERROR);
    if (@file_put_contents($tmp, DB_GUARD . $json, LOCK_EX) === false) return false;
    if (!@rename($tmp, $f)) { @unlink($tmp); return false; }
    return true;
}

/* ---------- konfigurasi ---------- */

$CFG = db_load('config');

function cfg($key = null, $def = null)
{
    global $CFG;
    if ($key === null) return $CFG;
    return isset($CFG[$key]) ? $CFG[$key] : $def;
}

function cfg_set($key, $val)
{
    global $CFG;
    $CFG[$key] = $val;
    return db_save('config', $CFG);
}

function setting($key)
{
    static $def = [
        'company' => 'Bilingku Net', 'address' => '', 'phone' => '', 'currency' => 'Rp',
        'tz' => 'Asia/Jakarta', 'iso_off' => 0, 'isolir_profile' => 'isolir',
        'wa_tpl' => "Halo {nama}, tagihan internet sebesar {jumlah} jatuh tempo {jatuh_tempo}. Mohon segera melakukan pembayaran. Terima kasih.\n{perusahaan}",
        'voucher_note' => '',
    ];

    $s = cfg('settings', []);
    return isset($s[$key]) ? $s[$key] : (isset($def[$key]) ? $def[$key] : null);
}

@date_default_timezone_set(setting('tz') ?: 'Asia/Jakarta');

/* ---------- sesi & keamanan ---------- */

/** Lama tanpa aktivitas sebelum otomatis logout (detik). */
if (!defined('IDLE_MAX')) define('IDLE_MAX', 3600);

/** HTTPS, termasuk saat dibuka lewat panel utama (proxy). */
function req_https()
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    return strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

/** Path dasar panel, mis. "/bilingku" di hosting atau "/billing" bila dibuka lewat panel utama. */
function base_path()
{
    $px = (string)($_SERVER['HTTP_X_FORWARDED_PREFIX'] ?? '');
    if (preg_match('#^/[a-z0-9-]+$#', $px)) return $px;
    return rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
}

function start_session()
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('bilingku_' . preg_replace('/\W/', '', basename(ROOT))); // cookie khusus folder ini supaya tidak bentrok dengan salinan Bilingku lain
    $secure = req_https();
    // sesi disimpan di data/sess milik panel, supaya tidak ikut dibersihkan aplikasi lain di hosting yang sama
    $dir = ROOT . '/data/sess';
    if (!is_dir($dir) && @mkdir($dir, 0700, true)) @file_put_contents($dir . '/.htaccess', "Require all denied\n");
    $own = is_dir($dir) && is_writable($dir);
    $def = (string)session_save_path();
    if ($own) session_save_path($dir);
    ini_set('session.gc_maxlifetime', (string)(IDLE_MAX + 900));
    session_set_cookie_params(['path' => base_path() . '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $secure]);
    session_start();
    if ($own && empty($_SESSION) && isset($_COOKIE[session_name()])) {
        // pindahan satu kali: sesi yang masih tersimpan di folder bawaan hosting dibawa ke data/sess, supaya tidak perlu login ulang
        session_write_close();
        session_save_path($def); session_start(); $old = $_SESSION; session_write_close();
        session_save_path($dir); session_start();
        if (!empty($old['auth'])) $_SESSION = $old;
    }
    // logout otomatis setelah IDLE_MAX tanpa aktivitas. Permintaan latar (p=api: grafik, log, ping) tidak dihitung aktivitas.
    if (!empty($_SESSION['auth'])) {
        $now = time(); $seen = (int)($_SESSION['seen'] ?? $now);
        if ($now - $seen >= IDLE_MAX) {
            $_SESSION = [];
            session_regenerate_id(true);
            flash('Anda otomatis keluar karena ' . (int)round(IDLE_MAX / 60) . ' menit tanpa aktivitas. Silakan login lagi.', 'err');
        } elseif ((string)($_GET['p'] ?? '') !== 'api' || !isset($_SESSION['seen'])) {
            $_SESSION['seen'] = $now;
        }
    }
    tz_apply();
}

/** Buang berkas sesi lama di data/sess (dipanggil saat login). */
function session_sweep()
{
    foreach (glob(ROOT . '/data/sess/sess_*') ?: [] as $f) if (@filemtime($f) < time() - IDLE_MAX - 900) @unlink($f);
}

/**
 * Alamat aset CSS/JS lewat asset.php: diberi cache 1 tahun (immutable) dan versi dari waktu ubah berkasnya,
 * jadi browser tidak bertanya lagi ke server sampai berkasnya benar-benar berubah. Sudah di-escape untuk atribut HTML.
 */
function asset_url($name)
{
    $m = (int)@filemtime(ROOT . '/assets/' . $name);
    return 'asset.php?f=' . rawurlencode($name) . '&amp;v=' . ($m ?: APP_VER);
}

/** Versi aset (CSS/JS) dari waktu ubah berkasnya, supaya browser otomatis memuat yang baru tanpa menaikkan APP_VER. */
function asset_ver()
{
    static $v = null;
    if ($v !== null) return $v;
    $m = 0;
    foreach (array_merge(glob(ROOT . '/assets/*.css') ?: [], glob(ROOT . '/assets/*.js') ?: []) as $f) $m = max($m, (int)@filemtime($f));
    return $v = $m ? (string)$m : APP_VER;
}

/* ---------- zona waktu: mengikuti router ---------- */

/** Pakai zona waktu router yang sedang dipilih (disimpan saat terakhir terhubung). */
function tz_apply()
{
    $r = router();
    $tz = (string)($r['tz'] ?? '');
    if ($tz !== '' && in_array($tz, timezone_identifiers_list(), true)) @date_default_timezone_set($tz);
}

/** Baca time-zone-name dari /system/clock router (sekali per sesi), simpan, lalu pakai. */
function tz_sync($api)
{
    $id = router_id();
    $k = 'tzchk_' . $id;
    if (session_status() === PHP_SESSION_ACTIVE && !empty($_SESSION[$k])) return;
    try { $c = $api->comm('/system/clock/print'); } catch (Exception $e) { return; }
    if (session_status() === PHP_SESSION_ACTIVE) $_SESSION[$k] = 1;
    $tz = (string)($c[0]['time-zone-name'] ?? '');
    if ($tz === '' || !in_array($tz, timezone_identifiers_list(), true)) return;
    $rs = routers();
    if (isset($rs[$id]) && ($rs[$id]['tz'] ?? '') !== $tz) { $rs[$id]['tz'] = $tz; cfg_set('routers', $rs); }
    @date_default_timezone_set($tz);
}

function authed() { return !empty($_SESSION['auth']); }

function csrf_token()
{
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}

function csrf_field() { return '<input type="hidden" name="_t" value="' . csrf_token() . '">'; }

function csrf_ok()
{
    return isset($_POST['_t'], $_SESSION['csrf']) && hash_equals($_SESSION['csrf'], (string)$_POST['_t']);
}

function secret_key()
{
    $k = cfg('key');
    if (!$k) { $k = bin2hex(random_bytes(24)); cfg_set('key', $k); }
    return hash('sha256', $k, true);
}

function enc($s)
{
    if (!function_exists('openssl_encrypt')) return 'b:' . base64_encode($s);
    $iv = random_bytes(16);
    return 'a:' . base64_encode($iv . openssl_encrypt($s, 'aes-256-cbc', secret_key(), OPENSSL_RAW_DATA, $iv));
}

function dec($s)
{
    $t = substr((string)$s, 0, 2); $raw = base64_decode(substr((string)$s, 2));
    if ($t === 'b:') return $raw;
    if ($t !== 'a:' || strlen($raw) < 17) return '';
    $p = openssl_decrypt(substr($raw, 16), 'aes-256-cbc', secret_key(), OPENSSL_RAW_DATA, substr($raw, 0, 16));
    return $p === false ? '' : $p;
}

/* ---------- helper umum ---------- */

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function post($k, $d = '') { return isset($_POST[$k]) && !is_array($_POST[$k]) ? trim((string)$_POST[$k]) : $d; }
function get($k, $d = '') { return isset($_GET[$k]) && !is_array($_GET[$k]) ? trim((string)$_GET[$k]) : $d; }
function has($hay, $needle) { return $needle === '' || strpos((string)$hay, (string)$needle) !== false; }

function url($p = 'dashboard', $q = [])
{
    $q = ['p' => $p] + $q; if (!isset($q['session']) && !in_array($p, ['routers', 'login', 'setup'], true) && ($s = cur_session()) !== '') $q = ['session' => $s] + $q; return './?' . http_build_query($q); // bawa ?session= router aktif di setiap link (seperti Mikhmon)
}

function redirect($p, $q = [])
{
    header('Location: ' . url($p, $q));
    exit;
}

function flash($msg, $type = 'ok', $link = null) { $_SESSION['flash'][] = [$type, $msg, $link]; }

function money($n, $cur = true)
{
    return ($cur ? setting('currency') . ' ' : '') . number_format((float)$n, 0, ',', '.');
}

function bytes($n)
{
    $n = (float)$n;
    foreach (['B', 'KB', 'MB', 'GB', 'TB'] as $u) {
        if ($n < 1024 || $u === 'TB') return ($u === 'B' ? (int)$n : number_format($n, $n < 10 ? 2 : 1, ',', '.')) . ' ' . $u;
        $n /= 1024;
    }
}

/** Tanggal RouterOS ("nov/12/2026" atau "2026-11-12") menjadi "2026-11-12". */
function ros_date($d)
{
    $d = trim((string)$d);
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $d, $m)) return "$m[1]-$m[2]-$m[3]";
    if (preg_match('/^([a-z]{3})\/(\d{1,2})\/(\d{4})/i', $d, $m)) {
        $mo = array_search(strtolower($m[1]), ['', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']);
        if ($mo) return sprintf('%04d-%02d-%02d', $m[3], $mo, $m[2]);
    }
    return '';
}

function bulan($ym)
{
    $n = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return $n[(int)substr($ym, 5, 2)] . ' ' . substr($ym, 0, 4);
}

function tgl($ymd)
{
    $t = strtotime((string)$ymd);
    return $t ? date('d/m/Y', $t) : '';
}

function valid_period($p) { return preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', (string)$p) ? $p : date('Y-m'); }

function rand_str($len, $set)
{
    $sets = [
        'lower' => 'abcdefghjkmnpqrstuvwxyz', 'upper' => 'ABCDEFGHJKMNPQRSTUVWXYZ', 'num' => '23456789',
    ];
    $pool = '';
    foreach (explode('+', $set) as $s) $pool .= isset($sets[$s]) ? $sets[$s] : '';
    if ($pool === '') $pool = $sets['lower'] . $sets['num'];
    $o = ''; $max = strlen($pool) - 1;
    for ($i = 0; $i < $len; $i++) $o .= $pool[random_int(0, $max)];
    return $o;
}

/* ---------- router ---------- */

function routers() { return cfg('routers', []); } /** Sesi router dari alamat ?session=NAMA (seperti Mikhmon); '' bila tidak ada/tidak cocok. */ function url_rid() { $s = get('session'); if ($s === '') return ''; $rs = routers(); if (isset($rs[$s])) return (string)$s; foreach ($rs as $id => $r) if (strcasecmp((string)($r['name'] ?? ''), $s) === 0) return (string)$id; return ''; } /** Nilai ?session= untuk router aktif: nama router (id bila nama kosong/kembar). */ function cur_session($id = null) { $rs = routers(); if ($id === null) { $id = url_rid(); if ($id === '') $id = (string)($_SESSION['rid'] ?? ''); } if (!isset($rs[$id])) return ''; $n = trim((string)($rs[$id]['name'] ?? '')); $c = 0; foreach ($rs as $r) if (strcasecmp(trim((string)($r['name'] ?? '')), $n) === 0) $c++; return ($n === '' || $c > 1 || (isset($rs[$n]) && $n !== (string)$id)) ? (string)$id : $n; }

function router_id()
{
    $rs = routers();
    $id = url_rid(); if ($id === '') $id = isset($_SESSION['rid']) ? $_SESSION['rid'] : ''; // ?session= di alamat diutamakan, tiap tab bisa beda router
    if (!isset($rs[$id])) { reset($rs); $id = (string)key($rs); }
    return $id;
}

function router()
{
    $rs = routers(); $id = router_id();
    return isset($rs[$id]) ? $rs[$id] + ['id' => $id] : null;
}

/** Nama file data milik router yang sedang dipilih. */
function rkey($name, $rid = null) { return 'r' . ($rid === null ? router_id() : $rid) . '_' . $name; }

/** Pakai ulang koneksi router antar halaman (hemat ±200 ms login per halaman). Ubah ke false untuk mematikan. */
if (!defined('ROS_KEEP')) define('ROS_KEEP', true);

/** $keep = true: koneksi persistent yang dipakai ulang (hanya untuk ros(); tes router dan cron tetap koneksi biasa). */
function ros_open($r, $keep = false)
{
    if (!empty($r['panel_id'])) {
        $pr = panel_router($r['panel_id']);
        if ($pr && !empty($pr['address'])) $r['host'] = $pr['address'];
    }
    $a = new RouterOS();
    if (!$a->connect($r['host'], (int)$r['port'], $r['user'], dec($r['pass']), false, $keep && ROS_KEEP)) {
        $GLOBALS['ROS_ERR'] = $a->error;
        return null;
    }
    return $a;
}

function ros($set = false, $peek = false)
{
    static $api = false;
    if ($peek) return $api === false ? null : (bool)$api;      // status tanpa membuka koneksi
    if ($set !== false) { $api = $set; return $api; }
    if ($api !== false) return $api;
    $r = router();
    if (!$r) { $GLOBALS['ROS_ERR'] = 'Belum ada router. Tambahkan router dulu.'; return $api = null; }
    $api = ros_open($r, true);
    if ($api) tz_sync($api);
    ros_last((bool)$api);                                    // ingat status terakhir untuk halaman tanpa koneksi
    return $api;
}

/** Status router terakhir yang diketahui (disimpan di sesi, per router). null = belum pernah dicek. */
function ros_last($set = null)
{
    if (session_status() !== PHP_SESSION_ACTIVE) return null;
    $k = 'ros_last_' . router_id();
    if ($set !== null) $_SESSION[$k] = (bool)$set;
    return isset($_SESSION[$k]) ? $_SESSION[$k] : null;
}

/** Ambil data; kembalikan [] bila gagal (pesan ada di $GLOBALS['ROS_ERR']). */
function rq($cmd, $p = [])
{
    $a = ros();
    if (!$a) return [];
    try { return $a->comm($cmd, $p); }
    catch (Exception $e) { $GLOBALS['ROS_ERR'] = $e->getMessage(); return []; }
}

/** Jalankan aksi; tampilkan pesan bila router menolak. */
function rdo($cmd, $p = [], $quiet = false)
{
    $a = ros();
    if (!$a) { if (!$quiet) flash(isset($GLOBALS['ROS_ERR']) ? $GLOBALS['ROS_ERR'] : 'Router tidak terhubung', 'err'); return false; }
    try { $a->comm($cmd, $p); return true; }
    catch (Exception $e) { $GLOBALS['ROS_ERR'] = $e->getMessage(); if (!$quiet) flash('Router menolak: ' . $e->getMessage(), 'err'); return false; }
}

/**
 * Beberapa perintah baca sekaligus dalam satu perjalanan jaringan (ke router yang jauh tiap perintah butuh ±60 ms).
 * $cmds: ['kunci' => [perintah, params]]. Hasil: ['kunci' => baris[]], atau angka untuk perintah dengan 'count-only'.
 * Perintah yang gagal menghasilkan [] / 0, sama seperti rq() dan rcount().
 */
function rq_many(array $cmds)
{
    $out = [];
    foreach ($cmds as $k => $c) $out[$k] = isset($c[1]['count-only']) ? 0 : [];
    $a = ros();
    if (!$a) return $out;
    try { $res = $a->batch(array_values($cmds)); }
    catch (Exception $e) { $GLOBALS['ROS_ERR'] = $e->getMessage(); return $out; }
    $i = 0;
    foreach ($cmds as $k => $c) {
        $r = $res[$i++];
        if ($r['err'] !== null) continue;
        $out[$k] = isset($c[1]['count-only']) ? (int)$r['ret'] : $r['rows'];
    }
    return $out;
}

function rcount($path, $q = [])
{
    $a = ros();
    if (!$a) return 0;
    try { return $a->count($path, $q); } catch (Exception $e) { return 0; }
}

/** Hapus banyak item sekaligus (dipecah per 40 id). */
function rremove($path, $ids)
{
    $n = 0;
    foreach (array_chunk(array_values(array_filter($ids)), 40) as $c) {
        if (rdo($path . '/remove', ['.id' => implode(',', $c)])) $n += count($c);
    }
    return $n;
}

/* ---------- hotspot: profil & voucher ---------- */

function valid_interval($v) { return (bool)preg_match('/^(\d+[wdhms])+$/', (string)$v); }

/** Baca metadata dari script on-login profil hotspot (format Mikhmon ",mode,harga,..."; profil Bilingku lama tetap terbaca). */
function hs_meta($onlogin)
{
    $m = ['mode' => 'none', 'price' => 0, 'validity' => '', 'sprice' => 0, 'lock' => 0];
    if (preg_match('/:put \("bilingku,([^"]*)"\)/', (string)$onlogin, $x)) {      // profil Bilingku lama (scheduler per voucher)
        $p = explode(',', $x[1]) + ['', 0, '', 0, ''];
        $old = ['remove' => 'remc', 'disable' => 'ntfc'];
        $m = ['mode' => isset($old[$p[0]]) ? $old[$p[0]] : 'none', 'price' => (float)$p[1], 'validity' => $p[2], 'sprice' => (float)$p[3], 'lock' => $p[4] === 'lock' ? 1 : 0];
    } elseif (preg_match('/:put \(",([^"]*)"\)/', (string)$onlogin, $x)) {      // format Mikhmon (juga ",bilingku," dari versi panel sebelumnya)
        $p = explode(',', $x[1]) + ['', 0, '', 0, '', '', ''];
        $m = ['mode' => in_array($p[0], ['rem', 'ntf', 'remc', 'ntfc'], true) ? $p[0] : 'none', 'price' => (float)$p[1], 'validity' => $p[2], 'sprice' => (float)$p[3], 'lock' => $p[5] === 'Enable' ? 1 : 0];
    }
    return $m;
}

/**
 * Kerangka script on-login (bagian tengah yang sama untuk semua profil).
 * Diambil dari profil ber-Expired Mode yang sudah ada di router (format Mikhmon),
 * bila tidak ada memakai kerangka bawaan panel (inc/bundle/onlogin.txt). '' bila keduanya tidak ada.
 * Nomor versi script (",mikhmon,2608001,") ikut disimpan, lihat hs_ver().
 */
function hs_tpl()
{
    $t = (string)cfg('hs_tpl', '');
    if ($t !== '') return (string)base64_decode($t);
    foreach (rq('/ip/hotspot/user/profile/print', ['.proplist' => 'name,on-login']) as $p) {
        $s = (string)($p['on-login'] ?? '');
        if (!preg_match('/^:put \(",(rem|ntf|remc|ntfc),[^"]*,(?:bilingku|mikhmon),(\d*)[^"]*"\);/', $s, $h)) continue;
        $end = 'comment="$ndate $ctime $mode"; ';
        $i = strpos($s, $end);
        if ($i === false) continue;
        $b = substr($s, strlen($h[0]), $i + strlen($end) - strlen($h[0]));
        $b = preg_replace('/:local mode "[A-Z]";/', ':local mode "%M%";', $b, 1, $n1);
        $b = preg_replace('/:local validity "[^"]*";/', ':local validity "%V%";', $b, 1, $n2);
        if ($n1 !== 1 || $n2 !== 1) continue;
        cfg_set('hs_tpl', base64_encode($b));
        if ($h[2] !== '') cfg_set('hs_ver', $h[2]);
        return $b;
    }
    // router baru tanpa profil ber-Expired Mode: pakai kerangka bawaan
    $b = mk_bundle()['onlogin'] ?? '';
    if ($b !== '' && strpos($b, '%M%') !== false && strpos($b, '%V%') !== false) {
        cfg_set('hs_tpl', base64_encode($b));
        if (!empty(mk_bundle()['version'])) cfg_set('hs_ver', (string)mk_bundle()['version']);
        return $b;
    }
    return '';
}

/**
 * Perlengkapan bawaan panel (inc/bundle/): kerangka script on-login dan tiga scheduler Expire Monitor.
 * Dipakai bila router dan data panel belum punya, sehingga router baru (cukup setup dasar + hotspot)
 * langsung bisa dikelola dari Bilingku tanpa aplikasi lain.
 */
function mk_bundle()
{
    static $b = null;
    if ($b !== null) return $b;
    $j = json_decode((string)@file_get_contents(__DIR__ . '/bundle/monitor.json'), true);
    $b = is_array($j) ? $j : [];
    $b['onlogin'] = (string)@file_get_contents(__DIR__ . '/bundle/onlogin.txt');
    return $b;
}

/** Nomor versi script on-login (",mikhmon,2608001," di baris pertama), diambil dari profil di router atau bawaan panel. */
function hs_ver()
{
    $v = (string)cfg('hs_ver', '');
    if ($v !== '') return $v;
    foreach (rq('/ip/hotspot/user/profile/print', ['.proplist' => 'on-login']) as $p) {
        if (preg_match('/^:put \(",(rem|ntf|remc|ntfc),[^"]*,(?:bilingku|mikhmon),(\d+),/', (string)($p['on-login'] ?? ''), $h)) {
            cfg_set('hs_ver', $h[2]);
            return $h[2];
        }
    }
    return (string)(mk_bundle()['version'] ?? '2608001') ?: '2608001';
}

/**
 * Script on-login profil hotspot, format Mikhmon (penanda dan catatan penjualan memakai kode "mikhmon",
 * sehingga tetap terbaca oleh Mikhmon). Terinspirasi dan sebagian diambil dari Mikhmon.
 * Mode: rem (hapus), ntf (notice), remc / ntfc (+ catat penjualan). Saat voucher pertama kali
 * login, tanggal habisnya ditulis ke comment voucher; scheduler "Expire-Monitor" di router
 * yang menghapus atau mematikan voucher setelah lewat. Mengembalikan null bila kerangka belum ada.
 */
function hs_onlogin($profile, $mode, $price, $validity, $sprice, $lock, $plain = false)
{
    $s = hs_onlogin_mk($profile, $mode, $price, $validity, $sprice, $lock);
    if ($s === null || $plain) return $s;
    // Kerangka dasar memakai "get $user" / "set $user". Bila nama voucher hanya angka (mis. 2356),
    // RouterOS membacanya sebagai nomor urut item, sehingga comment masa habis dan catatan penjualan tidak pernah dibuat.
    // Bilingku mencari voucher berdasarkan namanya supaya semua jenis kode voucher bekerja.
    $f = '[/ip hotspot user find where name=$user]';
    return strtr($s, [
        ':local comment [/ip hotspot user get $user comment];' => ':local comment [/ip hotspot user get ' . $f . ' comment];',
        '/ip hotspot user set $user comment="$ndate $ctime $mode";' => '/ip hotspot user set ' . $f . ' comment="$ndate $ctime $mode";',
        '/ip hotspot user set $user mac-address=$mac' => '/ip hotspot user set ' . $f . ' mac-address=$mac',
    ]);
}

/** Script on-login dengan kerangka dasar (tanpa perbaikan nama angka). */
function hs_onlogin_mk($profile, $mode, $price, $validity, $sprice, $lock)
{
    $price = (int)$price; $sprice = (int)$sprice;
    $lk = $lock ? 'Enable' : 'Disable';
    $lockCmd = '[:local mac $"mac-address"; /ip hotspot user set $user mac-address=$mac]';
    if (!in_array($mode, ['rem', 'ntf', 'remc', 'ntfc'], true) || $validity === '') {
        return ':put (",,' . $price . ',,,noexp,' . $lk . ',");' . ($lock ? ' ' . $lockCmd : '');
    }
    $tpl = hs_tpl();
    if ($tpl === '') return null;
    $s = ':put (",' . $mode . ',' . $price . ',' . $validity . ',' . $sprice . ',,' . $lk . ',,mikhmon,' . hs_ver() . ',");'
        . strtr($tpl, ['%M%' => $mode[0] === 'n' ? 'N' : 'R', '%V%' => $validity]);
    if (substr($mode, -1) === 'c') {
        $s .= '; :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-' . $price
            . '-|-$address-|-$mac-|-' . $validity . '-|-' . $profile . '-|-$comment" owner="$month$year" source="$month$year" comment="mikhmon"';
    }
    if ($lock) $s .= '; ' . $lockCmd;
    return $s . '}}';
}

/** Interval Expire-Monitor saat pertama dipasang (1m); setelah itu boleh diubah langsung di scheduler router. */
function hs_mon_interval() { return '1m'; }

/** Nama scheduler Expire Monitor (sama dengan nama yang dipakai Mikhmon, supaya tidak terpasang dobel). */
function hs_mon_names() { return ['Expire-Monitor', 'Reset-Expire-Monitor', 'Reset-Expire-Monitor-Daily']; }

/** Nama panel untuk label yang terlihat di router (Settings > Panel Name). */
function hs_label() { return function_exists('app_name') ? app_name() : APP_NAME; }

/** Comment scheduler Expire Monitor mengikuti nama panel: "Do not remove!!! <nama panel> Expire Monitor". */
function hs_brand_cmt($c)
{
    return 'Do not remove!!! ' . str_replace('"', '', hs_label()) . ' Expire Monitor';
}


/**
 * Perlengkapan Expire Monitor di router: tiga scheduler di atas.
 * Sertifikat "expireMonitor" (status kerja) dibuat dan dihapus sendiri oleh scheduler-scheduler itu.
 * Acuannya selalu script bawaan panel. Bila $install dan ada yang hilang, isinya beda (rusak / diubah), atau
 * dinonaktifkan, dipasang / diperbaiki lagi saat profil disimpan. Comment-nya mengikuti nama panel (Settings), mis. "Do not remove!!! Bilingku Expire Monitor".
 * Mengembalikan [dipasang, tidak ada dan tidak bisa dipasang, diperbaiki].
 */
function hs_mon_ensure($install = true)
{
    $have = [];
    // ambil tiga scheduler berdasarkan nama (cepat); mencetak semua scheduler beserta script-nya bisa makan beberapa detik
    foreach (hs_mon_names() as $n) {
        $r = rq('/system/scheduler/print', ['?name' => $n, '.proplist' => '.id,name,start-time,interval,on-event,policy,comment,disabled,next-run']);
        if ($r) $have[$n] = $r[0];
    }
    // acuan: script bawaan panel (inc/bundle/monitor.json) yang sudah terbukti bekerja; tidak mengikuti versi lain di router.
    // Salinannya disimpan di data/ sebagai cadangan bila berkas bawaan hilang.
    $bun = mk_bundle()['schedulers'] ?? [];
    $saved = json_decode((string)base64_decode((string)cfg('hs_mon', '')), true);
    if (!is_array($saved)) $saved = [];
    $ref = [];
    foreach (hs_mon_names() as $n) {
        $r = $bun[$n] ?? ($saved[$n] ?? null);
        if (!$r) continue;
        $r = array_intersect_key($r, array_flip(['start-time', 'interval', 'on-event', 'policy', 'comment']));
        $r['comment'] = hs_brand_cmt($r['comment'] ?? ''); // label mengikuti nama panel
        $ref[$n] = $r;
    }
    if ($ref && count($ref) === count(hs_mon_names())) {
        $js = base64_encode(json_encode($ref));
        if ($js !== (string)cfg('hs_mon', '')) cfg_set('hs_mon', $js);
    }

    $added = []; $miss = []; $fixed = [];
    foreach (hs_mon_names() as $n) {
        $r = $ref[$n] ?? null;
        if (!isset($have[$n])) {
            if (!$install || !$r) { $miss[] = $n; continue; }
            if ($n === 'Expire-Monitor') $r['interval'] = hs_mon_interval(); // interval pilihan pengguna (bawaan 1m)
            if (rdo('/system/scheduler/add', ['name' => $n] + $r, true)) $added[] = $n; else $miss[] = $n;
            continue;
        }
        // sudah ada: perbaiki bila isinya beda dari acuan atau dinonaktifkan (dipasang ulang saat simpan profil)
        $s = $have[$n]; $diff = [];
        // jadwal (start-time, interval) boleh diubah pengguna; yang diperiksa hanya isi script dan izinnya
        foreach (['on-event', 'policy'] as $k) if ($r && (string)($s[$k] ?? '') !== (string)($r[$k] ?? '')) $diff[$k] = $r[$k];
        if (($s['disabled'] ?? '') === 'true') $diff['disabled'] = 'no';
        if ($r && (string)($s['comment'] ?? '') !== (string)$r['comment']) $diff['comment'] = $r['comment']; // label mengikuti nama panel
        if ($diff && $install && $r) { if (rdo('/system/scheduler/set', ['.id' => $s['.id']] + $diff, true)) $fixed[] = $n; }
        elseif (array_diff_key($diff, ['comment' => 1])) $miss[] = $n . ' (perlu diperbaiki)'; // label lama saja bukan kerusakan
    }
    return [$added, $miss, $fixed];
}

/**
 * Kesehatan satu profil hotspot, ditampilkan sebagai titik warna di daftar profil:
 * ['ok'|'none'|'bad', keterangan]. Profil ber-Expired Mode dianggap bermasalah bila script on-login-nya
 * tidak sama dengan buatan panel (versi lama, rusak, atau diubah manual) atau Expire Monitor tidak lengkap.
 */
function hs_profile_health($p, $monOk)
{
    $ol = (string)($p['on-login'] ?? '');
    $m = hs_meta($ol);
    if ($m['mode'] === 'none') {
        if ($ol !== '' && strpos($ol, 'noexp') === false && strpos($ol, ':put (",') !== 0) return ['bad', 'Script on-login tidak dikenali. Save ulang profil ini untuk memperbaikinya.'];
        return ['none', 'Tanpa Expired Mode'];
    }
    $mk = strpos($ol, ',bilingku,') !== false; // format versi panel sebelumnya
    if (!$mk && strpos($ol, ',mikhmon,') === false) return ['bad', 'Format script lama. Save ulang profil ini untuk memperbaikinya.'];
    $want = hs_onlogin((string)$p['name'], $m['mode'], $m['price'], $m['validity'], $m['sprice'], $m['lock']);
    $plain = hs_onlogin((string)$p['name'], $m['mode'], $m['price'], $m['validity'], $m['sprice'], $m['lock'], true);
    $olt = rtrim($ol);
    // profil dari versi panel sebelumnya (penanda "bilingku") dibandingkan setelah labelnya disamakan; tetap berfungsi
    if ($mk) $olt = strtr($olt, [',,bilingku,' => ',,mikhmon,', 'comment="bilingku"' => 'comment="mikhmon"']);
    if ($want !== null && $want !== $olt && $plain !== $olt) return ['bad', 'Script on-login berbeda dari seharusnya (versi lama atau diubah manual). Save ulang profil ini untuk memperbaikinya.'];
    if (!$monOk) return ['bad', 'Expire Monitor di router tidak lengkap, voucher tidak akan kedaluwarsa. Save profil ini untuk memasangnya.'];
    if ($mk) return ['ok', 'Script OK (format versi sebelumnya). Save ulang profil ini supaya memakai format terbaru' . ($want !== $olt ? ' dan voucher bernama angka saja (mis. 2356) ikut tercatat.' : '.')];
    if ($want !== $olt) return ['ok', 'Script OK. Catatan: voucher dengan nama angka saja (mis. 2356) belum tercatat; Save ulang profil ini supaya ikut tercatat.'];
    return ['ok', 'Script dan Expire Monitor OK'];
}

/** Keadaan scheduler Expire-Monitor untuk ditampilkan: baris scheduler atau null. */
function hs_mon_row()
{
    $r = rq('/system/scheduler/print', ['?name' => 'Expire-Monitor', '.proplist' => 'name,disabled,next-run,run-count,interval']);
    return $r ? $r[0] : null;
}

/**
 * Salin catatan penjualan voucher dari router ke file data/ (per bulan).
 * Catatan comment "mikhmon" (dan "bilingku" dari versi panel sebelumnya) hanya dibaca, tidak dihapus dari router; catatan lama "bilingku-sale" dipindahkan.
 * Satu query saja ke router (comment mikhmon ATAU bilingku ATAU bilingku-sale), file bulan hanya ditulis bila ada catatan baru,
 * dan dikunci supaya tidak berjalan dobel. Mengembalikan jumlah catatan baru, atau -1 bila gagal menyimpan.
 */
function sales_sync()
{
    $lock = @fopen(DATA . '/' . rkey('sync') . '.lock', 'c');
    if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); return 0; } // sinkron lain sedang berjalan
    $meta = db_load(rkey('sync')); $meta['at'] = time(); db_save(rkey('sync'), $meta);
    $all = rq('/system/script/print', ['?comment=mikhmon', '?comment=bilingku', '?#|', '?comment=bilingku-sale', '?#|', '.proplist' => '.id,name,comment']);
    $by = []; $ids = []; $new = 0;
    foreach ($all as $r) {
        $p = explode('-|-', (string)($r['name'] ?? ''));
        $d = ros_date($p[0]);
        if (count($p) < 8 || !$d) continue;
        $by[substr($d, 0, 7)][] = [
            'k' => substr(md5($r['name']), 0, 12), 'd' => $d, 't' => $p[1], 'u' => $p[2], 'a' => (float)$p[3],
            'ip' => $p[4], 'mac' => $p[5], 'v' => $p[6], 'pr' => $p[7], 'c' => isset($p[8]) ? $p[8] : '',
        ];
        if (($r['comment'] ?? '') === 'bilingku-sale') $ids[] = $r['.id'];
    }
    foreach ($by as $ym => $list) {
        $cur = db_load(rkey('sales_' . $ym));
        $keys = [];
        foreach ($cur as $s) $keys[$s['k']] = 1;
        $add = 0;
        foreach ($list as $s) if (!isset($keys[$s['k']])) { $cur[] = $s; $keys[$s['k']] = 1; $add++; }
        if ($add && !db_save(rkey('sales_' . $ym), $cur)) { if ($lock) { flock($lock, LOCK_UN); fclose($lock); } return -1; }
        $new += $add;
    }
    foreach (array_chunk($ids, 40) as $c) rdo('/system/script/remove', ['.id' => implode(',', $c)], true);
    $meta['at'] = time(); $meta['n'] = count($all); db_save(rkey('sync'), $meta);
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    return $new;
}

/**
 * Daftar user hotspot dengan cache singkat (30 detik) per router, supaya User List dengan ribuan voucher
 * tidak mengambil semuanya dari router setiap pindah halaman / ganti saringan.
 * Cache dibuang setiap ada perubahan dari panel (hs_users_dirty) dan bisa dilewati dengan $fresh (tombol Reload).
 */
function hs_users_cached($props, $fresh = false, $ttl = 30, $stale = 1800)
{
    $k = rkey('hsu');
    if (!$fresh) {
        $c = db_load($k);
        if (!empty($c['t']) && ($c['p'] ?? '') === $props && isset($c['u'])) {
            $age = time() - (int)$c['t'];
            if ($age < $ttl) return $c['u'];
            // data tersimpan masih layak tampil: pakai dulu supaya halaman langsung terbuka, lalu perbarui dari router di latar
            if ($age < $stale) { hs_users_refresh_bg($props, (int)$c['t']); return $c['u']; }
        }
    }
    unset($GLOBALS['ROS_ERR']);
    $u = rq('/ip/hotspot/user/print', ['.proplist' => $props]);
    if (empty($GLOBALS['ROS_ERR'])) db_save($k, ['t' => time(), 'p' => $props, 'u' => $u]);
    return $u;
}

/** Proplist daftar user hotspot yang disimpan di cache (dipakai User List dan User Profile). */
const HSU_PROPS = '.id,server,name,password,profile,mac-address,uptime,bytes-in,bytes-out,limit-uptime,limit-bytes-total,comment,disabled';

/** Cache daftar user hotspot bila ada dan belum terlalu lama; null bila tidak ada. Tidak pernah menunggu router. */
function hs_users_peek($stale = 1800)
{
    $c = db_load(rkey('hsu'));
    if (empty($c['t']) || !isset($c['u']) || ($c['p'] ?? '') !== HSU_PROPS) return null;
    $age = time() - (int)$c['t'];
    if ($age >= $stale) return null;
    if ($age >= 30) hs_users_refresh_bg(HSU_PROPS, (int)$c['t']);
    return $c['u'];
}

/** Waktu data cache user hotspot diambil dari router (unix time), 0 bila belum ada. */
function hs_users_at() { $c = db_load(rkey('hsu')); return (int)($c['t'] ?? 0); }

/**
 * Perbarui cache user hotspot setelah halaman terkirim (ribuan voucher bisa butuh beberapa detik dari router).
 * Dikunci supaya tidak berjalan dobel; hasil dibuang bila cache sudah berubah selama pengambilan (mis. baru Generate).
 */
function hs_users_refresh_bg($props, $seen)
{
    static $queued = false;
    if ($queued || !function_exists('fastcgi_finish_request')) return;
    $queued = true;
    $k = rkey('hsu');
    register_shutdown_function(function () use ($props, $seen, $k) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close(); // jangan menahan halaman berikutnya
        fastcgi_finish_request();
        ignore_user_abort(true);
        @set_time_limit(180);
        $lock = @fopen(ROOT . '/data/' . $k . '.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { if ($lock) fclose($lock); return; }
        $c = db_load($k);
        if ((int)($c['t'] ?? 0) === $seen && ros()) {
            unset($GLOBALS['ROS_ERR']);
            $u = rq('/ip/hotspot/user/print', ['.proplist' => $props]);
            $now = db_load($k);
            if (empty($GLOBALS['ROS_ERR']) && (int)($now['t'] ?? 0) === $seen) db_save($k, ['t' => time(), 'p' => $props, 'u' => $u]);
        }
        flock($lock, LOCK_UN); fclose($lock);
    });
}

/** Buang cache daftar user hotspot (dipanggil setelah menambah / mengubah / menghapus voucher). */
function hs_users_dirty() { db_save(rkey('hsu'), []); }

/** Waktu sinkron penjualan terakhir (unix time) untuk router ini, 0 bila belum pernah. */
function sales_sync_at() { return (int)(db_load(rkey('sync'))['at'] ?? 0); }

/**
 * Sinkron penjualan di latar belakang: halaman langsung tampil dengan data tersimpan, lalu setelah halaman
 * terkirim ke browser panel mengambil catatan baru dari router. Paling sering sekali tiap $every detik.
 */
function sales_sync_bg($every = 120)
{
    static $queued = false;
    if ($queued || time() - sales_sync_at() < $every) return;
    $queued = true;
    register_shutdown_function(function () {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close(); // jangan menahan halaman berikutnya
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        ignore_user_abort(true);
        @set_time_limit(180);
        if (ros()) sales_sync();
    });
}

function sales($ym) { return db_load(rkey('sales_' . $ym)); }

/* ---------- PPPoE: pelanggan, jatuh tempo, pembayaran ---------- */

function customers()
{
    billing_migrate();
    return db_load(rkey('customers'));
}
function customers_save($c) { return db_save(rkey('customers'), $c); }
function payments() { billing_migrate(); return db_load(rkey('payments')); }
function packages() { return db_load(rkey('packages')); }

/** Geser tanggal sejumlah bulan, dengan tanggal jatuh tempo tetap ($day). */
function add_months($ymd, $n, $day = 0)
{
    $t = (int)substr($ymd, 0, 4) * 12 + (int)substr($ymd, 5, 2) - 1 + (int)$n;
    $y = intdiv($t, 12); $m = $t % 12 + 1;
    $d = $day ?: (int)substr($ymd, 8, 2);
    $d = max(1, min($d, (int)date('t', mktime(0, 0, 0, $m, 1, $y))));
    return sprintf('%04d-%02d-%02d', $y, $m, $d);
}

function days_until($ymd) { return (int)round((strtotime($ymd) - strtotime(date('Y-m-d'))) / 86400); }

/** Tanggal router mulai mengisolir: sehari setelah jatuh tempo. */
function iso_date($c) { return date('Y-m-d', strtotime($c['due'] . ' +1 days')); }

function is_billed($c) { return !empty($c['tagih']) && !empty($c['due']); }
function is_late($c) { return !empty($c['manual_iso']) || (is_billed($c) && date('Y-m-d') >= iso_date($c)); }

/** Status tagihan pelanggan: [kode, label]. */
function bill_state($c)
{
    if (!is_billed($c)) return ['none', ''];
    $d = days_until($c['due']);
    if (date('Y-m-d') >= iso_date($c)) return ['late', (function_exists('is_dead') && is_dead($c) ? 'dinonaktifkan, ' : '') . 'menunggak ' . (-$d) . ' hari'];
    if ($d === 0) return ['soon', 'jatuh tempo hari ini'];
    if ($d <= 7) return ['soon', $d . ' hari lagi'];
    return ['ok', 'lunas'];
}

/** Berapa bulan yang harus dibayar supaya jatuh tempo kembali di depan hari ini (minimal 1). */
function months_owed($c)
{
    if (!is_billed($c)) return 1;
    $n = 1; $today = date('Y-m-d');
    while ($n < 120 && add_months($c['due'], $n, $c['jt'] ?? 0) < $today) $n++;
    return $n;
}

/** Data lama versi 1 (tagihan bulanan) diubah sekali ke model jatuh tempo + pembayaran. */
function billing_migrate()
{
    static $done = [];
    $rid = router_id();
    if (isset($done[$rid])) return;
    $done[$rid] = 1;
    if (!db_exists(rkey('invoices')) || db_exists(rkey('payments'))) return;
    $inv = db_load(rkey('invoices')); $cs = db_load(rkey('customers')); $pays = []; $unpaid = [];
    foreach ($inv as $i) {
        if ($i['status'] === 'paid') {
            $pays[$i['id']] = ['id' => $i['id'], 'no' => str_replace('INV-', 'KW-', $i['no']), 'user' => $i['user'], 'nama' => $i['nama'], 'paket' => $i['paket'],
                'months' => 1, 'amount' => $i['amount'], 'from' => $i['due'], 'to' => add_months($i['due'], 1), 'paid_at' => $i['paid_at'], 'method' => $i['method']];
        } elseif (!isset($unpaid[$i['user']]) || $i['due'] < $unpaid[$i['user']]) $unpaid[$i['user']] = $i['due'];
    }
    foreach ($cs as $u => $c) {
        if (!empty($c['orig_profile'])) $c['paket'] = $c['orig_profile'];
        unset($c['orig_profile']);
        if (empty($c['due'])) {
            $jt = !empty($c['jt']) ? (int)$c['jt'] : 10;
            $due = isset($unpaid[$u]) ? $unpaid[$u] : add_months(date('Y-m-01'), 0, $jt);
            if (!isset($unpaid[$u]) && $due < date('Y-m-d')) $due = add_months($due, 1, $jt);
            $c['due'] = $due; $c['jt'] = (int)substr($due, 8, 2);
        }
        $cs[$u] = $c;
    }
    db_save(rkey('customers'), $cs);
    db_save(rkey('payments'), $pays);
    db_rename(rkey('invoices'), rkey('invoices_v1'));
}

/* ---------- PPPoE: isolir lewat scheduler router ---------- */

/** Tanggal "2027-01-11" ditulis sesuai format jam router (v7: 2027-01-11, v6: jan/11/2027). */
function ros_date_fmt($ymd)
{
    static $iso = []; // per router: format tanggal v6 dan v7 berbeda
    $k = router_id();
    if (!isset($iso[$k])) { $c = rq('/system/clock/print'); $iso[$k] = !isset($c[0]['date']) || preg_match('/^\d{4}-/', $c[0]['date']); }
    return $iso[$k] ? $ymd : strtolower(date('M/d/Y', strtotime($ymd)));
}

function ros_str($s) { return addcslashes((string)$s, "\"\\$"); }

/** Script yang dijalankan scheduler: pindahkan ke paket isolir dan putuskan koneksinya. */
function ppp_iso_event_v2($user, $iso)
{
    $u = ros_str($user); $i = ros_str($iso);
    return ':local s [/ppp secret find where name="' . $u . '"]; :if ([:len $s] > 0) do={ :if ([/ppp secret get $s profile] != "' . $i . '") do={ '
        . '/ppp secret set $s profile="' . $i . '"; /ppp active remove [find where name="' . $u . '"] } }';
}

function ppp_kick($user)
{
    foreach (rq('/ppp/active/print', ['?name' => $user, '.proplist' => '.id']) as $a) rdo('/ppp/active/remove', ['.id' => $a['.id']], true);
}

/** Pastikan paket isolir ada di router. */
function ppp_ensure_iso()
{
    static $done = []; // per router, supaya cron dengan beberapa router memeriksa tiap router
    $iso = (string)setting('isolir_profile');
    if ($iso === '') return false;
    $k = router_id() . '|' . $iso;
    if (isset($done[$k])) return $done[$k];
    $cmt = 'paket isolir ' . hs_label();
    $have = rq('/ppp/profile/print', ['?name' => $iso, '.proplist' => '.id,comment']);
    if ($have) {
        // label mengikuti nama panel; hanya comment buatan panel yang diganti, comment buatan sendiri dibiarkan
        $old = (string)($have[0]['comment'] ?? '');
        if ($old !== $cmt && strpos($old, 'paket isolir ') === 0) rdo('/ppp/profile/set', ['.id' => $have[0]['.id'], 'comment' => $cmt], true);
        return $done[$k] = true;
    }
    return $done[$k] = rdo('/ppp/profile/add', ['name' => $iso, 'rate-limit' => '128k/128k', 'address-list' => 'isolir', 'comment' => $cmt]);
}

/**
 * Samakan router dengan data tagihan satu pelanggan:
 * profil secret (paket pilihan atau paket isolir) dan scheduler "iso-<pengguna>"
 * yang mengisolir otomatis saat jatuh tempo terlewati.
 * $sec = baris secret (.id, profile), $sch = baris scheduler (.id, start-date, on-event) bila sudah diambil.
 */
function ppp_sync_v2($user, $sec = null, $sch = false)
{
    if (!ros()) return false;
    $cs = db_load(rkey('customers'));
    $c = isset($cs[$user]) ? $cs[$user] : [];
    if ($sec === null) { $r = rq('/ppp/secret/print', ['?name' => $user, '.proplist' => '.id,profile']); $sec = $r ? $r[0] : null; }
    if ($sch === false) { $r = rq('/system/scheduler/print', ['?name' => 'iso-' . $user, '.proplist' => '.id,start-date,on-event']); $sch = $r ? $r[0] : null; }
    if (!$sec) { if ($sch) rdo('/system/scheduler/remove', ['.id' => $sch['.id']], true); return false; }

    $iso = (string)setting('isolir_profile');
    $late = is_late($c);
    if ($late && !ppp_ensure_iso()) return false;
    $paket = !empty($c['paket']) ? $c['paket'] : ($sec['profile'] !== $iso ? $sec['profile'] : '');
    $want = $late ? $iso : $paket;
    if ($want !== '' && $sec['profile'] !== $want) {
        if (!rdo('/ppp/secret/set', ['.id' => $sec['.id'], 'profile' => $want])) return false;
        ppp_kick($user);
    }

    if (is_billed($c) && $iso !== '') {
        $p = ['start-date' => ros_date_fmt(iso_date($c)), 'start-time' => '00:00:30', 'interval' => '1d',
              'on-event' => ppp_iso_event($user, $iso), 'comment' => 'bilingku-iso'];
        if (!$sch) rdo('/system/scheduler/add', ['name' => 'iso-' . $user] + $p);
        elseif (($sch['start-date'] ?? '') !== $p['start-date'] || ($sch['on-event'] ?? '') !== $p['on-event']) rdo('/system/scheduler/set', ['.id' => $sch['.id']] + $p);
    } elseif ($sch) {
        rdo('/system/scheduler/remove', ['.id' => $sch['.id']], true);
    }

    if ($c || $late) {
        $c['isolated'] = $late ? 1 : 0;
        if ($paket !== '' && empty($c['paket'])) $c['paket'] = $paket;
        $cs[$user] = $c;
        customers_save($cs);
    }
    return true;
}

/** Samakan semua pelanggan sekaligus; kembalikan jumlah pelanggan yang diperiksa. */
function ppp_sync_all_v2()
{
    if (!ros()) return -1;
    $secs = []; $schs = [];
    foreach (rq('/ppp/secret/print', ['.proplist' => '.id,name,profile']) as $s) $secs[$s['name']] = $s;
    foreach (rq('/system/scheduler/print', ['?comment' => 'bilingku-iso', '.proplist' => '.id,name,start-date,on-event']) as $s) $schs[substr($s['name'], 4)] = $s;
    $n = 0;
    foreach (array_keys(customers()) as $u) {
        if (!isset($secs[$u])) continue;
        ppp_sync($u, $secs[$u], isset($schs[$u]) ? $schs[$u] : null);
        unset($schs[$u]);
        $n++;
    }
    foreach ($schs as $s) rdo('/system/scheduler/remove', ['.id' => $s['.id']], true);   // scheduler tanpa pelanggan
    return $n;
}

/** Catat pembayaran $months bulan: jatuh tempo maju, isolir dibuka bila sudah tidak menunggak. */
function pay_add($user, $months, $amount, $method, $date)
{
    $cs = customers();
    if (!isset($cs[$user]) || !is_billed($cs[$user])) return null;
    $c = $cs[$user]; $months = max(1, min(120, (int)$months));
    $pays = payments(); $seq = 0; $pre = 'KW-' . date('Ym', strtotime($date)) . '-';
    foreach ($pays as $p) if (strpos($p['no'], $pre) === 0) $seq = max($seq, (int)substr($p['no'], -4));
    $id = bin2hex(random_bytes(5));
    $to = add_months($c['due'], $months, $c['jt'] ?? 0);
    $pays[$id] = ['id' => $id, 'no' => $pre . sprintf('%04d', $seq + 1), 'user' => $user,
        'nama' => !empty($c['nama']) ? $c['nama'] : $user, 'paket' => $c['paket'] ?? '', 'months' => $months, 'amount' => (float)$amount,
        'from' => $c['due'], 'to' => $to, 'paid_at' => $date, 'method' => $method];
    $cs[$user]['due'] = $to;
    if (!db_save(rkey('payments'), $pays) || !customers_save($cs)) return null;
    ppp_sync($user, null, false, true);
    return $pays[$id];
}

/** Batalkan pembayaran terakhir seorang pelanggan: jatuh tempo kembali ke tanggal sebelumnya. */
function pay_cancel($id)
{
    $pays = payments();
    if (!isset($pays[$id])) return false;
    $p = $pays[$id]; $cs = customers();
    if (isset($cs[$p['user']])) {
        if (($cs[$p['user']]['due'] ?? '') !== $p['to']) return false;      // bukan pembayaran terakhir
        $cs[$p['user']]['due'] = $p['from'];
        customers_save($cs);
    }
    unset($pays[$id]);
    db_save(rkey('payments'), $pays);
    ppp_sync($p['user']);
    return true;
}

function wa_link($c, $amount)
{
    $hp = preg_replace('/\D/', '', (string)($c['hp'] ?? ''));
    if ($hp === '' || empty($c['due'])) return '';
    if ($hp[0] === '0') $hp = '62' . substr($hp, 1);
    $txt = strtr(setting('wa_tpl'), ['{nama}' => $c['nama'] ?? '', '{jumlah}' => money($amount), '{jatuh_tempo}' => tgl($c['due']),
        '{perusahaan}' => setting('company'), '{periode}' => '', '{no}' => '']);
    return 'https://wa.me/' . $hp . '?text=' . rawurlencode($txt);
}

/* ---------- tampilan ---------- */

function nav_items_v2()
{
    return [
        '' => [['dashboard', 'Dasbor', []]],
        'Hotspot' => [
            ['hs_users', 'Voucher', []], ['hs_profiles', 'Profil voucher', []],
            ['list', 'Sedang aktif', ['s' => 'hs_active']], ['list', 'Host', ['s' => 'hs_hosts']],
            ['list', 'IP binding', ['s' => 'hs_bindings']], ['list', 'Cookie', ['s' => 'hs_cookies']],
        ],
        'PPPoE' => [
            ['ppp_secrets', 'Pelanggan', []], ['payments', 'Pembayaran', []], ['ppp_profiles', 'Paket', []],
            ['list', 'Sedang aktif', ['s' => 'ppp_active']],
        ],
        'Lainnya' => [
            ['report', 'Laporan', []], ['log', 'Log router', []], ['routers', 'Router', []], ['settings', 'Pengaturan', []],
        ],
    ];
}

function flashes()
{
    if (empty($_SESSION['flash'])) return '';
    $o = '';
    foreach ($_SESSION['flash'] as $f) {
        $o .= '<div class="msg ' . h($f[0]) . '" role="status"><span>' . h($f[1]) . '</span>';
        if (!empty($f[2])) $o .= '<a class="msglink" target="_blank" href="' . h($f[2][1]) . '">' . h($f[2][0]) . '</a>';
        $o .= '</div>';
    }
    unset($_SESSION['flash']);
    return $o;
}

/**
 * Kepala halaman. $actions = tombol di kanan judul (HTML), $back = [label, url] untuk halaman formulir.
 */
function page_head_v2($title, $actions = '', $back = null)
{
    static $parent = ['hs_generate' => 'hs_users', 'ppp_pay' => 'ppp_secrets'];
    $p = get('p', 'dashboard'); $s = get('s');
    if (isset($parent[$p])) $p = $parent[$p];
    $r = router(); $rs = routers();
    header('Content-Type: text/html; charset=utf-8');
    header('X-Frame-Options: SAMEORIGIN');
    echo '<!doctype html><html lang="id" translate="no" class="notranslate"><head><link rel="icon" type="image/svg+xml" href="assets/favicon.svg"><meta name="google" content="notranslate"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>' . h($title) . ' — ' . APP_NAME . '</title><link rel="stylesheet" href="' . asset_url('style.css') . '"></head><body>';
    echo '<input type="checkbox" id="navtoggle" hidden><label for="navtoggle" class="scrim" aria-hidden="true"></label>';
    echo '<aside class="side"><a class="brand" href="' . url() . '">' . APP_NAME . '</a>';
    if ($rs) {
        $state = ros(null, true);
    if ($state === null) $state = ros_last();                // halaman tanpa koneksi: pakai status terakhir
        echo '<form method="post" action="' . h(url('routers')) . '" class="rsel">' . csrf_field() . '<input type="hidden" name="act" value="select">'
            . '<input type="hidden" name="back" value="' . h($_SERVER['QUERY_STRING'] ?? '') . '">'
            . '<span class="dot ' . ($state === null ? '' : ($state ? 'up' : 'down')) . '" title="' . ($state === null ? 'Router' : ($state ? 'Router terhubung' : 'Router tidak terhubung')) . '"></span>'
            . '<select name="id" aria-label="Router yang dipakai" onchange="this.form.submit()">';
        foreach ($rs as $id => $x) echo '<option value="' . h($id) . '"' . ($r && $r['id'] === (string)$id ? ' selected' : '') . '>' . h($x['name']) . '</option>';
        echo '</select></form>';
    }
    echo '<nav aria-label="Menu utama">';
    foreach (nav_items() as $group => $items) {
        if ($group !== '') echo '<div class="navgroup">' . h($group) . '</div>';
        foreach ($items as $it) {
            $on = $it[0] === $p && (!isset($it[2]['s']) || $it[2]['s'] === $s);
            echo '<a href="' . h(url($it[0], $it[2])) . '"' . ($on ? ' class="on" aria-current="page"' : '') . '>' . h($it[1]) . '</a>';
        }
    }
    echo '</nav><form method="post" action="' . h(url('login')) . '" class="logout">' . csrf_field()
        . '<span>' . h($_SESSION['auth'] ?? '') . '</span><button name="act" value="logout" class="linkbtn">Keluar</button></form></aside>';
    echo '<main><header class="top"><label for="navtoggle" class="burger" aria-label="Buka menu"><span></span></label>';
    echo '<div class="crumb">';
    if ($back) echo '<a href="' . h($back[1]) . '">' . h($back[0]) . '</a><span aria-hidden="true">/</span>';
    echo '<h1>' . h($title) . '</h1></div>';
    if ($actions !== '') echo '<div class="pageactions">' . $actions . '</div>';
    echo '</header><div class="content">' . flashes();
}

function page_foot_v2()
{
    echo '</div></main><script src="' . asset_url('app.js') . '"></script></body></html>';
}

/** Menu aksi baris tabel (tombol titik tiga). $items = potongan HTML tiap aksi. */
function row_menu($items)
{
    $items = array_filter($items);
    if (!$items) return '';
    return '<details class="menu"><summary aria-label="Aksi lain"><i></i></summary><div class="menulist">' . implode('', $items) . '</div></details>';
}

/** Halaman yang butuh router: hentikan dengan pesan jelas bila tidak terhubung. */
function need_ros($title)
{
    $a = ros();
    if ($a) return $a;
    page_head($title);
    $err = isset($GLOBALS['ROS_ERR']) ? $GLOBALS['ROS_ERR'] : 'Router tidak terhubung';
    echo '<div class="empty"><p class="emptytitle">' . h($err) . '</p>';
    if (router()) {
        echo '<p>Periksa: service <em>api</em> aktif di router (IP &rarr; Services), alamat dan port bisa dijangkau dari hosting, serta nama pengguna dan kata sandi benar.</p>';
    }
    echo '<p><a class="btn" href="' . url('routers') . '">Periksa router</a></p></div>';
    page_foot();
    exit;
}

function opt($val, $cur, $label = null)
{
    return '<option value="' . h($val) . '"' . ((string)$val === (string)$cur ? ' selected' : '') . '>' . h($label === null ? $val : $label) . '</option>';
}

function badge($text, $cls = '') { return '<span class="badge ' . $cls . '">' . h($text) . '</span>'; }

function confirm_btn($label, $act, $fields, $ask = '', $cls = 'linkbtn')
{
    $o = '<form method="post" class="inline"' . ($ask !== '' ? ' data-confirm="' . h($ask) . '"' : '') . '>' . csrf_field()
        . '<input type="hidden" name="act" value="' . h($act) . '">';
    foreach ($fields as $k => $v) $o .= '<input type="hidden" name="' . h($k) . '" value="' . h($v) . '">';
    return $o . '<button class="' . $cls . '">' . h($label) . '</button></form>';
}

require __DIR__ . '/v3.php';
require __DIR__ . '/voucher.php';

/* ---------- Panel utama (ACS NETMAP Panel) ---------- */

/** Penghubung yang ditulis panel utama saat Bilingku dipasang lewat menu Add-on. */
function panel_link()
{
    static $l = false;
    if ($l === false) {
        $f = DATA . '/panel-link.json';
        $l = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
        if (!is_array($l) || empty($l['url']) || empty($l['key'])) $l = null;
    }
    return $l;
}

/** Daftar router panel utama (cache 60 detik). ['ok'=>bool,'routers'=>[...],'panel'=>[...],'error'=>string] */
function panel_routers($fresh = false)
{
    static $res = null;
    if ($res !== null && !$fresh) return $res;
    $link = panel_link();
    if (!$link) return $res = ['ok' => false, 'routers' => [], 'panel' => [], 'error' => ''];
    $c = db_load('panel_cache');
    if (!$fresh && !empty($c['t']) && time() - (int)$c['t'] < 60) return $res = ['ok' => true, 'routers' => $c['routers'], 'panel' => $c['panel'], 'error' => ''];
    $body = false; $code = 0; $err = '';
    if (function_exists('curl_init')) {
        $ch = curl_init(rtrim($link['url'], '/') . '/api/addon/routers');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 8, CURLOPT_HTTPHEADER => ['X-Addon-Key: ' . $link['key'], 'Accept: application/json']]);
        $body = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => ['header' => 'X-Addon-Key: ' . $link['key'] . "\r\n", 'timeout' => 8, 'ignore_errors' => true]]);
        $body = @file_get_contents(rtrim($link['url'], '/') . '/api/addon/routers', false, $ctx);
        $code = $body !== false ? 200 : 0;
    }
    $j = $body !== false ? json_decode($body, true) : null;
    if ($code === 200 && is_array($j) && isset($j['routers'])) {
        db_save('panel_cache', ['t' => time(), 'routers' => $j['routers'], 'panel' => $j['panel']]);
        return $res = ['ok' => true, 'routers' => $j['routers'], 'panel' => $j['panel'], 'error' => ''];
    }
    $msg = $body === false ? 'Panel utama tidak menjawab' . ($err ? ': ' . $err : '') : 'Panel utama menolak (HTTP ' . $code . ')';
    if (!empty($c['routers'])) return $res = ['ok' => true, 'routers' => $c['routers'], 'panel' => $c['panel'], 'error' => $msg . ' — memakai data terakhir'];
    return $res = ['ok' => false, 'routers' => [], 'panel' => [], 'error' => $msg];
}

/** Satu router panel utama berdasarkan id-nya, atau null. */
function panel_router($id)
{
    foreach (panel_routers()['routers'] as $r) if ((string)$r['id'] === (string)$id) return $r;
    return null;
}
