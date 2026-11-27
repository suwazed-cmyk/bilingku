// Settings > Template Editor: template voucher (Default & Small), Kwitansi dan Tagihan PPP
"use strict";
module.exports = async function (C) {
  const { X, S, h, get, post, url, redirect, flash, csrf_field, icon, echo, page_head, page_foot, badge, opt, tgl, db_load, VTPL_NAMES, VTPL_SETS, VTPL_DOCS, vtpl_sets, vtpl_active, vtpl_key, vtpl_is_custom, vtpl_add_set, vtpl_set_active, vtpl_rename_set, vtpl_delete_set, vtpl_check, vtpl_save, vtpl_default, vtpl_get, vtpl_vars_doc } = C;
  const sets = vtpl_sets();
  let St = get("set");
  let P = get("part");
  if (P === "" && VTPL_DOCS[get("template")]) P = get("template");
  if (VTPL_DOCS[P]) St = "";
  else {
    if (!sets[St]) St = vtpl_active();
    if (!VTPL_NAMES[P]) P = "default";
  }
  const isDoc = !!VTPL_DOCS[P];
  const K = vtpl_key(St, P);
  const title = isDoc ? VTPL_DOCS[P] : sets[St] + " · " + VTPL_NAMES[P];
  const back = () => redirect("template", St === "" ? { part: P } : { set: St, part: P });
  const draft = () => (S().vtpl_draft = S().vtpl_draft || {});

  if (X().method === "POST") {
    const act = post("act");
    const label = String(post("label")).replace(/\s+/g, " ").trim();
    const taken = (l, skip = "") => Object.entries(sets).some(([k, v]) => k !== skip && String(v).toLowerCase() === l.toLowerCase());
    if (act === "add") {
      const from = sets[post("from")] ? post("from") : "std";
      if (label === "") {
        flash("Isi nama template.", "err");
        throw back();
      }
      if (taken(label)) {
        flash("Nama template " + label + " sudah dipakai.", "err");
        throw back();
      }
      const k = vtpl_add_set([...label].slice(0, 40).join(""), from);
      if (k === "") {
        flash("Template gagal dibuat.", "err");
        throw back();
      }
      if (post("use") === "1") vtpl_set_active(k);
      flash("Template " + label + " dibuat dari salinan " + sets[from] + " (Default dan Small). Silakan ubah lalu Save.");
      throw redirect("template", { set: k, part: "default" });
    }
    if (act === "rename" && vtpl_is_custom(St)) {
      if (label === "") {
        flash("Isi nama template.", "err");
        throw back();
      }
      if (taken(label, St)) {
        flash("Nama template " + label + " sudah dipakai.", "err");
        throw back();
      }
      if (vtpl_rename_set(St, [...label].slice(0, 40).join(""))) flash("Nama template diubah menjadi " + label + ".");
      throw back();
    }
    if (act === "delete" && vtpl_is_custom(St)) {
      if (vtpl_delete_set(St)) flash("Template " + sets[St] + " dihapus.");
      throw redirect("template", { set: vtpl_active(), part: "default" });
    }
    if (act === "use" && !isDoc) {
      if (vtpl_set_active(St)) flash("Template " + sets[St] + " sekarang dipakai saat Print.");
      throw back();
    }
    if (act === "save") {
      const src = String(X().POST.src || "").replace(/\r/g, "");
      const err = vtpl_check(src);
      if (err !== "") {
        draft()[K] = src;
        flash("Template belum disimpan. " + err, "err");
        throw back();
      }
      delete draft()[K];
      if (vtpl_save(K, src)) flash("Template " + title + " disimpan.");
      else flash("Template gagal disimpan.", "err");
    } else if (act === "reset") {
      const from = VTPL_SETS[post("from")] ? post("from") : VTPL_SETS[St] ? St : "std";
      const src = vtpl_default(isDoc ? P : vtpl_key(from, P));
      delete draft()[K];
      if (src !== "" && vtpl_save(K, src)) flash("Template " + title + " dikembalikan ke isi bawaan" + (isDoc ? "" : " (" + VTPL_SETS[from] + ")") + ".");
      else flash("Isi bawaan tidak ditemukan.", "err");
    }
    throw back();
  }

  const src = draft()[K] !== undefined ? draft()[K] : vtpl_get(K);
  const all = db_load("vtpl");
  const err = vtpl_check(src);
  const active = vtpl_active();
  const lnk = (s, p) => url("template", s === "" ? { part: p } : { set: s, part: p });
  await page_head("Template Editor");
  echo('<div class="tpled"><form method="post" class="card" id="tplform">' + csrf_field());
  echo('<div class="cardhead">' + icon("edit") + '<strong>Template Editor</strong><span class="badge">' + h(title) + "</span>" + (!isDoc && St === active ? badge("Dipakai saat Print", "ok") : "") + '<span class="spacer"></span>');
  if (all["_at_" + K]) echo('<span class="muted small">Disimpan ' + h(tgl(String(all["_at_" + K]).slice(0, 10)) + String(all["_at_" + K]).slice(10)) + "</span>");
  echo('</div><div class="cardbody"><div class="tplpick"><span class="grp"><b>TEMPLATE</b><select aria-label="Template" onchange="location.href=this.value"><optgroup label="Template Voucher">');
  for (const [k, v] of Object.entries(sets)) echo('<option value="' + h(lnk(k, isDoc ? "default" : P)) + '"' + (!isDoc && k === St ? " selected" : "") + ">" + h(v) + (k === active ? " (dipakai)" : "") + "</option>");
  echo('</optgroup><optgroup label="PPPoE">');
  for (const [k, v] of Object.entries(VTPL_DOCS)) echo('<option value="' + h(lnk("", k)) + '"' + (k === P ? " selected" : "") + ">" + h(v) + "</option>");
  echo("</optgroup></select></span>");
  if (!isDoc) {
    echo('<span class="seg" role="tablist" aria-label="Tampilan">');
    for (const [k, v] of Object.entries(VTPL_NAMES)) echo('<a role="tab" aria-selected="' + (k === P ? "true" : "false") + '" class="' + (k === P ? "on" : "") + '" href="' + h(lnk(St, k)) + '">' + h(v) + "</a>");
    echo('</span><span class="spacer"></span><button type="button" class="btn" data-open="#tpladd">' + icon("plus") + "Tambah</button>");
    if (vtpl_is_custom(St)) echo('<button type="button" class="btn" data-open="#tplren">' + icon("edit") + 'Ganti nama</button><button class="btn bad" name="act" value="delete" formnovalidate data-confirm="Hapus template ' + h(sets[St]) + '?&#10;Tampilan Default dan Small di template ini akan hilang dan tidak bisa dikembalikan.">' + icon("trash") + "Hapus</button>");
    if (St !== active) echo('<button class="btn" name="act" value="use" formnovalidate>' + icon("print") + "Pakai saat Print</button>");
  }
  echo('</div><p class="msg ' + (err ? "err" : "ok") + '" id="tplstate" role="status"><span>' + (err ? h(err) : "Template aman — struktur HTML dan PHP OK.") + "</span></p>");
  echo('<div class="tplbar"><button class="btn primary" name="act" value="save">' + icon("save") + 'Save</button><span class="spacer"></span><span class="grp"><b>RESET</b><select name="from" aria-label="Kembalikan ke isi bawaan">');
  if (isDoc) echo(opt(P, P, VTPL_DOCS[P]));
  else for (const [k, v] of Object.entries(VTPL_SETS)) echo(opt(k, VTPL_SETS[St] ? St : "std", v + " " + VTPL_NAMES[P]));
  echo('</select><button class="btn grpbtn" name="act" value="reset" formnovalidate data-confirm="Kembalikan ' + h(title) + ' ke isi bawaan?&#10;Perubahan Anda pada tampilan ini akan hilang." title="Kembalikan ke isi bawaan" aria-label="Kembalikan ke isi bawaan">' + icon("reload") + "</button></span></div>");
  echo('<div class="codewrap"><div class="ln" id="tplln" aria-hidden="true">1</div><textarea name="src" id="tplsrc" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Isi template">' + h(src) + "</textarea></div></div></form>");
  echo('<div><section class="card"><div class="cardhead">' + icon("eye") + '<strong>Preview</strong><span class="spacer"></span><label class="muted chk"' + (isDoc || P === "small" ? ' style="display:none"' : "") + '><input type="checkbox" id="pvqr"> QR</label></div><div class="cardbody"><iframe class="pvframe" id="pvframe" title="Pratinjau voucher"></iframe></div></section>');
  echo('<section class="card"><div class="cardhead">' + icon("info") + '<strong>Variables</strong></div><div class="cardbody vars"><table class="readme"><tbody>');
  for (const [k, v] of Object.entries(vtpl_vars_doc(P))) echo("<tr><td><code>" + h(k) + "</code></td><td>" + h(v) + "</td></tr>");
  echo("</tbody></table></div></section></div></div>");
  echo('<dialog class="tpldlg dlg" id="tpladd" aria-labelledby="tpladd_t"><form method="post">' + csrf_field() + '<input type="hidden" name="act" value="add"><div class="cardhead">' + icon("plus") + '<strong id="tpladd_t">Tambah Template</strong><span class="spacer"></span><button type="button" class="x" data-close aria-label="Tutup">&times;</button></div><div class="cardbody">');
  echo('<div class="frow"><label for="ta_name">Nama</label><input id="ta_name" name="label" required maxlength="40" placeholder="mis. Template 2" autocomplete="off"></div><div class="frow"><label for="ta_from">Salin dari</label><select id="ta_from" name="from">');
  for (const [k, v] of Object.entries(sets)) echo(opt(k, isDoc ? active : St, v));
  echo('</select></div><div class="frow"><label for="ta_use">Saat Print</label><label class="chk"><input type="checkbox" id="ta_use" name="use" value="1"> Langsung pakai template ini</label></div><div class="btnrow fend"><span class="spacer"></span><button type="button" class="btn" data-close>Batal</button><button class="btn primary">' + icon("plus") + "Tambah</button></div></div></form></dialog>");
  if (vtpl_is_custom(St)) echo('<dialog class="tpldlg dlg" id="tplren" aria-labelledby="tplren_t"><form method="post">' + csrf_field() + '<input type="hidden" name="act" value="rename"><div class="cardhead">' + icon("edit") + '<strong id="tplren_t">Ganti Nama Template</strong><span class="spacer"></span><button type="button" class="x" data-close aria-label="Tutup">&times;</button></div><div class="cardbody"><div class="frow"><label for="tr_name">Nama</label><input id="tr_name" name="label" required maxlength="40" value="' + h(sets[St]) + '" autocomplete="off"></div><div class="btnrow fend"><span class="spacer"></span><button type="button" class="btn" data-close>Batal</button><button class="btn primary">' + icon("save") + "Simpan</button></div></div></form></dialog>");
  echo("<script>(function(){document.querySelectorAll('[data-open]').forEach(function(b){b.addEventListener('click',function(){var d=document.querySelector(b.getAttribute('data-open'));if(d&&d.showModal){d.showModal();var i=d.querySelector('input[type=text],input:not([type])');if(i){i.focus();i.select()}}})});document.querySelectorAll('.tpldlg').forEach(function(d){d.addEventListener('click',function(e){if(e.target===d||e.target.closest('[data-close]'))d.close()})})})();</script>");
  echo("<script>(function(){var ta=document.getElementById('tplsrc'),ln=document.getElementById('tplln'),fr=document.getElementById('pvframe'),qr=document.getElementById('pvqr');var f=document.getElementById('tplform'),tok=f.querySelector('input[name=_t]').value,timer=null,busy=false,again=false;var lines=function(){var n=ta.value.split('\\n').length,s='';for(var i=1;i<=n;i++)s+=i+'\\n';ln.textContent=s;ln.style.height=ta.offsetHeight+'px';ln.scrollTop=ta.scrollTop};var preview=function(){if(busy){again=true;return}busy=true;var fd=new URLSearchParams();fd.append('_t',tok);fd.append('act','preview');fd.append('tpl'," + JSON.stringify(P) + ");fd.append('part'," + JSON.stringify(P) + ");fd.append('set'," + JSON.stringify(St) + ");fd.append('qr',qr.checked?'yes':'no');fd.append('n','2');fd.append('src',ta.value);fetch(" + JSON.stringify(url(isDoc ? "invoice_print" : "voucher_print")) + ",{method:'POST',body:fd,credentials:'same-origin'}).then(function(r){return r.text()}).then(function(h){fr.srcdoc=h}).catch(function(){}).then(function(){busy=false;if(again){again=false;preview()}})};ta.addEventListener('input',function(){lines();clearTimeout(timer);timer=setTimeout(preview,600)});ta.addEventListener('scroll',function(){ln.scrollTop=ta.scrollTop});ta.addEventListener('keydown',function(e){if(e.key==='Tab'){e.preventDefault();var s=ta.selectionStart,en=ta.selectionEnd;ta.value=ta.value.slice(0,s)+'  '+ta.value.slice(en);ta.selectionStart=ta.selectionEnd=s+2;lines()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();f.querySelector('button[value=save]').click()}});qr.addEventListener('change',preview);window.addEventListener('resize',lines);lines();preview()})();</script>");
  page_foot();
};
