"use strict";
module.exports = async function (C) {
  const { X, h, url, icon, echo, page_head, page_foot } = C;
  X().status = 404;
  await page_head("Halaman tidak ditemukan");
  echo('<section class="card nf"><div class="cardbody"><div class="nfcode" aria-hidden="true">404</div><h2>Halaman tidak ditemukan</h2><p>Alamat <code>' + h([...String(X().qs || "")].slice(0, 80).join("")) + '</code> tidak ada di panel ini. Mungkin salah ketik atau tautannya sudah lama.</p><div class="btnrow center"><a class="btn primary" href="' + h(url("dashboard")) + '">' + icon("dash") + 'Ke Dashboard</a><a class="btn" href="javascript:history.back()">Kembali</a></div></div></section>');
  page_foot();
};
