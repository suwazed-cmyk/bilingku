// Generate (banyak sekaligus), Add User (satu), dan Edit User hotspot
"use strict";
const JOBS = new Map(); // proses Generate bertahap per sesi (disimpan di memori, bukan di sesi)
module.exports = async function (C) {
  const { X, S, h, get, post, url, back, redirect, flash, csrf_field, icon, echo, page_head, page_foot, need_ros, rq, rdo, rremove, hs_users_dirty, hs_meta, hs_charsets, hs_gen_job_start, hs_gen_job_step, hs_generate_users, valid_interval, money, opt, badge, bytes, dur_secs, dur_fmt, router_id, numberFormat, floatv, intv } = C;
  const editId = get("id");
  const one = !!get("one") || editId !== "";
  const title = editId !== "" ? "Edit User" : one ? "Add User" : "Generate";
  await need_ros(title);
  const limit_bytes = (n, unit) => {
    n = floatv(String(n).replace(",", "."));
    return n > 0 ? String(Math.round(n * (unit === "GB" ? 1073741824 : 1048576))) : "0";
  };
  const jobKey = () => (X().sid || "") + "|" + router_id();

  if (X().method === "POST") {
    hs_users_dirty();
    if (post("act") === "delete" && editId !== "") {
      const u = await rq("/ip/hotspot/user/print", { "?.id": editId, ".proplist": "name" });
      if (await rdo("/ip/hotspot/user/remove", { ".id": editId })) {
        if (u.length) await rremove("/ip/hotspot/active", (await rq("/ip/hotspot/active/print", { "?user": u[0].name, ".proplist": ".id" })).map((x) => x[".id"]));
        flash("User " + (u.length ? u[0].name : "") + " dihapus.");
      }
      throw redirect("hs_users");
    }
    const base = { profile: post("profile"), server: post("server", "all") || "all" };
    const lu = post("limit_uptime").toLowerCase();
    const jout = (d) => {
      X().headers["Content-Type"] = "application/json; charset=utf-8";
      X().body = Buffer.from(JSON.stringify(d));
      throw C.EXIT();
    };
    const isJob = ["gen_start", "gen_step", "gen_finish"].includes(post("act"));
    if (lu !== "" && !valid_interval(lu)) {
      if (isJob) jout({ ok: false, error: "Time Limit ditulis seperti 1h, 30m, 1d, atau 4w3d." });
      flash("Time Limit ditulis seperti 1h, 30m, 1d, atau 4w3d.", "err");
      throw back();
    }
    base["limit-uptime"] = lu === "" ? "0" : lu;
    base["limit-bytes-total"] = limit_bytes(post("limit_data"), post("limit_unit"));

    if (post("act") === "save_one") {
      const name = post("name");
      const pass = String(X().POST.password || "");
      if (name === "") {
        flash("Isi Name.", "err");
        throw back();
      }
      const p = Object.assign({}, base, { name, password: pass, comment: post("comment") });
      let ok;
      if (editId !== "") ok = await rdo("/ip/hotspot/user/set", Object.assign({ ".id": editId }, p));
      else {
        const cm = String(p.comment);
        if (cm !== "" && !/^(vc|up)/.test(cm)) p.comment = (name === pass ? "vc-" : "up-") + cm;
        ok = await rdo("/ip/hotspot/user/add", p);
      }
      if (ok) {
        flash("User " + name + " disimpan.");
        const row = await rq("/ip/hotspot/user/print", { "?name": name, ".proplist": ".id" });
        throw redirect("hs_generate", row.length ? { id: row[0][".id"] } : {});
      }
      throw back();
    }
    const done = async (comment, made, profile, lu_, bytesLimit) => {
      const pr = await rq("/ip/hotspot/user/profile/print", { "?name": profile, ".proplist": "on-login" });
      const pm = hs_meta(pr.length ? pr[0]["on-login"] || "" : "");
      const cp = String(comment).split("-");
      const lb = floatv(bytesLimit);
      S().gen_done = { comment, code: cp[1] || "", date: cp[2] || "", note: cp.slice(3).join("-"), profile, validity: pm.validity !== "" ? pm.validity : "-", uptime: lu_ !== "" ? lu_ : "-", data: lb > 0 ? bytes(lb) : "-", price: pm.price, sprice: pm.sprice, lock: pm.lock ? "Enable" : "Disable", qty: made };
    };
    const opts = { qty: post("qty", "1"), len: post("len", "4"), prefix: post("prefix"), charset: post("charset"), mode: post("mode"), profile: post("profile"), server: post("server"), limit_uptime: lu, limit_bytes: base["limit-bytes-total"], comment: post("comment") };
    if (post("act") === "gen_start") {
      const job = await hs_gen_job_start(opts);
      job.lu = lu;
      job.err = "";
      job.rid = router_id();
      JOBS.set(jobKey(), job);
      jout({ ok: true, want: job.qty, comment: job.comment });
    }
    if (post("act") === "gen_step") {
      const job = JOBS.get(jobKey());
      if (!job) jout({ ok: false, error: "Proses generate tidak ditemukan. Ulangi Generate." });
      const r = await hs_gen_job_step(job, 25);
      job.err = r.err;
      job.full = r.full;
      const end = job.made >= job.qty || r.full || r.err !== "";
      jout({ ok: r.err === "", made: job.made, want: job.qty, done: end, full: r.full, error: r.err !== "" ? "Router menolak: " + r.err : "" });
    }
    if (post("act") === "gen_finish") {
      const job = JOBS.get(jobKey());
      JOBS.delete(jobKey());
      if (!job) jout({ ok: true, url: url("hs_users") });
      if (job.err) flash("Router menolak setelah " + job.made + " user: " + job.err, "err");
      else if (job.made < job.qty) flash("Hanya " + job.made + " dari " + job.qty + " user yang bisa dibuat: kombinasi nama dengan panjang dan Character ini hampir habis. Perbesar Length atau pakai Character campuran.", "err");
      if (job.made) await done(job.comment, job.made, job.base.profile, job.lu, job.base["limit-bytes-total"]);
      jout({ ok: true, url: job.made ? url("hs_users", { comment: job.comment }) : url("hs_generate") });
    }
    // Generate tanpa JS: sekaligus (maksimal 2000)
    const res = await hs_generate_users(opts);
    const want = Math.max(1, Math.min(2000, intv(post("qty", "1"))));
    if (res.err !== "") flash("Router menolak setelah " + res.made + " user: " + res.err, "err");
    else if (res.full) flash("Hanya " + res.made + " dari " + want + " user yang bisa dibuat: kombinasi nama dengan panjang dan Character ini hampir habis. Perbesar Length atau pakai Character campuran.", "err");
    if (res.made) {
      await done(res.comment, res.made, post("profile"), lu, base["limit-bytes-total"]);
      throw redirect("hs_users", { comment: res.comment });
    }
    throw back();
  }

  const profiles = await rq("/ip/hotspot/user/profile/print", { ".proplist": "name,on-login" });
  const servers = await rq("/ip/hotspot/print", { ".proplist": "name" });
  let e = { name: "", password: "", profile: get("profile"), server: "all", "limit-uptime": "", "limit-bytes-total": 0, comment: "" };
  let online = null;
  if (editId !== "") {
    const r = await rq("/ip/hotspot/user/print", { "?.id": editId });
    if (!r.length) {
      flash("User tidak ditemukan.", "err");
      throw redirect("hs_users");
    }
    e = C.U(r[0], e);
    const a = await rq("/ip/hotspot/active/print", { "?user": e.name, ".proplist": "address,uptime" });
    online = a.length ? a[0] : null;
  }
  const lb = floatv(e["limit-bytes-total"]);
  const unit = lb >= 1073741824 ? "GB" : "MB";
  const lbv = lb > 0 ? (lb / (unit === "GB" ? 1073741824 : 1048576)).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") : "";
  const lu = ["", "0s", "00:00:00"].includes(e["limit-uptime"]) ? "" : e["limit-uptime"];
  const popt = (p, cur) => {
    const m = hs_meta(p["on-login"] || "");
    return '<option value="' + h(p.name) + '"' + (String(p.name) === String(cur) ? " selected" : "") + ' data-val="' + h(m.validity) + '" data-price="' + h(m.price ? money(m.price, false) : "") + '" data-sprice="' + h(m.sprice ? money(m.sprice, false) : "") + '" data-lock="' + (m.lock ? "Enable" : "Disable") + '">' + h(p.name) + "</option>";
  };
  let srvSel = '<select id="g_srv" name="server">' + opt("all", e.server, "all");
  for (const s of servers) srvSel += opt(s.name, e.server);
  srvSel += "</select>";
  let last = [];
  if (!one) {
    const groups = {};
    for (const u of await rq("/ip/hotspot/user/print", { ".proplist": "profile,comment" })) {
      const m = /^(vc|up)-(\d+)-(\d{2}\.\d{2}\.\d{2})-/.exec(String(u.comment || ""));
      if (!m) continue;
      const k = m[2] + "|" + m[3];
      if (!groups[k]) groups[k] = { code: m[2], date: m[3], profile: u.profile || "", qty: 0, comment: u.comment, sort: "20" + m[3].slice(6, 8) + m[3].slice(0, 2) + m[3].slice(3, 5) };
      groups[k].qty++;
    }
    last = Object.values(groups).sort((a, b) => (b.sort < a.sort ? -1 : b.sort > a.sort ? 1 : b.code < a.code ? -1 : b.code > a.code ? 1 : 0)).slice(0, 10);
  }

  await page_head(title, "", ["User List", url("hs_users")]);
  echo('<div class="split"><form method="post" class="card" id="genform">' + csrf_field());
  echo('<div class="cardhead">' + icon(one ? "user" : "ticket") + "<strong>" + (editId !== "" ? "Edit User" : one ? "Add User" : "Generate User") + '</strong><span class="spacer"></span><a class="x" href="' + h(url("hs_users")) + '" title="Tutup" aria-label="Tutup">&times;</a></div><div class="cardbody">');
  if (one) {
    echo('<div class="frow"><label for="g_srv">Server</label>' + srvSel + "</div>");
    echo('<div class="frow"><label for="g_name">Name</label><input id="g_name" name="name" value="' + h(e.name) + '" required autocomplete="off"></div>');
    echo('<div class="frow"><label for="g_pass">Password</label><div class="join"><input id="g_pass" name="password" type="password" value="' + h(e.password) + '" autocomplete="new-password"><button type="button" class="btn eye" data-eye="#g_pass" title="Lihat kata sandi" aria-label="Lihat kata sandi">' + icon("eye") + "</button></div></div>");
  } else {
    echo('<div class="frow"><label for="g_qty">Qty</label><input id="g_qty" name="qty" type="number" min="1" max="2000" value="1" required></div>');
    echo('<div class="frow"><label for="g_srv">Server</label>' + srvSel + "</div>");
    echo('<div class="frow"><label for="g_mode">User Mode</label><select id="g_mode" name="mode"><option value="up">Username &amp; Password</option><option value="vc">Username = Password</option></select></div>');
    echo('<div class="frow"><label for="g_len">Name Length</label><select id="g_len" name="len">' + [3, 4, 5, 6, 7, 8].map((n) => opt(n, 4)).join("") + "</select></div>");
    echo('<div class="frow"><label for="g_prefix">Prefix</label><input id="g_prefix" name="prefix" maxlength="6" pattern="[A-Za-z0-9]*" autocomplete="off"></div>');
    echo('<div class="frow"><label for="g_set">Character</label><select id="g_set" name="charset">' + Object.entries(hs_charsets()).map(([k, v]) => opt(k, "lower", v)).join("") + "</select></div>");
  }
  echo('<div class="frow"><label for="g_prof">Profile</label><select id="g_prof" name="profile" required>' + profiles.map((p) => popt(p, e.profile)).join("") + "</select></div>");
  echo('<div class="frow"><label for="g_lu">Time Limit</label><input id="g_lu" name="limit_uptime" value="' + h(lu) + '" pattern="(\\d+[wdhmsWDHMS])+|\\d{1,2}:\\d{2}:\\d{2}" placeholder="mis. 3h, 1d"></div>');
  echo('<div class="frow"><label for="g_ld">Data Limit</label><div class="join"><input id="g_ld" name="limit_data" inputmode="decimal" value="' + h(lbv) + '"><select name="limit_unit" aria-label="Satuan">' + opt("MB", unit) + opt("GB", unit) + "</select></div></div>");
  echo('<div class="frow"><label for="g_cmt">Comment</label><input id="g_cmt" name="comment" value="' + h(e.comment) + '" autocomplete="off"></div><p id="g_info" class="proinfo" hidden></p>');
  echo('<div class="btnrow formfoot">');
  if (editId !== "") echo('<button class="btn bad" name="act" value="delete" formnovalidate data-confirm="Hapus user ' + h(e.name) + ' dari router?">' + icon("trash") + 'Remove</button><a class="btn ghost" target="_blank" href="' + h(url("voucher_print", { id: editId })) + '">' + icon("print") + "Print</a>");
  if (!one) echo('<a class="btn ghost" href="' + h(url("hs_users")) + '">' + icon("user") + "User List</a>");
  echo('<span class="spacer"></span><button class="btn primary" name="act" value="' + (one ? "save_one" : "generate") + '">' + icon(one ? "save" : "ticket") + (one ? "Save" : "Generate") + "</button></div>");
  echo("</div>");
  echo("<script>(function(){var s=document.getElementById('g_prof'),info=document.getElementById('g_info');var show=function(){var o=s.options[s.selectedIndex],d=o?o.dataset:{};info.hidden=false;info.innerHTML='<span><b>Validity</b> '+(d.val||'-')+'</span><span><b>Price</b> '+(d.price||'-')+'</span><span><b>Selling</b> '+(d.sprice||'-')+'</span><span><b>Lock User</b> '+(d.lock||'-')+'</span>'};s.addEventListener('change',show);show()})();");
  echo("(function(){var f=document.getElementById('genform');if(!f||!f.querySelector('button[value=generate]'))return;var d=document.createElement('dialog');d.className='dlg genprog';d.innerHTML='<div class=\"gphead\"><span class=\"gpspin\" aria-hidden=\"true\"></span><h3>Generate voucher</h3></div><div class=\"gpbody\"><div class=\"gpnums\"><b class=\"gppct\">0%</b><span class=\"gpcnt\"></span></div><div class=\"gpbar\"><i></i></div><ul class=\"gplog\"></ul><p class=\"gperr\" hidden></p></div><div class=\"gpfoot\" hidden><button type=\"button\" class=\"btn primary gpgo\">View Voucher</button></div>';document.body.appendChild(d);var pct=d.querySelector('.gppct'),cnt=d.querySelector('.gpcnt'),bar=d.querySelector('.gpbar i'),log=d.querySelector('.gplog'),err=d.querySelector('.gperr'),foot=d.querySelector('.gpfoot');var running=false,goUrl='';d.addEventListener('cancel',function(e){if(running)e.preventDefault()});var nf=function(n){return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g,'.')};var line=function(t,cls){var li=document.createElement('li');li.textContent=t;if(cls)li.className=cls;log.appendChild(li);log.scrollTop=log.scrollHeight};var post=function(act){var fd=new URLSearchParams(new FormData(f));fd.set('act',act);return fetch(location.href,{method:'POST',body:fd,credentials:'same-origin'}).then(function(r){return r.json()})};var show=function(made,want){var p=want?Math.floor(made/want*100):0;pct.textContent=p+'%';bar.style.width=p+'%';cnt.textContent=nf(made)+' dari '+nf(want)+' voucher dibuat'};var finish=function(){post('gen_finish').then(function(r){goUrl=r.url||'';if(!err.hidden){foot.hidden=false;running=false;d.querySelector('.gpspin').hidden=true}else location.href=goUrl}).catch(function(){location.reload()})};var fail=function(t){err.textContent=t;err.hidden=false;running=false;d.classList.add('bad');finish()};d.querySelector('.gpgo').addEventListener('click',function(){location.href=goUrl||location.href});f.addEventListener('submit',function(e){var b=e.submitter;if(e.defaultPrevented||!b||b.value!=='generate'||!window.fetch||!d.showModal)return;e.preventDefault();log.textContent='';err.hidden=true;foot.hidden=true;d.classList.remove('bad');d.querySelector('.gpspin').hidden=false;running=true;d.showModal();cnt.textContent='Menyiapkan…';pct.textContent='0%';bar.style.width='0%';var mark=0;post('gen_start').then(function(r){if(!r.ok)return fail(r.error||'Generate gagal dimulai.');var want=r.want;show(0,want);line('Mulai membuat '+nf(want)+' voucher (comment '+r.comment+')');var step=function(){post('gen_step').then(function(s){show(s.made,s.want);while(mark+100<=s.made){mark+=100;line('✓ '+nf(mark)+' voucher berhasil dibuat','ok')}if(!s.ok)return fail(s.error||'Router menolak.');if(s.done){if(s.made>mark)line('✓ '+nf(s.made)+' voucher berhasil dibuat','ok');if(s.full)return fail('Hanya '+nf(s.made)+' dari '+nf(s.want)+' voucher yang bisa dibuat: kombinasi nama hampir habis. Perbesar Length atau pakai Character campuran.');line('Selesai. Membuka daftar voucher…');running=false;return finish()}step()}).catch(function(){fail('Koneksi ke panel terputus. Voucher yang sudah dibuat tetap tersimpan di router.')})};step()}).catch(function(){fail('Tidak ada jawaban dari panel. Coba lagi.')})})})();</script>");
  echo("</form><section class=\"card\">");
  const readme = '<p class="hint">Format Time Limit.<br>[wdhm] Contoh: 30d = 30 hari, 12h = 12 jam, 4w3d = 31 hari.</p><p class="hint">Add User dengan Time Limit.<br>Sebaiknya Time Limit &lt; Validity.</p>';
  if (!one) {
    echo('<div class="cardhead">' + icon("ticket") + '<strong>Last Generate</strong></div><div class="cardbody">');
    if (last.length) {
      echo('<div class="tablewrap"><table class="readme"><thead><tr><th>Generate Code</th><th>Date</th><th>Profile</th><th>Comment</th><th class="r">Qty</th></tr></thead><tbody>');
      for (const g of last) {
        const note = String(g.comment).replace(/^(vc|up)-\d+-\d{2}\.\d{2}\.\d{2}-?/, "").trim();
        echo('<tr><td><a class="namelink" href="' + h(url("hs_users", { comment: g.comment })) + '"><b>' + h(g.code) + "</b></a></td><td>" + h(g.date) + "</td><td>" + h(g.profile) + "</td><td>" + (note !== "" ? h(note) : '<span class="mono">' + h(g.comment) + "</span>") + '</td><td class="r">' + g.qty + "</td></tr>");
      }
      echo("</tbody></table></div>");
    } else echo('<p class="muted">Belum ada hasil Generate di router.</p>');
    echo(readme + "</div>");
  } else {
    if (editId !== "") {
      const stExp = ["1s", "00:00:01"].includes(String(e["limit-uptime"] || ""));
      const stUp = String(e.uptime || "");
      const stNew = (stUp === "" || dur_secs(stUp) <= 0) && !/^([a-z]{3}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}/.test(String(e.comment || ""));
      const st = online ? badge("Online", "ok") + " " + h(online.address || "") : (e.disabled || "") === "true" ? badge("Disabled", "warn") : stExp ? badge("Expired", "bad") : stNew ? badge("Belum dipakai", "info") : '<span class="muted">Offline</span>';
      echo('<div class="cardhead">' + icon("user") + '<strong>Pemakaian</strong></div><div class="cardbody"><table class="kv"><tbody><tr><th>Status</th><td>' + st + '</td></tr><tr><th>MAC Address</th><td class="mono">' + (h(e["mac-address"] || "") || '<span class="muted">-</span>') + '</td></tr><tr><th>Uptime</th><td class="mono">' + h(dur_fmt(e.uptime || "")) + "</td></tr><tr><th>Bytes In / Out</th><td>" + bytes(e["bytes-in"] || 0) + " / " + bytes(e["bytes-out"] || 0) + "</td></tr></tbody></table></div>");
    }
    echo('<div class="cardhead">' + icon("info") + '<strong>Read Me</strong></div><div class="cardbody">' + readme + '<p class="hint">Comment kosong atau diawali vc / up supaya masa aktif profil dihitung saat login pertama. Comment lain otomatis diberi awalan up- (atau vc- bila Name = Password).</p></div>');
  }
  echo("</section></div>");
  page_foot();
};
