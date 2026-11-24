<?php
/** Settings > Upload Logo: logo yang dipakai template voucher ($logo). */
$dir = ROOT . '/assets/upload';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (post('act') === 'remove') {
        foreach (glob($dir . '/logo.*') ?: [] as $f) @unlink($f);
        flash('Logo dihapus. Voucher memakai logo bawaan.');
        redirect('uplogo');
    }
    $f = $_FILES['logo'] ?? null;
    if (!$f || empty($f['tmp_name']) || !is_uploaded_file($f['tmp_name'])) { flash('Pilih file gambar dulu.', 'err'); redirect('uplogo'); }
    if ($f['size'] > 1048576) { flash('Ukuran logo paling besar 1 MB.', 'err'); redirect('uplogo'); }
    $info = @getimagesize($f['tmp_name']);
    $ext = [IMAGETYPE_PNG => 'png', IMAGETYPE_JPEG => 'jpg', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp'][$info[2] ?? 0] ?? '';
    if ($ext === '') { flash('File harus gambar PNG, JPG, GIF, atau WEBP.', 'err'); redirect('uplogo'); }
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    foreach (glob($dir . '/logo.*') ?: [] as $old) @unlink($old);
    if (@move_uploaded_file($f['tmp_name'], $dir . '/logo.' . $ext)) flash('Logo diunggah. Dipakai di semua template voucher.');
    else flash('Logo gagal disimpan. Periksa izin tulis folder assets/.', 'err');
    redirect('uplogo');
}
$logo = vtpl_logo();
page_head('Upload Logo');
?>
<div class="split">
<form method="post" class="card" enctype="multipart/form-data">
<?= csrf_field() ?>
<div class="cardhead"><?= icon('save') ?><strong>Upload Logo</strong></div>
<div class="cardbody">
<div class="btnrow"><button class="btn primary" name="act" value="upload"><?= icon('save') ?>Upload</button>
<?php if (strpos($logo, 'upload/') !== false) { ?><button class="btn bad" name="act" value="remove" formnovalidate data-confirm="Hapus logo dan kembali ke logo bawaan?"><?= icon('minus') ?>Remove</button><?php } ?></div>
<div class="frow"><label for="u_logo">Logo</label><input id="u_logo" name="logo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required style="height:auto;padding:.4rem .5rem"></div>
<p class="hint">PNG, JPG, GIF, atau WEBP, paling besar 1 MB. Dipakai sebagai <code>$logo</code> di template voucher.</p>
</div>
</form>
<section class="card">
<div class="cardhead"><?= icon('eye') ?><strong>Current Logo</strong></div>
<div class="cardbody" style="text-align:center"><img src="<?= h($logo) ?>" alt="Logo voucher" style="max-width:220px;max-height:160px;border:1px solid var(--line);border-radius:8px;padding:.6rem;background:#fff"></div>
</section>
</div>
<?php page_foot();
