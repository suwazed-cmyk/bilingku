<?php
/** PPP Payment: ringkasan pendapatan dan riwayat pembayaran PPP. */
$METHODS = ['Tunai', 'Transfer', 'QRIS', 'Lainnya'];
if ($_SERVER['REQUEST_METHOD'] === 'POST') { if (post('act') === 'cancel') { if (pay_cancel(post('id'))) flash('Pembayaran dibatalkan dan jatuh tempo dikembalikan.'); else flash('Hanya pembayaran terakhir seorang pelanggan yang bisa dibatalkan.', 'err'); }
    elseif (post('act') === 'bulk_pay') {
        $today = date('Y-m-d'); $all = customers();
        $date = preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/', post('date')) && post('date') <= $today ? post('date') : $today;
        $method = in_array(post('method'), $METHODS, true) ? post('method') : 'Tunai';
        $ms = (array)($_POST['m'] ?? []);
        $us = array_values(array_unique(array_map('strval', (array)($_POST['users'] ?? []))));
        if (!$us) flash('Pilih minimal satu pelanggan.', 'err');
        else {
            $ok = 0; $fail = 0; $paidsum = 0;
            foreach ($us as $u) {
                $months = (int)($ms[$u] ?? 0);
                if ($months < 1 || $months > 120 || !isset($all[$u]) || !is_billed($all[$u])) { $fail++; continue; }
                $t = (float)($all[$u]['tarif'] ?? 0);
                $p = pay_add($u, $months, $t * $months, $method, $date);
                if ($p) { $ok++; $paidsum += $p['amount']; } else $fail++;
            }
            flash($ok . ' pelanggan dibayar (' . money($paidsum) . ').' . ($fail ? ' ' . $fail . ' gagal.' : ''), $fail ? 'err' : 'ok');
        }
    }
    back(); }

$cs = customers();
$owed = 0; $paid = []; $unpaid = [];
foreach ($cs as $u => $c) {
    if (!is_billed($c)) continue;
    $st = bill_state($c);
    if (in_array($st[0], ['late', 'grace'], true)) { $owed += (float)($c['tarif'] ?? 0) * months_owed($c); $unpaid[$u] = [$c, $st]; }
    else $paid[$u] = [$c, $st];
}
$byDue = function ($a, $b) { return strcmp((string)$a[0]['due'], (string)$b[0]['due']); };
uasort($paid, $byDue); uasort($unpaid, $byDue);
$v = get('v'); if ($v !== 'paid' && $v !== 'unpaid') $v = '';

$period = get('period') === 'all' ? 'all' : valid_period(get('period'));
$rows = []; $sum = 0; $total = 0;
foreach (payments() as $p) { $total += $p['amount']; if ($period !== 'all' && substr($p['paid_at'], 0, 7) !== $period) continue; $rows[] = $p; $sum += $p['amount']; }
usort($rows, function ($a, $b) { return strcmp($b['paid_at'] . $b['no'], $a['paid_at'] . $a['no']); });
ros();
page_head('PPP Payment');
?>
<div class="tiles">
<div class="tile green"><span class="num"><?= money($sum) ?></span><span class="lbl">Pendapatan periode</span><?= icon('money') ?></div>
<div class="tile blue"><span class="num"><?= money($total) ?></span><span class="lbl">Total semua pembayaran</span><?= icon('pie') ?></div>
<div class="tile gray"><span class="num"><?= count($rows) ?></span><span class="lbl">Jumlah transaksi</span><?= icon('ticket') ?></div>
<div class="tile amber"><span class="num"><?= money($owed) ?></span><span class="lbl">Belum dibayar</span><?= icon('clock') ?></div>
</div>

<div class="btnrow" style="margin:0 0 1rem!important">
<span class="seg"><a class="pill<?= $v === '' ? ' on' : '' ?>" href="<?= h(url('ppp_payment')) ?>">Riwayat</a>
<a class="pill<?= $v === 'paid' ? ' on' : '' ?>" href="<?= h(url('ppp_payment', ['v' => 'paid'])) ?>">Telah bayar</a>
<a class="pill<?= $v === 'unpaid' ? ' on' : '' ?>" href="<?= h(url('ppp_payment', ['v' => 'unpaid'])) ?>">Belum bayar</a></span>
<button type="button" id="paybtn" class="btn small dark payopen" style="margin-left:auto"><?= icon('money') ?>Bayar</button>
</div>



