// PPP Profiles: paket (harga per bulan) dan profil isolir (address-list, firewall, web proxy, halaman pemberitahuan)
"use strict";
module.exports = async function (C) {
  const { X, h, get, post, url, back, redirect, flash, csrf_field, icon, echo, page_head, page_foot, need_ros, rq, rdo, rremove, setting, packages, db_save, db_load, db_delete, rkey, date, money, money_in, fup_remove, fup_setup, fup_meta, pool_tag, isopage_url, pool_dialog, opt, badge, row_menu, confirm_btn, floatv } = C;
  await need_ros("PPP Profiles");
  const iso = String(setting("isolir_profile"));
  if (X().method === "POST") {
    const pk = packages();
    if (post("act") === "delete") {
      const name = post("name");
      if (await rdo("/ppp/profile/remove", { ".id": post("id") })) {
        delete pk[name];
        db_save(rkey("packages"), pk);
        const pf = db_load(rkey("pfup"));
        delete pf[name];
        db_save(rkey("pfup"), pf);
        const n = await fup_remove(name);
        const pools = (await rq("/ip/pool/print", { "?comment": pool_tag(name), ".proplist": ".id" })).map((x) => x[".id"]);
        const np = await rremove("/ip/pool", pools);
        flash("Profil " + name + " dihapus." + (n >= 0 ? " Address-list, firewall, dan aturan web proxy isolirnya ikut dihapus (" + n + " aturan)." : "") + (np ? " IP pool-nya ikut dihapus." : ""));
      }
      throw redirect("ppp_profiles");
    }
    const id = post("id");
    const name = post("name");
    const old = post("old");
    if (name === "") {
      flash("Isi nama profil.", "err");
      throw back();
    }
    const isPen = post("penalty") === "1";
    const isFup = isPen;
    const pf = db_load(rkey("pfup"));
    const list = post("list").replace(/[^a-zA-Z0-9_-]/g, "") || "isolir";
    let html = null;
    const up = X().FILES.page;
    if (isFup && up && up.name && up.size) {
      if (!/\.html?$/i.test(up.name) || up.size > 524288) {
        flash("File halaman isolir harus .html dan paling besar 512 KB.", "err");
        throw back();
      }
      html = up.data.toString("utf8");
    }
    const remote = post("remote");
    const unset = [];
    const p = { name, "only-one": ["yes", "no"].includes(post("only")) ? post("only") : "default", comment: post("comment") };
    const vals = { "local-address": post("local"), "remote-address": remote, "rate-limit": post("rate"), "dns-server": post("dns"), "parent-queue": post("parent"), "address-list": isFup ? list : post("alist") };
    for (const [k, v] of Object.entries(vals)) {
      if (v !== "") p[k] = v;
      else if (id !== "") unset.push(k);
    }
    const ok = id !== "" ? await rdo("/ppp/profile/set", Object.assign({ ".id": id }, p)) : await rdo("/ppp/profile/add", p);
    if (!ok) throw back();
    for (const k of unset) await rdo("/ppp/profile/unset", { ".id": id, "value-name": k }, true);
    if (old !== "" && old !== name) {
      delete pk[old];
      await fup_remove(old);
    }
    if (isPen) delete pk[name];
    else pk[name] = money_in(post("harga"));
    db_save(rkey("packages"), pk);
    if (old !== "" && old !== name) delete pf[old];
    delete pf[name];
    db_save(rkey("pfup"), pf);
    const msg = "Profil " + name + " disimpan.";
    if (remote === "" || post("local") === "") flash("Perhatian: profil " + name + " tanpa " + [remote === "" ? "IP pool (Remote Address)" : "", post("local") === "" ? "Local Address" : ""].filter(Boolean).join(" dan ") + ". Setiap secret yang memakainya wajib diisi alamatnya sendiri, kalau tidak PPPoE tidak bisa tersambung.", "warn");
    if (isFup) {
      if (html !== null) db_save(rkey("isopage"), { html, name: require("path").basename(up.name), at: date("Y-m-d H:i") });
      if (post("page_reset") === "1") db_delete(rkey("isopage"));
      if (await fup_setup(name, list)) flash(msg + " Isolir dipasang: address-list " + list + ", firewall, dan web proxy.");
      else flash(msg + " Tetapi sebagian aturan isolir gagal dipasang. Periksa pesan di atas lalu simpan ulang profil ini.", "warn");
    } else {
      const n = await fup_remove(name);
      flash(msg + (n >= 0 ? " Aturan isolirnya dihapus." : ""));
    }
    const row = await rq("/ppp/profile/print", { "?name": name, ".proplist": ".id" });
    throw redirect("ppp_profiles", row.length ? { edit: row[0][".id"] } : {});
  }
  const profiles = await rq("/ppp/profile/print");
  const pk = packages();
  const fm = fup_meta();
  const pfl = db_load(rkey("pfup"));
  const editId = get("edit");
  let form = get("add") !== "";
  let e = null;
  for (const p of profiles)
    if (editId !== "" && p[".id"] === editId) {
      e = p;
      form = true;
    }
  await page_head("PPP Profiles");
  if (form) {
    const pools = await rq("/ip/pool/print", { ".proplist": "name,ranges" });
    const queues = await rq("/queue/simple/print", { ".proplist": "name" });
    const m = e ? fm[e.name] || null : null;
    const isPen = m !== null || (e && pfl[e.name]) || get("add") === "fup" || (e && e.name === iso);
    const isFup = isPen;
    const ev = (k, d = "") => (e && e[k] !== undefined ? e[k] : d);
    const curRemote = String(ev("remote-address"));
    const known = curRemote === "" || pools.some((x) => x.name === curRemote);
    const pg = db_load(rkey("isopage"));
    echo('<div class="split"><form method="post" class="card" enctype="multipart/form-data">' + csrf_field() + '<input type="hidden" name="id" value="' + h(ev(".id")) + '"><input type="hidden" name="old" value="' + h(ev("name")) + '">' + (isPen ? '<input type="hidden" name="penalty" value="1">' : ""));
    echo('<div class="cardhead">' + icon("pie") + "<strong>" + (e ? "Edit" : "Add") + " " + (isPen ? "Isolir" : "PPP") + ' Profile</strong><span class="spacer"></span><a class="x" href="' + h(url("ppp_profiles")) + '" title="Tutup" aria-label="Tutup">&times;</a></div><div class="cardbody">');
    echo('<div class="frow"><label for="p_name">Name</label><input id="p_name" name="name" value="' + h(ev("name")) + '" required placeholder="' + (isFup ? "isolir" : "20M") + '"></div>');
    echo('<div class="frow"><label for="p_local">Local Address</label><input id="p_local" name="local" value="' + h(ev("local-address")) + '" placeholder="192.168.22.1"></div>');
    let ro = '<div class="frow"><label for="p_remote">Remote Address</label><div class="join"><select id="p_remote" name="remote" class="grow"><option value="">(tanpa pool)</option>';
    if (!known) ro += opt(curRemote, curRemote, curRemote + " (alamat tetap)");
    for (const x of pools) ro += opt(x.name, curRemote, x.name + " (" + (x.ranges || "") + ")");
    echo(ro + '</select><button type="button" class="btn" data-open="#pooldlg">' + icon("plus") + "Add</button></div></div>");
    echo('<div class="frow"><label for="p_rate">Rate Limit</label><input id="p_rate" name="rate" value="' + h(ev("rate-limit")) + '" placeholder="' + (isFup ? "1M/1M" : "20M/20M") + '"></div>');
    echo('<div class="frow"><label for="p_only">Only One</label><select id="p_only" name="only">' + opt("default", ev("only-one", "default")) + opt("yes", ev("only-one")) + opt("no", ev("only-one")) + "</select></div>");
    echo('<div class="frow"><label for="p_parent">Parent Queue</label><input id="p_parent" name="parent" value="' + h(ev("parent-queue") === "none" ? "" : ev("parent-queue")) + '" list="queues" placeholder="none"><datalist id="queues">' + queues.map((x) => '<option value="' + h(x.name) + '">').join("") + "</datalist></div>");
    echo('<div class="frow"><label for="p_dns">DNS Server</label><input id="p_dns" name="dns" value="' + h(ev("dns-server")) + '" placeholder="8.8.8.8,1.1.1.1"></div>');
    echo('<div class="frow"><label for="p_cmt">Comment</label><input id="p_cmt" name="comment" value="' + h(ev("comment")) + '"></div>');
    if (isFup) {
      echo('<div class="fsep">Isolir</div><p class="hint">Pelanggan di profil ini masuk Address List; internet dihentikan dan semua situs HTTP diarahkan ke halaman pemberitahuan pembayaran.</p><div class="isoonly">');
      echo('<div class="frow"><label for="p_list">Address List</label><input id="p_list" name="list" value="' + h(m && m.list ? m.list : ev("address-list", "isolir")) + '" pattern="[A-Za-z0-9_\\-]+" placeholder="isolir"></div>');
      echo('<div class="frow"><label for="p_page">Halaman isolir (.html)</label><input id="p_page" name="page" type="file" accept=".html,.htm,text/html" class="bkfile"></div>');
      echo('<p class="hint">' + (pg.html ? "Terpasang: " + h(pg.name || "halaman unggahan") + " (" + h(pg.at || "") + ")." : "Belum ada unggahan, jadi dipakai halaman bawaan.") + ' <a target="_blank" rel="noopener" href="' + h(isopage_url()) + '">Preview</a></p>');
      if (pg.html) echo('<div class="frow"><label for="p_reset">Halaman bawaan</label><select id="p_reset" name="page_reset">' + opt("0", "0", "Tetap pakai unggahan") + opt("1", "0", "Buang unggahan, pakai halaman bawaan") + "</select></div>");
      echo("</div>");
    } else {
      echo('<div class="fsep">Tagihan</div><div class="frow"><label for="p_alist">Address List</label><input id="p_alist" name="alist" value="' + h(ev("address-list")) + '" placeholder="opsional"></div>');
      echo('<div class="frow"><label for="p_harga">Harga per bulan</label><input id="p_harga" name="harga" type="text" inputmode="numeric" data-money value="' + (e && pk[e.name] ? h(money(pk[e.name], false)) : "") + '" placeholder="100.000"></div>');
    }
    echo('<div class="btnrow formfoot"><span class="spacer"></span><a class="btn" href="' + h(url("ppp_profiles")) + '">Batal</a><button class="btn primary" name="act" value="save">' + icon("save") + "Save</button></div></div></form>");
    echo(pool_dialog(true));
    echo('<section class="card"><div class="cardhead">' + icon("info") + '<strong>Read Me</strong></div><div class="cardbody"><table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody><tr><td>Rate Limit</td><td>Batas kecepatan rx/tx (unggah/unduh pelanggan), misalnya 20M/20M.</td></tr><tr><td>Remote Address</td><td>Pilih IP pool yang ada di router, atau klik Add untuk membuat pool baru. Pelanggan mendapat IP bergantian dari pool. Untuk IP tetap, isi Remote Address di secret dengan alamat di luar rentang pool.</td></tr><tr><td>Only One</td><td>yes = satu secret hanya boleh dipakai satu perangkat.</td></tr>');
    if (isFup) echo("<tr><td>Isolir</td><td>Pelanggan di profil ini masuk Address List. Firewall hanya mengizinkan DNS dan halaman pemberitahuan, lalu web proxy mengalihkan semua situs HTTP ke halaman pemberitahuan pembayaran.</td></tr><tr><td>Halaman isolir</td><td>Satu file .html yang berdiri sendiri (gambar ditanam di dalam file, bukan file terpisah). Satu halaman dipakai untuk semua profil isolir di router ini.</td></tr><tr><td>Situs HTTPS</td><td>Tidak bisa dialihkan, jadi hanya gagal dibuka. Ponsel biasanya tetap memunculkan halaman isolir lewat pemeriksaan koneksi otomatis.</td></tr><tr><td>Remove</td><td>Address-list, aturan firewall, dan aturan web proxy yang dibuat di sini ikut dihapus. IP pool tidak ikut dihapus; kelola di menu IP Pool. Web proxy dimatikan lagi bila panel yang menyalakannya.</td></tr>");
    else echo("<tr><td>Harga per bulan</td><td>Dipakai sebagai tarif bawaan saat menambah secret dengan profil ini.</td></tr><tr><td>Profil Isolir</td><td>Dibuat lewat tombol Add Isolir di daftar profil, lalu dipilih sebagai Isolir Profile di PPP User." + (e ? ' <a href="' + h(url("ppp_profiles", { edit: e[".id"], add: "fup" })) + '">Jadikan profil ini profil isolir</a>' : "") + "</td></tr>");
    echo("</tbody></table></div></section></div>");
  } else {
    const cnt = {};
    for (const s of await rq("/ppp/secret/print", { ".proplist": "profile" })) cnt[s.profile || ""] = (cnt[s.profile || ""] || 0) + 1;
    echo('<section class="card"><div class="cardhead">' + icon("pie") + '<div class="ttl"><strong>PPP Profiles</strong><small>' + profiles.length + ' paket &amp; profil isolir</small></div><div class="tools"><input type="search" class="filter" data-filter="#tbl" placeholder="Cari profil…" aria-label="Cari"><a class="hl icon" href="' + h(url("ppp_profiles")) + '" title="Muat ulang" aria-label="Reload Data">' + icon("reload") + '</a><a class="hl" href="' + h(url("ppp_profiles", { add: "fup" })) + '">' + icon("plus") + 'Add Isolir</a><a class="hl pri" href="' + h(url("ppp_profiles", { add: 1 })) + '">' + icon("plus") + 'Add Profile</a></div></div><div class="cardbody">');
    echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th>Name</th><th>Local Address</th><th>Remote Address</th><th>Rate Limit</th><th>Only One</th><th>Address List</th><th>Parent Queue</th><th class="r">Harga / bulan</th><th class="r">Secrets</th><th>Comment</th><th class="nosort"></th></tr></thead><tbody>');
    for (const p of profiles) {
      const def = (p.default || "") === "true";
      const isF = !!fm[p.name];
      echo('<tr><td class="key"><a class="namelink" href="' + h(url("ppp_profiles", { edit: p[".id"] })) + '">' + h(p.name) + "</a>" + (isF ? " " + badge("Isolir", "bad") : p.name === iso ? " " + badge("Isolir bawaan · belum lengkap", "warn") : "") + '</td><td class="mono">' + h(p["local-address"] || "") + '</td><td class="mono">' + h(p["remote-address"] || "") + "</td><td>" + h(p["rate-limit"] || "") + "</td><td>" + h(p["only-one"] || "") + "</td><td>" + h(p["address-list"] || "") + "</td><td>" + h((p["parent-queue"] || "") === "none" ? "" : p["parent-queue"] || "") + '</td><td class="r" data-v="' + floatv(pk[p.name]) + '">' + (pk[p.name] ? money(pk[p.name]) : "") + '</td><td class="r">' + (cnt[p.name] || 0) + "</td><td>" + h(p.comment || "") + '</td><td class="acts">' + row_menu(['<a href="' + h(url("ppp_profiles", { edit: p[".id"] })) + '">Edit</a>', def ? "" : confirm_btn("Remove", "delete", { id: p[".id"], name: p.name }, "Hapus profil " + p.name + "?" + (isF ? " Address-list, firewall, dan aturan web proxy isolirnya ikut dihapus." : ""), "danger")]) + "</td></tr>");
    }
    echo('</tbody></table></div><p class="count"><span data-count="#tbl">' + profiles.length + "</span> dari " + profiles.length + " item</p></div></section>");
  }
  page_foot();
};
