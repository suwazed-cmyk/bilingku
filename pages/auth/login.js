"use strict";
const auth_page = require("./_auth");
const { verifyPw, hashPw } = require("../../lib/passwd");
module.exports = async function (C) {
  const { X, S, h, post, url, redirect, flash, db_load, db_save, csrf_field, cfg, cfg_set, now } = C;
  if (X().method === "POST") {
    if (post("act") === "logout") {
      C.session_destroy();
      throw C.redirectTo("./");
    }
    const ip = String(X().req.headers["x-forwarded-for"] || X().req.socket.remoteAddress || "-").split(",")[0].trim();
    const fails = db_load("login_fail");
    for (const [k, f] of Object.entries(fails)) if (f[1] < now() - 900) delete fails[k];
    if (fails[ip] && fails[ip][0] >= 5) {
      flash("Terlalu banyak percobaan gagal. Coba lagi 15 menit lagi.", "err");
      throw redirect("login");
    }
    const a = cfg("admin");
    const user = post("user");
    if (a && a.user === user && (await verifyPw(String(X().POST.pass || ""), a.hash))) {
      // hash bcrypt lama (versi PHP) diganti scrypt supaya tidak perlu PHP lagi
      if (!String(a.hash).startsWith("scrypt$")) cfg_set("admin", Object.assign({}, a, { hash: hashPw(String(X().POST.pass || "")) }));
      delete fails[ip];
      db_save("login_fail", fails);
      C.session_regenerate();
      S().seen = now();
      C.session_sweep();
      S().auth = a.user;
      delete S().rid;
      throw redirect("routers");
    }
    fails[ip] = [fails[ip] ? fails[ip][0] + 1 : 1, now()];
    db_save("login_fail", fails);
    await new Promise((r) => setTimeout(r, 600));
    flash("Nama pengguna atau kata sandi salah.", "err");
    throw redirect("login");
  }
  auth_page(C, "Login", '<form method="post" action="' + h(url("login")) + '">' + csrf_field() + '<label>Username<input name="user" required autocomplete="username" autocapitalize="none" spellcheck="false" autofocus></label><label>Password<div class="join"><input type="password" id="lg_pass" name="pass" required autocomplete="current-password"><button type="button" class="btn eye" data-eye="#lg_pass" title="Lihat kata sandi" aria-label="Lihat kata sandi">' + C.icon("eye") + '</button></div></label><button class="btn primary wide">Login</button></form>');
};
