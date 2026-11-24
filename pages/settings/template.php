<?php
/**
 * Settings > Template Editor.
 * Template voucher berisi dua tampilan: Default (QR = Default dengan kode QR) dan Small.
 * Template bisa ditambah (salinan template lain), diganti nama, dihapus, dan dipilih sebagai template aktif untuk Print.
 * Kwitansi dan Tagihan PPP diedit di halaman yang sama.
 */
$sets = vtpl_sets();
$S = get('set');
$P = get('part');
if ($P === '' && isset(VTPL_DOCS[get('template')])) $P = get('template'); // tautan lama ?template=receipt
if (isset(VTPL_DOCS[$P])) { $S = ''; }
else {
    if (!isset($sets[$S])) $S = vtpl_active();
    if (!isset(VTPL_NAMES[$P])) $P = 'default';
}
$isDoc = isset(VTPL_DOCS[$P]);
$K = vtpl_key($S, $P);                                   // kunci yang diedit
$title = $isDoc ? VTPL_DOCS[$P] : $sets[$S] . ' · ' . VTPL_NAMES[$P];
$back = function () use ($S, $P) { redirect('template', $S === '' ? ['part' => $P] : ['set' => $S, 'part' => $P]); };

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $act = post('act');
    $label = trim(preg_replace('/\s+/', ' ', (string)post('label')));
    $taken = function ($l, $skip = '') use ($sets) { foreach ($sets as $k => $v) if ($k !== $skip && strtolower($v) === strtolower($l)) return true; return false; };
    if ($act === 'add') {
        $from = isset($sets[post('from')]) ? post('from') : 'std';
        if ($label === '') { flash('Isi nama template.', 'err'); $back(); }
        if ($taken($label)) { flash('Nama template ' . $label . ' sudah dipakai.', 'err'); $back(); }
        $k = vtpl_add_set(mb_substr($label, 0, 40), $from);
        if ($k === '') { flash('Template gagal dibuat. Periksa izin tulis folder data/.', 'err'); $back(); }
        if (post('use') === '1') vtpl_set_active($k);
        flash('Template ' . $label . ' dibuat dari salinan ' . $sets[$from] . ' (Default dan Small). Silakan ubah lalu Save.');
        redirect('template', ['set' => $k, 'part' => 'default']);
    }
    if ($act === 'rename' && vtpl_is_custom($S)) {
        if ($label === '') { flash('Isi nama template.', 'err'); $back(); }
        if ($taken($label, $S)) { flash('Nama template ' . $label . ' sudah dipakai.', 'err'); $back(); }
        if (vtpl_rename_set($S, mb_substr($label, 0, 40))) flash('Nama template diubah menjadi ' . $label . '.');
        $back();
    }
    if ($act === 'delete' && vtpl_is_custom($S)) {
        if (vtpl_delete_set($S)) flash('Template ' . $sets[$S] . ' dihapus.');
        redirect('template', ['set' => vtpl_active(), 'part' => 'default']);
    }
    if ($act === 'use' && !$isDoc) {
        if (vtpl_set_active($S)) flash('Template ' . $sets[$S] . ' sekarang dipakai saat Print.');
        $back();
    }
    if ($act === 'save') {
        $src = str_replace("\r", '', (string)($_POST['src'] ?? ''));
        $err = vtpl_check($src);
        if ($err !== '') { $_SESSION['vtpl_draft'][$K] = $src; flash('Template belum disimpan. ' . $err, 'err'); $back(); }
        unset($_SESSION['vtpl_draft'][$K]);
        if (vtpl_save($K, $src)) flash('Template ' . $title . ' disimpan.');
        else flash('Template gagal disimpan. Periksa izin tulis folder data/.', 'err');
    } elseif ($act === 'reset') {
        // kembalikan ke isi bawaan: template bawaan ke dirinya sendiri, template buatan sendiri ke template bawaan yang dipilih
        $from = isset(VTPL_SETS[post('from')]) ? post('from') : (isset(VTPL_SETS[$S]) ? $S : 'std');
        $src = vtpl_default($isDoc ? $P : vtpl_key($from, $P));
        unset($_SESSION['vtpl_draft'][$K]);
        if ($src !== '' && vtpl_save($K, $src)) flash('Template ' . $title . ' dikembalikan ke isi bawaan' . ($isDoc ? '' : ' (' . VTPL_SETS[$from] . ')') . '.');
        else flash('Isi bawaan tidak ditemukan.', 'err');
    }
    $back();
}

