<?php
/**
 * Bilingku 3 — tampilan panel dan model PPP gabungan:
 * Main Profile + FUP Profile (isolir) + Validity (lama di FUP sebelum disable), dengan pembayaran bulanan.
 */

/* ---------- ikon ---------- */

function icon($n)
{
    static $p = [
        'dash' => 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
        'search' => 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
        'wifi' => 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01',
        'ppp' => 'M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4',
        'money' => 'M3 6h18v12H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
        'report' => 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
        'log' => 'M4 6h16M4 12h16M4 18h10',
        'gear' => 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
        'router' => 'M3 14h18v6H3zM7 17h.01M11 17h.01M12 14V8M8.5 6.5a5 5 0 0 1 7 0',
        'user' => 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
        'pie' => 'M11 4v9h9A9 9 0 1 1 11 4zM15 3.5A8 8 0 0 1 20.5 9H15z',
        'link' => 'M9 15l6-6M10 6l1-1a5 5 0 0 1 7 7l-1 1M14 18l-1 1a5 5 0 0 1-7-7l1-1',
        'ticket' => 'M3 7h18v4a2 2 0 0 0 0 4v2H3v-2a2 2 0 0 0 0-4zM10 7v10',
        'edit' => 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
        'minus' => 'M5 12h14', 'trash' => 'M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3',
        'plus' => 'M12 5v14M5 12h14',
        'lock' => 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
        'unlock' => 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
        'reload' => 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
        'eye' => 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
        'chev' => 'M6 9l6 6 6-6',
        'save' => 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
        'clock' => 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
        'chip' => 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
        'pulse' => 'M3 12h4l2-6 4 12 2-6h6',
        'out' => 'M10 4H5v16h5M14 8l4 4-4 4M9 12h9',
        'info' => 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01',
        'print' => 'M7 9V3h10v6M7 17H4v-8h16v8h-3M7 13h10v8H7zM17 12h.01',
        'phone' => 'M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z',
        'down' => 'M12 4v12M6 11l6 6 6-6M5 20h14',
        'up' => 'M12 20V8M6 13l6-6 6 6M5 4h14',
        'cal' => 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
        'bell' => 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
    ];
    return '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' . ($p[$n] ?? '') . '"/></svg>';
}

/* ---------- kerangka halaman ---------- */

function nav_items()
{
    // [ikon, label, halaman, parameter]. Parameter bernilai '' berarti harus kosong supaya menu itu yang aktif.
	if (!isset(routers()[$_SESSION['rid'] ?? ''])) return [['router', 'Daftar Router', 'routers', ['add' => '', 'edit' => '']], ['plus', 'Tambah Router', 'routers', ['add' => '1']], ['gear', 'Admin Settings', 'settings', []], ['info', 'About', 'about', []]]; // mode Admin seperti Mikhmon: belum ada router yang dibuka
    return [
        ['dash', 'Dashboard', 'dashboard', []],
        ['wifi', 'Hotspot', [
            ['user', 'Users', [
                ['log', 'User List', 'hs_users', []], ['plus', 'Add User', 'hs_generate', ['one' => '1']], ['plus', 'Generate', 'hs_generate', ['one' => '', 'id' => '']],
            ]],
            ['pie', 'User Profile', [
                ['log', 'Profile List', 'hs_profiles', ['add' => '']], ['plus', 'Add Profile', 'hs_profiles', ['add' => '1']],
            ]],
            ['link', 'Hotspot Active', 'list', ['s' => 'hs_active']], ['router', 'Hosts', 'list', ['s' => 'hs_hosts']],
            ['lock', 'IP Bindings', 'list', ['s' => 'hs_bindings']], ['clock', 'Cookies', 'list', ['s' => 'hs_cookies']],
        ]],
        ['ppp', 'PPP', [
            ['user', 'PPP User', 'ppp_secrets', []], ['pie', 'PPP Profiles', 'ppp_profiles', []],
            ['link', 'PPP Active', 'list', ['s' => 'ppp_active']], ['money', 'PPP Payment', 'ppp_payment', []],
        ]],
        ['dash', 'IP Pool', 'ip_pools', []],
        ['chip', 'System', [
            ['clock', 'Scheduler', 'system', ['s' => 'scheduler']], ['pulse', 'Netwatch', 'system', ['s' => 'netwatch']],
            ['reload', 'Reboot', 'system', ['s' => 'reboot']],
        ]],
        ['log', 'Log', 'log', []],
        ['report', 'Report', 'report', []],
        ['gear', 'Settings', [
            ['router', 'Router', 'routers', []], ['gear', 'Admin Settings', 'settings', []],
            ['edit', 'Template Editor', 'template', []], ['save', 'Upload Logo', 'uplogo', []],
        ]],
        ['info', 'About', 'about', []],
    ];
}

