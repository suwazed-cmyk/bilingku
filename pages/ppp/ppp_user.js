// User Detail: semua data satu pelanggan PPP dalam satu halaman (?p=ppp_user&user=NAMA-PPP)
"use strict";
module.exports = async function (C) {
  const { h, get, url, icon, echo, page_head, page_foot, need_ros, rq, customers, payments, bill_state, badge, ppp_fup, money, tgl, today, bytes, dur_fmt, ros_dt, is_billed, days_until, months_owed, iso_date, dis_date, ppp_stage2, setting, ppp_joined, lama_langganan, iso_off_days, floatv } = C;
  await need_ros("User Detail");
  const user = String(get("user"));
  let s = null;
  for (const x of await rq("/ppp/secret/print"))
    if ((x.name || "") === user) {
      s = x;
      break;
    }
  const cs = customers();
  const c = cs[user] && typeof cs[user] === "object" ? cs[user] : {};
  const pays = Object.values(payments()).filter((p) => p && (p.user || "") === user);
  pays.sort((a, b) => (String(b.paid_at || "") < String(a.paid_at || "") ? -1 : String(b.paid_at || "") > String(a.paid_at || "") ? 1 : 0));
  if (user === "" || (!s && !Object.keys(c).length && !pays.length)) {
    await page_head("User Detail", "", ["PPP User", url("ppp_secrets")]);
    echo('<div class="empty"><p class="emptytitle">Pelanggan tidak ditemukan.</p><p><a class="btn" href="' + h(url("ppp_secrets")) + '">Back to PPP User</a></p></div>');
    page_foot();
    return;
  }
  let act = null;
  for (const a of await rq("/ppp/active/print", { ".proplist": "name,service,caller-id,address,uptime" }))
    if ((a.name || "") === user) {
      act = a;
      break;
    }
  const on = !!act;
  const off = s && (s.disabled || "") === "true";
  const st = bill_state(c);
  const nama = (c.nama || "") !== "" ? c.nama : user;
  const stLabel = !s ? "Tidak ada di router" : off ? "Disabled" : on ? "Online" : "Offline";
  const stCls = !s || off ? "" : on ? " up" : " down";
  let llo = String((s && s["last-logged-out"]) || "");
  if (llo.includes("1970")) llo = "";
  const fup = ppp_fup(c);
  const paket = c.paket ? c.paket : (s && s.profile) || "";
  const edit = s ? url("ppp_secrets", { edit: s[".id"] }) : "";
  const bill = st[0] === "none" ? badge("Tanpa tagihan", "warn") : ["late", "grace"].includes(st[0]) ? badge("Belum bayar", "bad") : badge("Lunas", "ok");
  let out = "";
  const row = (label, html) => {
    if (html === "" || html === null || html === undefined) html = '<span class="muted">-</span>';
    out += '<div class="frow"><label>' + h(label) + "</label><div>" + html + "</div></div>";
  };
  const txt = (v) => h(String(v === undefined || v === null ? "" : v));
  const mono = (v) => (String(v === undefined || v === null ? "" : v) === "" ? "" : '<span class="mono">' + h(String(v)) + "</span>");
  const dt = (v) => (String(v || "") === "" ? "" : h(tgl(v)));
  const joined = ppp_joined(c, user);
  const lama = lama_langganan(joined);
  let ifname = on ? "<" + String(act.service || "pppoe").toLowerCase() + "-" + user + ">" : "";
  let ifrow = ifname !== "" ? await rq("/interface/print", { "?name": ifname, ".proplist": "name,rx-byte,tx-byte" }) : [];
  if (on && !ifrow.length) {
    for (const i of await rq("/interface/print", { "?dynamic": "true", ".proplist": "name,rx-byte,tx-byte" }))
      if (String(i.name || "").endsWith("-" + user + ">")) {
        ifrow = [i];
        ifname = i.name;
        break;
      }
  }
  let wa = String(c.hp || "").replace(/\D/g, "");
  if (wa !== "" && wa[0] === "0") wa = "62" + wa.slice(1);
  let sum = 0;
  for (const p of pays) sum += floatv(p.amount);
  let lateInfo = "";
  let soonInfo = "";
  if (is_billed(c) && st[0] === "late") {
    const lateDays = Math.max(0, -days_until(c.due));
    const mo = months_owed(c);
    const owed = mo * floatv(c.tarif);
    const parts = ["Menunggak <b>" + lateDays + " hari</b> sejak jatuh tempo " + h(tgl(c.due))];
    if (owed > 0) parts.push("tagihan " + mo + " bulan <b>" + h(money(owed)) + "</b>");
    parts.push("di " + h(ppp_fup(c)) + " sejak " + h(tgl(iso_date(c))));
    const dz = dis_date(c);
    const s2 = ppp_stage2(c);
    const what = s2 === "dis" ? "secret di-disable" : "pindah ke " + h(String(setting("isolir_profile")));
    if (s2 !== "none") parts.push(today() >= dz ? "<b>" + (s2 === "dis" ? "secret di-disable sejak " : "dipindah ke " + h(String(setting("isolir_profile"))) + " sejak ") + h(tgl(dz)) + "</b>" : what + " " + h(tgl(dz)) + " (" + days_until(dz) + " hari lagi)");
    lateInfo = parts.join(" · ");
  } else if (is_billed(c) && st[0] === "soon") soonInfo = st[1][0].toUpperCase() + st[1].slice(1) + " · jatuh tempo " + h(tgl(c.due));

  await page_head("User Detail", "", ["PPP User", url("ppp_secrets")]);
  echo('<div class="pinfo"><section class="card wide"><div class="phero"><div class="who"><h2><span class="pic" aria-hidden="true">' + h([...nama.trim()][0] || "?").toUpperCase() + "</span>" + h(nama) + " " + bill + "</h2>" + (lateInfo !== "" ? '<p class="plate">' + lateInfo + "</p>" : soonInfo !== "" ? '<p class="psoon">' + soonInfo + "</p>" : '<p class="muted mono">' + h(user) + "</p>") + '</div><div class="pacts">');
  if (edit !== "") echo('<a class="btn small primary" href="' + h(edit) + '">' + icon("edit") + 'Edit</a><a class="btn small" href="' + h(url("ppp_pay", { user })) + '">' + icon("money") + "Bayar</a>");
  if (is_billed(c)) echo('<a class="btn small" target="_blank" href="' + h(url("invoice_print", { user })) + '">' + icon("print") + "Print Invoice</a>");
  if (wa !== "") echo('<a class="btn small" target="_blank" rel="noopener" href="https://wa.me/' + h(wa) + '">' + icon("phone") + "WhatsApp</a>");
  echo('<a class="pclose" href="' + h(url("ppp_secrets")) + '" title="Tutup, kembali ke PPP User" aria-label="Tutup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></a></div></div>');
  echo('<div class="pfacts"><div><small>Tanggal daftar</small><b>' + (joined !== "" ? h(tgl(joined)) : "-") + (joined !== "" && !c.joined ? " " + (edit !== "" ? '<a class="est" href="' + h(edit) + '#f_joined" title="Tanggal ini perkiraan. Klik untuk mengisi Tanggal Daftar yang benar.">(perkiraan · atur)</a>' : '<span class="muted est">(perkiraan)</span>') : "") + "</b></div><div><small>Lama berlangganan</small><b>" + (lama !== "" ? h(lama) : "-") + "</b></div><div><small>Jatuh Tempo</small><b>" + (is_billed(c) ? h(tgl(c.due)) : "-") + "</b></div><div><small>Total dibayar</small><b>" + h(money(sum)) + ' <span class="muted est">(' + pays.length + "x)</span></b></div></div></section>");
  echo('<div class="pcol"><section class="card"><div class="cardhead">' + icon("user") + '<strong>Pelanggan &amp; tagihan</strong></div><div class="cardbody">');
  out = "";
  row("Nomor WhatsApp", wa !== "" ? '<a href="https://wa.me/' + h(wa) + '" target="_blank" rel="noopener">' + h(c.hp) + "</a>" : "");
  row("Alamat", txt(c.alamat || "").replace(/\r?\n/g, "<br>"));
  row("Tarif per bulan", c.tarif ? h(money(c.tarif)) : "");
  const io = iso_off_days(c);
  row("Validity", is_billed(c) ? (io ? io + " hari di isolir, lalu secret di-disable" : '<span class="muted">Tidak diisi (tetap di isolir sampai bayar)</span>') : "");
  echo(out + "</div></section>");
  echo('<section class="card"><div class="cardhead">' + icon("pulse") + "<strong>Pemakaian Bandwidth</strong>" + (ifname !== "" ? '<span class="muted mono small">' + h(ifname) + "</span>" : "") + '</div><div class="cardbody">');
  if (!on) echo('<div class="empty"><p class="emptytitle">Pelanggan sedang offline.</p><p class="muted">Pemakaian diambil dari interface PPP pelanggan dan tampil saat ia terhubung.</p></div>');
  else if (!ifrow.length) echo('<div class="empty"><p class="emptytitle">Interface ' + h(ifname) + " tidak ditemukan di router.</p></div>");
  else {
    const ir = ifrow[0];
    echo('<div class="bwstat"><div class="dl"><small>' + icon("down") + "Download</small><b>" + h(bytes(ir["tx-byte"] || 0)) + '</b></div><div class="ul"><small>' + icon("up") + "Upload</small><b>" + h(bytes(ir["rx-byte"] || 0)) + "</b></div><div><small>" + icon("pulse") + "Total pemakaian</small><b>" + h(bytes(floatv(ir["tx-byte"]) + floatv(ir["rx-byte"]))) + "</b></div><div><small>" + icon("clock") + "Lama terhubung</small><b>" + h(dur_fmt(act.uptime || "")) + '</b></div></div><p class="hint">Pemakaian sesi saat ini dari interface ' + h(ifname) + ", dihitung sejak pelanggan terakhir kali terhubung. Download = data ke pelanggan, Upload = data dari pelanggan.</p>");
  }
  echo("</div></section></div>");
  echo('<section class="card"><div class="cardhead">' + icon("link") + '<strong>Koneksi</strong></div><div class="cardbody">');
  out = "";
  row("Status", '<span class="dot' + stCls + '" role="img" aria-label="' + h(stLabel) + '"></span>' + h(stLabel) + (fup !== "" && s && (s.profile || "") === fup && fup !== paket ? " " + badge("Isolir", "bad") : ""));
  row("Secret", mono(user));
  row("Service", txt(s && s.service));
  row("Main Profile", txt(paket));
  if (((s && s.profile) || "") !== paket) row("Profile di router", txt(s && s.profile));
  row("Isolir Profile", txt(fup));
  row("Local Address", mono(s && s["local-address"]));
  row("Remote Address", mono(s && s["remote-address"]));
  row("IP saat ini", mono(act && act.address));
  row("Caller ID", mono((act && act["caller-id"]) || (s && s["last-caller-id"]) || ""));
  row("Last Logged Out", llo !== "" ? txt(ros_dt(llo)) : "");
  row("Comment", txt(s && s.comment));
  echo(out + "</div></section>");
  echo('<section class="card wide"><div class="cardhead">' + icon("money") + '<strong>Riwayat pembayaran</strong><span class="spacer"></span>' + (pays.length ? '<span class="muted">' + h(money(sum)) + "</span>" : "") + '</div><div class="cardbody">');
  if (!pays.length) echo('<div class="empty"><p class="emptytitle">Belum ada pembayaran.</p></div>');
  else {
    echo('<div class="tablewrap"><table class="grid-t"><thead><tr><th>Nomor</th><th>Tanggal</th><th class="r">Bulan</th><th>Periode</th><th class="r">Jumlah</th><th>Cara bayar</th><th class="nosort"></th></tr></thead><tbody>');
    for (const p of pays) echo('<tr><td class="key mono">' + h(p.no || "") + "</td><td>" + dt(p.paid_at) + '</td><td class="r">' + h(p.months || "") + "</td><td>" + dt(p.from) + " – " + dt(p.to) + '</td><td class="r">' + h(money(p.amount || 0)) + "</td><td>" + h(p.method || "") + '</td><td class="acts">' + (p.id !== undefined ? '<a class="icbtn print" target="_blank" href="' + h(url("invoice_print", { pay: p.id })) + '" title="Print kwitansi ' + h(p.no || "") + '" aria-label="Print kwitansi ' + h(p.no || "") + '">' + icon("print") + "</a>" : "") + "</td></tr>");
    echo("</tbody></table></div>");
  }
  echo("</div></section></div>");
  page_foot();
};