$src = $_SESSION['vtpl_draft'][$K] ?? vtpl_get($K);
$all = db_load('vtpl');
$err = vtpl_check($src);
$active = vtpl_active();
$lnk = function ($s, $p) { return url('template', $s === '' ? ['part' => $p] : ['set' => $s, 'part' => $p]); };
page_head('Template Editor');
?>
<div class="tpled">
<form method="post" class="card" id="tplform">
<?= csrf_field() ?>
<div class="cardhead"><?= icon('edit') ?><strong>Template Editor</strong><span class="badge"><?= h($title) ?></span><?php if (!$isDoc && $S === $active) { ?><?= badge('Dipakai saat Print', 'ok') ?><?php } ?><span class="spacer"></span>
<?php if (!empty($all['_at_' . $K])) { ?><span class="muted" style="font-size:.82rem">Disimpan <?= h(tgl(substr($all['_at_' . $K], 0, 10)) . substr($all['_at_' . $K], 10)) ?></span><?php } ?></div>
<div class="cardbody">
<div class="tplpick">
<span class="grp"><b>TEMPLATE</b><select aria-label="Template" onchange="location.href=this.value">
<optgroup label="Template Voucher"><?php foreach ($sets as $k => $v) echo '<option value="' . h($lnk($k, $isDoc ? 'default' : $P)) . '"' . (!$isDoc && $k === $S ? ' selected' : '') . '>' . h($v) . ($k === $active ? ' (dipakai)' : '') . '</option>'; ?></optgroup>
<optgroup label="PPPoE"><?php foreach (VTPL_DOCS as $k => $v) echo '<option value="' . h($lnk('', $k)) . '"' . ($k === $P ? ' selected' : '') . '>' . h($v) . '</option>'; ?></optgroup>
</select></span>
<?php if (!$isDoc) { ?>
<span class="seg" role="tablist" aria-label="Tampilan"><?php foreach (VTPL_NAMES as $k => $v) echo '<a role="tab" aria-selected="' . ($k === $P ? 'true' : 'false') . '" class="' . ($k === $P ? 'on' : '') . '" href="' . h($lnk($S, $k)) . '">' . h($v) . '</a>'; ?></span>
<span class="spacer"></span>
<button type="button" class="btn" data-open="#tpladd"><?= icon('plus') ?>Tambah</button>
<?php if (vtpl_is_custom($S)) { ?><button type="button" class="btn" data-open="#tplren"><?= icon('edit') ?>Ganti nama</button><button class="btn bad" name="act" value="delete" formnovalidate data-confirm="Hapus template <?= h($sets[$S]) ?>?&#10;Tampilan Default dan Small di template ini akan hilang dan tidak bisa dikembalikan."><?= icon('minus') ?>Hapus</button><?php } ?>
<?php if ($S !== $active) { ?><button class="btn" name="act" value="use" formnovalidate><?= icon('print') ?>Pakai saat Print</button><?php } ?>
<?php } ?>
</div>
<p class="msg <?= $err ? 'err' : 'ok' ?>" id="tplstate" role="status"><span><?= $err ? h($err) : 'Template aman — struktur HTML dan PHP OK.' ?></span></p>
<div class="tplbar">
<button class="btn primary" name="act" value="save"><?= icon('save') ?>Save</button>
<span class="spacer"></span>
<span class="grp"><b>RESET</b><select name="from" aria-label="Kembalikan ke isi bawaan"><?php if ($isDoc) echo opt($P, $P, VTPL_DOCS[$P]); else foreach (VTPL_SETS as $k => $v) echo opt($k, isset(VTPL_SETS[$S]) ? $S : 'std', $v . ' ' . VTPL_NAMES[$P]); ?></select><button class="btn" name="act" value="reset" formnovalidate data-confirm="Kembalikan <?= h($title) ?> ke isi bawaan?&#10;Perubahan Anda pada tampilan ini akan hilang." style="border:0;border-left:1px solid var(--line);border-radius:0;height:34px" title="Kembalikan ke isi bawaan" aria-label="Kembalikan ke isi bawaan"><?= icon('reload') ?></button></span>
</div>
<div class="codewrap"><div class="ln" id="tplln" aria-hidden="true">1</div><textarea name="src" id="tplsrc" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Isi template"><?= h($src) ?></textarea></div>
</div>
</form>

<div>
<section class="card">
<div class="cardhead"><?= icon('eye') ?><strong>Preview</strong><span class="spacer"></span>
<label class="muted" style="display:<?= $isDoc || $P === 'small' ? 'none' : 'flex' ?>;align-items:center;gap:.35rem;font-size:.85rem"><input type="checkbox" id="pvqr"> QR</label></div>
<div class="cardbody"><iframe class="pvframe" id="pvframe" title="Pratinjau voucher"></iframe></div>
</section>
<section class="card">
<div class="cardhead"><?= icon('info') ?><strong>Variables</strong></div>
<div class="cardbody vars">
<table class="readme"><tbody>
<?php foreach (vtpl_vars_doc($P) as $k => $v) echo '<tr><td><code>' . h($k) . '</code></td><td>' . h($v) . '</td></tr>'; ?>
</tbody></table>
</div>
</section>
</div>
</div>