function page_head($title, $actions = '', $back = null)
{
    static $parent = ['ppp_pay' => 'ppp_secrets', 'ppp_user' => 'ppp_secrets'];
    $p = get('p', 'dashboard'); $s = get('s');
    if (isset($parent[$p])) $p = $parent[$p];
    if ($p === 'hs_generate' && get('id') !== '') $p = 'hs_users'; // Edit User termasuk User List
    $rs = routers(); $r = isset($rs[$_SESSION['rid'] ?? '']) ? router() : null; // mode Admin: belum ada router yang dibuka
    $on = function ($it) use ($p) {
        if ($it[2] !== $p) return false;
        foreach ($it[3] as $k => $v) if (get($k) !== (string)$v) return false;
        return true;
    };
    $v = '?v=' . asset_ver();
    header('Content-Type: text/html; charset=utf-8');
    header('X-Frame-Options: SAMEORIGIN');
    echo '<!doctype html><html lang="id" translate="no" class="notranslate"><head><link rel="icon" type="image/svg+xml" href="assets/favicon.svg"><meta name="google" content="notranslate"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<script>try{var t=localStorage.getItem("bk-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>';
    echo '<title>' . h($title) . ' — ' . h(app_name()) . '</title><link rel="stylesheet" href="' . asset_url('style.css') . '"><link rel="stylesheet" href="' . asset_url('theme.css') . '"><link rel="stylesheet" href="' . asset_url('redesign.css') . '"></head><body class="v3 pg-' . preg_replace('/[^a-z0-9_]/', '', basename((string)($GLOBALS['file'] ?? get('p')))) . '">';
    echo '<input type="checkbox" id="navtoggle" hidden><label for="navtoggle" class="scrim" aria-hidden="true"></label>';

    echo '<header class="topbar"><a class="brand" href="' . url() . '"><b>' . icon('wifi') . '</b>' . h(strtoupper(app_name())) . '</a>';
    echo '<label for="navtoggle" class="burger" aria-label="Buka atau tutup menu"><span></span></label><div class="crumb">';
    if ($back) echo '<a href="' . h($back[1]) . '">' . h($back[0]) . '</a><span aria-hidden="true">/</span>';
    echo '<h1>' . h($title) . '</h1></div>';
    if ($actions !== '') echo '<div class="pageactions">' . $actions . '</div>';
    // tombol tampilan gelap / terang (pilihan disimpan di browser)
    echo '<button type="button" class="themebtn" id="themebtn" title="Tampilan gelap / terang" aria-label="Ganti tampilan gelap atau terang">'
        . '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
        . '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>';
    echo notif_html();
    if ($rs) {
        $state = $r ? ros(null, true) : null;
        if ($state === null && $r) $state = ros_last(); // halaman tanpa koneksi: pakai status terakhir
        $rpCls = $state === null ? '' : ($state ? 'up' : 'down');
        $rpStt = $state === null ? 'Status belum diketahui' : ($state ? 'Terhubung' : 'Tidak terhubung');
        $rpCur = $r ? $r['name'] : 'Pilih router';
        // pemilih router: tombol berisi status + nama, daftar router muncul di panel kecil (bukan dropdown bawaan browser)
        echo '<details class="rpick"><summary title="' . h($rpCur . ' — ' . $rpStt) . '" aria-label="Router yang dipakai: ' . h($rpCur) . '">'
            . '<span class="dot ' . $rpCls . '"></span><b>' . h($rpCur) . '</b>' . icon('chev') . '</summary>'
            . '<div class="rpicklist"><div class="rpickhead">Pilih Router</div>'
            . '<form method="post" action="' . h(url('routers')) . '">' . csrf_field() . '<input type="hidden" name="act" value="select">'
            . '<input type="hidden" name="back" value="' . h($_SERVER['QUERY_STRING'] ?? '') . '">';
        foreach ($rs as $rpId => $rpX) {
            $rpOn = $r && $r['id'] === (string)$rpId;
            echo '<button type="submit" name="id" value="' . h($rpId) . '" class="ritem' . ($rpOn ? ' on' : '') . '"' . ($rpOn ? ' aria-current="true"' : '') . '>'
                . '<span class="rico">' . icon('router') . '</span>'
                . '<span class="rtxt"><b>' . h($rpX['name']) . '</b><small>' . h(($rpX['hotspot_name'] ?? '') !== '' ? $rpX['hotspot_name'] : 'Hotspot Name belum diisi')
                . ($rpOn ? ' · ' . h($rpStt) : ''). '</small></span>'
                . ($rpOn ? '<span class="rchk" aria-hidden="true">✓</span>' : '') . '</button>';
        }
        echo '</form><a class="rpickfoot" href="' . h(url('routers')) . '">' . icon('gear') . 'Manage Router</a></div></details>';
    }
    echo '<form method="post" action="' . h(url('login')) . '" class="logout">' . csrf_field()
        . '<span>' . icon('user') . h($_SESSION['auth'] ?? '') . '</span><button name="act" value="logout" class="linkbtn" title="Keluar" aria-label="Keluar">' . icon('out') . '</button></form></header>';

    echo '<aside class="side"><div class="sidehead">' . h($r ? $r['name'] : app_name()) . '</div><nav aria-label="Menu utama">';
    $draw = function ($items, $sub = false) use (&$draw, $on) {
        $o = ''; $any = false;
        foreach ($items as $it) {
            if (is_array($it[2])) {
                list($inner, $open) = $draw($it[2], true);
                $any = $any || $open;
                $o .= '<details class="navgrp' . ($sub ? ' navsub' : '') . '"' . ($open ? ' open' : '') . '><summary>' . icon($it[0]) . '<span>' . h($it[1]) . '</span>' . icon('chev') . '</summary>' . $inner . '</details>';
            } else {
                $act = $on($it);
                $any = $any || $act;
                $o .= '<a href="' . h(url($it[2], array_filter($it[3], 'strlen'))) . '"' . ($act ? ' class="on" aria-current="page"' : '') . '>' . icon($it[0]) . '<span>' . h($it[1]) . '</span></a>';
            }
        }
        return [$o, $any];
    };
    echo $draw(nav_items())[0];
    echo '</nav><div class="sidefoot">' . h(app_name()) . ' ' . APP_VER . '</div></aside>';
    echo '<main><div class="content">' . flashes();
}

function page_foot()
{
    $v = '?v=' . asset_ver();
    echo '</div></main><script src="' . asset_url('app.js') . '"></script><script src="' . asset_url('app3.js') . '"></script></body></html>';
}

/** Tombol ikon kecil di baris tabel (kirim POST). */
function icon_btn($icon, $title, $act, $fields, $ask = '', $cls = '')
{
    $o = '<form method="post" class="inline"' . ($ask !== '' ? ' data-confirm="' . h($ask) . '"' : '') . '>' . csrf_field()
        . '<input type="hidden" name="act" value="' . h($act) . '">';
    foreach ($fields as $k => $v) $o .= '<input type="hidden" name="' . h($k) . '" value="' . h($v) . '">';
    return $o . '<button class="icbtn ' . $cls . '" title="' . h($title) . '" aria-label="' . h($title) . '">' . icon($icon) . '</button></form>';
}

