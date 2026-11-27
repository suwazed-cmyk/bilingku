// User List: daftar pengguna hotspot, saring per profil / kelompok cetak, cetak dan hapus massal
"use strict";
module.exports = async function (C) {
  const { X, S, h, get, post, url, back, flash, csrf_field, icon, echo, header, page_head, page_foot, need_ros, rq, rdo, rremove, rcount, router, router_id, HSU_PROPS, hs_users_cached, hs_users_dirty, hs_users_at, dur_secs, dur_fmt, bytes, badge, row_menu, pager_html, export_btn, xlsx_send, ros_date, money, date, ksorted, intv, floatv } = C;
  await need_ros("User List");
  if (X().method === "POST") {
    hs_users_dirty();
    const act = post("act");
    let ids = Array.isArray(X().POST.ids) ? X().POST.ids.map(String) : [];
    if (post("id") !== "") ids = [post("id")];
    if (act === "delete" || act === "delete_comment") {
      const all = await rq("/ip/hotspot/user/print", { ".proplist": ".id,name,comment" });
      const names = {};
      if (act === "delete_comment") {
        ids = [];
        for (const u of all)
          if ((u.comment || "") === post("comment") && post("comment") !== "") {
            ids.push(u[".id"]);
            names[u.name] = 1;
          }
      } else for (const u of all) if (ids.includes(u[".id"])) names[u.name] = 1;
      const n = await rremove("/ip/hotspot/user", ids);
      const actIds = [];
      for (const a of await rq("/ip/hotspot/active/print", { ".proplist": ".id,user" })) if (names[a.user || ""]) actIds.push(a[".id"]);
      await rremove("/ip/hotspot/active", actIds);
      const sch = [];
      for (const s of await rq("/system/scheduler/print", { "?comment": "bilingku-exp", ".proplist": ".id,name" })) if (names[String(s.name).slice(4)]) sch.push(s[".id"]);
      await rremove("/system/scheduler", sch);
      flash(n + " voucher dihapus.");
      if (act === "delete_comment") throw C.redirect("hs_users");
    } else if (act === "toggle" && ids.length) {
      await rdo("/ip/hotspot/user/set", { ".id": ids[0], disabled: post("to") === "yes" ? "yes" : "no" });
    } else if (act === "reset" && ids.length) {
      if (await rdo("/ip/hotspot/user/reset-counters", { ".id": ids[0] })) flash("Pemakaian direset.");
    } else if (act === "kick" && ids.length) {
      const u = await rq("/ip/hotspot/user/print", { "?.id": ids[0], ".proplist": "name" });
      if (u.length) {
        await rremove("/ip/hotspot/active", (await rq("/ip/hotspot/active/print", { "?user": u[0].name, ".proplist": ".id" })).map((x) => x[".id"]));
        flash("Koneksi " + u[0].name + " diputuskan.");
      }
    }
    throw back();
  }
  const expOf = (cm) => {
    const m = /^([a-z]{3}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})( ([NR]))?/.exec(String(cm || ""));
    return m ? [m[1] + " " + m[2], m[4] || ""] : null;
  };
  const used = (u) => String(u.uptime || "") !== "" && dur_secs(u.uptime) > 0;
  const isExp = (u) => ["1s", "00:00:01"].includes(String(u["limit-uptime"] || ""));
  const fProfile = get("profile");
  const fComment = get("comment");
  const q = get("q").toLowerCase();
  let pg = Math.max(1, intv(get("pg", "1")));
  const per = [25, 50, 100, 200].includes(intv(get("per"))) ? intv(get("per")) : 50;
  const f = ["online", "new", "off", "exp"].includes(get("f")) ? get("f") : "";

  const users = await hs_users_cached(HSU_PROPS, get("fresh") === "1");
  const online = {};
  for (const a of await rq("/ip/hotspot/active/print", { ".proplist": "user,address" })) online[a.user || ""] = a.address || "";
  const legacy = {};
  const lk = "legacy_exp_" + router_id();
  if (S()[lk] === undefined) S()[lk] = (await rcount("/system/scheduler", { "?comment": "bilingku-exp" })) > 0;
  if (S()[lk]) for (const s of await rq("/system/scheduler/print", { "?comment": "bilingku-exp", ".proplist": "name,next-run" })) legacy[String(s.name).slice(4)] = s["next-run"] || "";

  const profiles = {};
  const comments = {};
  const rows = [];
  const cnt = { "": 0, online: 0, new: 0, off: 0, exp: 0 };
  for (const u of users) {
    const pr = u.profile || "";
    const c = u.comment || "";
    if (pr !== "") profiles[pr] = 1;
    if (c !== "" && !expOf(c)) comments[c] = (comments[c] || 0) + 1;
    const isOn = online[u.name] !== undefined;
    const isNew = !used(u) && !expOf(c);
    const isDead = isExp(u);
    const tags = { "": true, online: isOn, new: isNew, off: !isOn && !isNew && !isDead, exp: isDead };
    for (const [k, v] of Object.entries(tags)) if (v) cnt[k]++;
    if (!tags[f]) continue;
    if (fProfile !== "" && pr !== fProfile) continue;
    if (fComment !== "" && c !== fComment) continue;
    if (q !== "" && !(u.name + " " + c + " " + (u["mac-address"] || "")).toLowerCase().includes(q)) continue;
    rows.push(u);
  }
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / per));
  pg = Math.min(pg, pages);
  const view = rows.slice((pg - 1) * per, pg * per);
  const qs = {};
  for (const [k, v] of Object.entries({ profile: fProfile, comment: fComment, q: get("q"), f })) if (v !== "") qs[k] = v;
  const without = (o, ...ks) => {
    const r = Object.assign({}, o);
    for (const k of ks) delete r[k];
    return r;
  };
  if (["rsc", "xlsx", "csv"].includes(get("export"))) {
    const tag = ((fProfile !== "" ? fProfile : "all") + (fComment !== "" ? "-" + fComment : "")).replace(/^-+|-+$/g, "").replace(/[^A-Za-z0-9_.-]+/g, "-");
    const fn = ("users-" + ((router() || {}).name || "router") + "-" + tag + "-" + date("Ymd-His")).replace(/[^A-Za-z0-9_.-]/g, "");
    if (get("export") === "rsc") {
      X().headers["Content-Type"] = "text/plain; charset=utf-8";
      X().headers["Content-Disposition"] = 'attachment; filename="' + fn + '.rsc"';
      let o = "# " + rows.length + " hotspot user, " + date("Y-m-d H:i") + "\n/ip hotspot user\n";
      for (const u of rows) {
        const kv = { server: u.server || "all", name: u.name, password: u.password || "", profile: u.profile || "default" };
        const lu = String(u["limit-uptime"] || "");
        if (!["", "0s", "00:00:00"].includes(lu)) kv["limit-uptime"] = lu;
        if (floatv(u["limit-bytes-total"]) > 0) kv["limit-bytes-total"] = u["limit-bytes-total"];
        if ((u.comment || "") !== "") kv.comment = u.comment;
        let line = "add";
        for (const [k, v] of Object.entries(kv)) line += " " + k + '="' + C.ros_str(v) + '"';
        o += line + "\n";
      }
      X().body = Buffer.from(o, "utf8");
      throw C.EXIT();
    }
    const data = rows.map((u) => [u.server || "all", u.name, u.password || "", u.profile || "", u["mac-address"] || "", dur_fmt(u.uptime || ""), intv(u["bytes-in"]), intv(u["bytes-out"]), u["limit-uptime"] || "", intv(u["limit-bytes-total"]), u.comment || ""]);
    xlsx_send(fn + ".xlsx", ["Server", "Name", "Password", "Profile", "MAC Address", "Uptime", "Bytes In", "Bytes Out", "Limit Uptime", "Limit Bytes Total", "Comment"], data);
  }

  await page_head("User List");
  const gd = S().gen_done || null;
  delete S().gen_done;
  if (gd) {
    const pu = (tpl, qr) => url("voucher_print", { comment: gd.comment, tpl, qr });
    let r = [["Generate Code", gd.code], ["Date", gd.date]];
    if (gd.note !== "") r.push(["Comment", gd.note]);
    r = r.concat([["Profile", gd.profile], ["Validity", gd.validity], ["Time Limit", gd.uptime], ["Data Limit", gd.data], ["Price", gd.price ? money(gd.price) : "-"], ["Selling Price", gd.sprice ? money(gd.sprice) : "-"], ["Lock User", gd.lock], ["Qty", gd.qty]]);
    let o = '<dialog class="dlg gendlg" id="gendlg" aria-labelledby="gendlg-t"><div class="genhead">' + icon("ticket") + '<h3 id="gendlg-t">' + h(gd.code + " - " + gd.date) + '</h3><button type="button" class="genx" aria-label="Tutup" onclick="this.closest(\'dialog\').close()">×</button></div><p class="genok">' + h(gd.qty) + ' voucher berhasil dibuat.</p><table class="gentbl"><tbody>';
    for (const [k, v] of r) o += "<tr><th>" + h(k) + "</th><td>" + h(String(v)) + "</td></tr>";
    o += '</tbody></table><div class="genfoot"><a class="btn primary" target="_blank" autofocus href="' + h(pu("default", "no")) + '">' + icon("print") + 'Print</a><a class="btn" target="_blank" href="' + h(pu("default", "yes")) + '">' + icon("print") + 'QR</a><a class="btn" target="_blank" href="' + h(pu("small", "no")) + '">' + icon("print") + "Small</a></div></dialog>";
    o += '<script>(function(){var d=document.getElementById("gendlg");if(d&&d.showModal){d.showModal();d.addEventListener("click",function(e){if(e.target===d)d.close();});}})();</script>';
    echo(o);
  }
  // kartu ringkas status
  const tiles = [["", "Total Voucher", "ticket", "blue"], ["online", "Online", "link", "green"], ["new", "Belum Dipakai", "wifi", "gray"], ["exp", "Expired", "clock", "amber"]];
  echo('<div class="stats">');
  for (const [k, label, ic, col] of tiles) echo('<a class="stat ' + col + (k === f ? " on" : "") + '" href="' + h(url("hs_users", Object.assign(k === "" ? {} : { f: k }, without(qs, "f", "pg")))) + '"><span class="si">' + icon(ic) + "</span><div><small>" + h(label) + "</small><b>" + C.numberFormat(cnt[k], 0, ",", ".") + "</b></div></a>");
  echo("</div>");

  echo('<form method="post" id="hv-form">' + csrf_field() + '<input type="hidden" name="act" value="delete"><input type="hidden" name="to" value=""><section class="card">');
  echo('<div class="cardhead">' + icon("user") + '<strong>Users</strong><span class="muted hscnt">' + total + ' total</span><span class="spacer"></span>');
  echo('<button class="btn small bad" id="hv-bulk" data-confirm="Hapus voucher yang dicentang?" data-comment="' + h(fComment) + '" data-total="' + total + '">Remove 0</button>' + (fComment !== "" ? '<input type="hidden" name="comment" value="' + h(fComment) + '">' : ""));
  echo('<a class="hl" href="' + h(url("hs_users", Object.assign({}, qs, { fresh: 1 }))) + '" title="Reload Data" aria-label="Reload Data">' + icon("reload") + '</a><span class="muted hsuat" title="Waktu data diambil dari router. Klik Reload untuk mengambil ulang sekarang.">Data ' + date("H:i:s", hs_users_at() || C.now()) + "</span>");
  if (view.length) echo('<details class="xdd printdd"><summary class="btn small" title="Mencetak voucher yang dicentang. Bila tidak ada yang dicentang, semua voucher yang tampil di tabel dicetak.">' + icon("print") + "Print" + icon("chev") + '</summary><div class="xmenu"><div class="xhint">Yang dicentang, atau semua yang tampil</div><button type="button" data-print="default" data-qr="no">Default<small>Kartu voucher standar</small></button><button type="button" data-print="default" data-qr="yes">QR<small>Voucher dengan kode QR</small></button><button type="button" data-print="small" data-qr="no">Small<small>Ringkas, cocok untuk thermal</small></button></div></details>');
  echo(export_btn("hs_users", qs));
  echo('<a class="hl" href="' + h(url("hs_generate", fProfile !== "" ? { profile: fProfile } : {})) + '">' + icon("plus") + 'Generate</a><a class="hl" href="' + h(url("hs_generate", { one: 1 })) + '">' + icon("plus") + "Add User</a></div>");
  echo('<div class="cardbody"><div class="hsfilter"><input type="search" class="filter" form="hv-search" name="q" id="hv-q" value="' + h(get("q")) + '" placeholder="Cari nama, comment, MAC…" title="Menyaring sambil mengetik; tekan Enter untuk mencari di semua voucher" aria-label="Search"' + (view.length ? ' data-filter="#tbl"' : "") + ">");
  let base = without(qs, "profile", "pg");
  echo('<select aria-label="Profile" onchange="location.href=this.value"><option value="' + h(url("hs_users", base)) + '">All Profile</option>');
  for (const k of ksorted(profiles)) echo('<option value="' + h(url("hs_users", Object.assign({ profile: k }, base))) + '"' + (k === fProfile ? " selected" : "") + ">" + h(k) + "</option>");
  echo("</select>");
  base = without(qs, "comment", "pg");
  echo('<select aria-label="Comment" onchange="location.href=this.value"><option value="' + h(url("hs_users", base)) + '">All Comment</option>');
  for (const k of ksorted(comments, true)) echo('<option value="' + h(url("hs_users", Object.assign({ comment: k }, base))) + '"' + (k === fComment ? " selected" : "") + ">" + h(k + " (" + comments[k] + ")") + "</option>");
  echo("</select>");
  base = without(qs, "f", "pg");
  echo('<select aria-label="Status" onchange="location.href=this.value"' + (f !== "" ? ' class="active"' : "") + ">");
  for (const [k, v] of Object.entries({ "": "All Status", online: "Online", new: "Belum dipakai", off: "Offline", exp: "Expired" })) echo('<option value="' + h(url("hs_users", Object.assign(k === "" ? {} : { f: k }, base))) + '"' + (k === f ? " selected" : "") + ">" + h(v) + " (" + cnt[k] + ")</option>");
  echo("</select>");
  if (Object.keys(qs).length) echo('<a class="btn small ghost" href="' + h(url("hs_users")) + '">Clear Filter</a>');
  if (view.length) echo('<span class="hsnote">Print memakai baris yang dicentang, atau semua yang tampil</span>');
  echo("</div>");
  if (!view.length) {
    echo('<div class="empty"><p class="emptytitle">' + (Object.keys(qs).length ? "Tidak ada voucher yang cocok dengan saringan ini." : "Belum ada voucher.") + "</p>" + (!Object.keys(qs).length ? '<p><a class="btn primary" href="' + h(url("hs_generate")) + '">Generate voucher</a></p>' : "") + "</div>");
  } else {
    echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable" data-no-start="' + (pg - 1) * per + '"><thead><tr><th class="chk nosort"><input type="checkbox" data-checkall aria-label="Pilih semua"></th><th>Server</th><th>Name</th><th>Profile</th><th>Uptime</th><th class="r">Bytes In</th><th class="r">Bytes Out</th><th>Comment</th><th class="nosort"></th></tr></thead><tbody>');
    for (const u of view) {
      const off = (u.disabled || "") === "true";
      const n = u.name;
      const on = online[n] !== undefined;
      const cm = String(u.comment || "");
      const ex = expOf(cm);
      const dead = isExp(u);
      const st = on ? '<span class="dotst on" title="Online ' + h(online[n]) + '"></span>' : "";
      echo('<tr data-href="' + h(url("hs_generate", { id: u[".id"] })) + '"' + (off || dead ? ' class="off"' : "") + ">");
      echo('<td class="chk"><input type="checkbox" name="ids[]" value="' + h(u[".id"]) + '" aria-label="Pilih ' + h(n) + '"></td><td>' + h(u.server || "all") + "</td>");
      echo('<td class="key mono" data-v="' + h(n) + '">' + st + '<a class="namelink" href="' + h(url("hs_generate", { id: u[".id"] })) + '">' + h(n) + "</a>" + (off ? '<span class="stb">' + badge("Disabled", "warn") + "</span>" : dead ? '<span class="stb">' + badge("Expired", "bad") + "</span>" : "") + "</td>");
      echo("<td>" + h(u.profile || "") + '</td><td class="mono" data-v="' + dur_secs(u.uptime || "") + '">' + h(dur_fmt(u.uptime || "")) + '</td><td class="r" data-v="' + floatv(u["bytes-in"]) + '">' + bytes(u["bytes-in"] || 0) + '</td><td class="r" data-v="' + floatv(u["bytes-out"]) + '">' + bytes(u["bytes-out"] || 0) + "</td>");
      echo('<td data-v="' + h(ex ? ros_date(ex[0]) + ex[0].slice(-8) : cm) + '">' + (cm !== "" ? '<a class="cmflt" href="' + h(url("hs_users", { comment: cm })) + '" title="Saring comment ini" aria-label="Saring comment ' + h(cm) + '">' + icon("search") + "</a>" : "") + '<span class="ell" title="' + h(cm) + '">' + h(cm) + "</span>" + (!ex && legacy[n] ? ' <span class="muted">(habis ' + h(legacy[n]) + ")</span>" : "") + "</td>");
      echo('<td class="acts">' + row_menu(['<a href="' + h(url("hs_generate", { id: u[".id"] })) + '">Edit</a>', '<a target="_blank" href="' + h(url("voucher_print", { user: n, qr: "no" })) + '">Print</a>', '<a target="_blank" href="' + h(url("voucher_print", { user: n, qr: "yes" })) + '">Print QR</a>', on ? '<button name="id" value="' + h(u[".id"]) + '" onclick="this.form.act.value=\'kick\'">Remove Active</button>' : "", '<button name="id" value="' + h(u[".id"]) + '" onclick="this.form.act.value=\'toggle\';this.form.to.value=\'' + (off ? "no" : "yes") + '\'">' + (off ? "Enable" : "Disable") + "</button>", '<button name="id" value="' + h(u[".id"]) + '" onclick="this.form.act.value=\'reset\'">Reset counters</button>', '<button class="danger" name="id" value="' + h(u[".id"]) + '" data-confirm="Hapus voucher ' + h(n) + '?" onclick="this.form.act.value=\'delete\'">Remove</button>']) + "</td></tr>");
    }
    echo("</tbody></table></div>" + pager_html(total, pg, per, (p, s) => url("hs_users", Object.assign({}, qs, { pg: p, per: s }))));
  }
  echo('</div></section></form><form method="get" id="hv-search"><input type="hidden" name="p" value="hs_users">' + (C.cur_session() !== "" ? '<input type="hidden" name="session" value="' + h(C.cur_session()) + '">' : ""));
  for (const [k, v] of Object.entries(without(qs, "q", "pg"))) echo('<input type="hidden" name="' + h(k) + '" value="' + h(v) + '">');
  echo("</form>");
  const flt = {};
  for (const [k, v] of Object.entries({ comment: fComment, profile: fProfile, q: get("q"), f })) if (v !== "") flt[k] = v;
  echo("<script>(function(){var f=document.getElementById('hv-form'),b=document.getElementById('hv-bulk');if(!f||!b)return;var cm=b.dataset.comment||'',tot=b.dataset.total||'0';var picked=function(){return f.querySelectorAll('tbody input[type=checkbox]:checked').length};b.addEventListener('click',function(){var n=picked();f.act.value=n||!cm?'delete':'delete_comment';b.dataset.confirm=n||!cm?'Hapus '+n+' voucher yang dicentang?':'Hapus semua '+tot+' voucher dengan comment '+cm+'?'});var flt=" + JSON.stringify(flt) + ";document.querySelectorAll('[data-print]').forEach(function(btn){btn.addEventListener('click',function(){var d=btn.closest('details');if(d)d.removeAttribute('open');var all=Array.prototype.slice.call(f.querySelectorAll('tbody input[name=\"ids[]\"]'));var boxes=all.filter(function(c){return c.closest('tr').style.display!=='none'});var pick=boxes.filter(function(c){return c.checked});if(!pick.length&&Object.keys(flt).length&&boxes.length===all.length){var qs=Object.keys(flt).map(function(k){return k+'='+encodeURIComponent(flt[k])}).join('&');window.open(" + JSON.stringify(url("voucher_print")) + "+'&'+qs+'&tpl='+btn.dataset.print+'&qr='+btn.dataset.qr,'_blank');return}if(!pick.length)pick=boxes;if(!pick.length)return;var pf=document.createElement('form');pf.method='post';pf.target='_blank';pf.action=" + JSON.stringify(url("voucher_print")) + "+'&tpl='+btn.dataset.print+'&qr='+btn.dataset.qr;var add=function(n,v){var i=document.createElement('input');i.type='hidden';i.name=n;i.value=v;pf.appendChild(i)};add('_t',f.querySelector('input[name=_t]').value);add('act','print');pick.forEach(function(c){add('ids[]',c.value)});document.body.appendChild(pf);pf.submit();pf.remove()})});var q=document.getElementById('hv-q');if(q)q.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();document.getElementById('hv-search').submit()}});var u=function(){setTimeout(function(){var n=picked();b.classList.toggle('on',n>0||cm!=='');b.textContent=n||!cm?'Remove '+n:'Remove by Comment'},0)};u();f.addEventListener('change',u);f.addEventListener('click',u)})();</script>");
  page_foot();
};
