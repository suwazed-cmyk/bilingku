// PPP Payment: ringkasan pendapatan dan riwayat pembayaran PPP, bayar banyak pelanggan sekaligus
"use strict";
const PAYJS = require("fs").readFileSync(__dirname + "/_paydlg.js", "utf8");
module.exports = async function (C) {
  const { X, h, get, post, url, back, flash, csrf_field, icon, echo, page_head, page_foot, ros, customers, payments, pay_add, pay_cancel, is_billed, bill_state, months_owed, money, tgl, bulan, today, valid_period, setting, opt, badge, row_menu, confirm_btn, floatv, intv } = C;
  const METHODS = ["Tunai", "Transfer", "QRIS", "Lainnya"];
  if (X().method === "POST") {
    if (post("act") === "cancel") {
      if (await pay_cancel(post("id"))) flash("Pembayaran dibatalkan dan jatuh tempo dikembalikan.");
      else flash("Hanya pembayaran terakhir seorang pelanggan yang bisa dibatalkan.", "err");
    } else if (post("act") === "bulk_pay") {
      const t0 = today();
      const all = customers();
      const dt = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(post("date")) && post("date") <= t0 ? post("date") : t0;
      const method = METHODS.includes(post("method")) ? post("method") : "Tunai";
      const ms = X().POST.m && typeof X().POST.m === "object" ? X().POST.m : {};
      const us = [...new Set((Array.isArray(X().POST.users) ? X().POST.users : []).map(String))];
      if (!us.length) flash("Pilih minimal satu pelanggan.", "err");
      else {
        let ok = 0;
        let fail = 0;
        let paidsum = 0;
        for (const u of us) {
          const months = intv(ms[u]);
          if (months < 1 || months > 120 || !all[u] || !is_billed(all[u])) {
            fail++;
            continue;
          }
          const p = await pay_add(u, months, floatv(all[u].tarif) * months, method, dt);
          if (p) {
            ok++;
            paidsum += p.amount;
          } else fail++;
        }
        flash(ok + " pelanggan dibayar (" + money(paidsum) + ")." + (fail ? " " + fail + " gagal." : ""), fail ? "err" : "ok");
      }
    }
    throw back();
  }
  const cs = customers();
  let owed = 0;
  const paid = [];
  const unpaid = [];
  for (const [u, c] of Object.entries(cs)) {
    if (!is_billed(c)) continue;
    const st = bill_state(c);
    if (["late", "grace"].includes(st[0])) {
      owed += floatv(c.tarif) * months_owed(c);
      unpaid.push([u, c, st]);
    } else paid.push([u, c, st]);
  }
  const byDue = (a, b) => (String(a[1].due) < String(b[1].due) ? -1 : String(a[1].due) > String(b[1].due) ? 1 : 0);
  paid.sort(byDue);
  unpaid.sort(byDue);
  let v = get("v");
  if (v !== "paid" && v !== "unpaid") v = "";
  const period = get("period") === "all" ? "all" : valid_period(get("period"));
  const rows = [];
  let sum = 0;
  let total = 0;
  for (const p of Object.values(payments())) {
    total += floatv(p.amount);
    if (period !== "all" && String(p.paid_at).slice(0, 7) !== period) continue;
    rows.push(p);
    sum += floatv(p.amount);
  }
  rows.sort((a, b) => (String(b.paid_at) + b.no < String(a.paid_at) + a.no ? -1 : String(b.paid_at) + b.no > String(a.paid_at) + a.no ? 1 : 0));
  await ros();
  await page_head("PPP Payment", '<button type="button" id="paybtn" class="btn primary payopen">' + icon("money") + "Bayar</button>");
  echo('<div class="stats"><div class="stat green"><span class="si">' + icon("money") + "</span><div><small>Pendapatan " + (period === "all" ? "semua bulan" : h(bulan(period))) + "</small><b>" + money(sum) + '</b></div></div><div class="stat blue"><span class="si">' + icon("pie") + "</span><div><small>Total semua pembayaran</small><b>" + money(total) + '</b></div></div><div class="stat gray"><span class="si">' + icon("ticket") + "</span><div><small>Jumlah transaksi</small><b>" + rows.length + '</b></div></div><div class="stat red"><span class="si">' + icon("clock") + "</span><div><small>Belum dibayar</small><b>" + money(owed) + "</b></div></div></div>");
  echo('<div class="tabs"><a class="' + (v === "" ? "on" : "") + '" href="' + h(url("ppp_payment")) + '">Riwayat</a><a class="' + (v === "paid" ? "on" : "") + '" href="' + h(url("ppp_payment", { v: "paid" })) + '">Telah bayar <span>' + paid.length + '</span></a><a class="' + (v === "unpaid" ? "on" : "") + '" href="' + h(url("ppp_payment", { v: "unpaid" })) + '">Belum bayar <span>' + unpaid.length + "</span></a></div>");
  if (v === "") {
    echo('<section class="card"><form method="get" class="cardhead">' + icon("money") + '<strong>Riwayat pembayaran</strong><input type="hidden" name="p" value="ppp_payment">' + (C.cur_session() ? '<input type="hidden" name="session" value="' + h(C.cur_session()) + '">' : "") + '<input type="month" name="period" value="' + (period === "all" ? "" : h(period)) + '" aria-label="Bulan" onchange="this.form.submit()">' + (period !== "all" ? '<a class="hl" href="' + h(url("ppp_payment", { period: "all" })) + '">Semua bulan</a>' : "") + '<span class="spacer"></span>' + (rows.length ? '<input type="search" class="filter" placeholder="Search" data-filter="#tbl" aria-label="Filter" onkeydown="if(event.key===\'Enter\')event.preventDefault()">' : "") + '</form><div class="cardbody">');
    if (!rows.length) echo('<div class="empty"><p class="emptytitle">Belum ada pembayaran' + (period === "all" ? "" : " pada " + h(bulan(period))) + ".</p></div>");
    else {
      echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th>Nomor</th><th>Tanggal</th><th>Pelanggan</th><th>PPP</th><th class="r">Bulan</th><th>Berlaku sampai</th><th class="r">Jumlah</th><th>Cara bayar</th><th class="nosort"></th></tr></thead><tbody>');
      for (const p of rows) {
        const last = cs[p.user] && (cs[p.user].due || "") === p.to;
        echo('<tr><td class="key mono">' + h(p.no) + '</td><td data-v="' + h(p.paid_at) + '">' + h(tgl(p.paid_at)) + '</td><td><a class="namelink" href="' + h(url("ppp_user", { user: p.user })) + '">' + h(p.nama) + '</a></td><td class="mono">' + h(p.user) + '</td><td class="r">' + intv(p.months) + '</td><td data-v="' + h(p.to) + '">' + h(tgl(p.to)) + '</td><td class="r" data-v="' + floatv(p.amount) + '">' + money(p.amount) + "</td><td>" + h(p.method) + '</td><td class="acts">' + row_menu(['<a target="_blank" href="' + h(url("invoice_print", { pay: p.id })) + '">Print</a>', last ? confirm_btn("Cancel Payment", "cancel", { id: p.id }, "Batalkan " + p.no + "? Jatuh tempo " + p.nama + " kembali ke " + tgl(p.from) + ".", "danger") : ""]) + "</td></tr>");
      }
      echo("</tbody></table></div>");
    }
    echo("</div></section>");
  } else {
    const list = v === "paid" ? paid : unpaid;
    echo('<section class="card"><div class="cardhead">' + icon("user") + "<strong>" + (v === "paid" ? "Telah bayar" : "Belum bayar") + '</strong><span class="spacer"></span>' + (list.length ? '<input type="search" class="filter" placeholder="Search" data-filter="#tbl" aria-label="Filter">' : "") + '</div><div class="cardbody">');
    if (!list.length) echo('<div class="empty"><p class="emptytitle">' + (v === "paid" ? "Belum ada pelanggan yang berstatus telah bayar." : "Tidak ada pelanggan yang belum bayar.") + "</p></div>");
    else {
      echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th>Pelanggan</th><th>PPP</th><th>Profile</th><th class="r">Tarif</th><th>Jatuh Tempo</th>' + (v === "unpaid" ? '<th class="r">Bulan</th><th class="r">Tagihan</th>' : "") + "<th>Status</th></tr></thead><tbody>");
      for (const [u, c, st] of list) {
        const tf = floatv(c.tarif);
        const nm = (c.nama || "") !== "" ? c.nama : u;
        const mo = v === "unpaid" ? months_owed(c) : 1;
        echo('<tr><td><a class="namelink" href="' + h(url("ppp_user", { user: u })) + '">' + h(nm) + '</a></td><td class="mono">' + h(u) + "</td><td>" + h(c.paket || "") + '</td><td class="r" data-v="' + tf + '">' + money(tf) + '</td><td data-v="' + h(c.due) + '">' + h(tgl(c.due)) + "</td>" + (v === "unpaid" ? '<td class="r">' + mo + '</td><td class="r" data-v="' + tf * mo + '">' + money(tf * mo) + "</td>" : "") + "<td>" + (v === "paid" ? badge("Lunas", "ok") + (st[0] === "soon" ? ' <span class="muted">' + h(st[1]) + "</span>" : "") : badge("Belum bayar", "bad") + ' <span class="muted">' + h(st[1]) + "</span>") + "</td></tr>");
      }
      echo("</tbody></table></div>");
    }
    echo("</div></section>");
  }
  const cand = unpaid.concat(paid);
  echo('<dialog id="paydlg" class="paydlg dlg"><form method="post" id="bulkform" data-cur="' + h(setting("currency")) + '">' + csrf_field() + '<input type="hidden" name="act" value="bulk_pay">');
  echo('<div class="cardhead"><button type="button" class="payback" id="payback" title="Kembali" aria-label="Kembali"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></button>' + icon("money") + '<strong id="paytitle">Bayar</strong><span class="spacer"></span><button type="button" class="btn small primary payopen" id="paybulk" style="display:none">Bayar <span id="paybulkn">0</span></button>' + (cand.length ? '<input type="search" id="paysearch" class="filter" placeholder="Search" aria-label="Filter" autocomplete="off">' : "") + '<button type="button" class="x" id="payclose" aria-label="Tutup">&times;</button></div>');
  echo('<div class="cardbody paybody">');
  if (!cand.length) echo('<div class="empty"><p class="emptytitle">Belum ada pelanggan yang punya Jatuh Tempo.</p></div>');
  else {
    echo('<div id="payv1"><div class="tablewrap payscroll"><table id="paytbl" class="grid-t"><thead><tr><th><input type="checkbox" id="payall" aria-label="Pilih semua"></th><th>Pelanggan</th><th>Profile</th><th class="r">Tarif</th><th>Jatuh Tempo</th><th>Status</th><th></th></tr></thead><tbody>');
    for (const [u, c, st] of cand) {
      const tf = floatv(c.tarif);
      const nm = (c.nama || "") !== "" ? c.nama : u;
      const late = ["late", "grace"].includes(st[0]);
      echo('<tr data-u="' + h(u) + '" data-nm="' + h(nm) + '" data-pk="' + h(c.paket || "") + '" data-tf="' + h(money(tf)) + '" data-due="' + h(tgl(c.due)) + '" data-tarif="' + tf + '" data-owed="' + (late ? months_owed(c) : 1) + '" data-s="' + h((nm + " " + u + " " + (c.paket || "")).toLowerCase()) + '"><td><input type="checkbox" class="pc" aria-label="Pilih ' + h(nm) + '"></td><td>' + h(nm) + "</td><td>" + h(c.paket || "") + '</td><td class="r">' + money(tf) + "</td><td>" + h(tgl(c.due)) + "</td><td>" + (late ? badge("Belum bayar", "bad") : badge("Lunas", "ok")) + '</td><td class="acts"><button type="button" class="btn small payopen paynow">Bayar</button></td></tr>');
    }
    echo('</tbody></table></div></div><div id="payv2" style="display:none"><div id="paytable"></div><div class="payfoot"><div><label for="paymethod">Cara bayar</label><select id="paymethod" name="method">' + METHODS.map((m) => opt(m, "Tunai")).join("") + '</select></div><div><label for="paydate">Tanggal bayar</label><input id="paydate" type="date" name="date" value="' + today() + '" max="' + today() + '"></div><span class="sum" id="paysum"></span><button class="btn primary" id="paygo" data-confirm="Lanjutkan pembayaran?" data-ok="Ya, lanjutkan" disabled>' + icon("save") + "Save Payment</button></div></div>");
  }
  echo("</div></form></dialog><script>" + PAYJS + "</script>");
  page_foot();
};