/* ---------- pagination tabel (server) ---------- */

/**
 * Bar halaman di bawah tabel: "1-50 dari 618 item" + pilihan jumlah baris, lalu tombol « ‹ 1 2 3 › ».
 * $link($halaman, $perHalaman) mengembalikan URL. Tampilannya sama dengan pagination tabel di app3.js.
 */
function pager_html($total, $pg, $per, callable $link, array $sizes = [25, 50, 100, 200])
{
    $pages = $per > 0 ? max(1, (int)ceil($total / $per)) : 1;
    $pg = max(1, min($pg, $pages));
    $a = $total ? ($pg - 1) * $per + 1 : 0; $b = min($total, $pg * $per);
    $nf = function ($n) { return number_format($n, 0, ',', '.'); };
    $o = '<div class="pgbar"><div class="pginfo"><span>' . ($total ? $nf($a) . '-' . $nf($b) . ' dari ' . $nf($total) . ' item' : '0 item') . '</span>'
        . '<select class="pgsize" aria-label="Baris per halaman" onchange="location.href=this.value">';
    foreach ($sizes as $s) $o .= '<option value="' . h($link(1, $s)) . '"' . ($s === $per ? ' selected' : '') . '>' . $s . '</option>';
    $o .= '</select></div><nav class="pgnav" aria-label="Halaman tabel">';
    $btn = function ($p, $label, $aria, $dis, $on = false) use ($link, $per) {
        if ($dis) return '<span class="pgb dis" aria-hidden="true">' . $label . '</span>';
        return '<a class="pgb' . ($on ? ' on' : '') . '" href="' . h($link($p, $per)) . '" aria-label="' . $aria . '"' . ($on ? ' aria-current="page"' : '') . '>' . $label . '</a>';
    };
    $o .= $btn(1, '«', 'Halaman pertama', $pg <= 1) . $btn($pg - 1, '‹', 'Halaman sebelumnya', $pg <= 1);
    $s = max(1, min($pg - 2, $pages - 4)); $e = min($pages, $s + 4);
    for ($i = $s; $i <= $e; $i++) $o .= $btn($i, (string)$i, 'Halaman ' . $i, false, $i === $pg);
    $o .= $btn($pg + 1, '›', 'Halaman berikutnya', $pg >= $pages) . $btn($pages, '»', 'Halaman terakhir', $pg >= $pages);
    return $o . '</nav></div>';
}

/* ---------- PPP: validity, masa isolir, FUP ---------- */

/** "4w4d3h" menjadi detik. Kosong atau 0 = tanpa batas. */
function ival_secs($v)
{
    $v = strtolower(trim((string)$v));
    if ($v === '' || $v === '0') return 0;
    if (!preg_match('/^(\d+[wdhm])+$/', $v)) return -1;
    preg_match_all('/(\d+)([wdhm])/', $v, $m, PREG_SET_ORDER);
    $u = ['w' => 604800, 'd' => 86400, 'h' => 3600, 'm' => 60]; $t = 0;
    foreach ($m as $x) $t += (int)$x[1] * $u[$x[2]];
    return $t;
}

/** Jumlah hari (dibulatkan ke atas) dari sebuah interval. */
function ival_days($v) { $s = ival_secs($v); return $s > 0 ? (int)ceil($s / 86400) : 0; }

function date_add_days($ymd, $n) { return date('Y-m-d', strtotime($ymd . ' +' . (int)$n . ' days')); }

/** Profil FUP pelanggan; bila kosong memakai paket isolir dari Pengaturan. */
function ppp_fup($c)
{
    $f = (string)($c['fup'] ?? '');
    return $f !== '' ? $f : (string)setting('isolir_profile');
}

/**
 * Tanggal secret dinonaktifkan (disable): hari pertama isolir ditambah Masa Tenggang pelanggan (diisi per pelanggan di PPP User).
 * Contoh jatuh tempo 10/12, Masa Tenggang 7: isolir 11/12 s.d. 17/12, nonaktif mulai 18/12.
 * Kosong = tidak pernah (Masa Tenggang kosong / 0 atau pelanggan tanpa tagihan). Secret tidak pernah dihapus.
 */
function dis_date($c)
{
    $n = iso_off_days($c);
    if ($n <= 0 || !is_billed($c)) return '';
    return date_add_days(iso_date($c), $n);
}

function is_dead($c) { return ppp_stage2($c) === 'dis' && ppp_stage2_on($c); }

/** Validity pelanggan dalam hari (kolom Validity di PPP User): lama di FUP Profile setelah jatuh tempo sebelum secret di-disable. Kosong / 0 = tidak pernah. */
function iso_off_days($c) { return max(0, (int)($c['isooff'] ?? 0)); }

/** Setelah Validity (lama di isolir) habis, secret di-disable. */
function ppp_after($c) { return 'dis'; }

/**
 * Tahap kedua setelah Validity habis: 'none' (tidak ada), 'iso' (pindah ke profil isolir bawaan), 'dis' (disable).
 * Bila Isolir Profile-nya sudah profil isolir bawaan, pilihan "Isolir" tidak mengubah apa-apa lagi.
 */
function ppp_stage2($c)
{
    return dis_date($c) === '' ? 'none' : 'dis';
}

/** Tahap kedua sudah berlaku (tanggalnya sudah lewat). */
function ppp_stage2_on($c) { $d = dis_date($c); return $d !== '' && ppp_stage2($c) !== 'none' && date('Y-m-d') >= $d; }

/**
 * Profil isolir bawaan siap dipakai: profilnya ada dan (bila $install) address-list + firewall + web proxy terpasang,
 * supaya pelanggan benar-benar dialihkan ke halaman pemberitahuan. Mengembalikan 'ok', 'installed', atau 'partial'.
 */
