// Report: pendapatan Hotspot (penjualan voucher) dan PPPoE (pembayaran) per bulan
"use strict";
module.exports = async function (C) {
  const { h, get, url, icon, echo, page_head, page_foot, ros, sales_sync, sales_sync_bg, sales, payments, valid_period, money, tgl, bulan, badge, xlsx_send, csvLine, rkey, db, db_list, date, today, X, floatv, intv, days_in_month } = C;
  let synced = null;
  if (await ros()) {
    if (get("sync") !== "") synced = await sales_sync();
    else {
      sales_sync_bg();
      synced = 0;
    }
  }
  const period = valid_period(get("period"));
  const type = ["hs", "ppp"].includes(get("t")) ? get("t") : "";
  const cmpDesc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
  const sl = sales(period).slice().sort((a, b) => cmpDesc(a.d + a.t, b.d + b.t));
  const pays = Object.values(payments()).filter((i) => String(i.paid_at).slice(0, 7) === period).sort((a, b) => cmpDesc(a.paid_at + a.no, b.paid_at + b.no));
  let rows = [];
  if (type !== "ppp") for (const s of sl) rows.push({ d: s.d, t: s.t, k: "hs", u: s.u, pr: s.pr, a: floatv(s.a), note: ((s.v !== "" ? "Validity " + s.v : "") + (s.c !== "" ? " · " + s.c : "")).replace(/^ · | · $/g, ""), ip: s.ip, mac: s.mac });
  if (type !== "hs") for (const i of pays) rows.push({ d: i.paid_at, t: "", k: "ppp", u: i.nama !== "" ? i.nama : i.user, user: i.user, pr: i.paket, a: floatv(i.amount), note: i.no + " · " + intv(i.months) + " bulan · " + i.method + " · " + tgl(i.from) + " – " + tgl(i.to), ip: "", mac: "" });
  rows.sort((a, b) => cmpDesc(a.d + a.t, b.d + b.t));
  if (["csv", "xlsx"].includes(get("export"))) {
    const head = ["Tanggal", "Jam", "Jenis", "User / Pelanggan", "Profil / Paket", "Jumlah", "Keterangan", "IP", "MAC"];
    const data = rows.map((r) => [r.d, r.t, r.k === "hs" ? "Hotspot" : "PPPoE", r.u, r.pr, Math.trunc(r.a), r.note, r.ip, r.mac]);
    const fn = "report-" + (type === "hs" ? "hotspot-" : type === "ppp" ? "pppoe-" : "") + period;
    xlsx_send(fn + ".xlsx", head, data);
  }
  const days = {};
  const byProfile = {};
  const byPaket = {};
  let vSum = 0;
  let pSum = 0;
  for (const s of sl) {
    const d = (days[s.d] = days[s.d] || {});
    d.v = (d.v || 0) + floatv(s.a);
    d.vn = (d.vn || 0) + 1;
    const b = (byProfile[s.pr] = byProfile[s.pr] || [0, 0]);
    b[0]++;
    b[1] += floatv(s.a);
    vSum += floatv(s.a);
  }
  for (const i of pays) {
    const d = (days[i.paid_at] = days[i.paid_at] || {});
    d.p = (d.p || 0) + floatv(i.amount);
    d.pn = (d.pn || 0) + 1;
    const k = i.paket !== "" ? i.paket : "-";
    const b = (byPaket[k] = byPaket[k] || [0, 0]);
    b[0]++;
    b[1] += floatv(i.amount);
    pSum += floatv(i.amount);
  }
  let max = 1;
  for (const d of Object.values(days)) max = Math.max(max, (type !== "ppp" ? d.v || 0 : 0) + (type !== "hs" ? d.p || 0 : 0));
  const qf = (x = {}) => {
    const o = {};
    if (period) o.period = period;
    if (type) o.t = type;
    return url("report", Object.assign({}, x, o));
  };
  const [py, pm] = period.split("-").map(Number);
  const prev = pm === 1 ? py - 1 + "-12" : py + "-" + String(pm - 1).padStart(2, "0");
  const next = pm === 12 ? py + 1 + "-01" : py + "-" + String(pm + 1).padStart(2, "0");
  // total semua waktu: Hotspot dari semua data penjualan bulanan router ini, PPPoE dari semua pembayaran
  let allHs = 0;
  let allPp = 0;
  for (const r of db.prepare("SELECT name FROM docs WHERE name LIKE ?").all(rkey("sales_") + "%")) for (const x of db_list(r.name)) allHs += floatv(x.a);
  for (const i of Object.values(payments())) allPp += floatv(i.amount);
  const withT = (o) => (type ? Object.assign(o, { t: type }) : o);
  await page_head("Report");
  if (synced === null) echo('<div class="msg warn"><span>Router tidak terhubung, jadi penjualan voucher terbaru belum diambil dari router. Data di bawah adalah yang sudah tersimpan.</span></div>');
  const tiles = [
    [url("report", { period }), type === "", money(vSum + pSum), "Total " + bulan(period), sl.length + pays.length + " transaksi", "report", "blue"],
    [url("report", { period, t: "hs" }), type === "hs", money(vSum), "Hotspot", sl.length + " voucher terjual", "wifi", "green"],
    [url("report", { period, t: "ppp" }), type === "ppp", money(pSum), "PPPoE", pays.length + " pembayaran", "ppp", "amber"],
    ["", false, money(allHs + allPp), "Total semua", "Hotspot " + money(allHs, false) + " · PPPoE " + money(allPp, false), "money", "gray"],
  ];
  echo('<div class="stats">');
  for (const [u, on, num, lbl, sub, ic, c] of tiles) {
    const tag = u !== "" ? "a" : "div";
    echo("<" + tag + ' class="stat ' + c + (on ? " on" : "") + '"' + (u !== "" ? ' href="' + h(u) + '"' : "") + '><span class="si">' + icon(ic) + "</span><div><small>" + h(lbl) + "</small><b>" + h(num) + "</b><em>" + h(sub) + "</em></div></" + tag + ">");
  }
  echo("</div>");
  const typeOpt = { "": "Hotspot & PPPoE", hs: "Hotspot", ppp: "PPPoE" };
  echo('<section class="card"><div class="cardhead">' + icon("report") + "<strong>Report " + h(bulan(period)) + '</strong><a class="hl" href="' + h(qf({ sync: 1 })) + '" title="Ambil penjualan terbaru dari router" aria-label="Reload Data">' + icon("reload") + '</a><span class="spacer"></span><div class="rtools">');
  echo('<span class="rmonth"><a href="' + h(url("report", withT({ period: prev }))) + '" title="Bulan sebelumnya" aria-label="Bulan sebelumnya">&lsaquo;</a><input type="month" value="' + h(period) + '" aria-label="Periode" data-go="' + h(url("report", withT({}))) + '" onchange="if(this.value)location.href=this.dataset.go+\'&period=\'+this.value"><a href="' + h(url("report", withT({ period: next }))) + '" title="Bulan berikutnya" aria-label="Bulan berikutnya">&rsaquo;</a></span>');
  echo('<select aria-label="Jenis pendapatan" onchange="location.href=this.value">' + Object.entries(typeOpt).map(([k, v]) => '<option value="' + h(url("report", k ? { period, t: k } : { period })) + '"' + (k === type ? " selected" : "") + ">" + h(v) + "</option>").join("") + "</select>");
  echo('<details class="xdd"><summary class="btn small primary">' + icon("down") + 'Export</summary><div class="xmenu"><a href="' + h(qf({ export: "csv" })) + '">CSV</a><a href="' + h(qf({ export: "xlsx" })) + '">XLSX</a></div></details></div></div></section>');
  if (!Object.keys(days).length) {
    echo('<section class="card"><div class="cardbody"><div class="empty"><p class="emptytitle">Belum ada pendapatan ' + h(typeOpt[type]) + " pada " + h(bulan(period)) + ".</p></div></div></section>");
    page_foot();
    return;
  }
  echo('<div class="rgrid2"><section class="card"><div class="cardhead">' + icon("clock") + '<strong>Per hari</strong><span class="spacer"></span><span class="rlegend">' + (type !== "ppp" ? '<span><i class="h"></i>Hotspot</span>' : "") + (type !== "hs" ? '<span><i class="p"></i>PPPoE</span>' : "") + '</span></div><div class="cardbody"><div class="tablewrap"><table class="grid-t sortable t2" data-pgsize="14"><thead><tr><th>Tanggal</th>' + (type !== "ppp" ? '<th class="r">Hotspot</th>' : "") + (type !== "hs" ? '<th class="r">PPPoE</th>' : "") + '<th class="r">Total</th><th class="nosort" style="min-width:110px">Proporsi</th></tr></thead><tbody>');
  const list = Object.keys(days).sort(cmpDesc);
  for (const d of list) {
    const v = days[d];
    const hv = type !== "ppp" ? v.v || 0 : 0;
    const pv = type !== "hs" ? v.p || 0 : 0;
    const t = hv + pv;
    const hn = type !== "ppp" ? v.vn || 0 : 0;
    const pn = type !== "hs" ? v.pn || 0 : 0;
    if (!hn && !pn) continue;
    echo('<tr><td data-v="' + h(d) + '">' + h(tgl(d)) + "</td>" + (type !== "ppp" ? '<td class="r" data-v="' + hv + '">' + (hn ? '<span class="amt">' + money(hv) + '</span><span class="sub">' + hn + " voucher</span>" : '<span class="muted">-</span>') + "</td>" : "") + (type !== "hs" ? '<td class="r" data-v="' + pv + '">' + (pn ? '<span class="amt">' + money(pv) + '</span><span class="sub">' + pn + " bayar</span>" : '<span class="muted">-</span>') + "</td>" : "") + '<td class="r" data-v="' + t + '">' + (t ? "<b>" + money(t) + "</b>" : '<span class="muted">-</span>') + '</td><td><div class="rbar">' + (hv ? '<i class="h" style="width:' + Math.round((hv / max) * 1000) / 10 + '%"></i>' : "") + (pv ? '<i class="p" style="width:' + Math.round((pv / max) * 1000) / 10 + '%"></i>' : "") + "</div></td></tr>");
  }
  echo('</tbody></table></div></div></section><div class="rstack">');
  const sideTbl = (title, ic, sum, obj, label, cntLabel, empty, sorter) => {
    echo('<section class="card"><div class="cardhead">' + icon(ic) + "<strong>" + title + '</strong><span class="spacer"></span><span class="muted">' + money(sum) + '</span></div><div class="cardbody">');
    const ks = Object.keys(obj).sort(sorter);
    if (!ks.length) echo('<p class="muted">' + empty + "</p>");
    else echo('<div class="tablewrap"><table class="grid-t sortable" data-nopager><thead><tr><th>' + label + '</th><th class="r">' + cntLabel + '</th><th class="r">Jumlah</th></tr></thead><tbody>' + ks.map((k) => '<tr><td class="key">' + h(k) + '</td><td class="r">' + obj[k][0] + '</td><td class="r" data-v="' + obj[k][1] + '">' + money(obj[k][1]) + "</td></tr>").join("") + "</tbody></table></div>");
    echo("</div></section>");
  };
  if (type !== "ppp") sideTbl("Hotspot per profil", "wifi", vSum, byProfile, "Profil", "Terjual", "Tidak ada penjualan voucher.", (a, b) => byProfile[b][0] - byProfile[a][0] || byProfile[b][1] - byProfile[a][1]);
  if (type !== "hs") sideTbl("PPPoE per paket", "ppp", pSum, byPaket, "Paket", "Pembayaran", "Tidak ada pembayaran PPPoE.", (a, b) => byPaket[b][1] - byPaket[a][1]);
  echo("</div></div>");
  echo('<section class="card"><div class="cardhead">' + icon("log") + '<strong>Rincian</strong><span class="spacer"></span><input type="search" class="filter" placeholder="Search" data-filter="#tbl" aria-label="Search"></div><div class="cardbody"><div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th>Tanggal</th><th>Jenis</th><th>User / Pelanggan</th><th>Profil / Paket</th><th class="r">Jumlah</th><th>Keterangan</th></tr></thead><tbody>');
  for (const r of rows.slice(0, 500)) {
    const note = r.k === "hs" ? [r.note, r.ip !== "" ? "IP " + r.ip : "", r.mac !== "" ? "MAC " + r.mac : ""].filter(Boolean).join(" · ") : r.note;
    echo('<tr><td data-v="' + h(r.d + " " + r.t) + '" class="nowrap">' + h(tgl(r.d)) + (r.t !== "" ? ' <span class="muted mono">' + h(r.t) + "</span>" : "") + "</td><td>" + (r.k === "hs" ? badge("Hotspot", "ok") : badge("PPPoE", "info")) + '</td><td class="key">' + (r.k === "ppp" ? '<a class="namelink" href="' + h(url("ppp_user", { user: r.user })) + '">' + h(r.u) + "</a>" : '<span class="mono">' + h(r.u) + "</span>") + "</td><td>" + h(r.pr) + '</td><td class="r nowrap" data-v="' + r.a + '">' + money(r.a) + '</td><td class="rnote"><span class="ell" title="' + h(note) + '">' + h(note) + "</span></td></tr>");
  }
  echo('</tbody></table></div><p class="count"><span data-count="#tbl">' + Math.min(500, rows.length) + "</span> dari " + rows.length + " transaksi" + (rows.length > 500 ? " (500 terbaru; unduh XLSX untuk semuanya)" : "") + "</p></div></section>");
  page_foot();
};
