"use strict";
const auth_page = require("./_auth");
const { hashPw } = require("../../lib/passwd");
module.exports = async function (C) {
  const { X, S, post, redirect, flash, csrf_field, cfg_set } = C;
  if (X().method === "POST") {
    const u = post("user");
    const p1 = String(X().POST.pass || "");
    const p2 = String(X().POST.pass2 || "");
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(u)) flash("Nama pengguna 3–30 karakter: huruf, angka, titik, garis.", "err");
    else if (p1.length < 8) flash("Kata sandi minimal 8 karakter.", "err");
    else if (p1 !== p2) flash("Ulangi kata sandi dengan sama persis.", "err");
    else {
      cfg_set("admin", { user: u, hash: hashPw(p1) });
      C.secret_key();
      C.session_regenerate();
      S().auth = u;
      S().seen = C.now();
      flash("Akun admin dibuat. Sekarang tambahkan router MikroTik Anda.");
      throw redirect("routers");
    }
    throw redirect("setup");
  }
  auth_page(C, "Pemasangan awal", '<p class="muted">Buat akun admin untuk panel ini.</p><form method="post">' + csrf_field() + '<label>Username<input name="user" required autocomplete="off" autofocus></label><label>Password<input type="password" name="pass" required minlength="8" autocomplete="new-password"></label><label>Confirm Password<input type="password" name="pass2" required minlength="8" autocomplete="new-password"></label><button class="btn primary wide">Create Account</button></form>');
};
