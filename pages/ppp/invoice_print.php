<?php
/**
 * Cetak kwitansi (?pay=ID) atau tagihan berjalan seorang pelanggan (?user=NAMA) memakai template
 * "Kwitansi PPP" / "Tagihan PPP" di Settings › Template Editor.
 * POST act=preview: pratinjau template dari Template Editor.
 */
$cs = customers();
$preview = $_SERVER['REQUEST_METHOD'] === 'POST' && post('act') === 'preview';
$money = function ($n) { return money($n); };
$base = ['logo' => vtpl_logo(), 'company' => h(setting('company')), 'address' => h(setting('address')), 'phone' => h(setting('phone')), 'date' => h(tgl(date('Y-m-d')))];

/** Variabel kwitansi dari satu pembayaran. */
$receiptVars = function ($p) use ($cs, $base, $money) {
    $c = $cs[$p['user']] ?? [];
    return $base + ['no' => h($p['no']), 'nama' => h($p['nama']), 'user' => h($p['user']), 'alamat' => h($c['alamat'] ?? ''), 'hp' => h($c['hp'] ?? ''),
        'paket' => h($p['paket']), 'tarif' => h(!empty($c['tarif']) ? $money($c['tarif']) : ''), 'months' => (int)$p['months'],
        'from' => h(tgl($p['from'])), 'to' => h(tgl($p['to'])), 'paid_at' => h(tgl($p['paid_at'])), 'method' => h($p['method']),
        'due' => h(!empty($c['due']) ? tgl($c['due']) : ''), 'total' => h($money($p['amount'])), 'gettotal' => (string)(int)$p['amount'], 'late' => 'no'];
};
/** Variabel tagihan berjalan seorang pelanggan. */
$invoiceVars = function ($u, $c) use ($base, $money) {
    $n = months_owed($c); $t = (float)($c['tarif'] ?? 0) * $n;
    return $base + ['no' => h($u), 'nama' => h(($c['nama'] ?? '') !== '' ? $c['nama'] : $u), 'user' => h($u), 'alamat' => h($c['alamat'] ?? ''), 'hp' => h($c['hp'] ?? ''),
        'paket' => h($c['paket'] ?? ''), 'tarif' => h($money($c['tarif'] ?? 0)), 'months' => $n, 'from' => h(tgl($c['due'] ?? '')), 'to' => h(tgl(add_months($c['due'], $n, $c['jt'] ?? 0))),
        'paid_at' => '', 'method' => '', 'due' => h(tgl($c['due'] ?? '')), 'total' => h($money($t)), 'gettotal' => (string)(int)$t,
        'late' => days_until($c['due']) < 0 ? 'yes' : 'no'];
};

if ($preview) {
    $tpl = post('tpl') === 'invoice' ? 'invoice' : 'receipt';
    $src = str_replace("\r", '', (string)($_POST['src'] ?? ''));
    $vars = null;
    if ($tpl === 'receipt') { $all = payments(); if ($all) $vars = $receiptVars(end($all)); }
    else foreach ($cs as $u => $c) if (is_billed($c)) { $vars = $invoiceVars($u, $c); break; }
    if (!$vars) $vars = $base + ['no' => 'KW-' . date('Ym') . '-0001', 'nama' => 'Budi Santoso', 'user' => 'budi', 'alamat' => 'Jl. Contoh No. 1', 'hp' => '08123456789',
        'paket' => '20M', 'tarif' => h($money(150000)), 'months' => 1, 'from' => h(tgl(date('Y-m-d'))), 'to' => h(tgl(date('Y-m-d', strtotime('+1 month')))),
        'paid_at' => h(tgl(date('Y-m-d'))), 'method' => 'Tunai', 'due' => h(tgl(date('Y-m-d'))), 'total' => h($money(150000)), 'gettotal' => '150000', 'late' => 'no'];
    $doc = VTPL_DOCS[$tpl]; $no = $vars['no'];
} elseif (get('pay') !== '') {
    $pays = payments(); $p = $pays[get('pay')] ?? null;
    if (!$p) { http_response_code(404); exit('Pembayaran tidak ditemukan.'); }
    $tpl = 'receipt'; $vars = $receiptVars($p); $doc = 'Kwitansi'; $no = $p['no'];
    $src = vtpl_get($tpl);
} else {
    $u = get('user'); $c = $cs[$u] ?? null;
    if (!$c || !is_billed($c)) { http_response_code(404); exit('Pelanggan tidak punya tagihan.'); }
    $tpl = 'invoice'; $vars = $invoiceVars($u, $c); $doc = 'Tagihan'; $no = $u;
    $src = vtpl_get($tpl);
}
$err = vtpl_check($src);
header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: SAMEORIGIN');
?>
<!doctype html><html lang="id" translate="no" class="notranslate"><head><link rel="icon" type="image/svg+xml" href="assets/favicon.svg"><meta name="google" content="notranslate"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= h($doc . ' ' . html_entity_decode((string)$no)) ?></title>
<style>
body{margin:0;padding:1rem;background:#fff;color:#000;-webkit-print-color-adjust:exact}
.noprint{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 1rem;font:13px system-ui,sans-serif}
.noprint button,.noprint select{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #c9d3de;background:#fff;color:#1f2d3a;cursor:pointer}
.noprint .pr{background:#1b76ad;border-color:#1b76ad;color:#fff;font-weight:600}
.noprint span{color:#6b7a89;margin-left:auto}
.tplerr{padding:10px 12px;border-radius:8px;background:#fde5e2;color:#9b2c20;font:13px system-ui,sans-serif}
@media print{.noprint{display:none!important}body{padding:0}}
</style></head>
<body>
<?php if (!$preview) { ?>
<div class="noprint"><button class="pr" onclick="window.print()">Print</button>
<select aria-label="Ukuran kertas" onchange="document.body.classList.toggle('thermal', this.value === '58')"><option value="a5">Kertas A5</option><option value="58">Struk 58 mm</option></select>
<span>Template diatur di Settings &rsaquo; Template Editor</span></div>
<?php } ?>
<?= $err ? '<div class="tplerr">Template ' . h(VTPL_DOCS[$tpl]) . ' tidak bisa dipakai: ' . h($err) . '</div>' : vtpl_run($src, $vars) ?>
</body></html>
