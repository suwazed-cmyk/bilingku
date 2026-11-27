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
  echo('<div class="cardhead">' + icon(ic) + "<strong>" + h(title) + '</strong><span class="muted hscnt">' + tot + ' total</span><a class="hl" href="' + h(url("list", { s })) + '" title="Reload Data" aria-label="Reload Data">' + icon("reload") + '</a><span class="spacer"></span>');
  echo('<button class="btn small bad" id="ls-bulk" onclick="this.form.act.value=\'delete\'" data-confirm="' + (s === "hs_active" ? "Putuskan koneksi semua yang dicentang?" : "Hapus semua yang dicentang?") + '">' + verb + " 0</button>" + (rows.length ? '<input type="search" class="filter" placeholder="Search" data-filter="#tbl" aria-label="Filter">' : "") + '</div><div class="cardbody">');
  if (!rows.length) echo('<div class="empty"><p class="emptytitle">' + (s === "hs_active" ? "Belum ada user yang terhubung." : "Belum ada data.") + "</p></div>");
  else {
    echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th class="chk nosort"><input type="checkbox" data-checkall aria-label="Pilih semua"></th>');
    for (const [k, l] of Object.entries(cols)) echo("<th" + (k.startsWith("bytes") ? ' class="r"' : "") + ">" + h(l) + "</th>");
    echo('<th class="nosort"></th></tr></thead><tbody>');
    for (const r of rows) {
      const off = (r.disabled || "") === "true";
      echo("<tr" + (off ? ' class="off"' : "") + '><td class="chk"><input type="checkbox" name="ids[]" value="' + h(r[".id"]) + '" aria-label="Pilih"></td>');
      let first = true;
      for (const k of Object.keys(cols)) {
        const v = r[k] !== undefined ? r[k] : "";
        if (first) {
          first = false;
          if (k === "user" && uid === null) {
            uid = {};
            for (const u of await rq("/ip/hotspot/user/print", { ".proplist": ".id,name" })) uid[u.name] = u[".id"];
          }
          const lnk = k === "user" ? (uid[v] !== undefined ? url("hs_generate", { id: uid[v] }) : url("hs_generate", { one: 1 })) : "";
          echo('<td class="key' + (k === "mac-address" ? " mono" : "") + '">' + (lnk !== "" && v !== "" ? '<a class="namelink" href="' + h(lnk) + '">' + h(v) + "</a>" : h(v)) + "</td>");
          continue;
        }
        if (k.startsWith("bytes")) echo('<td class="r" data-v="' + floatv(v) + '">' + bytes(v) + "</td>");
        else if (["uptime", "session-time-left", "expires-in"].includes(k)) echo('<td class="mono" data-v="' + dur_secs(v) + '">' + h(dur_fmt(v)) + "</td>");
        else if (v === "true" || v === "false") echo("<td>" + (v === "true" ? badge("Yes", "ok") : '<span class="muted">No</span>') + "</td>");
        else if (k === "type") echo("<td>" + badge(v, v === "blocked" ? "bad" : v === "bypassed" ? "ok" : "") + "</td>");
        else echo("<td" + (["mac-address", "address", "to-address"].includes(k) ? ' class="mono"' : "") + ">" + h(v) + "</td>");
      }
      echo('<td class="acts">');
      if (s === "hs_active") echo('<button class="btn small bad" name="id" value="' + h(r[".id"]) + '" data-confirm="Putuskan koneksi ' + h(r.user || "") + '?" onclick="this.form.act.value=\'delete\'">Remove</button>');
      else {
        const btn = (label, act, to, ask = "", cls = "") => "<button" + (cls !== "" ? ' class="' + cls + '"' : "") + ' name="id" value="' + h(r[".id"]) + '"' + (ask !== "" ? ' data-confirm="' + h(ask) + '"' : "") + " onclick=\"this.form.act.value='" + act + "';this.form.to.value='" + to + "'\">" + h(label) + "</button>";
        const items = [];
        if (s === "hs_hosts" && r["mac-address"]) {
          items.push(btn("Make Bypassed", "bind", "bypassed", "Buat IP binding bypassed untuk " + r["mac-address"] + "? Perangkat ini bisa internet tanpa login."));
          items.push(btn("Make Blocked", "bind", "blocked", "Blokir " + r["mac-address"] + " lewat IP binding?"));
        }
        if (s === "hs_bindings") for (const t of ["regular", "bypassed", "blocked"]) if ((r.type || "") !== t) items.push(btn("Set " + t[0].toUpperCase() + t.slice(1), "type", t));
        items.push(btn("Remove", "delete", "", "Hapus item ini?", "danger"));
        echo(row_menu(items));
      }
      echo("</td></tr>");
    }
    echo('</tbody></table></div><p class="count"><span data-count="#tbl">' + tot + "</span> dari " + tot + " item</p>");
  }
  echo("</div></section></form><script>(function(){var f=document.getElementById('ls-form'),b=document.getElementById('ls-bulk');if(!f||!b)return;var u=function(){setTimeout(function(){var n=f.querySelectorAll('tbody input[type=checkbox]:checked').length;b.classList.toggle('on',n>0);b.textContent=" + JSON.stringify(verb) + "+' '+n},0)};f.addEventListener('change',u);f.addEventListener('click',u)})();</script>");
  page_foot();
};
