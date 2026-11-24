<?php
/**
 * Menyiapkan database Bilingku (dipanggil saat add-on dipasang/diperbarui, aman diulang).
 * Data lama data/*.json.php otomatis dipindah ke database.
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/../inc/core.php';
$pdo = sql();
if (!$pdo) { echo "pdo_sqlite tidak tersedia, Bilingku memakai berkas JSON di data/\n"; exit(0); }
$n = (int)$pdo->query('SELECT COUNT(*) FROM docs')->fetchColumn();
echo "Database siap: $n data tersimpan\n";
$l = panel_link();
echo $l ? "Terhubung ke panel utama di {$l['url']}\n" : "Dipasang mandiri (tanpa panel utama)\n";
