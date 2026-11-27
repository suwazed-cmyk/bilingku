// Settings > Upload Logo: logo yang dipakai template voucher ($logo)
"use strict";
const fs = require("fs");
const path = require("path");
// Jenis gambar dari isinya (bukan dari nama file)
function imgType(b) {
  if (b.length > 8 && b.readUInt32BE(0) === 0x89504e47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 6 && /^GIF8[79]a/.test(b.subarray(0, 6).toString("latin1"))) return "gif";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return "";
}
module.exports = async function (C) {
  const { X, h, post, redirect, flash, csrf_field, icon, echo, page_head, page_foot, vtpl_logo, DATA } = C;
  const dir = path.join(DATA, "upload");
  const clear = () => {
    try {
      for (const f of fs.readdirSync(dir)) if (/^logo\./.test(f)) fs.rmSync(path.join(dir, f), { force: true });
    } catch (e) {
      /* kosong */
    }
  };
  if (X().method === "POST") {
    if (post("act") === "remove") {
      clear();
      flash("Logo dihapus. Voucher memakai logo bawaan.");
      throw redirect("uplogo");
    }
    const f = X().FILES.logo;
    if (!f || !f.size) {
      flash("Pilih file gambar dulu.", "err");
      throw redirect("uplogo");
    }
    if (f.size > 1048576) {
      flash("Ukuran logo paling besar 1 MB.", "err");
      throw redirect("uplogo");
    }
    const ext = imgType(f.data);
    if (ext === "") {
      flash("File harus gambar PNG, JPG, GIF, atau WEBP.", "err");
      throw redirect("uplogo");
    }
    fs.mkdirSync(dir, { recursive: true });
    clear();
    fs.writeFileSync(path.join(dir, "logo." + ext), f.data);
    flash("Logo diunggah. Dipakai di semua template voucher.");
    throw redirect("uplogo");
  }
  const logo = vtpl_logo();
  await page_head("Upload Logo");
  echo('<div class="split"><form method="post" class="card" enctype="multipart/form-data">' + csrf_field() + '<div class="cardhead">' + icon("save") + '<strong>Upload Logo</strong></div><div class="cardbody">');
  echo('<div class="frow"><label for="u_logo">Logo</label><input id="u_logo" name="logo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required class="bkfile"></div><p class="hint">PNG, JPG, GIF, atau WEBP, paling besar 1 MB. Dipakai sebagai <code>$logo</code> di template voucher.</p>');
  echo('<div class="btnrow formfoot"><span class="spacer"></span>' + (logo.includes("upload/") ? '<button class="btn bad" name="act" value="remove" formnovalidate data-confirm="Hapus logo dan kembali ke logo bawaan?">' + icon("trash") + "Remove</button>" : "") + '<button class="btn primary" name="act" value="upload">' + icon("up") + "Upload</button></div></div></form>");
  echo('<section class="card"><div class="cardhead">' + icon("eye") + '<strong>Current Logo</strong></div><div class="cardbody logoprev"><img src="' + h(logo) + '" alt="Logo voucher"></div></section></div>');
  page_foot();
};
