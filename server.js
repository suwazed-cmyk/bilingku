#!/usr/bin/env node
// Bilingku — billing PPPoE & Hotspot MikroTik (Node.js, tanpa PHP, tanpa dependensi).
// Jalankan: node server.js   (PORT, HOST, DATA_DIR bisa diatur lewat environment)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const C = require("./lib/core");
const { X, Exit, ROOT, DATA } = C;

const PORT = parseInt(process.env.PORT, 10) || 8092;
const HOST = process.env.HOST || "127.0.0.1";

// Peta halaman: ?p= => berkas di pages/<folder>/<nama>.js (sama dengan index.php versi PHP)
const ROUTES = {
  setup: "auth/setup", login: "auth/login",
  dashboard: "dashboard/dashboard", api: "dashboard/api",
  hs_users: "hotspot/hs_users", hs_generate: "hotspot/hs_generate", hs_profiles: "hotspot/hs_profiles",
  list: "hotspot/list", voucher_print: "hotspot/voucher_print",
  template: "settings/template", uplogo: "settings/uplogo",
  ppp_secrets: "ppp/ppp_secrets", ppp_profiles: "ppp/ppp_profiles", ppp_payment: "ppp/ppp_payment",
  ppp_pay: "ppp/ppp_pay", ppp_user: "ppp/ppp_user", invoice_print: "ppp/invoice_print",
  ip_pools: "ip_pool/ip_pools", log: "log/log", report: "report/report",
  routers: "settings/routers", settings: "settings/settings",
  system: "system/system", about: "settings/about", notfound: "dashboard/notfound",
};
const PAGES = Object.keys(ROUTES).filter((k) => k !== "setup");
const pageMod = (f) => require(path.join(ROOT, "pages", f + ".js"));

// ---------------- isi permintaan ----------------
const MAX_BODY = 25 * 1024 * 1024;
function readBody(req) {
  return new Promise((resolve, reject) => {
    const ch = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > MAX_BODY) {
        reject(new Error("Isian terlalu besar"));
        req.destroy();
      } else ch.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(ch)));
    req.on("error", reject);
  });
}
// a=1&b[]=2 → { a: "1", b: ["2"] } (nama berakhiran [] menjadi array, seperti PHP)
function addField(o, k, v) {
  const m = /^([^[]+)\[([^\]]*)\]$/.exec(k);
  if (m) {
    const base = m[1];
    if (m[2] === "") {
      if (!Array.isArray(o[base])) o[base] = [];
      o[base].push(v);
    } else {
      if (!o[base] || typeof o[base] !== "object" || Array.isArray(o[base])) o[base] = {};
      o[base][m[2]] = v;
    }
  } else o[k] = v;
}
function parseQuery(s) {
  const o = {};
  for (const part of String(s || "").split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const dec = (x) => {
      try {
        return decodeURIComponent(x.replace(/\+/g, " "));
      } catch (e) {
        return x;
      }
    };
    addField(o, dec(i < 0 ? part : part.slice(0, i)), dec(i < 0 ? "" : part.slice(i + 1)));
  }
  return o;
}
function parseMultipart(buf, boundary) {
  const fields = {};
  const files = {};
  const sep = Buffer.from("--" + boundary);
  let pos = buf.indexOf(sep);
  while (pos >= 0) {
    pos += sep.length;
    if (buf.slice(pos, pos + 2).toString() === "--") break;
    pos += 2; // \r\n
    const he = buf.indexOf("\r\n\r\n", pos);
    if (he < 0) break;
    const head = buf.slice(pos, he).toString("utf8");
    const next = buf.indexOf(sep, he + 4);
    if (next < 0) break;
    const data = buf.slice(he + 4, next - 2);
    const name = (/name="([^"]*)"/i.exec(head) || [])[1];
    const fn = /filename="([^"]*)"/i.exec(head);
    if (name !== undefined) {
      if (fn) {
        const f = { name: fn[1], type: (/content-type:\s*([^\r\n]+)/i.exec(head) || [])[1] || "", size: data.length, data, error: fn[1] === "" && !data.length ? 4 : 0 };
        files[name.replace(/\[\]$/, "")] = f;
      } else addField(fields, name, data.toString("utf8"));
    }
    pos = next;
  }
  return { fields, files };
}

// ---------------- berkas statis ----------------
const TYPES = { ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2" };
function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Tidak ditemukan.");
    }
    const etag = '"' + st.mtimeMs.toString(36) + "-" + st.size.toString(36) + '"';
    const hd = { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", ETag: etag, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, hd);
      return res.end();
    }
    hd["Content-Length"] = st.size;
    res.writeHead(200, hd);
    fs.createReadStream(file).pipe(res);
  });
}

