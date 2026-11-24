<?php
/**
 * Klien RouterOS API (port 8728 / 8729-ssl).
 * Mendukung login RouterOS v6.43+ / v7 dan login lama (challenge MD5).
 */
class RouterOS
{
    public $error = '';
    public $ret = null;
    public $timeout = 6;
    private $sock = null;

    public $reused = false;   // true bila koneksi lama (sudah login) dipakai ulang

    /**
     * Sambung dan login. $keep = true: koneksi disimpan di proses PHP (persistent) dan dipakai ulang
     * oleh permintaan berikutnya, sehingga login ke router (±200 ms di RouterOS v7) tidak diulang tiap halaman.
     * Koneksi lama selalu diuji dulu; bila rusak / kotor / belum login, dibuat koneksi baru seperti biasa.
     */
    public function connect($host, $port, $user, $pass, $ssl = false, $keep = false)
    {
        if (strpos($host, ':') !== false && $host[0] !== '[') $host = '[' . $host . ']';
        $ctx = stream_context_create(['ssl' => [
            'verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true,
        ]]);
        $addr = ($ssl ? 'ssl://' : 'tcp://') . $host . ':' . (int)$port;
        $this->reused = false;
        if ($keep) {
            // kunci koneksi ikut user + sandi, supaya sesi router tidak pernah tertukar antar akun
            $addr .= '/' . substr(sha1($user . "\0" . $pass . "\0" . (int)$ssl), 0, 16);
            $this->sock = @stream_socket_client($addr, $errno, $errstr, $this->timeout, STREAM_CLIENT_CONNECT | STREAM_CLIENT_PERSISTENT, $ctx);
            if ($this->sock) {
                $st = $this->reuse();
                if ($st === 'ok') { stream_set_timeout($this->sock, $this->timeout); $this->reused = true; return true; }
                if ($st === 'dead') $this->sock = @stream_socket_client($addr, $errno, $errstr, $this->timeout, STREAM_CLIENT_CONNECT | STREAM_CLIENT_PERSISTENT, $ctx);
            }
        } else {
            $this->sock = @stream_socket_client($addr, $errno, $errstr, $this->timeout, STREAM_CLIENT_CONNECT, $ctx);
        }
        if (!$this->sock) {
            $this->error = "Tidak bisa terhubung ke $host:$port" . ($errstr ? " ($errstr)" : '');
            return false;
        }
        stream_set_timeout($this->sock, $this->timeout);
        try {
            $this->comm('/login', ['name' => $user, 'password' => $pass]);
            if ($this->ret !== null && $this->ret !== '') {           // RouterOS < 6.43
                $chal = pack('H*', $this->ret);
                $this->comm('/login', ['name' => $user, 'response' => '00' . md5(chr(0) . $pass . $chal)]);
            }
            return true;
        } catch (Exception $e) {
            $this->error = 'Login ke router gagal: ' . $e->getMessage();
            $this->close();
            return false;
        }
    }

    /**
     * Uji koneksi persistent: 'ok' = sudah login dan bersih, 'login' = tersambung tetapi belum login,
     * 'dead' = sudah ditutup (putus, ada sisa data, atau tidak menjawab dalam 1 detik).
     */
    private function reuse()
    {
        if (!is_resource($this->sock) || @feof($this->sock)) { $this->close(); return 'dead'; }
        // sisa balasan dari permintaan sebelumnya yang terpotong: jangan dipakai
        @stream_set_blocking($this->sock, false);
        $junk = @fread($this->sock, 8192);
        @stream_set_blocking($this->sock, true);
        if (($junk !== false && $junk !== '') || @feof($this->sock)) { $this->close(); return 'dead'; }
        stream_set_timeout($this->sock, 1);
        try {
            $tag = 'bk' . mt_rand(100000, 999999);
            $buf = $this->encWord('/system/identity/print') . $this->encWord('.tag=' . $tag) . chr(0);
            if (@fwrite($this->sock, $buf) !== strlen($buf)) { $this->close(); return 'dead'; }
            $ok = true;
            for ($i = 0; $i < 100; $i++) {
                $s = $this->readSentence();
                if (!$s) continue;
                if ($s[0] === '!fatal') { $this->close(); return 'dead'; }
                if (!in_array('.tag=' . $tag, $s, true)) { $this->close(); return 'dead'; }   // balasan milik perintah lain
                if ($s[0] === '!trap') $ok = false;
                if ($s[0] === '!done') return $ok ? 'ok' : 'login';
            }
        } catch (Exception $e) { /* readBytes sudah menutup koneksi */ }
        $this->close();
        return 'dead';
    }

