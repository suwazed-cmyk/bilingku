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