// ---------------- halaman isolir (tanpa login) ----------------
function isopage(req, res, q) {
  const x = { GET: q, POST: {}, FILES: {}, S: {}, out: [], headers: {}, tz: "Asia/Jakarta", after: [], memo: {}, req };
  C.als.run(x, () => {
    const rid = String(q.r || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const pg = rid !== "" ? C.db_load(C.rkey("isopage", rid)) : {};
    const hd = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Content-Security-Policy": "script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" };
    res.writeHead(200, hd);
    if (pg.html) return res.end(String(pg.html));
    const co = String(C.setting("company"));
    const ph = String(C.setting("phone") || "");
    const ad = String(C.setting("address") || "");
    let wa = ph.replace(/\D/g, "");
    if (wa !== "" && wa[0] === "0") wa = "62" + wa.slice(1);
    const h = C.h;
    res.end(`<!doctype html><html lang="id" translate="no" class="notranslate"><head><meta name="google" content="notranslate"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Layanan internet dihentikan sementara</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1rem;box-sizing:border-box;font-family:Inter,"Segoe UI",system-ui,Arial,sans-serif;background:#eef2f7;color:#0f172a;line-height:1.55}
.box{background:#fff;border-radius:16px;max-width:440px;width:100%;padding:2rem 1.6rem;text-align:center;box-shadow:0 10px 30px rgba(15,23,42,.10);border-top:6px solid #ef4444}
h1{font-size:1.3rem;margin:0 0 .8rem}p{margin:0 0 .9rem;color:#475569}
.co{font-weight:700;color:#2563eb;margin-bottom:1.2rem;letter-spacing:.2px}
a.btn{display:inline-block;margin-top:.4rem;padding:.7rem 1.4rem;border-radius:99px;background:#16a34a;color:#fff;text-decoration:none;font-weight:600}
small{display:block;margin-top:1.2rem;color:#64748b}
</style></head><body><div class="box">
<div class="co">${h(co)}</div>
<h1>Layanan internet Anda dihentikan sementara</h1>
<p>Masa aktif langganan sudah berakhir atau tagihan belum dibayar. Silakan lakukan pembayaran supaya internet aktif kembali.</p>
${wa !== "" ? `<p>Konfirmasi pembayaran:</p><a class="btn" href="https://wa.me/${h(wa)}">WhatsApp ${h(ph)}</a>` : ""}
${ad !== "" ? `<small>${h(ad)}</small>` : ""}
</div></body></html>`);
  });
}

// ---------------- aplikasi ----------------
async function app(req, res) {
  const u = new URL(req.url, "http://x");
  let p = decodeURIComponent(u.pathname);
  // alamat lama versi PHP tetap jalan
  if (p === "/index.php") p = "/";
  if (p === "/isopage.php" || p === "/isopage") return isopage(req, res, parseQuery(u.search.slice(1)));
  if (p === "/asset.php") {
    const f = String(parseQuery(u.search.slice(1)).f || "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(f)) return serveFile(req, res, "/nonexistent");
    return serveFile(req, res, path.join(ROOT, "assets", f === "style.css" || f === "theme.css" || f === "redesign.css" ? "bk.css" : f), "public, max-age=31536000, immutable");
  }
  if (p.startsWith("/assets/")) {
    const f = p.slice(8);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(f)) return serveFile(req, res, "/nonexistent");
    return serveFile(req, res, path.join(ROOT, "assets", f), u.search ? "public, max-age=31536000, immutable" : "public, max-age=3600");
  }
  if (p.startsWith("/upload/")) {
    const f = p.slice(8);
    if (!/^logo\.(png|jpg|gif|webp)$/.test(f)) return serveFile(req, res, "/nonexistent");
    return serveFile(req, res, path.join(DATA, "upload", f), "public, max-age=300");
  }
  if (p === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  if (p !== "/") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Tidak ditemukan.");
  }

  const x = { req, res, GET: parseQuery(u.search.slice(1)), POST: {}, FILES: {}, S: {}, out: [], headers: {}, status: 200, tz: "Asia/Jakarta", after: [], memo: {}, qs: u.search.slice(1), method: req.method };
  if (req.method === "POST") {
    let buf;
    try {
      buf = await readBody(req);
    } catch (e) {
      res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Isian terlalu besar (maksimal 25 MB).");
    }
    const ct = String(req.headers["content-type"] || "");
    const bm = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
    if (/multipart\/form-data/i.test(ct) && bm) {
      const r = parseMultipart(buf, bm[1] || bm[2]);
      x.POST = r.fields;
      x.FILES = r.files;
    } else x.POST = parseQuery(buf.toString("utf8"));
  }
  await C.als.run(x, () => handle(x));
}

async function handle(x) {
  C.sessionLoad(x);
  C.tz_apply();
  let p = C.get("p", C.get("session") !== "" ? "dashboard" : "routers");
  try {
    try {
      if (!C.cfg("admin")) p = "setup";
      else if (!C.authed()) p = "login";
      else if (!PAGES.includes(p)) p = "notfound";
      x.GET.p = p;
      if (C.authed() && C.get("session") !== "") {
        if (C.url_rid() === "") {
          C.flash("Sesi router tidak ditemukan. Silakan pilih router.", "err");
          throw C.redirect("routers");
        }
        if (p !== "routers") x.S.rid = C.url_rid();
        C.tz_apply();
      }
      if (!["setup", "login", "routers", "settings", "about", "notfound", "api"].includes(p) && !C.routers()[x.S.rid || ""]) throw C.redirect("routers");
      if (x.method === "POST" && !C.csrf_ok()) {
        C.flash("Formulir kedaluwarsa. Muat ulang halaman lalu coba lagi.", "err");
        throw C.redirect(p === "setup" || p === "login" ? p : "dashboard");
      }
      let file = ROUTES[p];
      if (p === "list" && C.get("s") === "ppp_active") file = "ppp/ppp_active";
      x.file = file;
      await pageMod(file)(C);
    } catch (e) {
      if (!(e instanceof Exit)) throw e;
      if (e.kind === "redirect") {
        x.status = 302;
        x.headers.Location = e.v;
        x.out = [];
        x.body = null;
      }
    }
    // pekerjaan yang harus selesai sebelum jawaban dikirim (mis. perbarui scheduler isolir di router)
    for (const fn of x.presend || []) {
      try {
        await fn();
      } catch (e) {
        console.error("presend:", e.message);
      }
    }
  } catch (e) {
    console.error(e);
    x.status = 500;
    x.headers = { "Content-Type": "text/html; charset=utf-8" };
    x.out = [`<!doctype html><meta charset="utf-8"><title>Kesalahan</title><body style="font-family:system-ui;padding:40px;color:#334"><h2>Terjadi kesalahan</h2><p>${C.h(e.message)}</p><p><a href="./">Kembali</a></p>`];
    x.body = null;
  }
  C.sessionSave(x);
  const ck = C.sessionCookie(x);
  const hd = Object.assign({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" }, x.headers);
  if (ck) hd["Set-Cookie"] = ck;
  const body = x.body !== undefined && x.body !== null ? x.body : Buffer.from(x.out.join(""), "utf8");
  hd["Content-Length"] = body.length;
  x.res.writeHead(x.status || 200, hd);
  x.res.end(body);
  // pekerjaan setelah halaman terkirim (sinkron penjualan, perbarui scheduler, cache voucher)
  for (const fn of x.after) {
    try {
      await fn();
    } catch (e) {
      console.error("latar:", e.message);
    }
  }
  if (x.after.length) C.sessionSave(x);
}

// Pindahan dari versi PHP: logo di assets/upload/ dipindah ke data/upload/
(function migrateLogo() {
  const old = path.join(ROOT, "assets", "upload");
  try {
    for (const f of fs.readdirSync(old)) {
      if (!/^logo\.(png|jpg|gif|webp)$/.test(f)) continue;
      fs.mkdirSync(path.join(DATA, "upload"), { recursive: true });
      const dst = path.join(DATA, "upload", f);
      if (!fs.existsSync(dst)) fs.copyFileSync(path.join(old, f), dst);
    }
  } catch (e) {
    /* tidak ada logo lama */
  }
})();
// Sesi PHP lama di data/sess tidak dipakai lagi
try {
  fs.rmSync(path.join(DATA, "sess"), { recursive: true, force: true });
} catch (e) {
  /* abaikan */
}

if (require.main === module) {
  const srv = http.createServer((req, res) => {
    app(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Kesalahan server");
    });
  });
  srv.keepAliveTimeout = 30000;
  srv.listen(PORT, HOST, () => console.log(`Bilingku ${C.APP_VER} berjalan di http://${HOST}:${PORT} (data: ${DATA})`));
  setInterval(() => C.session_sweep(), 3600 * 1000).unref();
}
module.exports = { app, parseQuery, parseMultipart };