    public function connected() { return is_resource($this->sock); }

    public function close()
    {
        if (is_resource($this->sock)) @fclose($this->sock);
        $this->sock = null;
    }

    /**
     * Kirim perintah. $params: 'kunci' => nilai (atribut), '?kunci' => nilai (query),
     * indeks angka => kata mentah (mis. '?#|').
     * Mengembalikan daftar baris (!re). Melempar Exception bila router membalas !trap.
     */
    public function comm($cmd, $params = [])
    {
        if (!is_resource($this->sock)) throw new Exception('Tidak terhubung ke router');
        $t0 = empty($GLOBALS['ROS_PROF_ON']) ? 0 : microtime(true);   // pengukur waktu (hanya saat diagnosa)
        $buf = $this->encWord($cmd);
        foreach ($params as $k => $v) {
            if (is_int($k)) $w = (string)$v;
            elseif ($k !== '' && $k[0] === '?') $w = $k . '=' . $v;
            else $w = '=' . $k . '=' . $v;
            $buf .= $this->encWord($w);
        }
        $buf .= chr(0);
        $len = strlen($buf); $sent = 0;
        while ($sent < $len) {
            $n = @fwrite($this->sock, substr($buf, $sent));
            if ($n === false || $n === 0) { $this->close(); throw new Exception('Koneksi ke router terputus'); }
            $sent += $n;
        }

        $rows = []; $trap = null; $this->ret = null;
        while (true) {
            $s = $this->readSentence();
            if (!$s) continue;
            $type = array_shift($s);
            $a = [];
            foreach ($s as $w) {
                if ($w !== '' && $w[0] === '=') {
                    $p = strpos($w, '=', 1);
                    if ($p !== false) $a[substr($w, 1, $p - 1)] = substr($w, $p + 1);
                }
            }
            if ($type === '!re') $rows[] = $a;
            elseif ($type === '!trap') { if ($trap === null) $trap = isset($a['message']) ? $a['message'] : 'perintah ditolak'; }
            elseif ($type === '!fatal') { $this->close(); throw new Exception(isset($s[0]) ? $s[0] : 'koneksi ditutup router'); }
            elseif ($type === '!done') { if (isset($a['ret'])) $this->ret = $a['ret']; break; }
        }
        if ($t0) $GLOBALS['ROS_PROF'][] = [$cmd . ' ' . implode(',', array_map('strval', array_keys($params))), count($rows), (microtime(true) - $t0) * 1000];
        if ($trap !== null) throw new Exception($trap);
        return $rows;
    }

