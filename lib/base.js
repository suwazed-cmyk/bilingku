// Dasar Bilingku Node.js: konteks permintaan, penyimpanan SQLite (tabel docs sama dengan versi PHP),
// konfigurasi, tanggal (zona waktu router), sesi, CSRF, enkripsi password router (kompatibel versi PHP).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const { DatabaseSync } = require("node:sqlite");
const { phpDate, numberFormat, sprintf, escHtml } = require("./vtpl");

const APP_NAME = "Bilingku";
const APP_VER = "4.0.0";
const ROOT = path.dirname(__dirname);
const DATA = process.env.DATA_DIR || path.join(ROOT, "data");
const IDLE_MAX = 3600;
const DB_GUARD = "<?php http_response_code(403); exit; ?>\n";

// ---------------- konteks permintaan ----------------
const als = new AsyncLocalStorage();
const X = () => als.getStore() || BG;
// konteks cadangan untuk pekerjaan di luar permintaan (mis. tes)
const BG = { GET: {}, POST: {}, FILES: {}, S: {}, out: [], headers: {}, tz: "Asia/Jakarta", after: [], memo: {}, bg: true };
class Exit {
  constructor(kind, v) {
    this.kind = kind;
    this.v = v;
  }
}
const EXIT = () => new Exit("exit");

// ---------------- database ----------------
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true, mode: 0o750 });
const DB_SQLITE = path.join(DATA, "bilingku.db");
const db = new DatabaseSync(DB_SQLITE);
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
{
  const v = db.prepare("PRAGMA user_version").get().user_version | 0;
  if (v < 1) {
    db.exec("CREATE TABLE IF NOT EXISTS docs (name TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL); PRAGMA user_version = 1;");
    dbImportFiles();
  }
  db.exec("CREATE TABLE IF NOT EXISTS sess (id TEXT PRIMARY KEY, data TEXT NOT NULL, seen INTEGER NOT NULL)");
}
const now = () => Math.floor(Date.now() / 1000);

// Pindahan satu kali dari berkas data/*.json.php (versi PHP tanpa SQLite)
function dbImportFiles() {
  let files = [];
  try {
    files = fs.readdirSync(DATA).filter((f) => f.endsWith(".json.php"));
  } catch (e) {
    return;
  }
  if (!files.length) return;
  const st = db.prepare("INSERT OR REPLACE INTO docs (name, data, updated) VALUES (?, ?, ?)");
  for (const f of files) {
    const s = fs.readFileSync(path.join(DATA, f), "utf8");
    const p = s.indexOf("\n");
    const json = p < 0 ? s : s.slice(p + 1);
    try {
      if (typeof JSON.parse(json) !== "object") continue;
    } catch (e) {
      continue;
    }
    st.run(f.slice(0, -9), json, Math.floor(fs.statSync(path.join(DATA, f)).mtimeMs / 1000));
  }
  const old = path.join(DATA, "json-lama");
  fs.mkdirSync(old, { recursive: true, mode: 0o700 });
  for (const f of files) fs.renameSync(path.join(DATA, f), path.join(old, f));
}
function db_exists(name) {
  return !!db.prepare("SELECT 1 AS x FROM docs WHERE name = ?").get(name);
}
function db_delete(name) {
  db.prepare("DELETE FROM docs WHERE name = ?").run(name);
  return true;
}
function db_rename(from, to) {
  db.prepare("UPDATE OR REPLACE docs SET name = ? WHERE name = ?").run(to, from);
  return true;
}
function db_raw(name) {
  const r = db.prepare("SELECT data FROM docs WHERE name = ?").get(name);
  if (!r) return undefined;
  try {
    return JSON.parse(r.data);
  } catch (e) {
    return undefined;
  }
}
// PHP menyimpan array asosiatif kosong sebagai [] — di sini selalu dikembalikan sebagai objek
function db_load(name, def) {
  const d = db_raw(name);
  if (d === undefined || d === null || typeof d !== "object") return def === undefined ? {} : def;
  if (Array.isArray(d)) return d.length ? Object.assign({}, d) : {};
  return d;
}
// Untuk data berupa daftar (penjualan per bulan, dsb.)
function db_list(name) {
  const d = db_raw(name);
  if (!d || typeof d !== "object") return [];
  return Array.isArray(d) ? d : Object.values(d);
}
function db_save(name, data) {
  try {
    db.prepare("INSERT OR REPLACE INTO docs (name, data, updated) VALUES (?, ?, ?)").run(name, JSON.stringify(data), now());
    return true;
  } catch (e) {
    console.error("Bilingku db_save " + name + ": " + e.message);
    return false;
  }
}
// Semua data untuk backup, format sama dengan versi PHP (nama.json.php = penjaga PHP + JSON)
function db_export() {
  const out = {};
  for (const r of db.prepare("SELECT name, data FROM docs ORDER BY name").all()) if (r.name !== "login_fail") out[r.name + ".json.php"] = DB_GUARD + r.data;
  return out;
}
function db_import_raw(file, s) {
  const name = path.basename(file).replace(/\.json\.php$/, "");
  const p = s.indexOf("\n");
  let d;
  try {
    d = JSON.parse(p < 0 ? s : s.slice(p + 1));
  } catch (e) {
    return false;
  }
  return d && typeof d === "object" ? db_save(name, d) : false;
}

