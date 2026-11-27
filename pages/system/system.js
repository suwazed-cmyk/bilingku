// Menu System: Scheduler, Netwatch, dan Reboot router (?s=scheduler | netwatch | reboot)
"use strict";
module.exports = async function (C) {
  const { X, h, get, post, url, back, redirect, flash, csrf_field, icon, echo, page_head, page_foot, need_ros, ros, rq, rdo, rq_many, router, dur_fmt, badge, row_menu, confirm_btn, ppp_sched_name, ppp_sched_ok, intv } = C;
  const SP = { scheduler: ["Scheduler", "/system/scheduler", "clock"], netwatch: ["Netwatch", "/tool/netwatch", "pulse"], reboot: ["Reboot", "", "reload"] };
  let s = get("s");
  if (!SP[s]) s = "scheduler";
  const [title, path, ic] = SP[s];
  await need_ros(title);
  const own = (name) => {
    const n = String(name);
    return n === ppp_sched_name() || n === ppp_sched_name() + "-boot" || n === "Expire-Monitor" || n === "Reset-Expire-Monitor" || n === "Reset-Expire-Monitor-Daily" || n.startsWith("iso-");
  };
  if (X().method === "POST") {
    const act = post("act");
    const id = post("id");
    if (s === "reboot") {
      if (act === "reboot") {
        const a = await ros();
        if (!a) {
          flash("Router tidak terhubung, perintah reboot tidak terkirim.", "err");
          throw back();
        }
        try {
          await Promise.race([a.comm("/system/reboot"), new Promise((r) => setTimeout(r, 3000))]);
        } catch (e) {
          /* router langsung memutus koneksi */
        }
        a.close();
        flash("Perintah reboot terkirim ke " + ((router() || {}).name || "router") + ". Router menyala ulang; tunggu 1–2 menit lalu muat ulang halaman.");
      }
      throw redirect("system", { s: "reboot" });
    }
    if (act === "toggle" && id !== "") {
      const off = post("to") === "disable";
      if (await rdo(path + "/" + (off ? "disable" : "enable"), { ".id": id })) flash(title + (off ? " dinonaktifkan." : " diaktifkan."));
      if (s === "scheduler") await ppp_sched_ok(true);
    } else if (act === "delete" && id !== "") {
      if (await rdo(path + "/remove", { ".id": id })) flash(title + " dihapus.");
      if (s === "scheduler") await ppp_sched_ok(true);
    }
    throw redirect("system", { s });
  }
  if (s === "reboot") {
    const Bq = await rq_many({ res: ["/system/resource/print", {}], id: ["/system/identity/print", {}], ha: ["/ip/hotspot/active/print", { "count-only": "" }], pa: ["/ppp/active/print", { "count-only": "" }] });
    const res = Bq.res.length ? Bq.res[0] : {};
    const rname = String((router() || {}).name || "router");
    const ident = String((Bq.id[0] && Bq.id[0].name) || "");
    await page_head("Reboot");
    echo('<div class="split"><form method="post" class="card">' + csrf_field() + '<input type="hidden" name="act" value="reboot"><div class="cardhead">' + icon("reload") + '<strong>Reboot</strong></div><div class="cardbody"><table class="kv"><tbody>');
    echo("<tr><th>Router</th><td>" + h(rname + (ident !== "" && ident !== rname ? " (" + ident + ")" : "")) + "</td></tr><tr><th>Uptime</th><td>" + h(dur_fmt(res.uptime || "") || "-") + "</td></tr><tr><th>RouterOS</th><td>" + h(res.version || "-") + "</td></tr><tr><th>Hotspot Active</th><td>" + intv(Bq.ha) + " user</td></tr><tr><th>PPP Active</th><td>" + intv(Bq.pa) + " user</td></tr></tbody></table>");
    echo('<div class="btnrow formfoot"><span class="spacer"></span><a class="btn" href="' + h(url("dashboard")) + '">Batal</a><button class="btn bad" data-ok="Ya, reboot" data-confirm="Reboot router ' + h(rname) + " sekarang?&#10;" + intv(Bq.ha) + " user hotspot dan " + intv(Bq.pa) + ' PPP yang sedang terhubung akan terputus sampai router menyala lagi.">' + icon("reload") + "Reboot</button></div></div></form>");
    echo('<section class="card"><div class="cardhead">' + icon("info") + '<strong>Read Me</strong></div><div class="cardbody"><table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody><tr><td>Reboot</td><td>Router dimatikan lalu menyala lagi. Semua pelanggan hotspot dan PPPoE terputus selama itu, biasanya 1–2 menit.</td></tr><tr><td>Waktu yang tepat</td><td>Lakukan saat sepi pemakaian. Jumlah yang sedang terhubung terlihat di Hotspot Active dan PPP Active.</td></tr><tr><td>Setelah reboot</td><td>Panel akan menampilkan router tidak terhubung sampai router menyala. Tunggu sebentar lalu muat ulang halaman.</td></tr></tbody></table></div></section></div>');
    page_foot();
    return;
  }
  const props = s === "scheduler" ? ".id,name,start-date,start-time,interval,next-run,run-count,disabled" : ".id,host,interval,timeout,status,since,comment,disabled";
  const rows = await rq(path + "/print", { ".proplist": props });
  const cols = s === "scheduler" ? { name: "Name", "start-date": "Start Date", "start-time": "Start Time", interval: "Interval", "next-run": "Next Run", "run-count": "Run Count" } : { host: "Host", status: "Status", since: "Since", interval: "Interval", timeout: "Timeout", comment: "Comment" };
  await page_head(title);
  echo('<section class="card"><div class="cardhead">' + icon(ic) + "<strong>" + h(title) + '</strong><span class="muted">' + rows.length + ' item</span><span class="spacer"></span>' + (rows.length ? '<input type="search" class="filter" placeholder="Search" data-filter="#tbl" aria-label="Filter">' : "") + '<a class="hl" href="' + h(url("system", { s })) + '" title="Reload Data" aria-label="Reload Data">' + icon("reload") + '</a></div><div class="cardbody">');
  if (!rows.length) echo('<div class="empty"><p class="emptytitle">Belum ada ' + h(title.toLowerCase()) + " di router ini.</p></div>");
  else {
    echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th class="dotc nosort"></th>' + Object.values(cols).map((l) => "<th>" + h(l) + "</th>").join("") + '<th class="nosort"></th></tr></thead><tbody>');
    for (const r of rows) {
      const off = (r.disabled || "") === "true";
      const label = String(r[s === "scheduler" ? "name" : "host"] || "");
      const mine = s === "scheduler" && own(label);
      const st = off ? "Disabled" : "Enabled";
      let o = '<tr><td class="dotc"><span class="dot ' + (off ? "down" : "up") + '" title="' + st + '" aria-label="' + st + '" role="img"></span></td>';
      for (const k of Object.keys(cols)) {
        const v = String(r[k] || "");
        if (k === "name" || k === "host") o += '<td class="key">' + h(v) + (mine ? " " + badge("Panel", "warn") : "") + "</td>";
        else if (k === "status") o += "<td>" + (off || v === "" ? '<span class="muted">-</span>' : badge(v[0].toUpperCase() + v.slice(1), v === "up" ? "ok" : v === "down" ? "bad" : "")) + "</td>";
        else if (k === "comment" || k === "run-count") o += "<td>" + (v !== "" ? h(v) : '<span class="muted">-</span>') + "</td>";
        else o += '<td class="mono">' + (v !== "" ? h(v) : '<span class="muted">-</span>') + "</td>";
      }
      const warn = mine ? "Scheduler " + label + " dipakai panel (isolir PPP / masa aktif voucher).\n" : "";
      o += '<td class="acts">' + row_menu([off ? confirm_btn("Enable", "toggle", { id: r[".id"], to: "enable" }) : confirm_btn("Disable", "toggle", { id: r[".id"], to: "disable" }, warn + "Nonaktifkan " + label + "?"), confirm_btn("Remove", "delete", { id: r[".id"] }, warn + "Hapus " + label + " dari router?", "danger")]) + "</td></tr>";
      echo(o);
    }
    echo("</tbody></table></div>");
  }
  echo("</div></section>");
  page_foot();
};