<?php if ($v === '') { ?>

<section class="card">
<form method="get" class="cardhead">
<?= icon('money') ?><strong>Riwayat pembayaran</strong>
<input type="hidden" name="p" value="ppp_payment">
<input type="month" name="period" value="<?= $period === 'all' ? '' : h($period) ?>" aria-label="Bulan" onchange="this.form.submit()" style="height:30px">
<?php if ($period !== 'all') { ?><a class="hl" href="<?= h(url('ppp_payment', ['period' => 'all'])) ?>">Semua bulan</a><?php } ?>
<span class="spacer"></span><?php if ($rows) { ?><input type="search" class="filter" placeholder="Search" data-filter="#tbl" aria-label="Filter" onkeydown="if(event.key==='Enter')event.preventDefault()"><?php } ?>
</form>
<div class="cardbody">
<?php if (!$rows) { ?>
<div class="empty"><p class="emptytitle">Belum ada pembayaran<?= $period === 'all' ? '' : ' pada ' . h(bulan($period)) ?>.</p></div>
<?php } else { ?>
<div class="tablewrap"><table id="tbl" class="grid-t sortable">
<thead><tr><th>Nomor</th><th>Tanggal</th><th>Pelanggan</th><th>PPP</th><th class="r">Bulan</th><th>Berlaku sampai</th><th class="r">Jumlah</th><th>Cara bayar</th><th class="nosort"></th></tr></thead><tbody>
<?php foreach ($rows as $p) { $last = isset($cs[$p['user']]) && ($cs[$p['user']]['due'] ?? '') === $p['to']; ?>
<tr>
<td class="key"><?= h($p['no']) ?></td><td data-v="<?= h($p['paid_at']) ?>"><?= h(tgl($p['paid_at'])) ?></td><td><a class="namelink" href="<?= h(url('ppp_user', ['user' => $p['user']])) ?>"><?= h($p['nama']) ?></a></td><td class="mono"><?= h($p['user']) ?></td>
<td class="r"><?= (int)$p['months'] ?></td><td data-v="<?= h($p['to']) ?>"><?= h(tgl($p['to'])) ?></td><td class="r" data-v="<?= (float)$p['amount'] ?>"><?= money($p['amount']) ?></td><td><?= h($p['method']) ?></td>
<td class="acts"><?= row_menu(['<a target="_blank" href="' . h(url('invoice_print', ['pay' => $p['id']])) . '">Print</a>', $last ? confirm_btn('Cancel Payment', 'cancel', ['id' => $p['id']], 'Batalkan ' . $p['no'] . '? Jatuh tempo ' . $p['nama'] . ' kembali ke ' . tgl($p['from']) . '.', 'danger') : '']) ?></td>
</tr>
<?php } ?>
</tbody></table></div>
<?php } ?>
</div>
</section>
<?php } else { $list = $v === 'paid' ? $paid : $unpaid; ?>
<section class="card">
<div class="cardhead"><?= icon('user') ?><strong><?= $v === 'paid' ? 'Telah bayar' : 'Belum bayar' ?></strong><span class="spacer"></span><?php if ($list) { ?><input type="search" class="filter" placeholder="Search" data-filter="#tbl" aria-label="Filter"><?php } ?></div>
<div class="cardbody">
<?php if (!$list) { ?>
<div class="empty"><p class="emptytitle"><?= $v === 'paid' ? 'Belum ada pelanggan yang berstatus telah bayar.' : 'Tidak ada pelanggan yang belum bayar.' ?></p></div>
<?php } else { ?>
<div class="tablewrap"><table id="tbl" class="grid-t sortable">
<thead><tr><th>Pelanggan</th><th>PPP</th><th>Profile</th><th class="r">Tarif</th><th>Jatuh Tempo</th><?php if ($v === 'unpaid') { ?><th class="r">Bulan</th><th class="r">Tagihan</th><?php } ?><th>Status</th></tr></thead><tbody>
<?php foreach ($list as $u => $x) { $c = $x[0]; $st = $x[1]; $tf = (float)($c['tarif'] ?? 0); $nm = ($c['nama'] ?? '') !== '' ? $c['nama'] : $u; $mo = $v === 'unpaid' ? (int)months_owed($c) : 1; ?>
<tr>
<td><a class="namelink" href="<?= h(url('ppp_user', ['user' => $u])) ?>"><?= h($nm) ?></a></td><td class="mono"><?= h($u) ?></td><td><?= h($c['paket'] ?? '') ?></td>
<td class="r" data-v="<?= $tf ?>"><?= money($tf) ?></td><td data-v="<?= h($c['due']) ?>"><?= h(tgl($c['due'])) ?></td>
<?php if ($v === 'unpaid') { ?><td class="r"><?= $mo ?></td><td class="r" data-v="<?= $tf * $mo ?>"><?= money($tf * $mo) ?></td><?php } ?>
<td><?= $v === 'paid' ? badge('Lunas', 'ok') . ($st[0] === 'soon' ? ' <span class="muted">' . h($st[1]) . '</span>' : '') : badge('Belum bayar', 'bad') . ' <span class="muted">' . h($st[1]) . '</span>' ?></td>
</tr>
<?php } ?>
</tbody></table></div>
<?php } ?>
</div>
</section>
<?php } ?>
<?php $cand = $unpaid + $paid; ?>
<dialog id="paydlg" class="paydlg">
<form method="post" id="bulkform" data-cur="<?= h(setting('currency')) ?>">
<?= csrf_field() ?><input type="hidden" name="act" value="bulk_pay">
<div class="cardhead"><button type="button" class="payback" id="payback" title="Kembali" aria-label="Kembali"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></button><?= icon('money') ?><strong id="paytitle">Bayar</strong><span class="spacer"></span><button type="button" class="btn small dark payopen" id="paybulk" style="display:none">Bayar <span id="paybulkn">0</span></button><?php if ($cand) { ?><input type="search" id="paysearch" class="filter" placeholder="Search" aria-label="Filter" autocomplete="off"><?php } ?><button type="button" class="x" id="payclose" aria-label="Tutup">&times;</button></div>
<div class="cardbody" style="overflow:auto;max-height:calc(92vh - 60px)">
<?php if (!$cand) { ?>
<div class="empty"><p class="emptytitle">Belum ada pelanggan yang punya Jatuh Tempo.</p></div>
<?php } else { ?>
<div id="payv1">
<div class="tablewrap" style="max-height:380px;overflow:auto"><table id="paytbl" class="grid-t">
<thead><tr><th><input type="checkbox" id="payall" aria-label="Pilih semua"></th><th>Pelanggan</th><th>Profile</th><th class="r">Tarif</th><th>Jatuh Tempo</th><th>Status</th><th></th></tr></thead><tbody>
<?php foreach ($cand as $u => $x) { $c = $x[0]; $st = $x[1]; $tf = (float)($c['tarif'] ?? 0); $nm = ($c['nama'] ?? '') !== '' ? $c['nama'] : $u; $late = in_array($st[0], ['late', 'grace'], true); ?>
<tr data-u="<?= h($u) ?>" data-nm="<?= h($nm) ?>" data-pk="<?= h($c['paket'] ?? '') ?>" data-tf="<?= h(money($tf)) ?>" data-due="<?= h(tgl($c['due'])) ?>" data-tarif="<?= $tf ?>" data-owed="<?= $late ? (int)months_owed($c) : 1 ?>" data-s="<?= h(strtolower($nm . ' ' . $u . ' ' . ($c['paket'] ?? ''))) ?>">
<td><input type="checkbox" class="pc" aria-label="Pilih <?= h($nm) ?>"></td><td><?= h($nm) ?></td><td><?= h($c['paket'] ?? '') ?></td>
<td class="r"><?= money($tf) ?></td><td><?= h(tgl($c['due'])) ?></td><td><?= $late ? badge('Belum bayar', 'bad') : badge('Lunas', 'ok') ?></td>
<td class="acts"><button type="button" class="btn small payopen paynow">Bayar</button></td>
</tr>
<?php } ?>
</tbody></table></div>
</div>
<div id="payv2" style="display:none">
<div id="paytable"></div>
<div class="payfoot">
<div><label for="paymethod">Cara bayar</label><select id="paymethod" name="method"><?php foreach ($METHODS as $m) echo opt($m, 'Tunai'); ?></select></div>
<div><label for="paydate">Tanggal bayar</label><input id="paydate" type="date" name="date" value="<?= date('Y-m-d') ?>" max="<?= date('Y-m-d') ?>"></div>
<span class="sum" id="paysum"></span>
<button class="btn primary" id="paygo" data-confirm="Lanjutkan pembayaran?" data-ok="Ya, lanjutkan" disabled><?= icon('save') ?>Save Payment</button>
</div>
</div>
<?php } ?>
</div>
</form>
</dialog>
<script>
(function(){
function g(i){return document.getElementById(i);}
var dlg=g('paydlg'),open=g('paybtn'),form=g('bulkform');
if(!dlg||!open)return;
g('payclose').addEventListener('click',function(){dlg.close();});
dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close();});
var all=g('payall');
if(!all){open.addEventListener('click',function(){dlg.showModal();});g('payback').addEventListener('click',function(){dlg.close();});return;}
var v1=g('payv1'),v2=g('payv2'),box=g('paytable'),bulk=g('paybulk'),bulkn=g('paybulkn'),go=g('paygo'),sum=g('paysum'),q=g('paysearch'),ttl=g('paytitle');
var rows=[].slice.call(document.querySelectorAll('#paytbl tbody tr')),cur=form.getAttribute('data-cur')||'Rp',months={},lines=[];
function fmt(n){var s=String(Math.round(n)),o='';while(s.length>3){o='.'+s.slice(-3)+o;s=s.slice(0,-3);}return cur+' '+s+o;}
function pc(r){return r.querySelector('.pc');}
function vis(r){return r.style.display!=='none';}
function checked(){return rows.filter(function(r){return pc(r).checked;});}
function calc(){var tot=0,bad=false;lines.forEach(function(l){var k=parseInt(l.mi.value,10)||0;if(k<1||k>120)bad=true;var v=parseFloat(l.r.getAttribute('data-tarif')||0)*k;tot+=v;l.sub.textContent=fmt(v);});sum.textContent=lines.length?lines.length+' dipilih - Total '+fmt(tot):'';go.disabled=!lines.length||bad;}
function mk(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;}
function cell(t,cls){return mk('td',cls||'',t);}
function build(){box.textContent='';lines=[];var wrap=mk('div','tablewrap'),t=mk('table','grid-t'),hr=mk('tr');t.id='paysel';
['No','Pelanggan','Profile','Tarif','Jatuh tempo','Bulan dibayar','Subtotal',''].forEach(function(h,i){hr.appendChild(mk('th',(i===3||i===6)?'r':'',h));});
var hd=mk('thead');hd.appendChild(hr);t.appendChild(hd);var tb=mk('tbody');
checked().forEach(function(r,i){var u=r.getAttribute('data-u');if(!(u in months))months[u]=r.getAttribute('data-owed')||'1';
var tr=mk('tr');tr.appendChild(cell(String(i+1)));var nc=cell(r.getAttribute('data-nm'));tr.appendChild(nc);
tr.appendChild(cell(r.getAttribute('data-pk')));tr.appendChild(cell(r.getAttribute('data-tf'),'r'));tr.appendChild(cell(r.getAttribute('data-due')));
var bc=mk('td'),st=mk('div','mstep'),mn=mk('button','',String.fromCharCode(8722)),pl=mk('button','','+'),mi=mk('input','pm'),hid=mk('input');
mn.type='button';pl.type='button';mn.setAttribute('aria-label','Kurangi bulan');pl.setAttribute('aria-label','Tambah bulan');
hid.type='hidden';hid.name='users[]';hid.value=u;mi.type='number';mi.name='m['+u+']';mi.min=1;mi.max=120;mi.value=months[u];mi.setAttribute('aria-label','Jumlah bulan');
function set(k){k=Math.max(1,Math.min(120,k||1));mi.value=k;months[u]=String(k);calc();}
mn.addEventListener('click',function(){set((parseInt(mi.value,10)||1)-1);});pl.addEventListener('click',function(){set((parseInt(mi.value,10)||0)+1);});
mi.addEventListener('input',function(){months[u]=mi.value;calc();});
st.appendChild(mn);st.appendChild(mi);st.appendChild(pl);bc.appendChild(hid);bc.appendChild(st);tr.appendChild(bc);
var sc=cell('','r');tr.appendChild(sc);var dc=cell('','r'),dl=mk('button','paydel');dl.type='button';dl.title='Keluarkan dari pembayaran';dl.setAttribute('aria-label','Keluarkan '+r.getAttribute('data-nm'));dl.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';dl.addEventListener('click',function(){pc(r).checked=false;sel();if(checked().length)build();else showV1();});dc.appendChild(dl);tr.appendChild(dc);tb.appendChild(tr);lines.push({r:r,mi:mi,sub:sc});});
t.appendChild(tb);wrap.appendChild(t);box.appendChild(wrap);calc();}
function sel(){var n=checked().length;bulk.style.display=(n&&v1.style.display!=='none')?'':'none';bulkn.textContent=n;var vr=rows.filter(vis);all.checked=vr.length>0&&vr.every(function(r){return pc(r).checked;});}
function showV2(){if(!checked().length)return;build();v1.style.display='none';v2.style.display='';bulk.style.display='none';q.style.display='none';ttl.textContent='Pembayaran';}
function showV1(){v2.style.display='none';v1.style.display='';q.style.display='';ttl.textContent='Bayar';sel();}
open.addEventListener('click',function(){showV1();dlg.showModal();});
rows.forEach(function(r){pc(r).addEventListener('change',sel);r.querySelector('.paynow').addEventListener('click',function(){rows.forEach(function(x){pc(x).checked=(x===r);});sel();showV2();});});
all.addEventListener('change',function(){rows.forEach(function(r){if(vis(r))pc(r).checked=all.checked;});sel();});
bulk.addEventListener('click',showV2);
g('payback').addEventListener('click',function(){if(v2.style.display!=='none')showV1();else dlg.close();});
q.addEventListener('input',function(){var s=q.value.trim().toLowerCase();rows.forEach(function(r){r.style.display=r.getAttribute('data-s').indexOf(s)>-1?'':'none';});sel();});
q.addEventListener('keydown',function(e){if(e.key==='Enter')e.preventDefault();});
form.addEventListener('submit',function(e){if(!lines.length||go.disabled)e.preventDefault();});
sel();
})();
</script>
<?php page_foot(); ?>