function ppp_isolir_ready($install = true)
{
    $iso = (string)setting('isolir_profile');
    if ($iso === '' || !ppp_ensure_iso()) return 'partial';
    if (isset(fup_meta()[$iso])) return 'ok';
    if (!$install || empty($_SERVER['HTTP_HOST'])) return 'partial';
    return fup_setup($iso, 'isolir') ? 'installed' : 'partial';
}

/** Comment dasar secret (tanpa akhiran " - tanggal" / " - expired"). */
function ppp_cmt_base($c, $sec, $user)
{
    $b = isset($c['cmt']) ? (string)$c['cmt'] : ppp_cmt_strip($sec['comment'] ?? '');
    return $b !== '' ? $b : (string)$user;
}

function ppp_cmt_strip($s) { return trim(preg_replace('~\s*-\s*(\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2}|[a-z]{3}/\d{2}/\d{4}|expired)\s*$~i', '', (string)$s)); }

/* ---------- PPP: satu scheduler global di router ---------- */

define('PPP_MARK', '# bk-expire');

/** Nama panel (bisa diganti di Pengaturan) dan bentuk ringkasnya untuk nama scheduler. */
function app_name() { $n = trim((string)setting('panel')); return $n !== '' ? $n : APP_NAME; }
function app_slug() { $s = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower(app_name())), '-'); return $s !== '' ? $s : 'bilingku'; }
function ppp_sched_name() { return app_slug() . '-expire'; }
function ppp_sched_cmt() { return 'Do not remove!!! ' . app_name() . ' expire'; }

/** Tanggal/jam dari router ("2026-11-09 14:06:37" atau "nov/09/2026 14:06:37") menjadi "09/11/2026 14:06:37". */
function ros_dt($s)
{
    $s = trim((string)$s);
    if ($s === '') return '';
    $p = preg_split('/\s+/', $s, 2);
    $d = ros_date($p[0]);
    return $d === '' ? $s : tgl($d) . (isset($p[1]) ? ' ' . $p[1] : '');
}

/** Lama waktu RouterOS ("1w2d3h4m5s") menjadi detik. */
function dur_secs($v)
{
    if (!preg_match_all('/(\d+)([wdhms])/', (string)$v, $m, PREG_SET_ORDER)) return 0;
    $u = ['w' => 604800, 'd' => 86400, 'h' => 3600, 'm' => 60, 's' => 1]; $t = 0;
    foreach ($m as $x) $t += (int)$x[1] * $u[$x[2]];
    return $t;
}

/** Lama waktu dalam angka: "11:09:21" atau "9d 03:04:05". */
function dur_fmt($v)
{
    if ((string)$v === '') return '';
    $t = is_numeric($v) ? (int)$v : dur_secs($v);
    $d = intdiv($t, 86400); $t %= 86400;
    return ($d ? $d . 'd ' : '') . sprintf('%02d:%02d:%02d', intdiv($t, 3600), intdiv($t % 3600, 60), $t % 60);
}

/** Angka dari isian uang ("100.000" menjadi 100000). */
function money_in($v) { return (float)preg_replace('/\D/', '', (string)$v); }

/** Hari terakhir aktif (sama dengan Jatuh Tempo). Tanggal ini yang ditulis di comment. */
function active_until($c) { return date_add_days(iso_date($c), -1); }

/**
 * Script yang dijalankan scheduler tiap hari:
 * baca semua PPP secret, bandingkan tanggal hari ini dengan tanggal di comment, ditulis dalam format tanggal router
 * ("nama - 2026-12-12" di RouterOS 7, "nama - dec/12/2026" di RouterOS 6; format lama dd/mm/yyyy tetap dibaca),
 * yang sudah lewat dipindah ke profil FUP dan comment jadi "nama - expired", tunggu 5 menit, lalu putuskan koneksinya.
 * Secret yang Masa Tenggang-nya habis dinonaktifkan (tidak dihapus).
 */