// ---------------- konfigurasi ----------------
function CFG() {
  const x = X();
  if (!x.CFG) x.CFG = db_load("config");
  return x.CFG;
}
function cfg(key, def) {
  const c = CFG();
  if (key === undefined || key === null) return c;
  return c[key] !== undefined && c[key] !== null ? c[key] : def === undefined ? null : def;
}
function cfg_set(key, val) {
  const c = CFG();
  c[key] = val;
  return db_save("config", c);
}
const SET_DEF = {
  company: "Bilingku Net",
  address: "",
  phone: "",
  currency: "Rp",
  tz: "Asia/Jakarta",
  iso_off: 0,
  isolir_profile: "isolir",
  wa_tpl: "Halo {nama}, tagihan internet sebesar {jumlah} jatuh tempo {jatuh_tempo}. Mohon segera melakukan pembayaran. Terima kasih.\n{perusahaan}",
  voucher_note: "",
};
function setting(key) {
  const s = cfg("settings", {}) || {};
  return s[key] !== undefined && s[key] !== null ? s[key] : SET_DEF[key] !== undefined ? SET_DEF[key] : null;
}

// ---------------- tanggal (mengikuti zona waktu router) ----------------
const tzValid = (tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: String(tz) });
    return !!tz;
  } catch (e) {
    return false;
  }
};
function date(fmt, ts) {
  return phpDate(fmt, ts === undefined ? now() : Math.floor(ts), X().tz || "Asia/Jakarta");
}
const today = () => date("Y-m-d");
// Tanggal Y-m-d dihitung sebagai tanggal kalender murni (tanpa jam), jadi tidak terpengaruh zona waktu
const ymdRe = /^(\d{4})-(\d{2})-(\d{2})/;
function ymdToUtc(ymd) {
  const m = ymdRe.exec(String(ymd || ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
}
function utcToYmd(t) {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function date_add_days(ymd, n) {
  const t = ymdToUtc(ymd);
  return isNaN(t) ? "" : utcToYmd(t + (n | 0) * 86400000);
}
function days_in_month(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
// strtotime untuk tanggal / tanggal-jam lokal → unix time (zona waktu router)
function strtotime(s) {
  s = String(s || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return 0;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) / 1000;
  // geser sesuai offset zona waktu pada saat itu (dua kali supaya tepat di sekitar pergantian DST)
  return Math.floor(guess - tzOffset(guess - tzOffset(guess) * 60) * 60);
}
function tzOffset(ts) {
  const tz = X().tz || "Asia/Jakarta";
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
  const p = f.formatToParts(new Date(ts * 1000)).find((x) => x.type === "timeZoneName");
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec((p && p.value) || "");
  return m ? +m[1] * 60 + (m[1][0] === "-" ? -1 : 1) * (+m[2] || 0) : 0;
}

// ---------------- sesi ----------------
const COOKIE = "bilingku_sid";
function getCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}
const sidHash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
function req_https() {
  return String(X().req?.headers["x-forwarded-proto"] || "").toLowerCase() === "https";
}
// Path dasar, mis. "/billing" bila dibuka lewat panel utama
function base_path() {
  const px = String(X().req?.headers["x-forwarded-prefix"] || "");
  return /^\/[a-z0-9-]+$/.test(px) ? px : "";
}
function sessionLoad(x) {
  const t = getCookie(x.req, COOKIE);
  x.S = {};
  if (t && /^[a-f0-9]{64}$/.test(t)) {
    const r = db.prepare("SELECT data FROM sess WHERE id = ?").get(sidHash(t));
    if (r) {
      x.sid = t;
      try {
        x.S = JSON.parse(r.data) || {};
      } catch (e) {
        x.S = {};
      }
    }
  }
  x.sessOrig = JSON.stringify(x.S);
  const S = x.S;
  // logout otomatis setelah IDLE_MAX tanpa aktivitas; permintaan latar (p=api) tidak dihitung aktivitas
  if (S.auth) {
    const n = now();
    const seen = +S.seen || n;
    if (n - seen >= IDLE_MAX) {
      x.S = {};
      session_regenerate(x);
      flash(`Anda otomatis keluar karena ${Math.round(IDLE_MAX / 60)} menit tanpa aktivitas. Silakan login lagi.`, "err");
    } else if (String(x.GET.p || "") !== "api" || S.seen === undefined) S.seen = n;
  }
}
function session_regenerate(x) {
  x = x || X();
  if (x.sid) db.prepare("DELETE FROM sess WHERE id = ?").run(sidHash(x.sid));
  x.sid = crypto.randomBytes(32).toString("hex");
  x.newSid = true;
}
function session_destroy() {
  const x = X();
  if (x.sid) db.prepare("DELETE FROM sess WHERE id = ?").run(sidHash(x.sid));
  x.S = {};
  x.sid = "";
  x.killCookie = true;
}
function sessionSave(x) {
  const data = JSON.stringify(x.S || {});
  if (x.killCookie && !Object.keys(x.S || {}).length) return;
  if (!x.sid) {
    if (data === "{}") return;
    session_regenerate(x);
  }
  if (data !== x.sessOrig || x.newSid || now() - (x.S.seen || 0) < 5) db.prepare("INSERT OR REPLACE INTO sess (id, data, seen) VALUES (?, ?, ?)").run(sidHash(x.sid), data, now());
  x.sessOrig = data;
}
function sessionCookie(x) {
  if (x.newSid && x.sid) return `${COOKIE}=${x.sid}; Path=${base_path() || ""}/; HttpOnly; SameSite=Lax${req_https() ? "; Secure" : ""}`;
  if (x.killCookie) return `${COOKIE}=; Path=${base_path() || ""}/; HttpOnly; SameSite=Lax; Max-Age=0`;
  return "";
}
function session_sweep() {
  db.prepare("DELETE FROM sess WHERE seen < ?").run(now() - IDLE_MAX - 900);
}
const S = () => X().S;
const authed = () => !!S().auth;

function csrf_token() {
  const s = S();
  if (!s.csrf) s.csrf = crypto.randomBytes(16).toString("hex");
  return s.csrf;
}
const csrf_field = () => `<input type="hidden" name="_t" value="${csrf_token()}">`;
function csrf_ok() {
  const a = String(X().POST._t || "");
  const b = String(S().csrf || "");
  return !!a && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ---------------- enkripsi password router (sama dengan versi PHP) ----------------
function secret_key() {
  let k = cfg("key");
  if (!k) {
    k = crypto.randomBytes(24).toString("hex");
    cfg_set("key", k);
  }
  return crypto.createHash("sha256").update(String(k)).digest();
}
function enc(s) {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv("aes-256-cbc", secret_key(), iv);
  return "a:" + Buffer.concat([iv, c.update(String(s), "utf8"), c.final()]).toString("base64");
}
function dec(s) {
  s = String(s || "");
  const t = s.slice(0, 2);
  const raw = Buffer.from(s.slice(2), "base64");
  if (t === "b:") return raw.toString("utf8");
  if (t !== "a:" || raw.length < 17) return "";
  try {
    const d = crypto.createDecipheriv("aes-256-cbc", secret_key(), raw.subarray(0, 16));
    return Buffer.concat([d.update(raw.subarray(16)), d.final()]).toString("utf8");
  } catch (e) {
    return "";
  }
}

// ---------------- helper umum ----------------
const h = (s) => escHtml(s === null || s === undefined ? "" : s);
function post(k, d = "") {
  const v = X().POST[k];
  return v !== undefined && !Array.isArray(v) ? String(v).trim() : d;
}
function postArr(k) {
  const v = X().POST[k];
  return Array.isArray(v) ? v : v !== undefined ? [v] : [];
}
function get(k, d = "") {
  const v = X().GET[k];
  return v !== undefined && !Array.isArray(v) ? String(v).trim() : d;
}
const has = (hay, needle) => needle === "" || String(hay).includes(String(needle));
// http_build_query sederhana
function qs(q) {
  return Object.entries(q)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v)).replace(/%20/g, "+"))
    .join("&");
}
function echo(...a) {
  X().out.push(...a.map((v) => (v === null || v === undefined ? "" : String(v))));
}
function header(line) {
  const i = line.indexOf(":");
  X().headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
function redirectTo(loc) {
  return new Exit("redirect", loc);
}
function flash(msg, type = "ok", link = null) {
  const s = S();
  (s.flash = s.flash || []).push([type, msg, link]);
}
function money(n, cur = true) {
  return (cur ? setting("currency") + " " : "") + numberFormat(+n || 0, 0, ",", ".");
}
function bytes(n) {
  n = +n || 0;
  for (const u of ["B", "KB", "MB", "GB", "TB"]) {
    if (n < 1024 || u === "TB") return (u === "B" ? Math.trunc(n) : numberFormat(n, n < 10 ? 2 : 1, ",", ".")) + " " + u;
    n /= 1024;
  }
}
const MONS = ["", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function ros_date(d) {
  d = String(d || "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^([a-z]{3})\/(\d{1,2})\/(\d{4})/i.exec(d);
  if (m) {
    const mo = MONS.indexOf(m[1].toLowerCase());
    if (mo > 0) return sprintf("%04d-%02d-%02d", m[3], mo, m[2]);
  }
  return "";
}
const BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const bulan = (ym) => BULAN[parseInt(String(ym).slice(5, 7), 10) || 0] + " " + String(ym).slice(0, 4);
function tgl(ymd) {
  const m = ymdRe.exec(String(ymd || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
const valid_period = (p) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(p)) ? p : date("Y-m"));
function rand_str(len, set) {
  const sets = { lower: "abcdefghjkmnpqrstuvwxyz", upper: "ABCDEFGHJKMNPQRSTUVWXYZ", num: "23456789" };
  let pool = "";
  for (const s of String(set).split("+")) pool += sets[s] || "";
  if (!pool) pool = sets.lower + sets.num;
  let o = "";
  for (let i = 0; i < len; i++) o += pool[crypto.randomInt(pool.length)];
  return o;
}
// Gabungan array PHP ($a + $b): kunci di $a menang
const U = (a, b) => {
  const r = Object.assign({}, a);
  for (const k of Object.keys(b || {})) if (!(k in r)) r[k] = b[k];
  return r;
};
const intv = (v) => {
  const n = parseInt(String(v === undefined || v === null ? "" : v).trim(), 10);
  return isNaN(n) ? 0 : n;
};
const floatv = (v) => {
  const n = parseFloat(String(v === undefined || v === null ? "" : v).trim());
  return isNaN(n) ? 0 : n;
};
const ros_str = (s) => String(s === undefined || s === null ? "" : s).replace(/["\\$]/g, (c) => "\\" + c);

module.exports = {
  APP_NAME, APP_VER, ROOT, DATA, IDLE_MAX, DB_GUARD, als, X, Exit, EXIT, db, now,
  db_exists, db_delete, db_rename, db_load, db_list, db_save, db_export, db_import_raw,
  cfg, cfg_set, setting, SET_DEF, tzValid, date, today, ymdToUtc, utcToYmd, date_add_days, days_in_month, strtotime,
  sessionLoad, sessionSave, sessionCookie, session_regenerate, session_destroy, session_sweep, S, authed, getCookie,
  req_https, base_path, csrf_token, csrf_field, csrf_ok, secret_key, enc, dec,
  h, post, postArr, get, has, qs, echo, header, redirectTo, flash, money, bytes, ros_date, MONS, bulan, tgl, valid_period, rand_str, U, intv, floatv, ros_str,
  numberFormat, sprintf,
};
