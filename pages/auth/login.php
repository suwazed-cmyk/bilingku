<?php
require __DIR__ . '/_auth.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (post('act') === 'logout') {
        $_SESSION = [];
        session_destroy();
        header('Location: ./');
        exit;
    }
    $ip = $_SERVER['REMOTE_ADDR'] ?? '-';
    $fails = db_load('login_fail');
    foreach ($fails as $k => $f) if ($f[1] < time() - 900) unset($fails[$k]);
    if (isset($fails[$ip]) && $fails[$ip][0] >= 5) {
        flash('Terlalu banyak percobaan gagal. Coba lagi 15 menit lagi.', 'err');
        redirect('login');
    }
    $a = cfg('admin'); // satu akun admin per folder, dibuat di halaman Setup
    if (hash_equals($a['user'], post('user')) && password_verify((string)($_POST['pass'] ?? ''), $a['hash'])) {
        unset($fails[$ip]);
        db_save('login_fail', $fails);
        session_regenerate_id(true);
        $_SESSION['seen'] = time();
        session_sweep();
        $_SESSION['auth'] = $a['user'];
		unset($_SESSION['rid']); // setiap login wajib pilih router
        redirect('routers');
    }
    $fails[$ip] = [isset($fails[$ip]) ? $fails[$ip][0] + 1 : 1, time()];
    db_save('login_fail', $fails);
    usleep(600000);
    flash('Nama pengguna atau kata sandi salah.', 'err');
    redirect('login');
}

auth_page('Login', '<form method="post" action="' . h(url('login')) . '">' . csrf_field()
    . '<label>Username<input name="user" required autocomplete="username" autocapitalize="none" spellcheck="false" autofocus></label>'
    . '<label>Password<input type="password" name="pass" required autocomplete="current-password"></label>'
    . '<button class="btn primary wide">Login</button></form>');
