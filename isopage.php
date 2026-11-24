<?php
/**
 * Halaman pemberitahuan isolir. Dibuka pelanggan yang dialihkan web proxy router, jadi tanpa login.
 * Isinya: file HTML yang diunggah di PPP Profiles, atau halaman bawaan bila belum ada unggahan.
 */
require __DIR__ . '/inc/core.php';
$rid = preg_replace('/[^a-zA-Z0-9_\-]/', '', isset($_GET['r']) ? (string)$_GET['r'] : '');
$pg = $rid !== '' ? db_load(rkey('isopage', $rid)) : [];
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
// halaman ini satu domain dengan panel: matikan script (termasuk di file HTML unggahan) supaya tidak bisa bertindak atas nama admin
header("Content-Security-Policy: script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
if (!empty($pg['html'])) { echo $pg['html']; exit; }
$co = setting('company'); $ph = setting('phone'); $ad = setting('address');
$wa = preg_replace('/\D/', '', (string)$ph);
if ($wa !== '' && $wa[0] === '0') $wa = '62' . substr($wa, 1);
?>
<!doctype html><html lang="id" translate="no" class="notranslate"><head><link rel="icon" type="image/svg+xml" href="assets/favicon.svg"><meta name="google" content="notranslate"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Layanan internet dihentikan sementara</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1rem;box-sizing:border-box;font-family:"Segoe UI",system-ui,Arial,sans-serif;background:#eef2f6;color:#1f2d3a;line-height:1.5}
.box{background:#fff;border-radius:14px;max-width:440px;width:100%;padding:2rem 1.6rem;text-align:center;box-shadow:0 4px 20px rgba(23,50,77,.12);border-top:6px solid #e2574c}
h1{font-size:1.35rem;margin:0 0 .8rem}p{margin:0 0 .9rem;color:#465666}
.co{font-weight:700;color:#1b76ad;margin-bottom:1.2rem}
a.btn{display:inline-block;margin-top:.4rem;padding:.7rem 1.4rem;border-radius:99px;background:#1c8a4f;color:#fff;text-decoration:none;font-weight:600}
small{display:block;margin-top:1.2rem;color:#718093}
</style></head><body><div class="box">
<div class="co"><?= h($co) ?></div>
<h1>Layanan internet Anda dihentikan sementara</h1>
<p>Masa aktif langganan sudah berakhir atau tagihan belum dibayar. Silakan lakukan pembayaran supaya internet aktif kembali.</p>
<?php if ($wa !== '') { ?><p>Konfirmasi pembayaran:</p><a class="btn" href="https://wa.me/<?= h($wa) ?>">WhatsApp <?= h($ph) ?></a><?php } ?>
<?php if ($ad !== '') { ?><small><?= h($ad) ?></small><?php } ?>
</div></body></html>
