// Dashboard: ringkasan router, voucher, PPP, pendapatan, traffic dan log
"use strict";
module.exports = async function (C) {
  const { h, url, icon, echo, page_head, page_foot, need_ros, routers, rq_many, sales_sync_bg, sales, payments, customers, bill_state, months_owed, money, bytes, tgl, ros_date, dur_secs, dur_fmt, date, today, opt, numberFormat, floatv, intv } = C;
  if (!Object.keys(routers()).length) throw C.redirect("routers");
  await need_ros("Dashboard");
  const B = await rq_many({
    res: ["/system/resource/print", {}], clk: ["/system/clock/print", {}], rb: ["/system/routerboard/print", {}], id: ["/system/identity/print", {}],
    if: ["/interface/print", { ".proplist": "name,running,type" }],
    hu: ["/ip/hotspot/user/print", { "count-only": "" }], ha: ["/ip/hotspot/active/print", { "count-only": "" }],
    ps: ["/ppp/secret/print", { "count-only": "" }], pa: ["/ppp/active/print", { "count-only": "" }],
  });
  const res = B.res[0] || {};
  const clk = B.clk[0] || {};
  const rb = B.rb[0] || {};
  const ifaces = B.if;
  const hsUsers = Math.max(0, B.hu - 1);
  const hsActive = B.ha;
  const pppAll = B.ps;
  const pppActive = B.pa;
  sales_sync_bg();
  const t0 = today();
  const ym = date("Y-m");
  let vDay = 0, vMon = 0, pDay = 0, pMon = 0, nDay = 0, nMon = 0;
  for (const s of sales(ym)) {
    vMon += floatv(s.a);
    nMon++;
    if (s.d === t0) {
      vDay += floatv(s.a);
      nDay++;
    }
  }
  for (const i of Object.values(payments())) {
    if (String(i.paid_at).slice(0, 7) === ym) {
      pMon += floatv(i.amount);
      nMon++;
    }
    if (i.paid_at === t0) {
      pDay += floatv(i.amount);
      nDay++;
    }
  }
  let late = 0, soon = 0, lateSum = 0;
  for (const c of Object.values(customers())) {
    const st = bill_state(c);
    if (st[0] === "late") {
      late++;
      lateSum += floatv(c.tarif) * months_owed(c);
    } else if (st[0] === "soon" || st[0] === "grace") soon++;
  }
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const tm = floatv(res["total-memory"]), fm = floatv(res["free-memory"]);
  const th = floatv(res["total-hdd-space"]), fh = floatv(res["free-hdd-space"]);
  const cpu = intv(res["cpu-load"]);
  const um = Math.max(0, tm - fm), uh = Math.max(0, th - fh);
  const lvl = (p) => (p >= 90 ? " r" : p >= 70 ? " o" : " g");
  const nf = (n) => numberFormat(n, 0, ",", ".");
  const clockSecs = dur_secs(String(clk.time || "").replace(/^(\d+):(\d+):(\d+).*$/, "$1h$2m$3s"));
  const ident = String((B.id[0] && B.id[0].name) || "");
  await page_head("Dashboard");
  echo('<div class="dhero card"><div class="dh-main"><span class="dh-ic">' + icon("router") + "</span><div><small>Router</small><b>" + h(ident || (C.router() || {}).name || "-") + '</b><span class="muted">' + h(rb.model || res["board-name"] || res.platform || "") + " · RouterOS " + h(res.version || "-") + "</span></div></div>");
  echo('<div class="dh-facts"><div><small>Tanggal</small><b>' + h(tgl(ros_date(clk.date || "")) || clk.date || "-") + '</b></div><div><small>Jam</small><b data-tick="clock" data-secs="' + clockSecs + '">' + h(String(clk.time || "-").slice(0, 8)) + '</b></div><div><small>Uptime</small><b data-tick="up" data-secs="' + dur_secs(res.uptime || "") + '">' + h(dur_fmt(res.uptime || "") || "-") + "</b></div><div><small>Zona waktu</small><b>" + h(clk["time-zone-name"] || "-") + "</b></div></div>");
  echo('<div class="dh-res"><div><small>CPU ' + cpu + '%</small><span class="pbar' + lvl(cpu) + '"><i style="width:' + cpu + '%"></i></span><em>' + h(String((res["cpu-count"] || "") + " × " + (res.cpu || "")).replace(/^ × | × $/g, "")) + "</em></div>");
  echo("<div><small>Memory " + pct(um, tm) + '%</small><span class="pbar' + lvl(pct(um, tm)) + '" title="Bebas ' + h(bytes(fm)) + '"><i style="width:' + pct(um, tm) + '%"></i></span><em>' + bytes(um) + " / " + bytes(tm) + "</em></div>");
  echo("<div><small>HDD " + pct(uh, th) + '%</small><span class="pbar' + lvl(pct(uh, th)) + '" title="Bebas ' + h(bytes(fh)) + '"><i style="width:' + pct(uh, th) + '%"></i></span><em>' + bytes(uh) + " / " + bytes(th) + "</em></div></div></div>");
  echo('<div class="stats">');
  echo('<a class="stat blue" href="' + h(url("hs_users")) + '"><span class="si">' + icon("wifi") + "</span><div><small>Voucher Hotspot</small><b>" + nf(hsUsers) + "</b><em>" + nf(hsActive) + " online</em></div></a>");
  echo('<a class="stat green" href="' + h(url("ppp_secrets")) + '"><span class="si">' + icon("ppp") + "</span><div><small>Pelanggan PPP</small><b>" + nf(pppAll) + "</b><em>" + nf(pppActive) + " online · " + nf(Math.max(0, pppAll - pppActive)) + " offline</em></div></a>");
  echo('<a class="stat red" href="' + h(url("ppp_secrets", { f: "late" })) + '"><span class="si">' + icon("money") + "</span><div><small>Menunggak</small><b>" + nf(late) + "</b><em>" + money(lateSum) + " · " + nf(soon) + " segera</em></div></a>");
  echo('<a class="stat amber" href="' + h(url("report")) + '"><span class="si">' + icon("report") + "</span><div><small>Pendapatan bulan ini</small><b>" + money(vMon + pMon) + "</b><em>Hari ini " + money(vDay + pDay) + " · " + nDay + " transaksi</em></div></a>");
  echo("</div>");
  echo('<div class="dashmain"><section class="card"><div class="cardhead">' + icon("pulse") + '<strong>Traffic</strong><span class="spacer"></span><span class="legend"><b class="tx"></b>Tx <span id="txv">–</span><b class="rx"></b>Rx <span id="rxv">–</span></span><select id="iface" aria-label="Interface">' + ifaces.map((i) => opt(i.name, (ifaces[0] && ifaces[0].name) || "")).join("") + '</select></div><div class="cardbody"><canvas id="traffic" height="260" data-url="' + h(url("api", { a: "traffic" })) + '"></canvas></div></section>');
  echo('<section class="card"><div class="cardhead">' + icon("money") + '<strong>Income</strong><span class="spacer"></span><a class="hl" href="' + h(url("report")) + '">Report</a></div><div class="cardbody"><table class="kv income"><tbody><tr><th>Hari ini <span class="muted">[' + nDay + "]</span></th><td>" + money(vDay + pDay) + '</td></tr><tr><th>Bulan ini <span class="muted">[' + nMon + "]</span></th><td>" + money(vMon + pMon) + "</td></tr><tr><th>Voucher</th><td>" + money(vMon) + "</td></tr><tr><th>PPP</th><td>" + money(pMon) + '</td></tr><tr><th>Tunggakan</th><td class="bad">' + money(lateSum) + "</td></tr></tbody></table></div>");
  echo('<div class="cardhead">' + icon("log") + '<strong>Hotspot &amp; PPP Log</strong><span class="spacer"></span><a class="hl" href="' + h(url("log")) + '">View All</a></div><div class="cardbody"><table class="grid-t" id="dlog" data-url="' + h(url("api", { a: "log" })) + '"><thead><tr><th>Time</th><th>Messages</th></tr></thead><tbody><tr><td colspan="2" class="muted">Memuat…</td></tr></tbody></table></div></section></div>');
  page_foot();
};
