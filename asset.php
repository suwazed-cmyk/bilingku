<?php
/**
 * Aset CSS/JS panel dengan cache panjang.
 * Server hosting mengirim berkas .css/.js tanpa aturan cache, jadi browser bertanya ulang di tiap halaman.
 * Lewat berkas ini aset diberi cache 1 tahun (immutable); alamatnya memuat versi (?v=waktu ubah berkas),
 * sehingga begitu berkas berubah browser otomatis mengambil yang baru.
 * Hanya melayani berkas .css / .js di folder assets/.
 */
$f = isset($_GET['f']) ? (string)$_GET['f'] : '';
$types = ['css' => 'text/css; charset=utf-8', 'js' => 'application/javascript; charset=utf-8'];
$ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
$path = __DIR__ . '/assets/' . $f;
if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]*$/', $f) || !isset($types[$ext]) || !is_file($path)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Tidak ditemukan.');
}
$mt = (int)filemtime($path);
$etag = '"' . dechex($mt) . '-' . dechex((int)filesize($path)) . '"';
header('Content-Type: ' . $types[$ext]);
header('Cache-Control: public, max-age=31536000, immutable');
header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 31536000) . ' GMT');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mt) . ' GMT');
header('ETag: ' . $etag);
header('X-Content-Type-Options: nosniff');
header_remove('Pragma');
header_remove('X-Powered-By');
if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim((string)$_SERVER['HTTP_IF_NONE_MATCH']) === $etag) { http_response_code(304); exit; }
readfile($path);
