// Router: daftar router MikroTik dan koneksi API-nya
"use strict";
const net = require("net");
module.exports = async function (C) {
  const { X, S, h, get, post, url, redirect, flash, cfg_set, routers, csrf_field, icon, icon_btn, echo, page_head, page_foot, cur_session, enc, panel_link, panel_routers, panel_router } = C;
  const rs = routers();
  if (X().method !== "POST" && !get("add") && !get("edit")) delete S().rid; // buka daftar router = mode Admin (seperti Mikhmon)

  if (X().method === "POST") {
    const act = post("act");
    let id = post("id");
    // kolom "Address : Port" -> [host, port]; port boleh kosong (bawaan 8728)
    const splitHp = (v) => {
      v = String(v || "").trim();
      let pt = 0;
      let m = /^\[([0-9a-fA-F:.]+)\]:(\d{1,5})$/.exec(v);
      if (!m && (v.match(/:/g) || []).length === 1) m = /^([^:\s]+):(\d{1,5})$/.exec(v);
      if (m) {
        v = m[1];
        pt = parseInt(m[2], 10);
      }
      return [v, pt === 0 ? 8728 : pt];
    };
    if (act === "ping") {
      const [ph, pp] = splitHp(post("host"));
      X().headers["Content-Type"] = "application/json; charset=utf-8";
      if (ph === "" || pp < 1 || pp > 65535) {
        X().body = Buffer.from(JSON.stringify({ ok: false, msg: "Isi Address dulu, misalnya 103.10.20.30:8728" }));
        throw C.EXIT();
      }
      let host = ph;
      const pid = post("panel_id").replace(/[^a-f0-9]/g, "");
      const t0 = Date.now();
      const r = await new Promise((resolve) => {
        const s = net.connect({ host, port: pp, timeout: 3000 });
        s.on("connect", () => {
          s.destroy();
          resolve({ ok: true });
        });
        s.on("timeout", () => {
          s.destroy();
          resolve({ ok: false, err: "waktu habis" });
        });
        s.on("error", (e) => resolve({ ok: false, err: e.code || e.message }));
      });
      const ms = Date.now() - t0;
      X().body = Buffer.from(JSON.stringify(r.ok ? { ok: true, msg: "Terjangkau: " + ph + ":" + pp + " (" + ms + " ms)" } : { ok: false, msg: "Tidak terjangkau: " + ph + ":" + pp + (r.err ? " (" + r.err + ")" : "") + (pid ? " — cek status VPN router di panel utama" : "") }));
      throw C.EXIT();
    }
    if (act === "select" && rs[id]) {
      S().rid = id;
      let back = post("back").replace(/[\r\n]/g, "");
      if (back === "" || back.includes("p=routers")) back = "p=dashboard";
      const bq = require("../../server").parseQuery(back);
      delete bq.session;
      throw C.redirectTo("./?" + C.qs(Object.assign({ session: cur_session(id) }, bq)));
    }
    if (act === "delete" && rs[id]) {
      delete rs[id];
      cfg_set("routers", rs);
      flash("Router dihapus dari daftar. Data tagihannya tetap tersimpan.");
      throw redirect("routers");
    }
    if (act === "save" || act === "connect") {
      const old = rs[id] || null;
      const [hostIn, portIn] = splitHp(post("host"));
      const r = { name: post("name"), host: hostIn, port: portIn, user: post("user"), ssl: 0, hotspot_name: post("hotspot_name"), dns_name: post("dns_name") };
      if (old && old.tz !== undefined) r.tz = old.tz;
      const pid = post("panel_id").replace(/[^a-f0-9]/g, "");
      if (pid !== "" && (await panel_router(pid))) r.panel_id = pid;
      const pass = String(X().POST.pass || "");
      r.pass = pass !== "" ? enc(pass) : old ? old.pass : enc("");
      if (r.name === "" || r.host === "" || r.user === "" || r.port < 1 || r.port > 65535 || r.hotspot_name === "" || r.dns_name === "" || (!old && pass === "")) {
        flash("Semua kolom wajib diisi: Router Name, Address:Port, Username, Password, Hotspot Name, dan DNS Name. Port harus 1-65535.", "err");
        throw redirect("routers", old ? { edit: id } : { add: 1 });
      }
      if (!old) id = require("crypto").randomBytes(3).toString("hex");
      rs[id] = r;
      cfg_set("routers", rs);
      delete S()["tzchk_" + id];
      if (act === "save") {
        flash("Router disimpan.");
        throw redirect("routers");
      }
      const api = await C.ros_open(r, false);
      if (api) {
        S().rid = id;
        await C.tz_sync(api);
        api.close();
        flash("Router disimpan dan berhasil terhubung. Zona waktu: " + (C.routers()[id].tz || X().tz) + ".");
        throw C.redirectTo("./?" + C.qs({ session: cur_session(id), p: "dashboard" }));
      }
      flash("Router disimpan, tetapi gagal terhubung: " + C.rosErr(), "err");
      throw redirect("routers", { edit: id });
    }
    throw redirect("routers");
  }

  const edit = get("edit");
  const form = get("add") || rs[edit];
  const e = rs[edit] || { name: "", host: "", port: "", user: "", ssl: 0, hotspot_name: "", dns_name: "" };
  const hp = String(e.host) === "" ? "" : (String(e.host).includes(":") ? "[" + e.host + "]" : e.host) + (String(e.port) !== "" ? ":" + e.port : "");
  const trName = (t) => ({ zt: "ZeroTier", wg: "WireGuard", l2tp: "L2TP" })[t] || "L2TP";

  if (form) {
    await page_head(rs[edit] ? "Edit Router" : "Add Router", "", Object.keys(rs).length ? ["Router", url("routers")] : null);
    echo('<div class="split"><form method="post" class="card">' + csrf_field() + '<input type="hidden" name="id" value="' + h(edit) + '">');
    echo('<div class="cardhead">' + icon("router") + "<strong>" + (rs[edit] ? "Edit Router" : "Add Router") + '</strong><span class="spacer"></span>' + (Object.keys(rs).length ? '<a class="x" href="' + h(url("routers")) + '" title="Tutup" aria-label="Tutup">&times;</a>' : "") + "</div>");
    echo('<div class="cardbody">');
    const PR = panel_link() ? await panel_routers() : null;
    if (PR) {
      echo('<div class="frow"><label for="r_panel">Dari panel utama</label><select id="r_panel" name="panel_id"><option value="">— Isi manual —</option>');
      for (const pr of PR.routers) {
        echo('<option value="' + h(pr.id) + '" data-name="' + h(pr.name) + '" data-addr="' + h(pr.address) + '" data-vps="' + h(pr.vpsAddress) + '" data-tr="' + h(pr.transport) + '"' + (String(e.panel_id || "") === String(pr.id) ? " selected" : "") + ">" + h(pr.name + " · " + trName(pr.transport) + " · " + (pr.address || "belum ada alamat") + " · " + (pr.online ? "tersambung" : pr.state === "pending" ? "menunggu pemasangan" : "terputus")) + "</option>");
      }
      echo("</select></div>");
      if (PR.error) echo('<p class="hint bad">' + h(PR.error) + "</p>");
      echo('<div id="r_panelhint" class="hint"' + (!e.panel_id ? ' style="display:none"' : "") + '>Alamat router diambil dari panel utama setiap terhubung (lewat VPN), jadi tidak perlu membuka API ke internet. Di MikroTik, izinkan API dari VPS:<pre class="code" id="r_cmd"></pre></div>');
    }
    echo('<div class="frow"><label for="r_name">Router Name</label><input id="r_name" name="name" value="' + h(e.name) + '" required placeholder="Kantor pusat"></div>');
    echo('<div class="frow"><label for="r_host">Address : Port</label><input id="r_host" name="host" value="' + h(hp) + '" required placeholder="103.10.20.30:8728 atau 10.66.0.2:8728"></div>');
    if (PR) echo('<p id="r_porthint" class="hint"' + (!e.panel_id ? ' style="display:none"' : "") + ">IP diisi otomatis dari VPN panel utama. <b>:8728</b> adalah port API bawaan MikroTik (Winbox → IP → Services → <b>api</b>). Bila port API router Anda diganti, ubah angka setelah titik dua. Tidak perlu port forwarding: Bilingku menghubungi router langsung lewat VPN.</p>");
    echo('<div class="frow"><label for="r_user">Username</label><input id="r_user" name="user" value="' + h(e.user) + '" required autocomplete="off"></div>');
    echo('<div class="frow"><label for="r_pass">Password</label><div class="join"><input id="r_pass" name="pass" type="password" autocomplete="new-password"' + (rs[edit] ? "" : " required") + ' placeholder="' + (rs[edit] ? "Kosongkan bila tidak diganti" : "") + '"><button type="button" class="btn eye" data-eye="#r_pass" title="Lihat kata sandi" aria-label="Lihat kata sandi">' + icon("eye") + "</button></div></div>");
    echo('<div class="fsep">Voucher</div>');
    echo('<div class="frow"><label for="r_hs">Hotspot Name</label><input id="r_hs" name="hotspot_name" value="' + h(e.hotspot_name) + '" required placeholder="WiFi Kampung"></div>');
    echo('<div class="frow"><label for="r_dns">DNS Name</label><input id="r_dns" name="dns_name" value="' + h(e.dns_name) + '" required placeholder="wifi.net"></div>');
    echo('<div class="btnrow formfoot"><span id="r_pingres" class="muted" role="status" aria-live="polite"></span><span class="spacer"></span><button type="button" id="r_ping" class="btn">' + icon("pulse") + 'Ping</button><button type="submit" name="act" value="save" class="btn">' + icon("save") + 'Save</button><button type="submit" name="act" value="connect" class="btn primary">' + icon("link") + "Save &amp; Connect</button></div>");
    echo("</div></form>");
    echo('<section class="card"><div class="cardhead">' + icon("info") + '<strong>Petunjuk</strong></div><div class="cardbody"><table class="readme"><thead><tr><th>Kolom</th><th>Keterangan</th></tr></thead><tbody>');
    echo("<tr><td>Address : Port</td><td>Alamat VPN router (L2TP, ZeroTier, WireGuard dari panel utama) atau IP publik/domain yang bisa dijangkau dari VPS, diikuti port API, misalnya <code>10.66.0.2:8728</code>. Port boleh dikosongkan (bawaan 8728). Aktifkan service api di IP › Services dan batasi Available From ke IP VPS.</td></tr>");
    echo("<tr><td>Username</td><td>Sebaiknya pengguna khusus panel dengan group full.</td></tr><tr><td>Hotspot Name</td><td>Nama yang tercetak di voucher (<code>$hotspotname</code>).</td></tr><tr><td>DNS Name</td><td>DNS name server hotspot, dipakai untuk alamat login dan kode QR (<code>$dnsname</code>).</td></tr><tr><td>Time Zone</td><td>Diambil otomatis dari System › Clock router setiap kali panel terhubung.</td></tr>");
    echo("</tbody></table></div></section></div>");
    echo("<script>(function(){var b=document.getElementById('r_ping'),o=document.getElementById('r_pingres');if(!b||!o)return;b.addEventListener('click',function(){var f=b.closest('form'),d=new URLSearchParams(new FormData(f));d.set('act','ping');o.textContent='Mengecek…';o.style.color='';b.disabled=true;fetch(location.href,{method:'POST',body:d,credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){o.textContent=j.msg;o.style.color=j.ok?'var(--ok)':'var(--bad)'}).catch(function(){o.textContent='Gagal mengecek.';o.style.color='var(--bad)'}).then(function(){b.disabled=false})})})();</script>");
    echo("<script>(function(){var sel=document.getElementById('r_panel');if(!sel)return;var nm=document.getElementById('r_name'),hp=document.getElementById('r_host'),hint=document.getElementById('r_panelhint'),cmd=document.getElementById('r_cmd'),ph=document.getElementById('r_porthint');function upd(fill){var o=sel.options[sel.selectedIndex],on=!!sel.value;hint.style.display=on?'':'none';if(ph)ph.style.display=on?'':'none';if(!on)return;var vps=o.dataset.vps||'IP-VPS';cmd.textContent='/ip service set api disabled=no address='+vps+'/32\\n/user add name=bilingku group=full password=SANDI-KUAT address='+vps+'/32';if(fill){if(!nm.value)nm.value=o.dataset.name;var m=hp.value.match(/:(\\d{1,5})\\s*$/);hp.value=(o.dataset.addr||'')+':'+(m?m[1]:'8728')}}sel.addEventListener('change',function(){upd(true)});upd(false)})();</script>");
  } else {
    await page_head("Daftar Router", '<a class="btn primary" href="' + h(url("routers", { add: 1 })) + '">' + icon("plus") + "Tambah Router</a>");
    const pr = panel_link() ? await panel_routers() : null;
    const pmap = {};
    if (pr) for (const x of pr.routers) pmap[x.id] = x;
    echo('<div class="rgrid">');
    let n = 0;
    for (const [id, r] of Object.entries(rs)) {
      n++;
      const hs = String(r.hotspot_name || "").trim();
      const p = r.panel_id ? pmap[r.panel_id] : null;
      const vpn = p ? '<span class="pill ' + (p.online ? "ok" : "bad") + '">' + h(trName(p.transport)) + " · " + (p.online ? "tersambung" : "terputus") + "</span>" : '<span class="pill">Manual</span>';
      echo('<div class="rcard"><div class="rt"><span class="av">' + icon("router") + '</span><div class="nm"><strong title="' + h(r.name) + '">' + h(r.name) + "</strong><small>" + h(p && p.address ? p.address : r.host) + ":" + h(r.port) + "</small></div>" + vpn + "</div>");
      echo('<div class="ri"><span><b>Sesi</b> ' + h(cur_session(id)) + "</span>" + (hs !== "" ? "<span><b>Hotspot</b> " + h(hs) + "</span>" : "") + "</div>");
      echo('<div class="ra"><form method="post" class="go">' + csrf_field() + '<input type="hidden" name="act" value="select"><input type="hidden" name="id" value="' + h(id) + '"><input type="hidden" name="back" value="p=dashboard"><button class="btn primary">' + icon("link") + 'Connect</button></form><a class="icbtn" href="' + h(url("routers", { edit: id })) + '" title="Edit" aria-label="Edit">' + icon("edit") + "</a>" + icon_btn("trash", "Hapus", "delete", { id }, "Hapus router " + r.name + " dari daftar?", "bad") + "</div></div>");
    }
    echo('<a class="rcard radd" href="' + h(url("routers", { add: 1 })) + '">' + icon("plus") + "<span>Tambah Router</span></a></div>");
    echo('<p class="count">' + n + " router" + (pr && pr.error ? ' · <span class="bad">' + h(pr.error) + "</span>" : "") + "</p>");
  }
  page_foot();
};