function ppp_script_src()
{
    $def = (string)setting('isolir_profile');
    $fx = ''; $dz = ''; $ix = '';
    foreach (db_load(rkey('customers')) as $u => $c) {
        $q = '"' . ros_str($u) . '"';
        if (!empty($c['fup']) && $c['fup'] !== $def) $fx .= ':set ($fx->' . $q . ') "' . ros_str($c['fup']) . '"' . "\n";
        $s2 = ppp_stage2($c);
        if ($s2 === 'none') continue;
        $dz .= ':set ($dz->' . $q . ') ' . str_replace('-', '', dis_date($c)) . "\n";
        if ($s2 === 'iso') $ix .= ':set ($ix->' . $q . ') "' . ros_str($def) . '"' . "\n";
    }
    return PPP_MARK . "\n" . '# ' . app_name() . ': dibuat otomatis oleh panel, jangan diubah manual' . "\n"
        . ':local fupDef "' . ros_str($def) . '"' . "\n"
        . ':local fx [:toarray ""]' . "\n" . $fx
        . ':local dz [:toarray ""]' . "\n" . $dz
        . ':local ix [:toarray ""]' . "\n" . $ix
        . <<<'ROS'
:local mons "janfebmaraprmayjunjulaugsepoctnovdec"
:local d [/system clock get date]
:local today 0
:if ([:typeof [:find $d "-"]] = "num") do={
  :set today [:tonum ([:pick $d 0 4] . [:pick $d 5 7] . [:pick $d 8 10])]
} else={
  :local mi ([:find $mons [:pick $d 0 3]] / 3 + 1)
  :local mm [:tostr $mi]
  :if ($mi < 10) do={ :set mm ("0" . $mm) }
  :set today [:tonum ([:pick $d 7 11] . $mm . [:pick $d 4 6])]
}
:local kick [:toarray ""]
:if ($today > 20200101) do={
  :foreach s in=[/ppp secret find] do={
    :local n [/ppp secret get $s name]
    :local c [/ppp secret get $s comment]
    :local l [:len $c]
    :local stage 0
        :local dd ($dz->$n)
        :if ([:typeof $dd] = "num") do={
            :if ($today >= $dd) do={
                :local ip ($ix->$n)
                :if ([:typeof $ip] = "str") do={
                    :set stage 1
                    :if (([:len [/ppp profile find where name=$ip]] > 0) && ([/ppp secret get $s profile] != $ip)) do={
                        /ppp secret set $s profile=$ip
                        :set kick ($kick, $n)
                    }
                } else={
                    :if ([/ppp secret get $s disabled] = false) do={
                        /ppp secret disable $s
                        :set kick ($kick, $n)
                    }
                }
            }
        }
    :local exp 0
    :local cut 0
    :if ($l >= 13) do={
      :local t [:pick $c ($l - 10) $l]
      :if ([:pick $c ($l - 13) ($l - 10)] = " - ") do={
        :if (([:pick $t 4 5] = "-") && ([:pick $t 7 8] = "-")) do={
          :set exp [:tonum ([:pick $t 0 4] . [:pick $t 5 7] . [:pick $t 8 10])]
          :set cut ($l - 13)
        }
        :if (([:pick $t 2 3] = "/") && ([:pick $t 5 6] = "/")) do={
          :set exp [:tonum ([:pick $t 6 10] . [:pick $t 3 5] . [:pick $t 0 2])]
          :set cut ($l - 13)
        }
      }
    }
    :if (($cut = 0) && ($l >= 14)) do={
      :local t [:pick $c ($l - 11) $l]
      :if (([:pick $c ($l - 14) ($l - 11)] = " - ") && ([:pick $t 3 4] = "/") && ([:pick $t 6 7] = "/")) do={
        :local mi [:find $mons [:pick $t 0 3]]
        :if ([:typeof $mi] = "num") do={
          :set mi ($mi / 3 + 1)
          :local mm [:tostr $mi]
          :if ($mi < 10) do={ :set mm ("0" . $mm) }
          :set exp [:tonum ([:pick $t 7 11] . $mm . [:pick $t 4 6])]
          :set cut ($l - 14)
        }
      }
    }
    :if ([:typeof $exp] != "num") do={ :set exp 0 }
    :if (($exp > 0) && ($today > $exp)) do={
      :local f ($fx->$n)
      :if ([:typeof $f] != "str") do={ :set f $fupDef }
      :if ([:len [/ppp profile find where name=$f]] > 0) do={
        :if (($stage = 0) && ([/ppp secret get $s profile] != $f)) do={
                        /ppp secret set $s profile=$f
          :set kick ($kick, $n)
        }
        /ppp secret set $s comment=([:pick $c 0 $cut] . " - expired")
      } else={
        :log warning ("bilingku: profil isolir " . $f . " tidak ada, " . $n . " tidak dipindahkan")
      }
    }
  }
}
:if ([:len $kick] > 0) do={
  :delay 5m
  :foreach n in=$kick do={ /ppp active remove [find where name=$n] }
}
ROS;
}

/** Keadaan scheduler global di router; dikenali dari penanda di baris pertama on-event, bukan dari namanya. */
function ppp_sched_state()
{
    // jalur cepat: ambil dua scheduler panel berdasarkan nama (pindai semua scheduler bisa beberapa detik di router yang ramai)
    $pp = '.id,name,on-event,disabled,comment,next-run,run-count,start-time,interval';
    $d = rq('/system/scheduler/print', ['?name' => ppp_sched_name(), '.proplist' => $pp]); $d = $d ? $d[0] : null;
    $b = rq('/system/scheduler/print', ['?name' => ppp_sched_name() . '-boot', '.proplist' => $pp]); $b = $b ? $b[0] : null;
    if ($d && $b && strpos((string)($d['on-event'] ?? ''), PPP_MARK) === 0 && strpos((string)($b['on-event'] ?? ''), PPP_MARK . '-boot') === 0) {
        $st = ['daily' => $d, 'boot' => $b, 'invalid' => false];
        $st['ok'] = ($d['disabled'] ?? '') !== 'true' && ($d['comment'] ?? '') === ppp_sched_cmt();
        return $st;
    }
    $d = $b = null; $all = rq('/system/scheduler/print');
    foreach ($all as $s) {
        $ev = (string)($s['on-event'] ?? '');
        if (strpos($ev, PPP_MARK . '-boot') === 0) { if (!$b) $b = $s; }
        elseif (strpos($ev, PPP_MARK) === 0) { if (!$d) $d = $s; }
    }
    $marked = $d && $b;
    // scheduler dengan nama yang sama tetapi isi lama (tanpa penanda) dipakai ulang, bukan dibuat dobel
    foreach ($all as $s) {
        if (!$d && ($s['name'] ?? '') === ppp_sched_name()) $d = $s;
        if (!$b && ($s['name'] ?? '') === ppp_sched_name() . '-boot') $b = $s;
    }
    $st = ['daily' => $d, 'boot' => $b, 'invalid' => false];
    $st['ok'] = $marked && ($d['disabled'] ?? '') !== 'true' && ($d['name'] ?? '') === ppp_sched_name() && ($d['comment'] ?? '') === ppp_sched_cmt();
    return $st;
}

function ppp_boot_src()
{
    return PPP_MARK . "-boot\n:delay 2m\n" . ':local f [:parse [/system scheduler get [find where name="' . ros_str(ppp_sched_name()) . '"] on-event]]' . "\n" . '$f';
}

