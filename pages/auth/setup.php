<?php
require __DIR__ . '/_auth.php';

if (!is_dir(DATA)) @mkdir(DATA, 0755, true);
$writable = is_writable(DATA);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $writable) {
    $u = post('user'); $p1 = (string)($_POST['pass'] ?? ''); $p2 = (string)($_POST['pass2'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_.-]{3,30}$/', $u)) flash('Nama pengguna 3–30 karakter: huruf, angka, titik, garis.', 'err');
    elseif (strlen($p1) < 8) flash('Kata sandi minimal 8 karakter.', 'err');
    elseif ($p1 !== $p2) flash('Ulangi kata sandi dengan sama persis.', 'err');
    else {
        cfg_set('admin', ['user' => $u, 'hash' => password_hash($p1, PASSWORD_DEFAULT)]);
        secret_key();
        session_regenerate_id(true);
        $_SESSION['auth'] = $u;
        flash('Akun admin dibuat. Sekarang tambahkan router MikroTik Anda.');
        redirect('routers');
    }
    redirect('setup');
}

$body = $writable
    ? '<p class="muted">Buat akun admin untuk panel ini.</p><form method="post">' . csrf_field()
        . '<label>Username<input name="user" required autocomplete="off" autofocus></label>'
        . '<label>Password<input type="password" name="pass" required minlength="8" autocomplete="new-password"></label>'
        . '<label>Confirm Password<input type="password" name="pass2" required minlength="8" autocomplete="new-password"></label>'
        . '<button class="btn primary wide">Create Account</button></form>'
    : '<div class="msg err">Folder <code>data/</code> belum bisa ditulis. Ubah izinnya menjadi 755 (atau 775) lewat File Manager hosting, lalu muat ulang halaman ini.</div>';
auth_page('Pemasangan awal', $body);
