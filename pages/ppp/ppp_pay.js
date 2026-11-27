// Terima pembayaran satu pelanggan: pilih jumlah bulan, total dihitung dari tarif
"use strict";
module.exports = async function (C) {
  const { X, h, get, post, url, back, redirect, flash, csrf_field, icon, echo, page_head, page_foot, ros, customers, pay_add, is_billed, is_late, bill_state, months_owed, add_months, money, tgl, today, setting, opt, badge, floatv, intv } = C;
  const METHODS = ["Tunai", "Transfer", "QRIS", "Lainnya"];
  const user = get("user");
  const cs = customers();
  if (!cs[user] || !is_billed(cs[user])) {
    flash("Pelanggan ini belum punya Jatuh Tempo. Atur dulu di PPP User.", "err");
    throw redirect("ppp_payment");
  }
  const c = cs[user];
  const t0 = today();
  const tarif = floatv(c.tarif);
  if (X().method === "POST") {
    const months = intv(post("months"));
    if (months < 1 || months > 120) {
      flash("Jumlah bulan antara 1 dan 120.", "err");
      throw back();
    }
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(post("date")) && post("date") <= t0 ? post("date") : t0;
    const p = await pay_add(user, months, tarif * months, METHODS.includes(post("method")) ? post("method") : "Tunai", dt);
    if (!p) {
      flash("Pembayaran gagal disimpan.", "err");
      throw back();
    }
    const after = customers()[user];
    let msg = "Pembayaran " + p.months + " bulan (" + money(p.amount) + ") dari " + p.nama + " diterima. Jatuh tempo berikutnya " + tgl(p.to) + ".";
    if (!(await ros())) msg += " Router tidak terhubung, jadi profil di router belum diperbarui.";
    else if (c.isolated && !after.isolated) msg += " Dikembalikan ke Main Profile.";
    else if (is_late(after)) msg += " Masih menunggak, belum dikembalikan ke Main Profile.";
    flash(msg, "ok", ["Print Kwitansi", url("invoice_print", { pay: p.id })]);
    throw redirect("ppp_payment");
  }
  const st = bill_state(c);
  const owed = months_owed(c);
  await page_head("Terima Pembayaran", "", ["PPP Payment", url("ppp_payment")]);
  echo('<div class="split"><form method="post" class="card pay" id="payform" data-due="' + h(c.due) + '" data-jt="' + intv(c.jt) + '" data-tarif="' + tarif + '" data-cur="' + h(setting("currency")) + '">' + csrf_field() + '<input type="hidden" id="amount" name="amount" value="' + tarif * owed + '">');
  echo('<div class="cardhead">' + icon("money") + '<strong>Terima pembayaran</strong><span class="spacer"></span><a class="x" href="' + h(url("ppp_payment")) + '" title="Tutup" aria-label="Tutup">&times;</a></div><div class="cardbody">');
  echo('<div class="custhead"><span class="av">' + icon("user") + "</span><div><b>" + h((c.nama || "") !== "" ? c.nama : user) + '</b><small class="mono">' + h(user) + " · " + h(c.paket || "") + "</small></div>" + (["late", "grace"].includes(st[0]) ? badge("Belum bayar", "bad") : badge("Lunas", "ok")) + "</div>");
  echo('<table class="kv"><tbody><tr><th>Tarif per bulan</th><td>' + money(tarif) + "</td></tr><tr><th>Jatuh tempo sekarang</th><td>" + h(tgl(c.due)) + " <span class=\"muted\">" + h(st[1]) + "</span></td></tr></tbody></table>");
  echo('<div class="fsep">Bayar untuk berapa bulan</div><div class="monthpick"><div class="stepper"><button type="button" class="btn" data-step="-1" aria-label="Kurangi satu bulan">&minus;</button><input id="months" name="months" type="number" min="1" max="120" value="' + owed + '" required aria-label="Jumlah bulan"><button type="button" class="btn" data-step="1" aria-label="Tambah satu bulan">+</button></div><div class="quick" role="group" aria-label="Pilihan cepat">' + [1, 2, 3, 6, 12].map((q) => '<button type="button" class="chip" data-months="' + q + '">' + q + " bulan</button>").join("") + "</div></div>");
  echo('<div class="result"><div><span class="lbl">Total</span><strong id="total">' + money(tarif * owed) + '</strong></div><div><span class="lbl">Jatuh tempo berikutnya</span><strong id="newdue">' + h(tgl(add_months(c.due, owed, c.jt || 0))) + "</strong></div></div>");
  if (tarif <= 0) echo('<p class="msg warn"><span>Tarif per bulan pelanggan ini masih kosong, jadi totalnya Rp 0. Isi tarifnya di PPP User.</span></p>');
  echo('<div class="frow"><label for="pm">Cara bayar</label><select id="pm" name="method">' + METHODS.map((m) => opt(m, "Tunai")).join("") + '</select></div><div class="frow"><label for="pd">Tanggal bayar</label><input id="pd" type="date" name="date" value="' + t0 + '" max="' + t0 + '"></div>');
  echo('<div class="btnrow formfoot"><span class="spacer"></span><a class="btn ghost" href="' + h(url("ppp_payment")) + '">Cancel</a><button class="btn primary">' + icon("save") + "Save Payment</button></div></div></form>");
  echo('<section class="card"><div class="cardhead">' + icon("info") + '<strong>Read Me</strong></div><div class="cardbody"><table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody><tr><td>Jumlah bulan</td><td>Cukup pilih berapa bulan yang dibayar. Total dihitung otomatis dari tarif per bulan.</td></tr><tr><td>Jatuh Tempo</td><td>Jatuh Tempo maju sebanyak bulan yang dibayar, dengan tanggal yang sama tiap bulan.</td></tr><tr><td>Setelah bayar</td><td>Pelanggan yang sedang di profil isolir dikembalikan ke Main Profile dan comment-nya berisi tanggal baru.</td></tr></tbody></table></div></section></div>');
  page_foot();
};