/** Buat atau perbaiki scheduler global (isi script ada di on-event), dan buang peninggalan versi lama. */
function ppp_sched_install()
{
    if (!ros()) return false;
    $st = ppp_sched_state(); $name = ppp_sched_name();
    ppp_ensure_iso(); // FUP bawaan (paket isolir) harus ada sebelum scheduler memakainya
    $daily = ['name' => $name, 'start-time' => '00:01:00', 'interval' => '1d', 'on-event' => ppp_script_src(), 'disabled' => 'no', 'comment' => ppp_sched_cmt()];
    $ok = $st['daily'] ? rdo('/system/scheduler/set', ['.id' => $st['daily']['.id']] + $daily) : rdo('/system/scheduler/add', $daily);
    // kedua: jalan sekali tiap router menyala, supaya hari yang terlewat saat router mati tetap diproses
    $boot = ['name' => $name . '-boot', 'start-time' => 'startup', 'interval' => '0s', 'on-event' => ppp_boot_src(), 'disabled' => 'no', 'comment' => ppp_sched_cmt() . ' (boot)'];
    $ok = ($st['boot'] ? rdo('/system/scheduler/set', ['.id' => $st['boot']['.id']] + $boot) : rdo('/system/scheduler/add', $boot)) && $ok;
    foreach (['bilingku-iso', 'bilingku-dis', 'bilingku'] as $cm) {
        rremove('/system/scheduler', array_column(rq('/system/scheduler/print', ['?comment' => $cm, '.proplist' => '.id']), '.id'));
    }
    rremove('/system/script', array_column(rq('/system/script/print', ['?name' => 'bilingku-expire', '?comment' => 'bilingku', '.proplist' => '.id']), '.id'));
    if (session_status() === PHP_SESSION_ACTIVE) $_SESSION['nf']['sched_' . router_id()] = [time(), $ok ? 1 : 0];
    return $ok;
}

/** Perbarui isi scheduler bila data pelanggan berubah (FUP per secret). Tidak membuat yang belum ada. */
function ppp_script_refresh()
{
    if (!ros(null, true)) return;
    $st = ppp_sched_state();
    if (!$st['daily']) return;
    $src = ppp_script_src();
    if (($st['daily']['on-event'] ?? '') !== $src) rdo('/system/scheduler/set', ['.id' => $st['daily']['.id'], 'on-event' => $src], true);
}

/** Jalankan pemeriksaan sekarang di latar belakang (tidak menunggu jeda 5 menitnya). */
function ppp_sched_run()
{
    return rdo('/execute', ['script' => ':local f [:parse [/system scheduler get [find where name="' . ros_str(ppp_sched_name()) . '"] on-event]]; $f']);
}

/**
 * Samakan router dengan data satu pelanggan sekarang juga (tanpa menunggu scheduler):
 * profil (Main atau FUP), comment "<nama> - dd/mm/yyyy" atau "<nama> - expired", dan nonaktif bila Masa Tenggang habis.
 * $enable = aktifkan lagi secret yang nonaktif bila sudah tidak kedaluwarsa (dipakai setelah pembayaran).
 * $sch dan $dsch tidak dipakai lagi (dulu scheduler per pelanggan).
 */
function ppp_sync($user, $sec = null, $sch = false, $enable = false, $dsch = false)
{
    static $reg = false;
    if (!ros()) return false;
    if (!$reg) { $reg = true; register_shutdown_function('ppp_script_refresh'); }
    $cs = db_load(rkey('customers'));
    $c = isset($cs[$user]) ? $cs[$user] : [];
    if ($sec === null) { $r = rq('/ppp/secret/print', ['?name' => $user, '.proplist' => '.id,profile,disabled,comment']); $sec = $r ? $r[0] : null; }
    if (!$sec) return false;

    $iso = ppp_fup($c);
    // paket isolir bawaan dibuat otomatis di router begitu ada pelanggan bertagihan yang memakainya,
    // supaya scheduler di router tidak gagal memindahkan pelanggan saat jatuh tempo
    if (is_billed($c) && $iso === (string)setting('isolir_profile')) ppp_ensure_iso();
    $late = is_late($c);
    $s2 = ppp_stage2($c); $s2on = $late && ppp_stage2_on($c);
    $isoDef = (string)setting('isolir_profile');
    if ($late && ($iso === $isoDef || ($s2on && $s2 === 'iso')) && !ppp_ensure_iso()) return false;
    $paket = !empty($c['paket']) ? $c['paket'] : (!in_array($sec['profile'], [$iso, $isoDef], true) ? $sec['profile'] : '');
    // lewat jatuh tempo: Isolir Profile; Validity habis + "Isolir": profil isolir bawaan
    $want = $late ? ($s2on && $s2 === 'iso' ? $isoDef : $iso) : $paket;
    if ($want !== '' && $sec['profile'] !== $want) {
        if (!rdo('/ppp/secret/set', ['.id' => $sec['.id'], 'profile' => $want])) return false;
        ppp_kick($user);
    }

    $billed = is_billed($c);
    $base = ppp_cmt_base($c, $sec, $user);
    $cmt = $billed ? $base . ' - ' . ($late ? 'expired' : ros_date_fmt(active_until($c))) : (isset($c['cmt']) ? (string)$c['cmt'] : ($sec['comment'] ?? ''));
    if ($cmt !== ($sec['comment'] ?? '')) rdo('/ppp/secret/set', ['.id' => $sec['.id'], 'comment' => $cmt], true);

    $dead = $s2on && $s2 === 'dis'; // hanya pilihan "Disable" yang mematikan secret
    $off = ($sec['disabled'] ?? '') === 'true';
    if ($dead && !$off) { rdo('/ppp/secret/disable', ['.id' => $sec['.id']], true); ppp_kick($user); }
    elseif (!$dead && $off && ($enable || !empty($c['expired']))) rdo('/ppp/secret/enable', ['.id' => $sec['.id']], true);

    if ($c || $late) {
        $c['isolated'] = $late ? 1 : 0;
        $c['expired'] = $dead ? 1 : 0;
        if ($paket !== '' && empty($c['paket'])) $c['paket'] = $paket;
        $cs[$user] = $c;
        customers_save($cs);
    }
    return true;
}

