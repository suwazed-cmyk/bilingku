// Admin Settings: data usaha, isolir PPPoE, scheduler, backup & restore, dan kata sandi admin
"use strict";
const fs = require("fs");
const path = require("path");
const { writeZip, readZip } = require("../../lib/zip");
const { verifyPw, hashPw } = require("../../lib/passwd");
module.exports = async function (C) {
  const { X, S, h, post, redirect, flash, cfg, cfg_set, setting, routers, csrf_field, icon, echo, page_head, page_foot, confirm_btn, app_name, app_slug, ppp_sched_name, bytes, date, DATA, DB_GUARD } = C;
  const upDir = path.join(DATA, "upload");
  const backup_files = () => {
    const f = {};
    try {
      for (const x of fs.readdirSync(upDir)) if (/^logo\./.test(x)) f["upload/" + x] = path.join(upDir, x);
    } catch (e) {
      /* tidak ada logo */
    }
    return f;
  };
  const backup_entries = () => {
    const e = [];
    for (const [name, s] of Object.entries(C.db_export())) e.push(["data/" + name, s]);
    for (const [name, p] of Object.entries(backup_files())) e.push([name, fs.readFileSync(p)]);
    return e;
  };

  if (X().method === "POST") {
    const act = post("act");
    if (act === "save") {
      const iso = post("isolir_profile").replace(/[^A-Za-z0-9_.-]/g, "") || "isolir";
      cfg_set("settings", { panel: post("panel") !== "" ? post("panel") : "Bilingku", company: post("company"), address: post("address"), phone: post("phone"), currency: post("currency", "Rp"), tz: setting("tz"), isolir_profile: iso, wa_tpl: String(X().POST.wa_tpl || "").replace(/\r/g, ""), voucher_note: post("voucher_note") });
      const n = Object.keys(routers()).length && routers()[S().rid || ""] ? await C.ppp_sync_all() : -1;
      flash("Pengaturan disimpan." + (n >= 0 ? " Scheduler isolir " + n + " pelanggan diperbarui." : ""));
    } else if (act === "sync") {
      const n = await C.ppp_sync_all();
      if (n >= 0) flash("Profil dan scheduler isolir " + n + " pelanggan sudah disamakan dengan data tagihan.");
      else flash("Router tidak terhubung: " + (C.rosErr() || ""), "err");
    } else if (act === "password") {
      const a = cfg("admin");
      const nw = String(X().POST.new || "");
      if (!(await verifyPw(String(X().POST.cur || ""), a.hash))) flash("Kata sandi saat ini salah.", "err");
      else if (nw.length < 8) flash("Kata sandi baru minimal 8 karakter.", "err");
      else if (nw !== String(X().POST.new2 || "")) flash("Ulangi kata sandi baru dengan sama persis.", "err");
      else {
        cfg_set("admin", Object.assign({}, a, { hash: hashPw(nw) }));
        flash("Kata sandi diganti.");
      }
    } else if (act === "backup") {
      const z = writeZip([...backup_entries(), ["bilingku-backup.txt", app_name() + " " + C.APP_VER + "\nDibuat " + date("Y-m-d H:i:s") + "\n"]]);
      X().headers["Content-Type"] = "application/zip";
      X().headers["Content-Disposition"] = 'attachment; filename="backup-' + app_slug() + "-" + date("Ymd-His") + '.zip"';
      X().body = z;
      throw C.EXIT();
    } else if (act === "restore") {
      const f = X().FILES.zip;
      if (!f || !f.size) {
        flash("Pilih file backup (.zip) dulu.", "err");
        throw redirect("settings");
      }
      let ents;
      try {
        ents = readZip(f.data);
      } catch (e) {
        ents = null;
      }
      if (!ents || !ents.some((x) => x.name === "bilingku-backup.txt")) {
        flash("File ini bukan backup " + app_name() + ".", "err");
        throw redirect("settings");
      }
      const take = [];
      let bad = 0;
      let hasCfg = false;
      for (const en of ents) {
        if (en.name === "bilingku-backup.txt") continue;
        let m = /^data\/([A-Za-z0-9_-]+\.json\.php)$/.exec(en.name);
        if (m) {
          const s = en.data.toString("utf8");
          const p = s.indexOf("\n");
          let ok = s.startsWith(DB_GUARD);
          try {
            ok = ok && typeof JSON.parse(s.slice(p + 1)) === "object";
          } catch (e) {
            ok = false;
          }
          if (!ok) {
            bad++;
            continue;
          }
          if (m[1] === "config.json.php") hasCfg = true;
          take.push(["db", m[1], s]);
        } else if ((m = /^upload\/(logo\.(png|jpg|gif|webp))$/.exec(en.name))) take.push(["file", m[1], en.data]);
        else bad++;
      }
      if (!hasCfg) {
        flash("Backup tidak berisi config.json.php, restore dibatalkan.", "err");
        throw redirect("settings");
      }
      const keep = "sebelum-restore-" + date("Ymd-His") + ".zip";
      fs.writeFileSync(path.join(DATA, keep), writeZip([...backup_entries(), ["bilingku-backup.txt", "otomatis sebelum restore " + date("Y-m-d H:i:s")]]), { mode: 0o600 });
      fs.mkdirSync(upDir, { recursive: true });
      let ok = 0;
      for (const [kind, name, s] of take) {
        if (kind === "db") {
          if (C.db_import_raw(name, s)) ok++;
        } else {
          for (const old of Object.keys(backup_files())) if (old !== "upload/" + name) fs.rmSync(path.join(DATA, old), { force: true });
          fs.writeFileSync(path.join(upDir, name), s);
          ok++;
        }
      }
      X().CFG = null;
      C.session_regenerate();
      flash("Restore selesai: " + ok + " file dipulihkan" + (bad ? ", " + bad + " file diabaikan" : "") + ". Keadaan sebelumnya disimpan di data/" + keep + ".");
    }
    throw redirect("settings");
  }

  const bf = backup_files();
  let bsize = 0;
  for (const p of Object.values(bf)) bsize += fs.statSync(p).size;
  for (const s of Object.values(C.db_export())) bsize += Buffer.byteLength(s);
  const nfile = Object.keys(C.db_export()).length + Object.keys(bf).length;
  let prev = [];
  try {
    prev = fs.readdirSync(DATA).filter((x) => /^sebelum-restore-.*\.zip$/.test(x)).sort();
  } catch (e) {
    prev = [];
  }

  await page_head("Admin Settings");
  echo('<div class="setgrid"><form method="post" class="card">' + csrf_field() + '<input type="hidden" name="act" value="save">');
  echo('<div class="cardhead">' + icon("gear") + "<strong>General</strong></div><div class=\"cardbody\">");
  echo('<div class="frow"><label for="s_panel">Panel Name</label><input id="s_panel" name="panel" value="' + h(app_name()) + '" maxlength="24" required></div>');
  echo('<div class="frow"><label for="s_co">Company</label><input id="s_co" name="company" value="' + h(setting("company")) + '"></div>');
  echo('<div class="frow"><label for="s_ph">Phone</label><input id="s_ph" name="phone" value="' + h(setting("phone")) + '"></div>');
  echo('<div class="frow"><label for="s_ad">Address</label><input id="s_ad" name="address" value="' + h(setting("address")) + '"></div>');
  echo('<div class="frow"><label for="s_cur">Currency</label><input id="s_cur" name="currency" value="' + h(setting("currency")) + '" maxlength="5"></div>');
  echo('<div class="frow"><label for="s_vn">Voucher Note</label><input id="s_vn" name="voucher_note" value="' + h(setting("voucher_note")) + '" placeholder="Misalnya nomor pengaduan"></div>');
  echo('<div class="fsep">Isolir PPPoE</div><div class="frow"><label for="s_iso">Isolir Profile</label><input id="s_iso" name="isolir_profile" value="' + h(setting("isolir_profile")) + '" required></div>');
  echo('<div class="frow"><label for="s_wa">WhatsApp Message</label><textarea id="s_wa" name="wa_tpl" rows="4">' + h(setting("wa_tpl")) + "</textarea></div>");
  echo('<p class="hint">Pesan bisa memakai {nama}, {jumlah}, {jatuh_tempo}, dan {perusahaan}. Paket isolir dibuat otomatis bila belum ada di router. Alur PPPoE: lewat jatuh tempo → pindah ke Isolir Profile → setelah Validity pelanggan habis (diisi per pelanggan di PPP User) secret di-disable, tidak dihapus → saat dibayar secret aktif lagi dan kembali ke paketnya.</p>');
  echo('<div class="btnrow formfoot"><span class="spacer"></span><button class="btn primary">' + icon("save") + "Save</button></div></div></form>");

  echo('<div class="setcol"><section class="card"><div class="cardhead">' + icon("save") + '<strong>Backup &amp; Restore</strong></div><div class="cardbody">');
  echo('<div class="seg"><button type="button" class="on" data-tab="bk_b">Backup</button><button type="button" data-tab="bk_r">Restore</button></div>');
  echo('<div id="bk_b" class="segpane"><div class="bkban"><span class="bkbic">' + icon("save") + "</span><div><small>PAKET CADANGAN<em>.ZIP</em></small><b>" + h(bytes(bsize)) + " <span>&bull; " + nfile + " data</span></b></div></div>");
  echo('<p class="bklbl">Data yang disertakan:</p><div class="bkchips"><span style="--c:#0ea5e9">Router</span><span style="--c:#10b981">Pelanggan</span><span style="--c:#f59e0b">Pembayaran</span><span style="--c:#a855f7">Voucher</span><span style="--c:#6366f1">Template &amp; Logo</span></div>');
  echo('<form method="post">' + csrf_field() + '<button class="btn primary bkbig" name="act" value="backup">' + icon("down") + 'Unduh File Backup (.zip)</button></form><p class="bknote">Berisi login router dan data pelanggan: simpan di tempat yang aman. Format sama dengan versi PHP, jadi bisa dipulihkan di kedua versi.</p></div>');
  echo('<div id="bk_r" class="segpane" hidden><form method="post" enctype="multipart/form-data" data-confirm="Restore backup ini?&#10;Data panel sekarang akan diganti isi backup. Keadaan sekarang disimpan otomatis dulu.">' + csrf_field() + '<input type="hidden" name="act" value="restore"><div class="bkban bad"><span class="bkbic">' + icon("reload") + '</span><div><small>PULIHKAN DATA<em>.ZIP</em></small><b>Restore <span>&bull; dari file backup</span></b></div></div>');
  echo('<p class="bklbl">Pilih file backup (.zip):</p><input id="s_zip" class="bkfile" name="zip" type="file" accept=".zip,application/zip" required><button class="btn bad bkbig">' + icon("reload") + 'Restore Sekarang</button></form><p class="bknote">Data sekarang disimpan otomatis sebelum diganti isi backup.' + (prev.length ? "<br>Cadangan terakhir: data/" + h(prev[prev.length - 1]) : "") + "</p></div>");
  echo("</div></section>");

  echo('<section class="card"><div class="cardhead">' + icon("clock") + '<strong>Scheduler Isolir</strong></div><div class="cardbody"><p class="hint">Satu scheduler di router (<code>' + h(ppp_sched_name()) + "</code>) memeriksa semua PPP secret tiap hari. Secret yang tanggal di comment-nya sudah lewat dipindah ke Isolir Profile, lalu koneksinya diputus 5 menit kemudian. Pakai tombol ini bila scheduler terhapus atau data di router diubah dari luar panel.</p>");
  echo('<div class="btnrow">' + (routers()[S().rid || ""] ? confirm_btn("Reinstall Scheduler", "sync", {}, "", "btn") : '<span class="muted">Buka (Connect) router dulu untuk memasang scheduler.</span>') + "</div></div></section>");

  echo('<form method="post" class="card">' + csrf_field() + '<input type="hidden" name="act" value="password"><div class="cardhead">' + icon("lock") + '<strong>Admin Password</strong></div><div class="cardbody">');
  echo('<div class="frow"><label for="s_cur_pw">Current Password</label><input id="s_cur_pw" type="password" name="cur" required autocomplete="current-password"></div>');
  echo('<div class="frow"><label for="s_new_pw">New Password</label><input id="s_new_pw" type="password" name="new" required minlength="8" autocomplete="new-password"></div>');
  echo('<div class="frow"><label for="s_new_pw2">Confirm Password</label><input id="s_new_pw2" type="password" name="new2" required minlength="8" autocomplete="new-password"></div>');
  echo('<div class="btnrow formfoot"><span class="spacer"></span><button class="btn primary">' + icon("lock") + "Change Password</button></div></div></form></div></div>");
  page_foot();
};