    /**
     * Kirim beberapa perintah sekaligus dan baca semua balasannya (satu perjalanan jaringan, bukan satu per perintah).
     * $cmds: [[perintah, params], ...]. Balasan dicocokkan lewat .tag.
     * Hasil per perintah: ['rows' => baris !re, 'ret' => nilai !done, 'err' => pesan !trap atau null].
     */
    public function batch(array $cmds)
    {
        if (!is_resource($this->sock)) throw new Exception('Tidak terhubung ke router');
        $t0 = empty($GLOBALS['ROS_PROF_ON']) ? 0 : microtime(true);
        $cmds = array_values($cmds);
        $buf = '';
        foreach ($cmds as $i => $c) {
            $buf .= $this->encWord($c[0]);
            foreach ((isset($c[1]) ? $c[1] : []) as $k => $v) {
                if (is_int($k)) $w = (string)$v;
                elseif ($k !== '' && $k[0] === '?') $w = $k . '=' . $v;
                else $w = '=' . $k . '=' . $v;
                $buf .= $this->encWord($w);
            }
            $buf .= $this->encWord('.tag=b' . $i) . chr(0);
        }
        $len = strlen($buf); $sent = 0;
        while ($sent < $len) {
            $n = @fwrite($this->sock, substr($buf, $sent));
            if ($n === false || $n === 0) { $this->close(); throw new Exception('Koneksi ke router terputus'); }
            $sent += $n;
        }
        $out = [];
        foreach ($cmds as $i => $c) $out[$i] = ['rows' => [], 'ret' => null, 'err' => null];
        $left = count($cmds);
        while ($left > 0) {
            $s = $this->readSentence();
            if (!$s) continue;
            $type = array_shift($s);
            $a = []; $tag = null;
            foreach ($s as $w) {
                if (strpos($w, '.tag=') === 0) { $tag = substr($w, 5); continue; }
                if ($w !== '' && $w[0] === '=') {
                    $p = strpos($w, '=', 1);
                    if ($p !== false) $a[substr($w, 1, $p - 1)] = substr($w, $p + 1);
                }
            }
            if ($type === '!fatal') { $this->close(); throw new Exception(isset($s[0]) ? $s[0] : 'koneksi ditutup router'); }
            if ($tag === null || $tag === '' || $tag[0] !== 'b') continue;
            $i = (int)substr($tag, 1);
            if (!isset($out[$i])) continue;
            if ($type === '!re') $out[$i]['rows'][] = $a;
            elseif ($type === '!trap') { if ($out[$i]['err'] === null) $out[$i]['err'] = isset($a['message']) ? $a['message'] : 'perintah ditolak'; }
            elseif ($type === '!done') { if (isset($a['ret'])) $out[$i]['ret'] = $a['ret']; $left--; }
        }
        if ($t0) $GLOBALS['ROS_PROF'][] = ['BATCH ' . count($cmds) . ' perintah: ' . implode(' ', array_column($cmds, 0)), 0, (microtime(true) - $t0) * 1000];
        return $out;
    }

    /** Hitung jumlah item tanpa mengambil datanya. */
    public function count($path, $query = [])
    {
        $this->comm($path . '/print', $query + ['count-only' => '']);
        return (int)$this->ret;
    }

    private function encWord($w)
    {
        $l = strlen($w);
        if ($l < 0x80) $p = chr($l);
        elseif ($l < 0x4000) $p = pack('n', $l | 0x8000);
        elseif ($l < 0x200000) $p = substr(pack('N', $l | 0xC00000), 1);
        elseif ($l < 0x10000000) $p = pack('N', $l | 0xE0000000);
        else $p = chr(0xF0) . pack('N', $l);
        return $p . $w;
    }

    private function readBytes($n)
    {
        $d = '';
        while (strlen($d) < $n) {
            $c = @fread($this->sock, $n - strlen($d));
            if ($c === false || $c === '') {
                $m = stream_get_meta_data($this->sock);
                $this->close();
                throw new Exception(!empty($m['timed_out']) ? 'Router tidak merespons (timeout)' : 'Koneksi ke router terputus');
            }
            $d .= $c;
        }
        return $d;
    }

    private function readSentence()
    {
        $words = [];
        while (true) {
            $b = ord($this->readBytes(1));
            if (($b & 0x80) === 0) $len = $b;
            elseif (($b & 0xC0) === 0x80) $len = (($b & 0x3F) << 8) | ord($this->readBytes(1));
            elseif (($b & 0xE0) === 0xC0) { $x = $this->readBytes(2); $len = (($b & 0x1F) << 16) | (ord($x[0]) << 8) | ord($x[1]); }
            elseif (($b & 0xF0) === 0xE0) { $x = $this->readBytes(3); $len = (($b & 0x0F) << 24) | (ord($x[0]) << 16) | (ord($x[1]) << 8) | ord($x[2]); }
            else { $x = unpack('N', $this->readBytes(4)); $len = $x[1]; }
            if ($len === 0) return $words;
            $words[] = $this->readBytes($len);
        }
    }
}