/** Samakan semua pelanggan dan pastikan scheduler global terpasang; kembalikan jumlah pelanggan yang diperiksa. */
function ppp_sync_all()
{
    if (!ros()) return -1;
    $secs = [];
    foreach (rq('/ppp/secret/print', ['.proplist' => '.id,name,profile,disabled,comment']) as $s) $secs[$s['name']] = $s;
    $n = 0;
    foreach (array_keys(customers()) as $u) {
        if (!isset($secs[$u])) continue;
        ppp_sync($u, $secs[$u]);
        $n++;
    }
    ppp_sched_install();
    return $n;
}

/* ---------- profil FUP / isolir: address-list, firewall, web proxy, halaman pemberitahuan ---------- */

function fup_meta() { return db_load(rkey('fup')); }
function fup_tag($profile) { return 'bilingku-fup:' . $profile; }
function pool_tag($profile) { return 'bilingku-pool:' . $profile; }

/** Alamat dasar panel, mis. https://domain/bilingku */
function app_base()
{
    return (req_https() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost') . base_path();
}

function isopage_url($rid = null) { return app_base() . '/isopage.php?r=' . rawurlencode($rid === null ? router_id() : $rid); }

/** Tambah aturan di urutan paling atas (sebelum aturan statis pertama); bila ditolak, tambah di akhir. */
function radd_top($path, $p)
{
    $a = ros();
    if (!$a) return false;
    foreach (rq($path . '/print', ['.proplist' => '.id,dynamic']) as $r) {
        if (($r['dynamic'] ?? '') === 'true') continue;
        try { $a->comm($path . '/add', $p + ['place-before' => $r['.id']]); return true; } catch (Exception $e) {}
        break;
    }
    return rdo($path . '/add', $p);
}

/** Hapus semua aturan router yang dibuat untuk satu profil FUP. */
function fup_clear_rules($profile)
{
    $n = 0;
    foreach (['/ip/firewall/nat', '/ip/firewall/filter', '/ip/firewall/address-list', '/ip/proxy/access'] as $path) {
        $ids = array_column(rq($path . '/print', ['?comment' => fup_tag($profile), '.proplist' => '.id']), '.id');
        $n += rremove($path, $ids);
    }
    return $n;
}

/**
 * Pasang isolir untuk profil FUP: pelanggan di address-list $list hanya boleh DNS dan halaman pemberitahuan,
 * HTTP dialihkan ke web proxy yang meneruskan ke halaman pemberitahuan di panel ini.
 */
function fup_setup($profile, $list)
{
    if (!ros()) return false;
    $tag = fup_tag($profile); $meta = fup_meta(); $m = $meta[$profile] ?? [];
    fup_clear_rules($profile);
    $px = rq('/ip/proxy/print'); $px = $px ? $px[0] : [];
    $port = (int)($px['port'] ?? 8080); if ($port < 1) $port = 8080;
    $byus = !empty($m['proxy_by_us']);
    if (($px['enabled'] ?? 'false') !== 'true') {
        if (!rdo('/ip/proxy/set', ['enabled' => 'yes'])) return false;
        $byus = true;
    }
    $host = preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '');
    $allow = $list . '-allow'; $c = ['comment' => $tag];
    $ok = rdo('/ip/firewall/address-list/add', ['list' => $allow, 'address' => $host] + $c);
    // web proxy: izinkan halaman pemberitahuan, selain itu alihkan ke sana (ditaruh di akhir supaya aturan lain tetap berlaku)
    $ok = rdo('/ip/proxy/access/add', ['dst-host' => $host, 'action' => 'allow'] + $c) && $ok;
    // RouterOS v7: action=redirect + action-data; v6: action=deny + redirect-to
    try { ros()->comm('/ip/proxy/access/add', ['action' => 'redirect', 'action-data' => isopage_url()] + $c); }
    catch (Exception $e) { $ok = rdo('/ip/proxy/access/add', ['action' => 'deny', 'redirect-to' => isopage_url()] + $c) && $ok; }
    // firewall: tiap aturan ditaruh paling atas, jadi ditambahkan dari yang terakhir
    $src = ['src-address-list' => $list];
    $ok = radd_top('/ip/firewall/nat', ['chain' => 'dstnat', 'protocol' => 'tcp', 'dst-port' => '80', 'action' => 'redirect', 'to-ports' => (string)$port] + $src + $c) && $ok;
    $ok = radd_top('/ip/firewall/filter', ['chain' => 'forward', 'action' => 'drop'] + $src + $c) && $ok;
    $ok = radd_top('/ip/firewall/filter', ['chain' => 'forward', 'action' => 'accept', 'dst-address-list' => $allow] + $src + $c) && $ok;
    $ok = radd_top('/ip/firewall/filter', ['chain' => 'forward', 'action' => 'accept', 'protocol' => 'tcp', 'dst-port' => '53'] + $src + $c) && $ok;
    $ok = radd_top('/ip/firewall/filter', ['chain' => 'forward', 'action' => 'accept', 'protocol' => 'udp', 'dst-port' => '53'] + $src + $c) && $ok;
    $ok = radd_top('/ip/firewall/filter', ['chain' => 'input', 'action' => 'accept', 'protocol' => 'tcp', 'dst-port' => (string)$port] + $src + $c) && $ok;
    $meta[$profile] = ['list' => $list, 'proxy_by_us' => $byus ? 1 : 0];
    db_save(rkey('fup'), $meta);
    return $ok;
}

/** Bongkar semua yang dibuat fup_setup untuk profil ini. Mengembalikan jumlah aturan yang dihapus, -1 bila profil bukan FUP. */
function fup_remove($profile)
{
    $meta = fup_meta();
    if (!isset($meta[$profile])) return -1;
    $n = fup_clear_rules($profile);
    $byus = !empty($meta[$profile]['proxy_by_us']);
    unset($meta[$profile]);
    if ($meta) {
        if ($byus) { $k = key($meta); $meta[$k]['proxy_by_us'] = 1; }
    } else {
        if ($byus) rdo('/ip/proxy/set', ['enabled' => 'no'], true);
        db_delete(rkey('isopage'));
    }
    db_save(rkey('fup'), $meta);
    return $n;
}

