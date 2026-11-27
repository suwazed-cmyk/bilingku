// Daftar dari router: Hotspot Active, Hosts, IP Bindings, Cookies
"use strict";
module.exports = async function (C) {
  const { X, h, get, post, url, back, redirect, flash, csrf_field, icon, echo, page_head, page_foot, need_ros, rq, rdo, rremove, opt, badge, bytes, dur_secs, dur_fmt, row_menu, floatv } = C;
  const SPEC = {
    hs_active: ["Hotspot Active", "/ip/hotspot/active", "Remove", "link", { user: "User", server: "Server", address: "Address", "mac-address": "MAC Address", uptime: "Uptime", "session-time-left": "Time Left", "bytes-in": "Bytes In", "bytes-out": "Bytes Out", "login-by": "Login By", comment: "Comment" }],
    hs_hosts: ["Hosts", "/ip/hotspot/host", "Remove", "router", { "mac-address": "MAC Address", address: "Address", "to-address": "To Address", server: "Server", authorized: "Authorized", bypassed: "Bypassed", comment: "Comment" }],
    hs_bindings: ["IP Bindings", "/ip/hotspot/ip-binding", "Remove", "lock", { "mac-address": "MAC Address", address: "Address", "to-address": "To Address", server: "Server", type: "Type", comment: "Comment" }],
    hs_cookies: ["Cookies", "/ip/hotspot/cookie", "Remove", "clock", { user: "User", "mac-address": "MAC Address", domain: "Domain", "expires-in": "Expires In" }],
  };
  const s = get("s");
  if (!SPEC[s]) throw redirect("dashboard");
  const [title, path, verb, ic, cols] = SPEC[s];
  await need_ros(title);
  if (X().method === "POST") {
    const act = post("act");
    if (act === "add" && s === "hs_bindings") {
      const p = { type: ["regular", "bypassed", "blocked"].includes(post("type")) ? post("type") : "bypassed" };
      for (const [k, f] of Object.entries({ "mac-address": "mac", address: "address", "to-address": "to", comment: "comment" })) if (post(f) !== "") p[k] = post(f);
      if (post("server") !== "") p.server = post("server");
      if (post("mac") === "" && post("address") === "") {
        flash("Isi MAC Address atau Address.", "err");
        throw back();
      }
      if (await rdo(path + "/add", p)) flash("IP binding ditambahkan.");
    } else if (act === "bind" && s === "hs_hosts") {
      const hh = await rq("/ip/hotspot/host/print", { "?.id": post("id"), ".proplist": "mac-address,address,server" });
      const blk = post("to") === "blocked";
      if (hh.length && (await rdo("/ip/hotspot/ip-binding/add", { "mac-address": hh[0]["mac-address"], type: blk ? "blocked" : "bypassed", comment: blk ? "blocked dari Hosts" : "bypass dari Hosts" }))) flash(hh[0]["mac-address"] + " dijadikan IP binding " + (blk ? "blocked" : "bypassed") + ".");
    } else if (act === "type" && s === "hs_bindings") {
      if (["regular", "bypassed", "blocked"].includes(post("to")) && (await rdo(path + "/set", { ".id": post("id"), type: post("to") }))) flash("Type diubah ke " + post("to") + ".");
    } else {
      let ids = Array.isArray(X().POST.ids) ? X().POST.ids.map(String) : [];
      if (post("id") !== "") ids = [post("id")];
      const n = await rremove(path, ids);
      if (n) flash(n + " item " + (s === "hs_active" ? "diputuskan dari Hotspot Active" : "dihapus") + ".");
    }
    throw back();
  }
  const rows = await rq(path + "/print", { ".proplist": ".id," + Object.keys(cols).join(",") + (s === "hs_bindings" ? ",disabled" : "") });
  const servers = s === "hs_bindings" ? await rq("/ip/hotspot/print", { ".proplist": "name" }) : [];
  const tot = rows.length;
  let uid = null;
  await page_head(title);
  if (s === "hs_bindings") {
    echo('<details class="card addcard"' + (rows.length ? "" : " open") + '><summary class="cardhead">' + icon("plus") + '<strong>Add IP Binding</strong><span class="spacer"></span>' + icon("chev") + '</summary><div class="cardbody"><form method="post" class="addrow">' + csrf_field() + '<input type="hidden" name="act" value="add">');
    echo('<input name="mac" placeholder="MAC Address" aria-label="MAC Address" pattern="[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}" autocomplete="off"><input name="address" placeholder="Address (opsional)" aria-label="Address" autocomplete="off"><input name="to" placeholder="To Address (opsional)" aria-label="To Address" autocomplete="off">');
    echo('<select name="server" aria-label="Server"><option value="">all</option>' + servers.map((x) => opt(x.name, "")).join("") + '</select><select name="type" aria-label="Type"><option value="bypassed">bypassed</option><option value="regular">regular</option><option value="blocked">blocked</option></select><input name="comment" placeholder="Comment" aria-label="Comment" autocomplete="off"><button class="btn primary">' + icon("save") + "Save</button></form></div></details>");
  }
  echo('<form method="post" id="ls-form">' + csrf_field() + '<input type="hidden" name="act" value="delete"><input type="hidden" name="to" value=""><section class="card">');
  const sub = { hs_active: "user yang sedang login", hs_hosts: "perangkat yang terlihat hotspot", hs_bindings: "aturan bypass / blokir", hs_cookies: "login otomatis tersimpan" }[s];
  echo('<div class="cardhead">' + icon(ic) + '<div class="ttl"><strong>' + h(title) + "</strong><small>" + tot + " " + sub + '</small></div><div class="tools">');
  echo('<button class="btn small bad" id="ls-bulk" onclick="this.form.act.value=\'delete\'" data-confirm="' + (s === "hs_active" ? "Putuskan koneksi semua yang dicentang?" : "Hapus semua yang dicentang?") + '">' + verb + " 0</button>" + (rows.length ? '<input type="search" class="filter" placeholder="Cari…" data-filter="#tbl" aria-label="Filter">' : "") + '<a class="hl icon" href="' + h(url("list", { s })) + '" title="Muat ulang" aria-label="Reload Data">' + icon("reload") + '</a></div></div><div class="cardbody">');
  if (!rows.length) echo('<div class="empty"><p class="emptytitle">' + (s === "hs_active" ? "Belum ada user yang terhubung." : "Belum ada data.") + "</p></div>");
  else {
    const two = (b, sm, mono) => '<td class="two"><b' + (mono ? ' class="mono"' : "") + ">" + (b || '<span class="dash">—</span>') + "</b>" + (sm ? "<small" + (mono ? ' class="mono"' : "") + ' title="' + h(sm.replace(/<[^>]+>/g, "")) + '">' + sm + "</small>" : "") + "</td>";
    const use = (bi, bo) => '<td class="use" data-v="' + (floatv(bi) + floatv(bo)) + '"><span><i>↓</i>' + bytes(bo) + "</span><span><i>↑</i>" + bytes(bi) + "</span></td>";
    const yes = (v, t, cls) => (v === "true" ? badge(t, cls) + " " : "");
    const cmTd = (c) => '<td class="cm"><span class="ell" title="' + h(c || "") + '">' + (c ? h(c) : '<span class="dash">—</span>') + "</span></td>";
    const head = {
      hs_active: ["User", "Alamat", "Uptime", "Pemakaian", "Login"],
      hs_hosts: ["Perangkat", "To Address", "Server", "Status", "Comment"],
      hs_bindings: ["Perangkat", "To Address", "Server", "Type", "Comment"],
      hs_cookies: ["User", "MAC Address", "Domain", "Berlaku"],
    }[s];
    echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th class="chk nosort"><input type="checkbox" data-checkall aria-label="Pilih semua"></th>' + head.map((x) => "<th" + (x === "Pemakaian" || x === "Uptime" ? ' class="r"' : "") + ">" + x + "</th>").join("") + '<th class="nosort"></th></tr></thead><tbody>');
    if (s === "hs_active") {
      uid = {};
      for (const u of await rq("/ip/hotspot/user/print", { ".proplist": ".id,name" })) uid[u.name] = u[".id"];
    }
    for (const r of rows) {
      const off = (r.disabled || "") === "true";
      let o = "<tr" + (off ? ' class="off"' : "") + '><td class="chk"><input type="checkbox" name="ids[]" value="' + h(r[".id"]) + '" aria-label="Pilih"></td>';
      if (s === "hs_active") {
        const lnk = uid[r.user] !== undefined ? url("hs_generate", { id: uid[r.user] }) : url("hs_generate", { one: 1 });
        o += two('<a class="namelink" href="' + h(lnk) + '">' + h(r.user) + "</a>", h(r.comment || ""), false);
        o += two(h(r.address), h(r["mac-address"]), true);
        o += '<td class="two r" data-v="' + dur_secs(r.uptime) + '"><b class="mono">' + h(dur_fmt(r.uptime)) + "</b>" + (r["session-time-left"] ? "<small>sisa " + h(dur_fmt(r["session-time-left"])) + "</small>" : "") + "</td>";
        o += use(r["bytes-in"], r["bytes-out"]);
        o += '<td><span class="badge' + (String(r["login-by"]).includes("cookie") ? "" : " info") + '">' + h(r["login-by"] || "-") + "</span>" + (r.server && r.server !== "all" ? '<small class="muted"> ' + h(r.server) + "</small>" : "") + "</td>";
        o += '<td class="acts"><button class="icbtn bad" name="id" value="' + h(r[".id"]) + '" title="Putuskan" aria-label="Putuskan ' + h(r.user || "") + '" data-confirm="Putuskan koneksi ' + h(r.user || "") + '?" onclick="this.form.act.value=\'delete\'">' + icon("out") + "</button></td></tr>";
        echo(o);
        continue;
      }
      if (s === "hs_cookies") {
        o += '<td class="key">' + h(r.user || "") + '</td><td class="mono">' + h(r["mac-address"] || "") + "</td><td>" + (h(r.domain || "") || '<span class="dash">—</span>') + '</td><td class="mono" data-v="' + dur_secs(r["expires-in"]) + '">' + h(dur_fmt(r["expires-in"] || "")) + "</td>";
      } else {
        o += two(h(r["mac-address"] || r.address || ""), r["mac-address"] && r.address ? h(r.address) : "", true);
        o += '<td class="mono">' + (h(r["to-address"] || "") || '<span class="dash">—</span>') + "</td><td>" + h(r.server || "all") + "</td>";
        if (s === "hs_hosts") o += "<td>" + (yes(r.authorized, "Login", "ok") + yes(r.bypassed, "Bypass", "info") || '<span class="badge">Belum login</span>') + "</td>";
        else o += "<td>" + badge(r.type || "regular", r.type === "blocked" ? "bad" : r.type === "bypassed" ? "ok" : "") + "</td>";
        o += cmTd(r.comment);
      }
      const btn = (label, act, to, ask = "", cls = "") => "<button" + (cls !== "" ? ' class="' + cls + '"' : "") + ' name="id" value="' + h(r[".id"]) + '"' + (ask !== "" ? ' data-confirm="' + h(ask) + '"' : "") + " onclick=\"this.form.act.value='" + act + "';this.form.to.value='" + to + "'\">" + h(label) + "</button>";
      const items = [];
      if (s === "hs_hosts" && r["mac-address"]) {
        items.push(btn("Jadikan bypass", "bind", "bypassed", "Buat IP binding bypassed untuk " + r["mac-address"] + "? Perangkat ini bisa internet tanpa login."));
        items.push(btn("Blokir", "bind", "blocked", "Blokir " + r["mac-address"] + " lewat IP binding?"));
      }
      if (s === "hs_bindings") for (const t of ["regular", "bypassed", "blocked"]) if ((r.type || "") !== t) items.push(btn("Ubah ke " + t, "type", t));
      items.push(btn("Hapus", "delete", "", "Hapus item ini?", "danger"));
      echo(o + '<td class="acts">' + row_menu(items) + "</td></tr>");
    }
    echo('</tbody></table></div><p class="count"><span data-count="#tbl">' + tot + "</span> dari " + tot + " item</p>");
  }
  echo("</div></section></form><script>(function(){var f=document.getElementById('ls-form'),b=document.getElementById('ls-bulk');if(!f||!b)return;var u=function(){setTimeout(function(){var n=f.querySelectorAll('tbody input[type=checkbox]:checked').length;b.classList.toggle('on',n>0);b.textContent=" + JSON.stringify(verb) + "+' '+n},0)};f.addEventListener('change',u);f.addEventListener('click',u)})();</script>");
  page_foot();
};
