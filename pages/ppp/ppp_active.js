// PPP Active: koneksi PPP yang sedang tersambung (?p=list&s=ppp_active)
"use strict";
module.exports = async function (C) {
  const { X, h, post, url, back, flash, csrf_field, icon, echo, page_head, page_foot, need_ros, rq, rremove, customers, dur_fmt, dur_secs, tgl } = C;
  await need_ros("PPP Active");
  if (X().method === "POST") {
    let ids = Array.isArray(X().POST.ids) ? X().POST.ids.map(String) : [];
    if (post("id") !== "") ids = [post("id")];
    const n = await rremove("/ppp/active", ids);
    if (n) flash(n + " koneksi diputuskan.");
    throw back();
  }
  const rows = await rq("/ppp/active/print", { ".proplist": ".id,name,service,caller-id,encoding,address,uptime,comment" });
  const cs = customers();
  const tot = rows.length;
  await page_head("PPP Active");
  echo('<form method="post" id="pa-form">' + csrf_field() + '<section class="card"><div class="cardhead">' + icon("link") + '<div class="ttl"><strong>PPP Active</strong><small>' + tot + ' koneksi tersambung</small></div><div class="tools"><button class="btn small bad" id="pa-bulk" data-confirm="Putuskan koneksi semua yang dicentang?">Remove 0</button>' + (rows.length ? '<input type="search" class="filter" placeholder="Cari…" data-filter="#tbl" aria-label="Filter">' : "") + '<a class="hl icon" href="' + h(url("list", { s: "ppp_active" })) + '" title="Muat ulang" aria-label="Reload Data">' + icon("reload") + '</a></div></div><div class="cardbody">');
  if (!rows.length) echo('<div class="empty"><p class="emptytitle">Belum ada yang terhubung.</p></div>');
  else {
    echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th class="chk nosort"><input type="checkbox" data-checkall aria-label="Pilih semua"></th><th class="dotc nosort"></th><th>Pelanggan</th><th>Alamat</th><th class="r">Uptime</th><th>Jatuh Tempo</th><th class="nosort"></th></tr></thead><tbody>');
    for (const r of rows) {
      const sv = String(r.service || "").toLowerCase();
      const nm = r.name || "";
      const cc = cs[nm] || {};
      echo('<tr><td class="chk"><input type="checkbox" name="ids[]" value="' + h(r[".id"]) + '" aria-label="Pilih ' + h(nm) + '"></td><td class="dotc"><span class="dot up" title="Online" aria-label="Online" role="img"></span></td><td class="two"><b><a class="namelink" href="' + h(url("ppp_user", { user: nm })) + '">' + h(cc.nama || nm) + "</a></b><small>" + h((cc.nama ? nm + " · " : "") + (sv === "pppoe" ? "PPPoE" : sv !== "" ? sv.toUpperCase() : "-")) + '</small></td><td class="two"><b class="mono">' + h(r.address || "") + '</b><small class="mono">' + h(r["caller-id"] || "") + '</small></td><td class="r mono" data-v="' + dur_secs(r.uptime || "") + '">' + h(dur_fmt(r.uptime || "")) + "</td><td>" + (cc.due ? h(tgl(cc.due)) : '<span class="dash">—</span>') + '</td><td class="acts"><button class="icbtn bad" name="id" value="' + h(r[".id"]) + '" title="Putuskan" aria-label="Putuskan ' + h(nm) + '" data-confirm="Putuskan koneksi ' + h(nm) + '?">' + icon("out") + "</button></td></tr>");
    }
    echo('</tbody></table></div><p class="count"><span data-count="#tbl">' + tot + "</span> dari " + tot + " item</p>");
  }
  echo("</div></section></form><script>(function(){var f=document.getElementById('pa-form'),b=document.getElementById('pa-bulk');var u=function(){setTimeout(function(){var n=f.querySelectorAll('tbody input[type=checkbox]:checked').length;b.classList.toggle('on',n>0);b.textContent='Remove '+n},0)};f.addEventListener('change',u);f.addEventListener('click',u)})();</script>");
  page_foot();
};
