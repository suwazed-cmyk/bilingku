// PPP User: secret PPP + data pelanggan (tarif, jatuh tempo, isolir)
"use strict";
module.exports = async function (C) {
  const { X, h, get, post, url, back, redirect, flash, csrf_field, icon, echo, page_head, page_foot, need_ros, rq, rdo, setting, customers, customers_save, payments, packages, db_save, db_load, rkey, add_months, today, tgl, money, money_in, ival_days, ppp_sync, ppp_kick, ppp_sched_install, ppp_sched_name, ppp_sched_run, ppp_sched_ok, ppp_sched_state, ppp_isolir_ready, ppp_fup, is_late, is_billed, bill_state, wa_link, months_owed, ros_dt, fup_meta, ppp_after, ppp_joined, ppp_cmt_strip, opt, badge, row_menu, confirm_btn, U, intv, floatv } = C;
  await need_ros("PPP User");
  const isoDef = String(setting("isolir_profile"));
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d));
  const byName = (rows) => {
    const o = {};
    for (const r of rows) o[r.name] = r;
    return o;
  };
  if (X().method === "POST") {
    const act = post("act");
    const user = post("user");
    const cs = customers();
    if (act === "mksched") {
      if (await ppp_sched_install()) flash("Scheduler " + ppp_sched_name() + " dibuat. Router memeriksa semua secret tiap hari pukul 00:01 dan tiap kali menyala.");
      throw back();
    }
    if (act === "runsched") {
      if (await ppp_sched_run()) flash("Pemeriksaan dijalankan di router. Secret yang lewat tanggal dipindah ke Isolir Profile sekarang, koneksinya diputus 5 menit kemudian. Muat ulang daftar untuk melihat hasilnya.");
      throw back();
    }
    if (act === "save" || act === "reset") {
      const id = post("id");
      const old = post("old");
      const name = post("name");
      let c = cs[old] ? cs[old] : {};
      if (name === "") {
        flash("Isi Name (nama pengguna PPP).", "err");
        throw back();
      }
      const val = post("validity", "").trim().toLowerCase();
      let isoOff;
      if (val === "" || val === "0") isoOff = "";
      else if (/^\d+$/.test(val)) isoOff = String(intv(val));
      else if (/^(\d+[wd])+$/.test(val)) isoOff = String(ival_days(val));
      else {
        flash("Validity ditulis dalam hari, misalnya 3 atau 3d (1w = 7 hari). Kosongkan bila secret tidak perlu di-disable.", "err");
        throw back();
      }
      let start = isDate(post("start")) ? post("start") : today();
      let due = isDate(post("due")) ? post("due") : "";
      if (act === "reset") {
        start = today();
        due = due !== "" || c.due ? add_months(start, 1) : "";
      }
      const profs = byName(await rq("/ppp/profile/print", { ".proplist": "name,local-address,remote-address" }));
      const noip = (prof) => {
        const m = [];
        for (const [f, l] of [["remote", "Remote Address"], ["local", "Local Address"]]) if (post(f) === "" && !(profs[prof] && profs[prof][f + "-address"])) m.push(l);
        return m;
      };
      let miss;
      if (act === "save" && (miss = noip(post("profile"))).length) {
        flash(miss.join(" dan ") + " belum ada: profil " + post("profile") + " tidak punya " + (miss.includes("Remote Address") ? "IP pool" : "Local Address") + " dan di secret juga kosong. Isi di secret ini, atau lengkapi profilnya di PPP Profiles.", "err");
        throw back();
      }
      if (post("profile") === "") {
        flash("Pilih Main Profile (paket) pelanggan.", "err");
        throw back();
      }
      const fupName = post("fup");
      if (fupName !== "" && fupName === post("profile")) {
        flash("Isolir Profile tidak boleh sama dengan Main Profile. Pilih profil isolir, misalnya " + isoDef + ".", "err");
        throw back();
      }
      if (fupName !== "" && fupName !== post("profile") && profs[fupName] && (miss = noip(fupName)).length) flash("Perhatian: Isolir Profile " + fupName + " tidak punya " + miss.join(" dan ") + ". Setelah diisolir, " + name + " tidak akan bisa tersambung sampai profil itu dilengkapi.", "warn");
      const p = { name, service: post("service", "pppoe"), comment: post("comment") };
      if (id === "") p.profile = post("profile");
      if (id === "" || String(X().POST.password || "") !== "") p.password = String(X().POST.password || "");
      const unset = [];
      for (const [k, f] of [["local-address", "local"], ["remote-address", "remote"]]) {
        if (post(f) !== "") p[k] = post(f);
        else if (id !== "") unset.push(k);
      }
      const ok = id !== "" ? await rdo("/ppp/secret/set", Object.assign({ ".id": id }, p)) : await rdo("/ppp/secret/add", p);
      if (!ok) throw back();
      for (const k of unset) await rdo("/ppp/secret/unset", { ".id": id, "value-name": k }, true);
      const jt = due !== "" && due === (c.due || "") && c.jt ? intv(c.jt) : intv(due.slice(8, 10));
      const fup = post("fup") === isoDef ? "" : post("fup");
      c = U({ nama: post("nama").trim() !== "" ? post("nama").trim() : name, hp: post("hp"), alamat: post("alamat"), tarif: money_in(post("tarif")), cmt: post("comment"), tagih: due !== "" ? 1 : 0, paket: post("profile"), fup, validity: "", gracep: "0", isooff: isoOff, after: "dis", start, due, jt, joined: c.joined ? c.joined : isDate(post("joined")) ? post("joined") : today() }, c);
      if (old !== "" && old !== name) {
        delete cs[old];
        const pays = payments();
        for (const [k, x] of Object.entries(pays)) if (x.user === old) pays[k].user = name;
        db_save(rkey("payments"), pays);
      }
      cs[name] = c;
      customers_save(cs);
      if (old !== "" && old !== name) await ppp_sync(old);
      await ppp_sync(name, null, false, act === "reset");
      if (due !== "" && fup === "") {
        const ir = await ppp_isolir_ready(true);
        if (ir === "installed") flash("Profil " + isoDef + " dipasang lengkap di router: address-list isolir, firewall, dan web proxy ke halaman pemberitahuan.");
        else if (ir === "partial") flash("Profil " + isoDef + " belum terpasang lengkap (firewall / web proxy). Buka PPP Profiles, edit profil " + isoDef + " lalu Save supaya aturan isolirnya dipasang ulang.", "warn");
      }
      if ((await ppp_sched_ok(true)) === false && (await ppp_sched_install())) flash("Scheduler " + ppp_sched_name() + " belum ada di router ini, jadi dibuat otomatis.");
      flash(act === "reset" ? "Start Date " + name + " diatur ulang ke hari ini" + (due !== "" ? ", Jatuh Tempo " + tgl(due) + "." : ".") : "Secret " + name + " disimpan." + (due !== "" ? " Jatuh Tempo " + tgl(due) + "." : ""));
      const row = await rq("/ppp/secret/print", { "?name": name, ".proplist": ".id" });
      throw redirect("ppp_secrets", row.length ? { edit: row[0][".id"] } : {});
    }
    if (act === "bulk_delete") {
      const ids = Array.isArray(X().POST.ids) ? X().POST.ids.map(String) : [];
      const names = {};
      for (const x of await rq("/ppp/secret/print", { ".proplist": ".id,name" })) if (ids.includes(x[".id"])) names[x[".id"]] = x.name;
      let n = 0;
      for (const [id, u] of Object.entries(names)) {
        if (!(await rdo("/ppp/secret/remove", { ".id": id }, true))) continue;
        await ppp_kick(u);
        delete cs[u];
        n++;
      }
      customers_save(cs);
      for (const u of Object.values(names)) await ppp_sync(u);
      flash(n + " secret dihapus. Riwayat pembayarannya tetap tersimpan.");
      throw redirect("ppp_secrets");
    }
    if (act === "delete") {
      if (await rdo("/ppp/secret/remove", { ".id": post("id") })) {
        await ppp_kick(user);
        delete cs[user];
        customers_save(cs);
        await ppp_sync(user);
        flash("Secret " + user + " dihapus. Riwayat pembayarannya tetap tersimpan.");
      }
      throw redirect("ppp_secrets");
    } else if (act === "toggle") {
      const dis = post("to") === "disable";
      if (await rdo("/ppp/secret/" + (dis ? "disable" : "enable"), { ".id": post("id") })) {
        if (dis) await ppp_kick(user);
        if (cs[user]) {
          cs[user].expired = 0;
          customers_save(cs);
        }
        flash("Secret " + user + (dis ? " dinonaktifkan." : " diaktifkan."));
      }
    } else if (act === "isolir" || act === "buka") {
      const c = cs[user] ? cs[user] : {};
      if (act === "isolir") c.manual_iso = 1;
      else delete c.manual_iso;
      cs[user] = c;
      customers_save(cs);
      if (await ppp_sync(user)) {
        if (act === "isolir") flash(user + " dipindahkan ke profil " + ppp_fup(c) + " dan koneksinya diputuskan.");
        else if (is_late(c)) flash(user + " masih lewat Jatuh Tempo. Terima pembayarannya untuk mengembalikan ke Main Profile.", "warn");
        else flash(user + " dikembalikan ke Main Profile.");
      }
    } else if (act === "kick") {
      await ppp_kick(user);
      flash("Koneksi " + user + " diputuskan.");
    }
    throw back();
  }

  const secrets = await rq("/ppp/secret/print");
  const cs = customers();
  const pk = packages();
  const editId = get("edit");
  let form = get("add") !== "";
  let e = null;
  for (const s of secrets)
    if (editId !== "" && s[".id"] === editId) {
      e = s;
      form = true;
    }
  if (form) {
    const profiles = await rq("/ppp/profile/print", { ".proplist": "name,local-address,remote-address,address-list" });
    const c = U(e && cs[e.name] ? cs[e.name] : {}, { nama: "", hp: "", alamat: "", tarif: "", due: "", gracep: "0", start: today(), fup: "" });
    if (!e && c.due === "") c.due = add_months(c.start, 1);
    const cur = c.paket ? c.paket : (e && e.profile) || "";
    const fup = c.fup !== "" ? c.fup : isoDef;
    const names = profiles.map((x) => x.name);
    const isoMissing = isoDef !== "" && !names.includes(isoDef);
    if (isoMissing) names.push(isoDef);
    const fmeta = fup_meta();
    for (const x of profiles) if (String(x["address-list"] || "").toLowerCase().includes("isolir") && !fmeta[x.name]) fmeta[x.name] = { list: x["address-list"], own: 1 };
    const plabel = (n) => (n === isoDef && isoMissing ? n + " (bawaan, dibuat otomatis saat Save)" : n + (n === isoDef ? " (bawaan)" : ""));
    const ev = (k, d = "") => (e && e[k] !== undefined ? e[k] : d);
    await page_head("PPP User", "", ["PPP User", url("ppp_secrets")]);
    echo('<div class="split"><form method="post" class="card" id="secretform">' + csrf_field() + '<input type="hidden" name="id" value="' + h(ev(".id")) + '"><input type="hidden" name="old" value="' + h(ev("name")) + '"><input type="hidden" name="user" value="' + h(ev("name")) + '">');
    echo('<div class="cardhead">' + icon("user") + "<strong>" + (e ? "Edit" : "Add") + ' PPP User</strong><span class="spacer"></span>' + (e ? '<a class="hl" href="' + h(url("ppp_user", { user: e.name })) + '">' + icon("eye") + 'Detail</a><a class="hl" href="' + h(url("ppp_pay", { user: e.name })) + '">' + icon("money") + "Bayar</a>" : "") + '<a class="x" href="' + h(url("ppp_secrets")) + '" title="Tutup" aria-label="Tutup">&times;</a></div>');
    echo('<div class="cardbody"><p class="msg err" id="ipwarn" hidden></p><div class="fsep first">Data pelanggan</div>');
    echo('<div class="frow"><label for="f_nama">Nama pelanggan</label><input id="f_nama" name="nama" value="' + h(c.nama) + '" placeholder="Kosong = memakai PPP Name"></div>');
    echo('<div class="frow"><label for="f_hp">Nomor WhatsApp</label><input id="f_hp" name="hp" value="' + h(c.hp) + '" inputmode="tel" placeholder="0812…"></div>');
    echo('<div class="frow"><label for="f_alamat">Alamat</label><input id="f_alamat" name="alamat" value="' + h(c.alamat) + '"></div>');
    if (e) {
      const jd = c.joined !== undefined ? c.joined : ppp_joined(c, e.name);
      echo('<div class="frow"><label for="f_joined">Tanggal Daftar</label><input id="f_joined" value="' + h(tgl(jd)) + '" disabled title="Terisi otomatis saat pelanggan pertama kali dibuat"><input type="hidden" name="joined" value="' + h(jd) + '"></div>');
    }
    echo('<div class="frow"><label for="tarif">Tarif per bulan</label><input name="tarif" id="tarif" type="text" inputmode="numeric" data-money value="' + (c.tarif !== "" ? h(money(c.tarif, false)) : "") + '" placeholder="100.000"></div>');
    echo('<div class="frow"><label for="f_start">Start Date</label><div class="join"><input id="f_start" name="start" type="date" value="' + h(c.start) + '">' + (e ? '<button type="button" class="btn" data-today="#f_start" data-recalc="#f_due" data-months="1" title="Start Date = hari ini, Jatuh Tempo = 1 bulan setelahnya">' + icon("reload") + "Reset</button>" : "") + "</div></div>");
    echo('<div class="frow"><label for="f_due_btn">Jatuh Tempo</label><div class="dpk" data-follow="#f_start" data-fresh="' + (e ? "0" : "1") + '"><button type="button" class="dpk-btn" id="f_due_btn" aria-haspopup="dialog">' + icon("cal") + '<span></span></button><input type="hidden" name="due" id="f_due" value="' + h(c.due) + '"></div></div>');
    echo('<div class="fsep">Akun PPP</div><div class="frow"><label for="f_svc">Services</label><select id="f_svc" name="service">' + ["any", "pppoe", "l2tp", "pptp", "sstp", "ovpn"].map((x) => opt(x, ev("service", "pppoe"))).join("") + "</select></div>");
    echo('<div class="frow"><label for="f_name">PPP Name</label><input id="f_name" name="name" value="' + h(ev("name")) + '" required autocomplete="off"></div>');
    echo('<div class="frow"><label for="f_pass">Password</label><div class="join"><input id="f_pass" name="password" type="password" value="' + h(ev("password")) + '" autocomplete="new-password" ' + (e ? "" : "required") + '><button type="button" class="btn eye" data-eye="#f_pass" title="Lihat kata sandi" aria-label="Lihat kata sandi">' + icon("eye") + '</button><button type="button" class="btn" id="f_gen" title="Buat kata sandi acak" aria-label="Buat kata sandi acak">' + icon("reload") + "</button></div></div>");
    let po = '<div class="frow"><label for="paket">Main Profile</label><select name="profile" id="paket" required>' + (!e ? '<option value="" disabled' + (cur === "" ? " selected" : "") + ">Pilih paket…</option>" : "");
    for (const p of profiles) {
      if (p.name !== cur && (fmeta[p.name] || p.name === isoDef || p.name === "default-encryption")) continue;
      po += '<option value="' + h(p.name) + '" data-harga="' + h(pk[p.name] !== undefined ? pk[p.name] : "") + '"' + (p["remote-address"] ? ' data-remote="1"' : "") + (p["local-address"] ? ' data-local="1"' : "") + (p.name === cur ? " selected" : "") + ">" + h(p.name) + "</option>";
    }
    echo(po + "</select></div>");
    echo('<div class="frow isorow"><label for="f_fup">Isolir Profile</label><select id="f_fup" name="fup">' + names.filter((n) => fmeta[n] || n === isoDef || n === fup).map((n) => opt(n, fup, plabel(n))).join("") + "</select></div>");
    echo('<div class="frow isorow"><label for="f_val">Validity</label><input id="f_val" name="validity" value="' + h(c.isooff !== undefined ? c.isooff : "") + '" pattern="0|\\d+|(\\d+[wdWD])+" placeholder="Jumlah hari di isolir, mis. 3" inputmode="numeric"></div>');
    echo('<div class="frow"><label for="f_local">Local Address</label><input id="f_local" name="local" value="' + h(ev("local-address")) + '" placeholder="Ikut profil"></div>');
    echo('<div class="frow"><label for="f_remote">Remote Address</label><input id="f_remote" name="remote" value="' + h(ev("remote-address")) + '" placeholder="Ikut profil"></div>');
    echo('<div class="frow"><label for="f_cmt">Comment</label><input id="f_cmt" name="comment" value="' + h(c.cmt !== undefined ? c.cmt : ppp_cmt_strip(ev("comment"))) + '" placeholder="Kosong = memakai PPP Name"></div>');
    echo('<p class="flowsum" id="flowsum"></p>');
    echo('<div class="btnrow formfoot">' + (e ? '<button class="btn bad" name="act" value="delete" formnovalidate data-confirm="Hapus secret ' + h(e.name) + ' dari router?">' + icon("trash") + "Remove</button>" : "") + '<span class="spacer"></span><a class="btn" href="' + h(url("ppp_secrets")) + '">Batal</a><button class="btn primary" id="f_save" name="act" value="save" data-ok="Ya, simpan" data-confirm="' + (e ? "Simpan perubahan " + h(e.name) + "?" : "Simpan pelanggan baru?") + '">' + icon("save") + "Save</button></div></div>");
    echo("<script>(function(){var f=document.currentScript.parentNode,idEl=f.querySelector('input[name=id]');if(!idEl||idEl.value!=='')return;var NL=String.fromCharCode(10);f.addEventListener('submit',function(e){var b=e.submitter;if(b&&b.value!=='save')return;var t=f.querySelector('#tarif'),v=t?t.value.replace(/[^0-9]/g,''):'';if(!b)return;if(!b.dataset.base)b.dataset.base=b.dataset.confirm||'';if(v===''||parseInt(v,10)===0){b.dataset.confirm='Tarif per bulan belum diisi'+NL+'Pelanggan akan disimpan tanpa tarif, sehingga tagihannya Rp 0. Tetap simpan?'}else{b.dataset.confirm=b.dataset.base}},true)})();</script>");
    echo("<script>(function(){var out=document.getElementById('flowsum');var due=document.getElementById('f_due'),pen=document.getElementById('f_fup'),val=document.getElementById('f_val'),main=document.getElementById('paket');var days=function(v){v=(v||'').trim().toLowerCase();if(/^\\d+$/.test(v))return +v;var t=0,ok=false;v.replace(/(\\d+)([wd])/g,function(_,n,u){ok=true;t+=+n*(u==='w'?7:1)});return ok?t:0};var b=function(t){var x=document.createElement('b');x.textContent=t;return x.outerHTML};var draw=function(){var n=days(val.value);var none=!due.value;document.querySelectorAll('#secretform .isorow').forEach(function(r){r.hidden=none});if(!out)return;if(none){out.innerHTML=b('NON Expired')+': tanpa jatuh tempo, pelanggan tidak pernah diisolir maupun di-disable.';return}var s='Lewat jatuh tempo → pindah ke '+b(pen.value)+' (internet berhenti, halaman pemberitahuan)';s+=n?' selama '+n+' hari → lalu '+b('secret di-disable'):' sampai membayar';out.innerHTML=s+'. Setelah bayar → kembali ke '+b(main.value||'Main Profile')+'.'};var gen=document.getElementById('f_gen'),pw=document.getElementById('f_pass');if(gen&&pw)gen.addEventListener('click',function(){var cs='abcdefghjkmnpqrstuvwxyz23456789',a=new Uint32Array(8),s='';(window.crypto||window.msCrypto).getRandomValues(a);for(var i=0;i<a.length;i++)s+=cs[a[i]%cs.length];pw.value=s;pw.type='text'});[due,pen,val,main].forEach(function(el){if(el){el.addEventListener('change',draw);el.addEventListener('input',draw)}});setInterval(function(){if(due&&due.value!==due._v){due._v=due.value;draw()}},400);draw()})();</script>");
    echo("</form>");
    echo('<section class="card"><div class="cardhead">' + icon("info") + '<strong>Read Me</strong></div><div class="cardbody"><table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody>');
    echo("<tr><td>Main Profile</td><td>Paket pelanggan selama belum melewati jatuh tempo. Profil isolir tidak ditampilkan di sini.</td></tr><tr><td>Tarif per bulan</td><td>Jumlah tagihan tiap bulan. Ikut harga Main Profile bila diisi di PPP Profiles.</td></tr><tr><td>Start Date</td><td>Tanggal mulai berlangganan.</td></tr><tr><td>Jatuh Tempo</td><td>Batas waktu pembayaran. Otomatis terisi 1 bulan setelah Start Date dan bisa diubah lewat kalender, misalnya pelanggan mulai berlangganan tanggal 25 tetapi ingin membayar tiap tanggal 1. Maju 1 bulan setiap pembayaran diterima. Pilih None di kalender untuk pelanggan tanpa jatuh tempo (NON Expired).</td></tr>");
    echo("<tr><td>Isolir Profile</td><td>Profil yang diterapkan setelah melewati jatuh tempo: internet berhenti dan pelanggan diarahkan ke halaman pemberitahuan pembayaran. Bawaan: " + h(isoDef) + ". Jika belum tersedia di router, panel membuatnya otomatis saat Save, lengkap dengan Address List isolir, firewall, dan web proxy.</td></tr><tr><td>Validity</td><td>Jangka waktu yang diberikan kepada pelanggan (secret) di isolir sebelum status layanan dinonaktifkan (di-disable). Kosong = tetap di isolir sampai membayar.</td></tr><tr><td>Setelah bayar</td><td>Pelanggan otomatis kembali ke Main Profile, secret aktif lagi, dan Jatuh Tempo maju 1 bulan.</td></tr><tr><td>NON Expired</td><td>Pilih None di kalender Jatuh Tempo lalu Save: tanpa tagihan, tidak pernah dipindah ke Isolir Profile maupun dinonaktifkan.</td></tr><tr><td>Reset</td><td>Hanya saat Edit. Tombol di kolom Start Date: Start Date diisi hari ini dan Jatuh Tempo 1 bulan setelahnya. Berlaku setelah Save.</td></tr>");
    echo('</tbody></table><p class="hint">Format Validity: jumlah hari, boleh angka saja atau dengan satuan d (hari) / w (minggu). Contoh: 3 atau 3d = 3 hari, 1w = 7 hari, 1w3d = 10 hari.<br>Satu scheduler di router (' + h(ppp_sched_name()) + ') memeriksa semua secret tiap hari: yang lewat jatuh tempo dipindah ke Isolir Profile dan comment-nya jadi "expired"; bila Validity habis, secret di-disable. Koneksinya diputus 5 menit kemudian supaya profil baru berlaku.</p></div></section></div>');
    page_foot();
    return;
  }

  const online = {};
  for (const a of await rq("/ppp/active/print", { ".proplist": "name,address,caller-id" })) online[a.name] = a;
  const f = ["online", "offline", "disabled", "late", "soon", "iso"].includes(get("f")) ? get("f") : "";
  const cnt = { "": 0, online: 0, offline: 0, disabled: 0, late: 0, soon: 0, iso: 0 };
  const rows = [];
  for (const s of secrets) {
    const n = s.name;
    const c = cs[n] || {};
    const st = bill_state(c);
    const fup = ppp_fup(c);
    const paket = c.paket ? c.paket : "";
    const isIso = fup !== "" && (s.profile || "") === fup && fup !== paket && (paket !== "" || fup === isoDef);
    const off = (s.disabled || "") === "true";
    const on = !!online[n];
    const tags = { "": true, online: on, offline: !on && !off, disabled: off, late: st[0] === "late", soon: st[0] === "soon" || st[0] === "grace", iso: isIso };
    for (const [k, v] of Object.entries(tags)) if (v) cnt[k]++;
    if (tags[f]) rows.push([s, c, st, isIso, on, off]);
  }
  await page_head("PPP User");
  const sched = (await ppp_sched_ok()) ? await ppp_sched_state() : { ok: false };
  const tiles = [["", "Total User", "user", "blue"], ["online", "Online", "link", "green"], ["offline", "Offline", "wifi", "gray"], ["late", "Menunggak", "money", "red"]];
  echo('<div class="stats">');
  for (const [k, label, ic, col] of tiles) echo('<a class="stat ' + col + (k === f ? " on" : "") + '" href="' + h(url("ppp_secrets", k === "" ? {} : { f: k })) + '"><span class="si">' + icon(ic) + "</span><div><small>" + h(label) + "</small><b>" + C.numberFormat(cnt[k], 0, ",", ".") + "</b></div></a>");
  echo("</div>");
  echo('<section class="card"><div class="cardhead">' + icon("user") + '<div class="ttl"><strong>Pelanggan PPP</strong><small>' + cnt[""] + " secret · " + cnt.online + ' online</small></div><div class="tools"><button type="button" class="btn small bad" id="ps-bulk">Remove 0</button><a class="hl icon" href="' + h(url("ppp_secrets", f === "" ? {} : { f })) + '" title="Muat ulang" aria-label="Reload Data">' + icon("reload") + '</a><a class="hl" href="' + h(url("ppp_payment")) + '">' + icon("money") + 'Pembayaran</a><a class="hl pri" href="' + h(url("ppp_secrets", { add: 1 })) + '">' + icon("plus") + "Add User</a></div></div>");
  echo('<div class="cardbody"><div class="hsfilter">' + (rows.length ? '<input type="search" class="filter" placeholder="Cari user, nama, profile…" data-filter="#tbl" aria-label="Search">' : "") + '<select aria-label="Saring status" onchange="location.href=this.value"' + (f !== "" ? ' class="active"' : "") + ">");
  for (const [k, v] of Object.entries({ "": "Semua status", online: "Online", offline: "Offline", disabled: "Disabled", late: "Menunggak", soon: "Segera jatuh tempo", iso: "Diisolir" })) echo('<option value="' + h(url("ppp_secrets", k === "" ? {} : { f: k })) + '"' + (k === f ? " selected" : "") + ">" + h(v) + " (" + cnt[k] + ")</option>");
  echo("</select>" + (f !== "" ? '<a class="btn small ghost" href="' + h(url("ppp_secrets")) + '">Clear Filter</a>' : "") + "</div>");
  if (!rows.length) echo('<div class="empty"><p class="emptytitle">' + (secrets.length ? "Tidak ada secret di saringan ini." : "Belum ada PPP user di router ini.") + "</p></div>");
  else {
    echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th class="chk nosort"><input type="checkbox" data-checkall aria-label="Pilih semua"></th><th class="dotc nosort"></th><th>User</th><th>Profile</th><th>Remote Address</th><th>Last Logged Out</th><th>Jatuh Tempo</th><th class="r">Tarif / bulan</th><th>Status</th><th class="nosort"></th></tr></thead><tbody>');
    for (const [s, c, st, isIso, on, off] of rows) {
      const n = s.name;
      const wa = st[0] !== "none" && st[0] !== "ok" ? wa_link(c, floatv(c.tarif) * months_owed(c)) : "";
      let llo = String(s["last-logged-out"] || "");
      if (llo.includes("1970")) llo = "";
      const edit = url("ppp_secrets", { edit: s[".id"] });
      const stl = off ? "Disabled" : on ? "Online" : "Offline";
      echo("<tr" + (off ? ' class="off"' : "") + '><td class="chk"><input type="checkbox" name="ids[]" value="' + h(s[".id"]) + '" aria-label="Pilih ' + h(n) + '"></td><td class="dotc"><span class="dot' + (off ? "" : on ? " up" : " down") + '" title="' + stl + '" aria-label="' + stl + '" role="img"></span></td>');
      echo('<td class="key"><a class="namelink" href="' + h(url("ppp_user", { user: n })) + '" title="PPP: ' + h(n) + '">' + h((c.nama || "") !== "" ? c.nama : n) + "</a>" + ((c.nama || "") !== "" && c.nama !== n ? '<small class="sub">' + h(n) + "</small>" : "") + (isIso ? " " + badge("Isolir", "bad") : "") + "</td>");
      echo("<td>" + h(s.profile || "") + '</td><td class="mono">' + h(on ? online[n].address || "" : s["remote-address"] || "") + "</td><td>" + h(ros_dt(llo)) + '</td><td data-v="' + h(c.due || "") + '">' + (is_billed(c) ? h(tgl(c.due)) : "") + '</td><td class="r">' + (c.tarif ? money(c.tarif) : "-") + "</td><td>" + (st[0] === "none" ? '<span class="muted">Tanpa tagihan</span>' : ["late", "grace"].includes(st[0]) ? badge("Belum bayar", "bad") : st[0] === "soon" ? badge(st[1], "warn") : badge("Lunas", "ok")) + "</td>");
      echo('<td class="acts">' + row_menu(['<a href="' + h(edit) + '">Edit</a>', '<a href="' + h(url("ppp_pay", { user: n })) + '">Bayar</a>', confirm_btn(off ? "Enable" : "Disable", "toggle", { id: s[".id"], user: n, to: off ? "enable" : "disable" }, off ? "" : "Nonaktifkan secret " + n + "?", ""), is_billed(c) ? '<a target="_blank" href="' + h(url("invoice_print", { user: n })) + '">Print Invoice</a>' : "", wa ? '<a target="_blank" rel="noopener" href="' + h(wa) + '">Send WhatsApp</a>' : "", on ? confirm_btn("Remove Active", "kick", { user: n }, "", "") : "", c.manual_iso ? confirm_btn("Restore Main Profile", "buka", { user: n }, "", "") : !isIso ? confirm_btn("Move to Isolir", "isolir", { user: n }, "Pindahkan " + n + " ke profil " + ppp_fup(c) + " dan putuskan koneksinya?", "") : "", confirm_btn("Remove", "delete", { id: s[".id"], user: n }, "Hapus secret " + n + " dari router?", "danger")]) + "</td></tr>");
    }
    echo('</tbody></table></div><p class="count"><span data-count="#tbl">' + rows.length + "</span> dari " + rows.length + " item</p>");
  }
  if (sched.ok) echo('<form method="post" class="count schedrow">' + csrf_field() + "<span>" + badge("Scheduler aktif", "ok") + " " + h(ppp_sched_name()) + " jalan tiap hari pukul 00:01" + (sched.daily && sched.daily["next-run"] ? ", berikutnya " + h(ros_dt(sched.daily["next-run"])) : "") + ". Sudah jalan " + intv(sched.daily && sched.daily["run-count"]) + ' kali.</span><button class="linkbtn" name="act" value="runsched" data-confirm="Jalankan pemeriksaan sekarang? Secret yang lewat tanggal langsung dipindah ke Isolir Profile.">Run Now</button></form>');
  echo('</div></section><form method="post" id="ps-form" hidden data-confirm="">' + csrf_field() + '<input type="hidden" name="act" value="bulk_delete"></form>');
  echo("<script>(function(){var t=document.getElementById('tbl'),b=document.getElementById('ps-bulk'),f=document.getElementById('ps-form');if(!t||!b){if(b)b.remove();return}var picked=function(){return Array.prototype.filter.call(t.querySelectorAll('tbody input[name=\"ids[]\"]'),function(c){return c.checked&&c.closest('tr').style.display!=='none'})};var u=function(){setTimeout(function(){var n=picked().length;b.classList.toggle('on',n>0);b.textContent='Remove '+n},0)};t.addEventListener('change',u);t.addEventListener('click',u);b.addEventListener('click',function(){var p=picked();if(!p.length)return;f.querySelectorAll('input[name=\"ids[]\"]').forEach(function(x){x.remove()});p.forEach(function(c){var i=document.createElement('input');i.type='hidden';i.name='ids[]';i.value=c.value;f.appendChild(i)});f.setAttribute('data-confirm','Hapus '+p.length+' secret dari router?'+String.fromCharCode(10)+'Koneksinya diputus dan data pelanggannya dihapus. Riwayat pembayaran tetap tersimpan.');if(f.requestSubmit)f.requestSubmit();else f.submit()})})();</script>");
  page_foot();
};