/** Popup "Add IP Pool". $ajax = simpan tanpa meninggalkan halaman (dipakai di form profil). */
function pool_dialog($ajax = false)
{
    return '<dialog id="pooldlg" class="dlg"><form method="post" action="' . h(url('ip_pools')) . '"' . ($ajax ? ' data-poolajax="#p_remote"' : '') . '>'
        . csrf_field() . '<input type="hidden" name="act" value="save">' . ($ajax ? '<input type="hidden" name="ajax" value="1">' : '')
        . '<div class="cardhead">' . icon('dash') . '<strong>Add IP Pool</strong><span class="spacer"></span><button type="button" class="x" data-close title="Tutup" aria-label="Tutup">&times;</button></div>'
        . '<div class="cardbody"><p class="msg err" hidden></p>'
        . '<div class="frow"><label for="d_pname">Name</label><input id="d_pname" name="name" required pattern="[A-Za-z0-9_.\-]+" placeholder="pool-pppoe" autocomplete="off"></div>'
        . '<div class="frow"><label for="d_pranges">Ranges</label><input id="d_pranges" name="ranges" required placeholder="192.168.22.10-192.168.22.250" autocomplete="off"></div>'
        . '<div class="frow"><label for="d_pcmt">Comment</label><input id="d_pcmt" name="comment" autocomplete="off"></div>'
        . '<div class="btnrow" style="margin:.9rem 0 0"><button class="btn primary">' . icon('save') . 'Save</button><button type="button" class="btn ghost" data-close>Cancel</button></div>'
        . '</div></form></dialog>';
}

/* ---------- pemberitahuan (lonceng di top bar) ---------- */

/** Scheduler global sudah lengkap di router ini? Hasilnya diingat 10 menit supaya tidak menanyai router di tiap halaman. null = belum diketahui. */
function ppp_sched_ok($fresh = false)
{
    $k = 'sched_' . router_id();
    $c = $_SESSION['nf'][$k] ?? null;
    if (ros(null, true) && ($fresh || !$c || time() - $c[0] > 600)) {
        $st = ppp_sched_state();
        $c = [time(), $st['ok'] ? 1 : 0];
        if (session_status() === PHP_SESSION_ACTIVE) $_SESSION['nf'][$k] = $c;
    }
    return $c ? (bool)$c[1] : null;
}

/** Daftar pemberitahuan: [judul, isi, HTML aksi]. */
function notif_items()
{
    $it = [];
    if (!router()) return $it;
    if (ppp_sched_ok() === false) {
        $it[] = ['Scheduler PPP belum terpasang',
            'Router ini belum punya scheduler ' . ppp_sched_name() . ' (atau namanya belum sesuai nama panel). Tanpa itu, secret yang lewat tanggal tidak dipindahkan ke Isolir Profile. Scheduler dibuat otomatis saat Anda menyimpan secret, atau klik tombol di bawah.',
            '<form method="post" action="' . h(url('ppp_secrets')) . '">' . csrf_field() . '<button class="btn small primary" name="act" value="mksched">Create Scheduler</button></form>'];
    }
    $late = $soon = 0;
    foreach (customers() as $c) {
        $st = bill_state($c);
        if ($st[0] === 'late') $late++;
        elseif ($st[0] === 'soon' || $st[0] === 'grace') $soon++;
    }
    if ($late) $it[] = ['Pelanggan menunggak', $late . ' pelanggan PPP sudah lewat Jatuh Tempo dan masuk Isolir Profile.', '<a class="btn small" href="' . h(url('ppp_secrets', ['f' => 'late'])) . '">View</a>'];
    if ($soon) $it[] = ['Segera jatuh tempo', $soon . ' pelanggan PPP jatuh tempo dalam 7 hari.', '<a class="btn small" href="' . h(url('ppp_secrets', ['f' => 'soon'])) . '">View</a>'];
    return $it;
}

function notif_html()
{
    $it = notif_items(); $n = count($it);
    $o = '<details class="notif"><summary title="Pemberitahuan" aria-label="Pemberitahuan' . ($n ? ', ' . $n . ' baru' : '') . '">' . icon('bell') . ($n ? '<b>' . $n . '</b>' : '') . '</summary><div class="notiflist">';
    if (!$n) $o .= '<div class="nitem"><p class="muted">Tidak ada pemberitahuan.</p></div>';
    foreach ($it as $x) $o .= '<div class="nitem"><strong>' . h($x[0]) . '</strong><p>' . h($x[1]) . '</p>' . $x[2] . '</div>';
    return $o . '</div></details>';
}

/* ---------- PPP: tanggal daftar dan lama berlangganan ---------- */

/** Tanggal daftar pelanggan: isian Tanggal Daftar, atau perkiraan dari Start Date / pembayaran pertama untuk data lama. */
function ppp_joined($c, $user)
{
    if (!empty($c['joined'])) return (string)$c['joined'];
    $d = !empty($c['start']) ? (string)$c['start'] : '';
    foreach (payments() as $p) {
        if (($p['user'] ?? '') !== $user) continue;
        foreach (['from', 'paid_at'] as $k) if (!empty($p[$k]) && ($d === '' || $p[$k] < $d)) $d = (string)$p[$k];
    }
    return $d;
}

/** Lama berlangganan dari tanggal daftar sampai hari ini, mis. "1 tahun 2 bulan 5 hari". */
function lama_langganan($ymd)
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$ymd)) return '';
    $a = new DateTime($ymd); $b = new DateTime(date('Y-m-d'));
    if ($a > $b) return 'mulai ' . tgl($ymd);
    $x = $a->diff($b); $o = [];
    if ($x->y) $o[] = $x->y . ' tahun';
    if ($x->m) $o[] = $x->m . ' bulan';
    if ($x->d) $o[] = $x->d . ' hari';
    return $o ? implode(' ', $o) : 'mulai hari ini';
}
