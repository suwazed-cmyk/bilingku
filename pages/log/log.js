// Log router: bawaan menampilkan log Hotspot & PPP sekaligus
"use strict";
module.exports = async function (C) {
  const { h, get, url, icon, echo, page_head, page_foot, need_ros, rq, badge, ros_dt } = C;
  await need_ros("Log");
  const T = { hspp: "Hotspot & PPP", hotspot: "Hotspot", ppp: "PPP", all: "Semua topik" };
  const topic = T[get("t")] ? get("t") : "hspp";
  const kind = (tp) => {
    tp = String(tp || "");
    if (tp.includes("hotspot")) return "hotspot";
    if (["ppp", "pppoe", "l2tp", "pptp", "sstp"].some((x) => tp.includes(x))) return "ppp";
    return "other";
  };
  const split = (msg, k) => {
    msg = String(msg || "");
    let m;
    if (k === "hotspot" && (m = /^(?:->:\s*)?(\S+)\s+\(([^)]*)\):\s*(.*)$/.exec(msg))) return [m[1], m[2], m[3]];
    if (k === "ppp" && (m = /^<(?:pppoe|l2tp|pptp|sstp|ovpn)-([^>]+)>:\s*(.*)$/.exec(msg))) return [m[1], "", m[2]];
    if (k === "ppp" && (m = /^(\S+) logged (in|out)(?:, (\S+))?/.exec(msg))) return [m[1], m[3] || "", "logged " + m[2]];
    return ["", "", msg];
  };
  let rows = [];
  const cnt = { hotspot: 0, ppp: 0, other: 0 };
  for (const l of await rq("/log/print", { ".proplist": "time,topics,message" })) {
    const k = kind(l.topics);
    cnt[k]++;
    if (topic === "hspp" && k === "other") continue;
    if ((topic === "hotspot" || topic === "ppp") && k !== topic) continue;
    l.k = k;
    rows.push(l);
  }
  rows = rows.reverse().slice(0, 500);
  await page_head("Log");
  echo('<section class="card"><div class="cardhead">' + icon("log") + '<strong>Log</strong><span class="muted hscnt">' + rows.length + ' total</span><span class="spacer"></span><a class="hl" href="' + h(url("log", topic === "hspp" ? {} : { t: topic })) + '" title="Reload Data" aria-label="Reload Data">' + icon("reload") + '</a></div><div class="cardbody"><div class="hsfilter">' + (rows.length ? '<input type="search" class="filter" placeholder="Search log…" data-filter="#tbl" aria-label="Search">' : "") + '<div class="seg">');
  for (const [k, v] of Object.entries(T)) echo('<a class="' + (k === topic ? "on" : "") + '" href="' + h(url("log", k === "hspp" ? {} : { t: k })) + '">' + h(v) + "</a>");
  echo("</div></div>");
  if (!rows.length) echo('<div class="empty"><p class="emptytitle">Belum ada log ' + h(T[topic]) + ' di router.</p><p class="muted">Bila log hotspot atau PPP tidak pernah muncul, aktifkan lewat terminal router:<br><code>/system logging add topics=hotspot,info action=memory</code><br><code>/system logging add topics=pppoe,ppp,info action=memory</code></p></div>');
  else {
    echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th>Time</th><th>Topik</th><th>User</th><th>IP</th><th>Messages</th></tr></thead><tbody>');
    for (const l of rows) {
      const [u, ip, msg] = split(l.message, l.k);
      const bad = /fail|error|invalid|wrong|denied|terminat|disconnect|logged out|timeout/i.test(msg);
      const to = l.k === "hotspot" ? url("hs_users", { q: u }) : url("ppp_user", { user: u });
      echo('<tr><td class="mono nowrap" data-v="' + h(l.time || "") + '">' + h(ros_dt(l.time || "")) + "</td><td>" + (l.k === "hotspot" ? badge("Hotspot", "ok") : l.k === "ppp" ? badge("PPP", "info") : '<span class="muted">' + h(l.topics || "") + "</span>") + '</td><td class="key">' + (u !== "" ? '<a class="namelink" href="' + h(to) + '">' + h(u) + "</a>" : "") + '</td><td class="mono">' + h(ip) + "</td><td" + (bad ? ' class="bad"' : "") + ">" + h(msg) + "</td></tr>");
    }
    echo('</tbody></table></div><p class="count" hidden><span data-count="#tbl">' + rows.length + "</span> dari " + rows.length + " item</p>");
  }
  echo("</div></section>");
  page_foot();
};
