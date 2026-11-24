<?php
require __DIR__ . '/inc/core.php';
start_session();

/**
 * Peta halaman: nilai ?p= => berkas di pages/<folder>/<nama>.php
 * Halaman dikelompokkan per menu supaya rapi:
 *   auth/      login, pemasangan awal
 *   dashboard/ dashboard + data fetch dashboard (api)
 *   hotspot/   Vouchers, User Profiles, Hotspot Active/Hosts/IP Bindings/Cookies, cetak voucher
 *   ppp/       PPP User, PPP Profiles, PPP Active, PPP Payment, terima bayar, cetak kwitansi/tagihan
 *   ip_pool/   IP Pool
 *   log/       Log router
 *   report/    Laporan
 *   settings/  Router, Pengaturan
 */
$routes = [
    'setup' => 'auth/setup', 'login' => 'auth/login',
    'dashboard' => 'dashboard/dashboard', 'api' => 'dashboard/api',
    'hs_users' => 'hotspot/hs_users', 'hs_generate' => 'hotspot/hs_generate', 'hs_profiles' => 'hotspot/hs_profiles',
    'list' => 'hotspot/list', 'voucher_print' => 'hotspot/voucher_print',
    'template' => 'settings/template', 'uplogo' => 'settings/uplogo',
    'ppp_secrets' => 'ppp/ppp_secrets', 'ppp_profiles' => 'ppp/ppp_profiles', 'ppp_payment' => 'ppp/ppp_payment',
    'ppp_pay' => 'ppp/ppp_pay', 'ppp_user' => 'ppp/ppp_user', 'invoice_print' => 'ppp/invoice_print',
    'ip_pools' => 'ip_pool/ip_pools', 'log' => 'log/log', 'report' => 'report/report',
    'routers' => 'settings/routers', 'settings' => 'settings/settings',
    'system' => 'system/system',
    'about' => 'settings/about',
    'notfound' => 'dashboard/notfound',
];
$pages = array_diff(array_keys($routes), ['setup']);

$p = get('p', get('session') !== '' ? 'dashboard' : 'routers'); // ?session=NAMA tanpa p langsung ke Dashboard router itu
if (!cfg('admin')) $p = 'setup';
elseif (!authed()) $p = 'login';
elseif (!in_array($p, $pages, true)) $p = 'notfound';   // alamat salah: tampilkan halaman "tidak ditemukan", bukan Dashboard
$_GET['p'] = $p; if (authed() && get('session') !== '') { if (url_rid() === '') { flash('Sesi router tidak ditemukan. Silakan pilih router.', 'err'); header('Location: ' . url('routers')); exit; } if ($p !== 'routers') $_SESSION['rid'] = url_rid(); } // sesi per router dari alamat
if (!in_array($p, ['setup', 'login', 'routers', 'settings', 'about', 'notfound', 'api'], true) && !isset(routers()[$_SESSION['rid'] ?? ''])) { header('Location: ' . url('routers')); exit; } // wajib pilih router dulu (seperti Mikhmon)

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !csrf_ok()) {
    flash('Formulir kedaluwarsa. Muat ulang halaman lalu coba lagi.', 'err');
    header('Location: ' . url($p === 'setup' || $p === 'login' ? $p : 'dashboard'));
    exit;
}

/** Kembali ke halaman yang sama setelah aksi POST. */
function back()
{
    header('Location: ./' . (!empty($_SERVER['QUERY_STRING']) ? '?' . $_SERVER['QUERY_STRING'] : ''));
    exit;
}

$file = $routes[$p];
if ($p === 'list' && get('s') === 'ppp_active') $file = 'ppp/ppp_active'; // PPP Active ada di folder ppp
require ROOT . '/pages/' . $file . '.php';
