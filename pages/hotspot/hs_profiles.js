// User Profiles hotspot: Expired Mode, Validity, harga, Lock User
"use strict";
module.exports = async function (C) {
  const { X, h, get, post, url, back, redirect, flash, csrf_field, icon, echo, page_head, page_foot, need_ros, rq, rdo, hs_tpl, hs_onlogin, hs_mon_ensure, hs_meta, hs_profile_health, hs_users_peek, hs_mon_row, money, money_in, setting, opt, row_menu, confirm_btn, dur_secs, intv } = C;
  await need_ros("User Profile");
  const MODES = { none: "None", rem: "Remove", ntf: "Notice", remc: "Remove & Record", ntfc: "Notice & Record" };
  if (X().method === "POST") {
    const act = post("act");
    if (act === "delete") {
      if (await rdo("/ip/hotspot/user/profile/remove", { ".id": post("id") })) flash("Profil " + post("name") + " dihapus.");
      throw redirect("hs_profiles");
    }
    const id = post("id");
    const name = post("name").replace(/ /g, "-").replace(/[^A-Za-z0-9_.-]/g, "");
    const mode = MODES[post("mode")] ? post("mode") : "none";
    let validity = post("validity").toLowerCase();
    if (name === "") {
      flash("Isi Name (huruf, angka, titik, garis).", "err");
      throw back();
    }
    if (mode !== "none" && !/^\d+[dhm]$/.test(validity)) {
      flash("Validity ditulis seperti 30m, 12h, 1d, atau 30d (satu satuan saja).", "err");
      throw back();
    }
    if (mode !== "none" && (await hs_tpl()) === "") {
      flash("Kerangka script on-login tidak ditemukan (berkas inc/bundle/onlogin.txt hilang). Pulihkan berkas panel lalu ulangi.", "err");
      throw back();
    }
    if (mode === "none") validity = "";
    const p = { name, "shared-users": String(Math.max(1, intv(post("shared", "1")))), "rate-limit": post("rate"), "status-autorefresh": "1m", "on-login": await hs_onlogin(name, mode, money_in(post("price")), validity, money_in(post("sprice")), post("lock") === "1") };
    if (post("pool") !== "") p["address-pool"] = post("pool");
    if (post("parent") !== "") p["parent-queue"] = post("parent");
    const ok = id !== "" ? await rdo("/ip/hotspot/user/profile/set", Object.assign({ ".id": id }, p)) : await rdo("/ip/hotspot/user/profile/add", p);
    if (!ok) throw back();
    const [added, miss, fixed] = await hs_mon_ensure();
    flash("Profil " + name + " disimpan." + (added.length ? " Dipasang di router: " + added.join(", ") + "." : "") + (fixed.length ? " Diperbaiki: " + fixed.join(", ") + "." : ""));
    if (miss.length && mode !== "none") flash("Belum ada di router dan belum ada salinannya: " + miss.join(", ") + ". Berkas bawaan inc/bundle/monitor.json tidak ditemukan; pulihkan berkas panel. Tanpa Expire-Monitor voucher tidak akan kedaluwarsa.", "err");
    const row = await rq("/ip/hotspot/user/profile/print", { "?name": name, ".proplist": ".id" });
    throw redirect("hs_profiles", row.length ? { edit: row[0][".id"] } : {});
  }
  const profiles = await rq("/ip/hotspot/user/profile/print");
  const editId = get("edit");
  let form = get("add") !== "";
  let e = null;
  for (const p of profiles)
    if (editId !== "" && p[".id"] === editId) {
      e = p;
      form = true;
    }
  await page_head("User Profile");
  if (form) {
    const m = hs_meta((e && e["on-login"]) || "");
    const pools = await rq("/ip/pool/print", { ".proplist": "name,ranges" });
    const queues = await rq("/queue/simple/print", { ".proplist": "name" });
    const mode = MODES[m.mode] ? m.mode : "none";
    const def = e && (e.default || "") === "true";
    let nv = 0;
    if (e) nv = (await rq("/ip/hotspot/user/print", { "?profile": e.name, ".proplist": ".id" })).length;
    const ev = (k, d = "") => (e && e[k] !== undefined ? e[k] : d);
    echo('<div class="split"><form method="post" class="card" id="hsprof">' + csrf_field() + '<input type="hidden" name="id" value="' + h(ev(".id")) + '">');
    echo('<div class="cardhead">' + icon("pie") + "<strong>" + (e ? "Edit" : "Add") + ' User Profile</strong><span class="spacer"></span>' + (e ? '<a class="hl" href="' + h(url("hs_users", { profile: e.name })) + '">' + icon("ticket") + nv + " voucher</a>" : "") + '<a class="x" href="' + h(url("hs_profiles")) + '" title="Tutup" aria-label="Tutup">&times;</a></div><div class="cardbody">');
    if (e) {
      const mm = await hs_mon_ensure(false);
      const hl = await hs_profile_health(e, !mm[1].length);
      if (hl[0] !== "none") echo('<p class="msg ' + (hl[0] === "ok" ? "ok" : "err") + '"><span>' + h(hl[1]) + "</span></p>");
    }
    echo('<div class="frow"><label for="h_name">Name</label><input id="h_name" name="name" value="' + h(ev("name")) + '" required pattern="[A-Za-z0-9_.\\- ]+" placeholder="3jam-2000" autocomplete="off"' + (def ? " readonly" : "") + "></div>");
    echo('<div class="frow"><label for="h_pool">Address Pool</label><select id="h_pool" name="pool">' + opt("none", ev("address-pool", "none"), "none") + pools.map((x) => opt(x.name, ev("address-pool"))).join("") + "</select></div>");
    echo('<div class="frow"><label for="h_shared">Shared Users</label><input id="h_shared" name="shared" type="number" min="1" value="' + h(ev("shared-users", 1)) + '"></div>');
    echo('<div class="frow"><label for="h_rate">Rate limit [up/down]</label><input id="h_rate" name="rate" value="' + h(ev("rate-limit")) + '" placeholder="2M/5M"></div>');
    echo('<div class="frow"><label for="h_mode">Expired Mode</label><select id="h_mode" name="mode">' + Object.entries(MODES).map(([k, v]) => opt(k, mode, v)).join("") + "</select></div>");
    echo('<div class="frow"><label for="h_val">Validity</label><input id="h_val" name="validity" value="' + h(m.validity) + '" pattern="\\d+[dhmDHM]" placeholder="1d"></div>');
    echo('<div class="frow"><label for="h_price">Price ' + h(setting("currency")) + '</label><input id="h_price" name="price" type="text" inputmode="numeric" data-money value="' + (m.price ? h(money(m.price, false)) : "") + '" placeholder="2.000"></div>');
    echo('<div class="frow"><label for="h_sprice">Selling Price ' + h(setting("currency")) + '</label><input id="h_sprice" name="sprice" type="text" inputmode="numeric" data-money value="' + (m.sprice ? h(money(m.sprice, false)) : "") + '" placeholder="3.000"></div>');
    echo('<div class="frow"><label for="h_lock">Lock User</label><select id="h_lock" name="lock">' + opt("0", m.lock, "Disable") + opt("1", m.lock, "Enable") + "</select></div>");
    echo('<div class="frow"><label for="h_parent">Parent Queue</label><select id="h_parent" name="parent">' + opt("none", ev("parent-queue", "none"), "none") + queues.map((x) => opt(x.name, ev("parent-queue"))).join("") + "</select></div>");
    echo('<div class="btnrow formfoot">' + (e && !def ? '<input type="hidden" name="name_old" value="' + h(e.name) + '"><button class="btn bad" name="act" value="delete" formnovalidate data-confirm="Hapus profil ' + h(e.name) + "?" + (nv ? " Masih ada " + nv + " voucher yang memakai profil ini." : "") + '">' + icon("trash") + "Remove</button>" : "") + '<span class="spacer"></span><button class="btn primary" name="act" value="save">' + icon("save") + "Save</button></div>");
    echo("</div><script>(function(){var md=document.getElementById('h_mode'),v=document.getElementById('h_val');var sync=function(){var on=md.value!=='none';v.disabled=!on;v.required=on;if(!on)v.value=''};md.addEventListener('change',function(){sync();if(md.value!=='none')v.focus()});sync()})();</script></form>");
    echo('<section class="card"><div class="cardhead">' + icon("info") + '<strong>Read Me</strong></div><div class="cardbody"><table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody><tr><td>Expired Mode</td><td>Kontrol untuk user hotspot. Pilihan: Remove, Notice, Remove &amp; Record, Notice &amp; Record.</td></tr><tr><td>Remove</td><td>User dihapus saat masa aktifnya habis.</td></tr><tr><td>Notice</td><td>User tidak dihapus dan mendapat pemberitahuan setelah masa aktif habis (limit-uptime 1s, ditandai Expired).</td></tr><tr><td>Record</td><td>Menyimpan harga setiap user yang login, untuk menghitung total penjualan hotspot di Report.</td></tr><tr><td>Lock User</td><td>Username hanya bisa dipakai di 1 perangkat.</td></tr><tr><td>Format Validity</td><td>[dhm] Contoh: 30d = 30 hari, 12h = 12 jam, 30m = 30 menit.</td></tr></tbody></table>');
    echo('<p class="hint">Saat Save, panel memastikan scheduler Expire Monitor (Expire-Monitor, Reset-Expire-Monitor, Reset-Expire-Monitor-Daily) ada dan utuh di router. Yang terhapus, rusak, atau dinonaktifkan dipasang lagi otomatis. Interval Expire-Monitor bawaannya 1 menit dan bisa diubah langsung di System &gt; Scheduler router; panel tidak mengubahnya.<br>Masa habis hanya diberikan pada voucher yang comment-nya kosong atau diawali vc / up. Voucher dari Generate dan Add User di panel ini sudah otomatis begitu.</p></div></section></div>');
    page_foot();
    return;
  }
  const cnt = {};
  let us = hs_users_peek();
  if (us === null) us = await rq("/ip/hotspot/user/print", { ".proplist": "profile" });
  for (const u of us) cnt[u.profile || ""] = (cnt[u.profile || ""] || 0) + 1;
  const [, miss] = await hs_mon_ensure(false);
  const mon = await hs_mon_row();
  const monOk = !miss.length && mon && (mon.disabled || "") !== "true";
  echo('<section class="card"><div class="cardhead">' + icon("pie") + '<div class="ttl"><strong>User Profile</strong><small>' + profiles.length + ' profil voucher</small></div><div class="tools"><input type="search" class="filter" data-filter="#tbl" placeholder="Cari profil…" aria-label="Cari"><a class="hl icon" href="' + h(url("hs_profiles")) + '" title="Muat ulang" aria-label="Reload Data">' + icon("reload") + '</a><a class="hl pri" href="' + h(url("hs_profiles", { add: 1 })) + '">' + icon("plus") + 'Add Profile</a></div></div><div class="cardbody">');
  if (!monOk) echo('<p class="msg err"><span>Expire Monitor di router belum lengkap' + (miss.length ? " (" + h(miss.join(", ")) + ")" : "") + ": voucher tidak akan kedaluwarsa. Buka salah satu profil ber-Expired Mode lalu Save untuk memasangnya.</span></p>");
  echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th>Name</th><th class="sh">Shared Users</th><th>Rate Limit</th><th>Expired Mode</th><th>Validity</th><th class="r">Price</th><th class="r">Selling Price</th><th class="r">Vouchers</th><th class="nosort"></th></tr></thead><tbody>');
  for (const p of profiles) {
    const m = hs_meta(p["on-login"] || "");
    const def = (p.default || "") === "true";
    const n = cnt[p.name] || 0;
    const hl = await hs_profile_health(p, monOk);
    const rl = String(p["rate-limit"] || "").trim();
    const rlp = rl === "" ? [] : rl.split(/\s+/);
    const modeCls = { rem: "bad", remc: "bad", ntf: "warn", ntfc: "warn" }[m.mode] || "";
    echo('<tr><td class="key"><span class="dot' + (hl[0] === "ok" ? " up" : hl[0] === "bad" ? " down" : "") + '" title="' + h(hl[1]) + '" aria-label="' + h(hl[1]) + '" role="img"></span><a class="namelink" href="' + h(url("hs_profiles", { edit: p[".id"] })) + '">' + h(p.name) + "</a></td>");
    echo('<td class="sh">' + h(p["shared-users"] || "") + '</td><td class="rl" data-v="' + h(rl) + '"' + (rlp.length > 1 ? ' title="' + h(rl) + '"' : "") + ">" + (rlp.length ? '<span class="rl1">' + h(rlp[0]) + "</span>" + (rlp.length > 1 ? '<span class="rl2">…</span>' : "") : "") + "</td>");
    echo("<td>" + (m.mode === "none" ? '<span class="muted">None</span>' : '<span class="badge ' + modeCls + '">' + h(MODES[m.mode]) + "</span>") + '</td><td data-v="' + dur_secs(m.validity) + '">' + h(m.validity) + '</td><td class="r" data-v="' + Math.trunc(m.price) + '">' + (m.price ? money(m.price, false) : "") + '</td><td class="r" data-v="' + Math.trunc(m.sprice) + '">' + (m.sprice ? money(m.sprice, false) : "") + "</td>");
    echo('<td class="r">' + (n ? '<a href="' + h(url("hs_users", { profile: p.name })) + '">' + n + "</a>" : "0") + '</td><td class="acts">' + row_menu(['<a href="' + h(url("hs_profiles", { edit: p[".id"] })) + '">Edit</a>', '<a href="' + h(url("hs_generate", { profile: p.name })) + '">Generate</a>', n ? '<a href="' + h(url("hs_users", { profile: p.name })) + '">User List</a>' : "", def ? "" : confirm_btn("Remove", "delete", { id: p[".id"], name: p.name }, "Hapus profil " + p.name + "?" + (n ? " Masih ada " + n + " voucher yang memakai profil ini." : ""), "danger")]) + "</td></tr>");
  }
  echo('</tbody></table></div><p class="count"><span data-count="#tbl">' + profiles.length + "</span> dari " + profiles.length + ' item</p><div class="legendrow"><span><span class="dot up"></span>Siap dipakai</span><span><span class="dot"></span>Tanpa Expired Mode</span><span><span class="dot down"></span>Bermasalah — buka profil lalu Save untuk memperbaiki (arahkan kursor ke titik untuk detail)</span></div></div></section>');
  page_foot();
};