<dialog class="tpldlg" id="tpladd" aria-labelledby="tpladd_t">
<form method="post">
<?= csrf_field() ?><input type="hidden" name="act" value="add">
<div class="cardhead"><?= icon('plus') ?><strong id="tpladd_t">Tambah Template</strong><span class="spacer"></span><button type="button" class="x" data-close aria-label="Tutup">&times;</button></div>
<div class="cardbody">
<div class="frow"><label for="ta_name">Nama</label><input id="ta_name" name="label" required maxlength="40" placeholder="mis. Template 2" autocomplete="off"></div>
<div class="frow"><label for="ta_from">Salin dari</label><select id="ta_from" name="from"><?php foreach ($sets as $k => $v) echo opt($k, $isDoc ? $active : $S, $v); ?></select></div>
<div class="frow"><label for="ta_use">Saat Print</label><label class="chk"><input type="checkbox" id="ta_use" name="use" value="1"> Langsung pakai template ini</label></div>
<div class="btnrow fend"><span class="spacer"></span><button type="button" class="btn" data-close>Batal</button><button class="btn primary"><?= icon('plus') ?>Tambah</button></div>
</div>
</form>
</dialog>
<?php if (vtpl_is_custom($S)) { ?>
<dialog class="tpldlg" id="tplren" aria-labelledby="tplren_t">
<form method="post">
<?= csrf_field() ?><input type="hidden" name="act" value="rename">
<div class="cardhead"><?= icon('edit') ?><strong id="tplren_t">Ganti Nama Template</strong><span class="spacer"></span><button type="button" class="x" data-close aria-label="Tutup">&times;</button></div>
<div class="cardbody">
<div class="frow"><label for="tr_name">Nama</label><input id="tr_name" name="label" required maxlength="40" value="<?= h($sets[$S]) ?>" autocomplete="off"></div>
<div class="btnrow fend"><span class="spacer"></span><button type="button" class="btn" data-close>Batal</button><button class="btn primary"><?= icon('save') ?>Simpan</button></div>
</div>
</form>
</dialog>
<?php } ?>
<script>
(function () {
    document.querySelectorAll('[data-open]').forEach(function (b) {
        b.addEventListener('click', function () { var d = document.querySelector(b.getAttribute('data-open')); if (d && d.showModal) { d.showModal(); var i = d.querySelector('input[type=text],input:not([type])'); if (i) { i.focus(); i.select(); } } });
    });
    document.querySelectorAll('.tpldlg').forEach(function (d) {
        d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    });
})();
</script>
<script>
(function () {
    var ta = document.getElementById('tplsrc'), ln = document.getElementById('tplln'), fr = document.getElementById('pvframe'), qr = document.getElementById('pvqr');
    var f = document.getElementById('tplform'), tok = f.querySelector('input[name=_t]').value, timer = null, busy = false, again = false;
    var lines = function () {
        var n = ta.value.split('\n').length, s = '';
        for (var i = 1; i <= n; i++) s += i + '\n';
        ln.textContent = s; ln.style.height = ta.offsetHeight + 'px'; ln.scrollTop = ta.scrollTop;
    };
    var preview = function () {
        if (busy) { again = true; return; }
        busy = true;
        var fd = new FormData();
        fd.append('_t', tok); fd.append('act', 'preview'); fd.append('tpl', <?= json_encode($P) ?>); fd.append('part', <?= json_encode($P) ?>); fd.append('set', <?= json_encode($S) ?>);
        fd.append('qr', qr.checked ? 'yes' : 'no'); fd.append('n', '2'); fd.append('src', ta.value);
        fetch(<?= json_encode(url($isDoc ? 'invoice_print' : 'voucher_print')) ?>, { method: 'POST', body: fd, credentials: 'same-origin' })
            .then(function (r) { return r.text(); })
            .then(function (h) { fr.srcdoc = h; })
            .catch(function () {})
            .then(function () { busy = false; if (again) { again = false; preview(); } });
    };
    ta.addEventListener('input', function () { lines(); clearTimeout(timer); timer = setTimeout(preview, 600); });
    ta.addEventListener('scroll', function () { ln.scrollTop = ta.scrollTop; });
    ta.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') { e.preventDefault(); var s = ta.selectionStart, en = ta.selectionEnd; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 2; lines(); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); f.querySelector('button[value=save]').click(); }
    });
    qr.addEventListener('change', preview);
    window.addEventListener('resize', lines);
    lines(); preview();
})();
</script>
<?php page_foot();
