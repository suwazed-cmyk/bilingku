// Logika Bilingku (port dari inc/core.php, inc/v3.php, inc/voucher.php).
// Semua yang berbicara dengan router bersifat async. Script yang dikirim ke router sama persis dengan versi PHP.
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const zlib = require("zlib");
const B = require("./base");
const ROS = require("./routeros");
const VT = require("./vtpl");
const { X, Exit, EXIT, h, get, post, echo, header, flash, cfg, cfg_set, setting, db_load, db_list, db_save, db_exists, db_delete, db_rename, date, today, date_add_days, strtotime, ymdToUtc, money, ros_date, tgl, U, intv, floatv, ros_str, sprintf, numberFormat, csrf_field, S, ROOT, DATA, APP_NAME, APP_VER } = B;

const memo = (k, fn) => {
  const m = X().memo || (X().memo = {});
  if (!(k in m)) m[k] = fn();
  return m[k];
};
const rosErr = (v) => {
  if (v !== undefined) X().ROS_ERR = v;
  return X().ROS_ERR;
};

// ---------------- URL & navigasi ----------------
function url(p = "dashboard", q = {}) {
  let o = Object.assign({ p }, q);
  let s;
  if (o.session === undefined && !["routers", "login", "setup"].includes(p) && (s = cur_session()) !== "") o = Object.assign({ session: s }, o);
  // bawa ?session= router aktif di setiap link (seperti Mikhmon)
  if (o.session !== undefined) {
    const { session, ...rest } = o;
    o = Object.assign({ session }, rest);
  }
  return "./?" + B.qs(o);
}
// Kembali ke halaman yang sama setelah aksi POST
const back = () => new Exit("redirect", "./" + (X().qs ? "?" + X().qs : ""));
// Urutan kunci seperti ksort PHP 8 (angka dibandingkan sebagai angka)
const isNumS = (s) => /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(String(s));
const phpCmp = (a, b) => (isNumS(a) && isNumS(b) ? +a - +b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const ksorted = (o, desc = false) => Object.keys(o).sort((a, b) => (desc ? -1 : 1) * phpCmp(a, b));
function redirect(p, q = {}) {
  return new Exit("redirect", url(p, q));
}

// ---------------- router ----------------
const routers = () => {
  const r = cfg("routers", {});
  return r && typeof r === "object" && !Array.isArray(r) ? r : Array.isArray(r) ? Object.assign({}, r) : {};
};
function url_rid() {
  const s = get("session");
  if (s === "") return "";
  const rs = routers();
  if (rs[s]) return String(s);
  for (const [id, r] of Object.entries(rs)) if (String(r.name || "").toLowerCase() === s.toLowerCase()) return String(id);
  return "";
}
function cur_session(id = null) {
  const rs = routers();
  if (id === null) {
    id = url_rid();
    if (id === "") id = String(S().rid || "");
  }
  if (!rs[id]) return "";
  const n = String(rs[id].name || "").trim();
  let c = 0;
  for (const r of Object.values(rs)) if (String(r.name || "").trim().toLowerCase() === n.toLowerCase()) c++;
  return n === "" || c > 1 || (rs[n] && n !== String(id)) ? String(id) : n;
}
function router_id() {
  const rs = routers();
  let id = url_rid();
  if (id === "") id = S().rid !== undefined ? String(S().rid) : "";
  if (!rs[id]) id = Object.keys(rs)[0] || "";
  return id;
}
function router() {
  const rs = routers();
  const id = router_id();
  return rs[id] ? Object.assign({}, rs[id], { id }) : null;
}
const rkey = (name, rid = null) => "r" + (rid === null ? router_id() : rid) + "_" + name;

function tz_apply() {
  const r = router();
  const tz = String((r && r.tz) || "");
  X().tz = tz && B.tzValid(tz) ? tz : setting("tz") && B.tzValid(setting("tz")) ? setting("tz") : "Asia/Jakarta";
}
async function tz_sync(api) {
  const id = router_id();
  const k = "tzchk_" + id;
  if (S()[k]) return;
  let c;
  try {
    c = await api.comm("/system/clock/print");
  } catch (e) {
    return;
  }
  S()[k] = 1;
  const tz = String((c[0] && c[0]["time-zone-name"]) || "");
  if (!tz || !B.tzValid(tz)) return;
  const rs = routers();
  if (rs[id] && (rs[id].tz || "") !== tz) {
    rs[id].tz = tz;
    cfg_set("routers", rs);
  }
  X().tz = tz;
}

async function ros_open(r, keep = false) {
  r = Object.assign({}, r);
  if (r.panel_id) {
    const pr = await panel_router(r.panel_id);
    if (pr && pr.address) r.host = pr.address;
  }
  const a = await ROS.open(r.host, intv(r.port) || 8728, r.user, B.dec(r.pass), keep);
  if (a.failed) {
    rosErr(a.error);
    return null;
  }
  return a;
}
// ros(): koneksi router aktif (dibuka sekali per permintaan). ros(null, true) = status tanpa membuka koneksi
async function ros(set = false, peek = false) {
  const x = X();
  if (peek) return x.api === undefined ? null : !!x.api;
  if (set !== false) return (x.api = set);
  if (x.api !== undefined) return x.api;
  if (x.apiOpening) return x.apiOpening;
  x.apiOpening = (async () => {
    const r = router();
    if (!r) {
      rosErr("Belum ada router. Tambahkan router dulu.");
      return (x.api = null);
    }
    const api = await ros_open(r, true);
    x.api = api;
    if (api) await tz_sync(api);
    ros_last(!!api);
    return api;
  })();
  const a = await x.apiOpening;
  x.apiOpening = null;
  return a;
}
const rosPeek = () => (X().api === undefined ? null : !!X().api);
function ros_last(set = null) {
  const k = "ros_last_" + router_id();
  if (set !== null) S()[k] = !!set;
  return S()[k] !== undefined ? S()[k] : null;
}
async function rq(cmd, p = {}) {
  const a = await ros();
  if (!a) return [];
  try {
    return await a.comm(cmd, p);
  } catch (e) {
    rosErr(e.message);
    return [];
  }
}
async function rdo(cmd, p = {}, quiet = false) {
  const a = await ros();
  if (!a) {
    if (!quiet) flash(rosErr() || "Router tidak terhubung", "err");
    return false;
  }
  try {
    await a.comm(cmd, p);
    return true;
  } catch (e) {
    rosErr(e.message);
    if (!quiet) flash("Router menolak: " + e.message, "err");
    return false;
  }
}
// Perintah mentah yang boleh gagal (pengganti try { ros()->comm() } catch di PHP)
async function rtry(cmd, p = {}) {
  const a = await ros();
  if (!a) throw new Error(rosErr() || "Router tidak terhubung");
  return a.comm(cmd, p);
}
async function rq_many(cmds) {
  const out = {};
  for (const [k, c] of Object.entries(cmds)) out[k] = c[1] && c[1]["count-only"] !== undefined ? 0 : [];
  const a = await ros();
  if (!a) return out;
  const res = await a.batch(Object.values(cmds));
  let i = 0;
  for (const [k, c] of Object.entries(cmds)) {
    const r = res[i++];
    if (r.err !== null) {
      rosErr(r.err);
      continue;
    }
    out[k] = c[1] && c[1]["count-only"] !== undefined ? intv(r.ret) : r.rows;
  }
  return out;
}
async function rcount(p, q = {}) {
  const a = await ros();
  if (!a) return 0;
  try {
    return await a.count(p, q);
  } catch (e) {
    return 0;
  }
}
async function rremove(p, ids) {
  let n = 0;
  const list = ids.filter(Boolean);
  for (let i = 0; i < list.length; i += 40) {
    const c = list.slice(i, i + 40);
    if (await rdo(p + "/remove", { ".id": c.join(",") })) n += c.length;
  }
  return n;
}

// ---------------- hotspot: profil & voucher ----------------
const valid_interval = (v) => /^(\d+[wdhms])+$/.test(String(v));
function hs_meta(onlogin) {
  let m = { mode: "none", price: 0, validity: "", sprice: 0, lock: 0 };
  onlogin = String(onlogin || "");
  let x = /:put \("bilingku,([^"]*)"\)/.exec(onlogin);
  if (x) {
    const p = x[1].split(",");
    while (p.length < 5) p.push(["", 0, "", 0, ""][p.length]);
    const old = { remove: "remc", disable: "ntfc" };
    m = { mode: old[p[0]] || "none", price: floatv(p[1]), validity: p[2], sprice: floatv(p[3]), lock: p[4] === "lock" ? 1 : 0 };
  } else if ((x = /:put \(",([^"]*)"\)/.exec(onlogin))) {
    const p = x[1].split(",");
    while (p.length < 7) p.push(["", 0, "", 0, "", "", ""][p.length]);
    m = { mode: ["rem", "ntf", "remc", "ntfc"].includes(p[0]) ? p[0] : "none", price: floatv(p[1]), validity: p[2], sprice: floatv(p[3]), lock: p[5] === "Enable" ? 1 : 0 };
  }
  return m;
}
let BUNDLE = null;
function mk_bundle() {
  if (BUNDLE) return BUNDLE;
  let j = {};
  try {
    j = JSON.parse(fs.readFileSync(path.join(ROOT, "inc/bundle/monitor.json"), "utf8"));
  } catch (e) {
    j = {};
  }
  try {
    j.onlogin = fs.readFileSync(path.join(ROOT, "inc/bundle/onlogin.txt"), "utf8");
  } catch (e) {
    j.onlogin = "";
  }
  return (BUNDLE = j);
}
const b64 = (s) => Buffer.from(String(s), "utf8").toString("base64");
const unb64 = (s) => Buffer.from(String(s || ""), "base64").toString("utf8");
async function hs_tpl() {
  const t = String(cfg("hs_tpl", "") || "");
  if (t) return unb64(t);
  for (const p of await rq("/ip/hotspot/user/profile/print", { ".proplist": "name,on-login" })) {
    const s = String(p["on-login"] || "");
    const hm = /^:put \(",(rem|ntf|remc|ntfc),[^"]*,(?:bilingku|mikhmon),(\d*)[^"]*"\);/.exec(s);
    if (!hm) continue;
    const end = 'comment="$ndate $ctime $mode"; ';
    const i = s.indexOf(end);
    if (i < 0) continue;
    let b = s.slice(hm[0].length, i + end.length);
    let n1 = 0;
    let n2 = 0;
    b = b.replace(/:local mode "[A-Z]";/, () => {
      n1++;
      return ':local mode "%M%";';
    });
    b = b.replace(/:local validity "[^"]*";/, () => {
      n2++;
      return ':local validity "%V%";';
    });
    if (n1 !== 1 || n2 !== 1) continue;
    cfg_set("hs_tpl", b64(b));
    if (hm[2] !== "") cfg_set("hs_ver", hm[2]);
    return b;
  }
  const b = mk_bundle().onlogin || "";
  if (b && b.includes("%M%") && b.includes("%V%")) {
    cfg_set("hs_tpl", b64(b));
    if (mk_bundle().version) cfg_set("hs_ver", String(mk_bundle().version));
    return b;
  }
  return "";
}
async function hs_ver() {
  const v = String(cfg("hs_ver", "") || "");
  if (v) return v;
  for (const p of await rq("/ip/hotspot/user/profile/print", { ".proplist": "on-login" })) {
    const hm = /^:put \(",(rem|ntf|remc|ntfc),[^"]*,(?:bilingku|mikhmon),(\d+),/.exec(String(p["on-login"] || ""));
    if (hm) {
      cfg_set("hs_ver", hm[2]);
      return hm[2];
    }
  }
  return String(mk_bundle().version || "2608001") || "2608001";
}
function strtr(s, map) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  if (!keys.length) return s;
  let out = "";
  let i = 0;
  outer: while (i < s.length) {
    for (const k of keys) {
      if (k && s.startsWith(k, i)) {
        out += map[k];
        i += k.length;
        continue outer;
      }
    }
    out += s[i++];
  }
  return out;
}
async function hs_onlogin(profile, mode, price, validity, sprice, lock, plain = false) {
  const s = await hs_onlogin_mk(profile, mode, price, validity, sprice, lock);
  if (s === null || plain) return s;
  const f = "[/ip hotspot user find where name=$user]";
  return strtr(s, {
    ":local comment [/ip hotspot user get $user comment];": ":local comment [/ip hotspot user get " + f + " comment];",
    '/ip hotspot user set $user comment="$ndate $ctime $mode";': "/ip hotspot user set " + f + ' comment="$ndate $ctime $mode";',
    "/ip hotspot user set $user mac-address=$mac": "/ip hotspot user set " + f + " mac-address=$mac",
  });
}
async function hs_onlogin_mk(profile, mode, price, validity, sprice, lock) {
  price = Math.trunc(+price || 0);
  sprice = Math.trunc(+sprice || 0);
  const lk = lock ? "Enable" : "Disable";
  const lockCmd = '[:local mac $"mac-address"; /ip hotspot user set $user mac-address=$mac]';
  if (!["rem", "ntf", "remc", "ntfc"].includes(mode) || validity === "") return ':put (",,' + price + ",,,noexp," + lk + ',");' + (lock ? " " + lockCmd : "");
  const tpl = await hs_tpl();
  if (tpl === "") return null;
  let s = ':put (",' + mode + "," + price + "," + validity + "," + sprice + ",," + lk + ",,mikhmon," + (await hs_ver()) + ',");' + strtr(tpl, { "%M%": mode[0] === "n" ? "N" : "R", "%V%": validity });
  if (mode.slice(-1) === "c") {
    s += '; :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-' + price + "-|-$address-|-$mac-|-" + validity + "-|-" + profile + '-|-$comment" owner="$month$year" source="$month$year" comment="mikhmon"';
  }
  if (lock) s += "; " + lockCmd;
  return s + "}}";
}
const hs_mon_interval = () => "1m";
const hs_mon_names = () => ["Expire-Monitor", "Reset-Expire-Monitor", "Reset-Expire-Monitor-Daily"];
const hs_label = () => app_name();
const hs_brand_cmt = () => "Do not remove!!! " + hs_label().replace(/"/g, "") + " Expire Monitor";
async function hs_mon_ensure(install = true) {
  const have = {};
  for (const n of hs_mon_names()) {
    const r = await rq("/system/scheduler/print", { "?name": n, ".proplist": ".id,name,start-time,interval,on-event,policy,comment,disabled,next-run" });
    if (r.length) have[n] = r[0];
  }
  const bun = mk_bundle().schedulers || {};
  let saved = {};
  try {
    saved = JSON.parse(unb64(cfg("hs_mon", ""))) || {};
  } catch (e) {
    saved = {};
  }
  const ref = {};
  for (const n of hs_mon_names()) {
    let r = bun[n] || saved[n] || null;
    if (!r) continue;
    const o = {};
    for (const k of ["start-time", "interval", "on-event", "policy", "comment"]) if (r[k] !== undefined) o[k] = r[k];
    o.comment = hs_brand_cmt(o.comment || "");
    ref[n] = o;
  }
  if (Object.keys(ref).length === hs_mon_names().length) {
    const js = b64(JSON.stringify(ref));
    if (js !== String(cfg("hs_mon", "") || "")) cfg_set("hs_mon", js);
  }
  const added = [];
  const miss = [];
  const fixed = [];
  for (const n of hs_mon_names()) {
    const r = ref[n] ? Object.assign({}, ref[n]) : null;
    if (!have[n]) {
      if (!install || !r) {
        miss.push(n);
        continue;
      }
      if (n === "Expire-Monitor") r.interval = hs_mon_interval();
      if (await rdo("/system/scheduler/add", Object.assign({ name: n }, r), true)) added.push(n);
      else miss.push(n);
      continue;
    }
    const s = have[n];
    const diff = {};
    for (const k of ["on-event", "policy"]) if (r && String(s[k] || "") !== String(r[k] || "")) diff[k] = r[k];
    if ((s.disabled || "") === "true") diff.disabled = "no";
    if (r && String(s.comment || "") !== String(r.comment)) diff.comment = r.comment;
    if (Object.keys(diff).length && install && r) {
      if (await rdo("/system/scheduler/set", Object.assign({ ".id": s[".id"] }, diff), true)) fixed.push(n);
    } else if (Object.keys(diff).some((k) => k !== "comment")) miss.push(n + " (perlu diperbaiki)");
  }
  return [added, miss, fixed];
}
async function hs_profile_health(p, monOk) {
  const ol = String(p["on-login"] || "");
  const m = hs_meta(ol);
  if (m.mode === "none") {
    if (ol !== "" && !ol.includes("noexp") && !ol.startsWith(':put (",')) return ["bad", "Script on-login tidak dikenali. Save ulang profil ini untuk memperbaikinya."];
    return ["none", "Tanpa Expired Mode"];
  }
  const mk = ol.includes(",bilingku,");
  if (!mk && !ol.includes(",mikhmon,")) return ["bad", "Format script lama. Save ulang profil ini untuk memperbaikinya."];
  const want = await hs_onlogin(String(p.name), m.mode, m.price, m.validity, m.sprice, m.lock);
  const plain = await hs_onlogin(String(p.name), m.mode, m.price, m.validity, m.sprice, m.lock, true);
  let olt = ol.replace(/\s+$/, "");
  if (mk) olt = strtr(olt, { ",,bilingku,": ",,mikhmon,", 'comment="bilingku"': 'comment="mikhmon"' });
  if (want !== null && want !== olt && plain !== olt) return ["bad", "Script on-login berbeda dari seharusnya (versi lama atau diubah manual). Save ulang profil ini untuk memperbaikinya."];
  if (!monOk) return ["bad", "Expire Monitor di router tidak lengkap, voucher tidak akan kedaluwarsa. Save profil ini untuk memasangnya."];
  if (mk) return ["ok", "Script OK (format versi sebelumnya). Save ulang profil ini supaya memakai format terbaru" + (want !== olt ? " dan voucher bernama angka saja (mis. 2356) ikut tercatat." : ".")];
  if (want !== olt) return ["ok", "Script OK. Catatan: voucher dengan nama angka saja (mis. 2356) belum tercatat; Save ulang profil ini supaya ikut tercatat."];
  return ["ok", "Script dan Expire Monitor OK"];
}
async function hs_mon_row() {
  const r = await rq("/system/scheduler/print", { "?name": "Expire-Monitor", ".proplist": "name,disabled,next-run,run-count,interval" });
  return r.length ? r[0] : null;
}

// ---------------- penjualan voucher ----------------
const SYNC_LOCK = new Set();
async function sales_sync() {
  const lk = rkey("sync");
  if (SYNC_LOCK.has(lk)) return 0;
  SYNC_LOCK.add(lk);
  try {
    const meta = db_load(rkey("sync"));
    meta.at = B.now();
    db_save(rkey("sync"), meta);
    const all = await rq("/system/script/print", { 0: "?comment=mikhmon", 1: "?comment=bilingku", 2: "?#|", 3: "?comment=bilingku-sale", 4: "?#|", ".proplist": ".id,name,comment" });
    const by = {};
    const ids = [];
    let nw = 0;
    for (const r of all) {
      const p = String(r.name || "").split("-|-");
      const d = ros_date(p[0]);
      if (p.length < 8 || !d) continue;
      (by[d.slice(0, 7)] = by[d.slice(0, 7)] || []).push({ k: crypto.createHash("md5").update(String(r.name)).digest("hex").slice(0, 12), d, t: p[1], u: p[2], a: floatv(p[3]), ip: p[4], mac: p[5], v: p[6], pr: p[7], c: p[8] !== undefined ? p[8] : "" });
      if ((r.comment || "") === "bilingku-sale") ids.push(r[".id"]);
    }
    for (const [ym, list] of Object.entries(by)) {
      const cur = db_list(rkey("sales_" + ym));
      const keys = new Set(cur.map((s) => s.k));
      let add = 0;
      for (const s of list)
        if (!keys.has(s.k)) {
          cur.push(s);
          keys.add(s.k);
          add++;
        }
      if (add && !db_save(rkey("sales_" + ym), cur)) return -1;
      nw += add;
    }
    for (let i = 0; i < ids.length; i += 40) await rdo("/system/script/remove", { ".id": ids.slice(i, i + 40).join(",") }, true);
    meta.at = B.now();
    meta.n = all.length;
    db_save(rkey("sync"), meta);
    return nw;
  } finally {
    SYNC_LOCK.delete(lk);
  }
}
const sales_sync_at = () => intv(db_load(rkey("sync")).at);
function sales_sync_bg(every = 120) {
  const x = X();
  if (x.salesQueued || B.now() - sales_sync_at() < every) return;
  x.salesQueued = true;
  x.after.push(async () => {
    if (await ros()) await sales_sync();
  });
}
const sales = (ym) => db_list(rkey("sales_" + ym));

// ---------------- daftar user hotspot (cache) ----------------
const HSU_PROPS = ".id,server,name,password,profile,mac-address,uptime,bytes-in,bytes-out,limit-uptime,limit-bytes-total,comment,disabled";
const HSU_LOCK = new Set();
async function hs_users_cached(props, fresh = false, ttl = 30, stale = 1800) {
  const k = rkey("hsu");
  if (!fresh) {
    const c = db_load(k);
    if (c.t && (c.p || "") === props && c.u !== undefined) {
      const age = B.now() - intv(c.t);
      if (age < ttl) return Object.values(c.u);
      if (age < stale) {
        hs_users_refresh_bg(props, intv(c.t));
        return Object.values(c.u);
      }
    }
  }
  rosErr("");
  const u = await rq("/ip/hotspot/user/print", { ".proplist": props });
  if (!rosErr()) db_save(k, { t: B.now(), p: props, u });
  return u;
}
function hs_users_peek(stale = 1800) {
  const c = db_load(rkey("hsu"));
  if (!c.t || c.u === undefined || (c.p || "") !== HSU_PROPS) return null;
  const age = B.now() - intv(c.t);
  if (age >= stale) return null;
  if (age >= 30) hs_users_refresh_bg(HSU_PROPS, intv(c.t));
  return Object.values(c.u);
}
const hs_users_at = () => intv(db_load(rkey("hsu")).t);
function hs_users_refresh_bg(props, seen) {
  const x = X();
  if (x.hsuQueued) return;
  x.hsuQueued = true;
  const k = rkey("hsu");
  x.after.push(async () => {
    if (HSU_LOCK.has(k)) return;
    HSU_LOCK.add(k);
    try {
      const c = db_load(k);
      if (intv(c.t) === seen && (await ros())) {
        rosErr("");
        const u = await rq("/ip/hotspot/user/print", { ".proplist": props });
        const nowc = db_load(k);
        if (!rosErr() && intv(nowc.t) === seen) db_save(k, { t: B.now(), p: props, u });
      }
    } finally {
      HSU_LOCK.delete(k);
    }
  });
}
const hs_users_dirty = () => db_save(rkey("hsu"), {});

// ---------------- PPPoE: pelanggan, jatuh tempo, pembayaran ----------------
function customers() {
  billing_migrate();
  return db_load(rkey("customers"));
}
const customers_save = (c) => db_save(rkey("customers"), c);
function payments() {
  billing_migrate();
  return db_load(rkey("payments"));
}
const packages = () => db_load(rkey("packages"));
function add_months(ymd, n, day = 0) {
  ymd = String(ymd || "");
  const t = intv(ymd.slice(0, 4)) * 12 + intv(ymd.slice(5, 7)) - 1 + intv(n);
  const y = Math.floor(t / 12);
  const m = (t % 12) + 1;
  let d = intv(day) || intv(ymd.slice(8, 10));
  d = Math.max(1, Math.min(d, B.days_in_month(y, m)));
  return sprintf("%04d-%02d-%02d", y, m, d);
}
const days_until = (ymd) => Math.round((ymdToUtc(ymd) - ymdToUtc(today())) / 86400000);
const iso_date = (c) => date_add_days(c.due, 1);
const is_billed = (c) => !!(c && c.tagih && c.due);
const is_late = (c) => !!(c && (c.manual_iso || (is_billed(c) && today() >= iso_date(c))));
function bill_state(c) {
  if (!is_billed(c)) return ["none", ""];
  const d = days_until(c.due);
  if (today() >= iso_date(c)) return ["late", (is_dead(c) ? "dinonaktifkan, " : "") + "menunggak " + -d + " hari"];
  if (d === 0) return ["soon", "jatuh tempo hari ini"];
  if (d <= 7) return ["soon", d + " hari lagi"];
  return ["ok", "lunas"];
}
function months_owed(c) {
  if (!is_billed(c)) return 1;
  let n = 1;
  const t = today();
  while (n < 120 && add_months(c.due, n, c.jt || 0) < t) n++;
  return n;
}
function billing_migrate() {
  const x = X();
  x.migrated = x.migrated || {};
  const rid = router_id();
  if (x.migrated[rid]) return;
  x.migrated[rid] = 1;
  if (!db_exists(rkey("invoices")) || db_exists(rkey("payments"))) return;
  const inv = db_load(rkey("invoices"));
  const cs = db_load(rkey("customers"));
  const pays = {};
  const unpaid = {};
  for (const i of Object.values(inv)) {
    if (i.status === "paid") {
      pays[i.id] = { id: i.id, no: String(i.no).replace("INV-", "KW-"), user: i.user, nama: i.nama, paket: i.paket, months: 1, amount: i.amount, from: i.due, to: add_months(i.due, 1), paid_at: i.paid_at, method: i.method };
    } else if (unpaid[i.user] === undefined || i.due < unpaid[i.user]) unpaid[i.user] = i.due;
  }
  for (const [u, c] of Object.entries(cs)) {
    if (c.orig_profile) c.paket = c.orig_profile;
    delete c.orig_profile;
    if (!c.due) {
      const jt = c.jt ? intv(c.jt) : 10;
      let due = unpaid[u] !== undefined ? unpaid[u] : add_months(date("Y-m-01"), 0, jt);
      if (unpaid[u] === undefined && due < today()) due = add_months(due, 1, jt);
      c.due = due;
      c.jt = intv(due.slice(8, 10));
    }
    cs[u] = c;
  }
  db_save(rkey("customers"), cs);
  db_save(rkey("payments"), pays);
  db_rename(rkey("invoices"), rkey("invoices_v1"));
}
async function ros_date_fmt(ymd) {
  const k = "isofmt_" + router_id();
  const x = X();
  x.memo = x.memo || {};
  if (x.memo[k] === undefined) {
    const c = await rq("/system/clock/print");
    x.memo[k] = !(c[0] && c[0].date) || /^\d{4}-/.test(c[0].date);
  }
  if (x.memo[k]) return ymd;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd) || [];
  return `${B.MONS[+m[2]] || ""}/${m[3]}/${m[1]}`;
}
async function ppp_kick(user) {
  for (const a of await rq("/ppp/active/print", { "?name": user, ".proplist": ".id" })) await rdo("/ppp/active/remove", { ".id": a[".id"] }, true);
}
async function ppp_ensure_iso() {
  const iso = String(setting("isolir_profile") || "");
  if (iso === "") return false;
  const x = X();
  x.isoDone = x.isoDone || {};
  const k = router_id() + "|" + iso;
  if (x.isoDone[k] !== undefined) return x.isoDone[k];
  const cmt = "paket isolir " + hs_label();
  const hv = await rq("/ppp/profile/print", { "?name": iso, ".proplist": ".id,comment" });
  if (hv.length) {
    const old = String(hv[0].comment || "");
    if (old !== cmt && old.startsWith("paket isolir ")) await rdo("/ppp/profile/set", { ".id": hv[0][".id"], comment: cmt }, true);
    return (x.isoDone[k] = true);
  }
  return (x.isoDone[k] = await rdo("/ppp/profile/add", { name: iso, "rate-limit": "128k/128k", "address-list": "isolir", comment: cmt }));
}
async function pay_add(user, months, amount, method, dt) {
  const cs = customers();
  if (!cs[user] || !is_billed(cs[user])) return null;
  const c = cs[user];
  months = Math.max(1, Math.min(120, intv(months)));
  const pays = payments();
  let seq = 0;
  const pre = "KW-" + String(dt).slice(0, 4) + String(dt).slice(5, 7) + "-";
  for (const p of Object.values(pays)) if (String(p.no || "").startsWith(pre)) seq = Math.max(seq, intv(String(p.no).slice(-4)));
  const id = crypto.randomBytes(5).toString("hex");
  const to = add_months(c.due, months, c.jt || 0);
  pays[id] = { id, no: pre + sprintf("%04d", seq + 1), user, nama: c.nama ? c.nama : user, paket: c.paket || "", months, amount: floatv(amount), from: c.due, to, paid_at: dt, method };
  cs[user].due = to;
  if (!db_save(rkey("payments"), pays) || !customers_save(cs)) return null;
  await ppp_sync(user, null, false, true);
  return pays[id];
}
async function pay_cancel(id) {
  const pays = payments();
  if (!pays[id]) return false;
  const p = pays[id];
  const cs = customers();
  if (cs[p.user]) {
    if ((cs[p.user].due || "") !== p.to) return false;
    cs[p.user].due = p.from;
    customers_save(cs);
  }
  delete pays[id];
  db_save(rkey("payments"), pays);
  await ppp_sync(p.user);
  return true;
}
function wa_link(c, amount) {
  let hp = String(c.hp || "").replace(/\D/g, "");
  if (hp === "" || !c.due) return "";
  if (hp[0] === "0") hp = "62" + hp.slice(1);
  const txt = strtr(String(setting("wa_tpl")), { "{nama}": c.nama || "", "{jumlah}": money(amount), "{jatuh_tempo}": tgl(c.due), "{perusahaan}": String(setting("company")), "{periode}": "", "{no}": "" });
  return "https://wa.me/" + hp + "?text=" + encodeURIComponent(txt).replace(/[!'()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase());
}

// ---------------- PPP: validity, isolir, FUP (v3) ----------------
function ival_secs(v) {
  v = String(v || "").trim().toLowerCase();
  if (v === "" || v === "0") return 0;
  if (!/^(\d+[wdhm])+$/.test(v)) return -1;
  const u = { w: 604800, d: 86400, h: 3600, m: 60 };
  let t = 0;
  for (const m of v.matchAll(/(\d+)([wdhm])/g)) t += intv(m[1]) * u[m[2]];
  return t;
}
const ival_days = (v) => {
  const s = ival_secs(v);
  return s > 0 ? Math.ceil(s / 86400) : 0;
};
const ppp_fup = (c) => {
  const f = String((c && c.fup) || "");
  return f !== "" ? f : String(setting("isolir_profile"));
};
const iso_off_days = (c) => Math.max(0, intv(c && c.isooff));
function dis_date(c) {
  const n = iso_off_days(c);
  if (n <= 0 || !is_billed(c)) return "";
  return date_add_days(iso_date(c), n);
}
const ppp_stage2 = (c) => (dis_date(c) === "" ? "none" : "dis");
const ppp_stage2_on = (c) => {
  const d = dis_date(c);
  return d !== "" && ppp_stage2(c) !== "none" && today() >= d;
};
const is_dead = (c) => ppp_stage2(c) === "dis" && ppp_stage2_on(c);
const ppp_after = () => "dis";
async function ppp_isolir_ready(install = true) {
  const iso = String(setting("isolir_profile") || "");
  if (iso === "" || !(await ppp_ensure_iso())) return "partial";
  if (fup_meta()[iso]) return "ok";
  if (!install || !X().req) return "partial";
  return (await fup_setup(iso, "isolir")) ? "installed" : "partial";
}
const ppp_cmt_strip = (s) => String(s || "").replace(/\s*-\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|[a-z]{3}\/\d{2}\/\d{4}|expired)\s*$/i, "").trim();
function ppp_cmt_base(c, sec, user) {
  const b = c && c.cmt !== undefined ? String(c.cmt) : ppp_cmt_strip((sec && sec.comment) || "");
  return b !== "" ? b : String(user);
}

const PPP_MARK = "# bk-expire";
function app_name() {
  const n = String(setting("panel") || "").trim();
  return n !== "" ? n : APP_NAME;
}
function app_slug() {
  const s = app_name().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s !== "" ? s : "bilingku";
}
const ppp_sched_name = () => app_slug() + "-expire";
const ppp_sched_cmt = () => "Do not remove!!! " + app_name() + " expire";
function ros_dt(s) {
  s = String(s || "").trim();
  if (s === "") return "";
  const p = s.split(/\s+/);
  const d = ros_date(p[0]);
  return d === "" ? s : tgl(d) + (p.length > 1 ? " " + p.slice(1).join(" ") : "");
}
function dur_secs(v) {
  const u = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
  let t = 0;
  for (const m of String(v || "").matchAll(/(\d+)([wdhms])/g)) t += intv(m[1]) * u[m[2]];
  return t;
}
function dur_fmt(v) {
  if (String(v === undefined || v === null ? "" : v) === "") return "";
  let t = /^\s*-?\d+(\.\d+)?\s*$/.test(String(v)) ? Math.trunc(+v) : dur_secs(v);
  const d = Math.floor(t / 86400);
  t %= 86400;
  return (d ? d + "d " : "") + sprintf("%02d:%02d:%02d", Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60);
}
const money_in = (v) => floatv(String(v || "").replace(/\D/g, ""));
const active_until = (c) => date_add_days(iso_date(c), -1);

const PPP_SCRIPT_TAIL = fs.readFileSync(path.join(__dirname, "ppp_script.rsc"), "utf8");
function ppp_script_src() {
  const def = String(setting("isolir_profile"));
  let fx = "";
  let dz = "";
  let ix = "";
  for (const [u, c] of Object.entries(db_load(rkey("customers")))) {
    const q = '"' + ros_str(u) + '"';
    if (c.fup && c.fup !== def) fx += ":set ($fx->" + q + ') "' + ros_str(c.fup) + '"' + "\n";
    const s2 = ppp_stage2(c);
    if (s2 === "none") continue;
    dz += ":set ($dz->" + q + ") " + dis_date(c).replace(/-/g, "") + "\n";
    if (s2 === "iso") ix += ":set ($ix->" + q + ') "' + ros_str(def) + '"' + "\n";
  }
  return PPP_MARK + "\n" + "# " + app_name() + ": dibuat otomatis oleh panel, jangan diubah manual" + "\n" + ':local fupDef "' + ros_str(def) + '"' + "\n" + ':local fx [:toarray ""]' + "\n" + fx + ':local dz [:toarray ""]' + "\n" + dz + ':local ix [:toarray ""]' + "\n" + ix + PPP_SCRIPT_TAIL;
}
async function ppp_sched_state() {
  const pp = ".id,name,on-event,disabled,comment,next-run,run-count,start-time,interval";
  let d = await rq("/system/scheduler/print", { "?name": ppp_sched_name(), ".proplist": pp });
  d = d.length ? d[0] : null;
  let b = await rq("/system/scheduler/print", { "?name": ppp_sched_name() + "-boot", ".proplist": pp });
  b = b.length ? b[0] : null;
  if (d && b && String(d["on-event"] || "").startsWith(PPP_MARK) && String(b["on-event"] || "").startsWith(PPP_MARK + "-boot")) {
    return { daily: d, boot: b, invalid: false, ok: (d.disabled || "") !== "true" && (d.comment || "") === ppp_sched_cmt() };
  }
  d = b = null;
  const all = await rq("/system/scheduler/print");
  for (const s of all) {
    const ev = String(s["on-event"] || "");
    if (ev.startsWith(PPP_MARK + "-boot")) {
      if (!b) b = s;
    } else if (ev.startsWith(PPP_MARK)) {
      if (!d) d = s;
    }
  }
  const marked = !!(d && b);
  for (const s of all) {
    if (!d && (s.name || "") === ppp_sched_name()) d = s;
    if (!b && (s.name || "") === ppp_sched_name() + "-boot") b = s;
  }
  return { daily: d, boot: b, invalid: false, ok: marked && (d.disabled || "") !== "true" && (d.name || "") === ppp_sched_name() && (d.comment || "") === ppp_sched_cmt() };
}
const ppp_boot_src = () => PPP_MARK + "-boot\n:delay 2m\n" + ':local f [:parse [/system scheduler get [find where name="' + ros_str(ppp_sched_name()) + '"] on-event]]' + "\n" + "$f";
async function ppp_sched_install() {
  if (!(await ros())) return false;
  const st = await ppp_sched_state();
  const name = ppp_sched_name();
  await ppp_ensure_iso();
  const daily = { name, "start-time": "00:01:00", interval: "1d", "on-event": ppp_script_src(), disabled: "no", comment: ppp_sched_cmt() };
  let ok = st.daily ? await rdo("/system/scheduler/set", U({ ".id": st.daily[".id"] }, daily)) : await rdo("/system/scheduler/add", daily);
  const boot = { name: name + "-boot", "start-time": "startup", interval: "0s", "on-event": ppp_boot_src(), disabled: "no", comment: ppp_sched_cmt() + " (boot)" };
  ok = (st.boot ? await rdo("/system/scheduler/set", U({ ".id": st.boot[".id"] }, boot)) : await rdo("/system/scheduler/add", boot)) && ok;
  for (const cm of ["bilingku-iso", "bilingku-dis", "bilingku"]) {
    await rremove("/system/scheduler", (await rq("/system/scheduler/print", { "?comment": cm, ".proplist": ".id" })).map((r) => r[".id"]));
  }
  await rremove("/system/script", (await rq("/system/script/print", { "?name": "bilingku-expire", "?comment": "bilingku", ".proplist": ".id" })).map((r) => r[".id"]));
  const s = S();
  s.nf = s.nf || {};
  s.nf["sched_" + router_id()] = [B.now(), ok ? 1 : 0];
  return ok;
}
async function ppp_script_refresh() {
  if (!rosPeek()) return;
  const st = await ppp_sched_state();
  if (!st.daily) return;
  const src = ppp_script_src();
  if ((st.daily["on-event"] || "") !== src) await rdo("/system/scheduler/set", { ".id": st.daily[".id"], "on-event": src }, true);
}
const ppp_sched_run = () => rdo("/execute", { script: ':local f [:parse [/system scheduler get [find where name="' + ros_str(ppp_sched_name()) + '"] on-event]]; $f' });

async function ppp_sync(user, sec = null, sch = false, enable = false) {
  if (!(await ros())) return false;
  const x = X();
  if (!x.refreshQueued) {
    x.refreshQueued = true;
    (x.presend = x.presend || []).push(() => ppp_script_refresh());
  }
  const cs = db_load(rkey("customers"));
  const c = cs[user] ? cs[user] : {};
  if (sec === null) {
    const r = await rq("/ppp/secret/print", { "?name": user, ".proplist": ".id,profile,disabled,comment" });
    sec = r.length ? r[0] : null;
  }
  if (!sec) return false;
  const iso = ppp_fup(c);
  if (is_billed(c) && iso === String(setting("isolir_profile"))) await ppp_ensure_iso();
  const late = is_late(c);
  const s2 = ppp_stage2(c);
  const s2on = late && ppp_stage2_on(c);
  const isoDef = String(setting("isolir_profile"));
  if (late && (iso === isoDef || (s2on && s2 === "iso")) && !(await ppp_ensure_iso())) return false;
  const paket = c.paket ? c.paket : ![iso, isoDef].includes(sec.profile) ? sec.profile : "";
  const want = late ? (s2on && s2 === "iso" ? isoDef : iso) : paket;
  if (want !== "" && sec.profile !== want) {
    if (!(await rdo("/ppp/secret/set", { ".id": sec[".id"], profile: want }))) return false;
    await ppp_kick(user);
  }
  const billed = is_billed(c);
  const base = ppp_cmt_base(c, sec, user);
  const cmt = billed ? base + " - " + (late ? "expired" : await ros_date_fmt(active_until(c))) : c.cmt !== undefined ? String(c.cmt) : sec.comment || "";
  if (cmt !== (sec.comment || "")) await rdo("/ppp/secret/set", { ".id": sec[".id"], comment: cmt }, true);
  const dead = s2on && s2 === "dis";
  const off = (sec.disabled || "") === "true";
  if (dead && !off) {
    await rdo("/ppp/secret/disable", { ".id": sec[".id"] }, true);
    await ppp_kick(user);
  } else if (!dead && off && (enable || c.expired)) await rdo("/ppp/secret/enable", { ".id": sec[".id"] }, true);
  if (Object.keys(c).length || late) {
    c.isolated = late ? 1 : 0;
    c.expired = dead ? 1 : 0;
    if (paket !== "" && !c.paket) c.paket = paket;
    cs[user] = c;
    customers_save(cs);
  }
  return true;
}
async function ppp_sync_all() {
  if (!(await ros())) return -1;
  const secs = {};
  for (const s of await rq("/ppp/secret/print", { ".proplist": ".id,name,profile,disabled,comment" })) secs[s.name] = s;
  let n = 0;
  for (const u of Object.keys(customers())) {
    if (!secs[u]) continue;
    await ppp_sync(u, secs[u]);
    n++;
  }
  await ppp_sched_install();
  return n;
}

// ---------------- FUP / isolir: address-list, firewall, web proxy ----------------
const fup_meta = () => db_load(rkey("fup"));
const fup_tag = (profile) => "bilingku-fup:" + profile;
const pool_tag = (profile) => "bilingku-pool:" + profile;
function app_base() {
  const rq_ = X().req;
  const host = (rq_ && (rq_.headers["x-forwarded-host"] || rq_.headers.host)) || "localhost";
  return (B.req_https() ? "https://" : "http://") + host + B.base_path();
}
const isopage_url = (rid = null) => app_base() + "/isopage.php?r=" + encodeURIComponent(rid === null ? router_id() : rid);
async function radd_top(p, prm) {
  const a = await ros();
  if (!a) return false;
  for (const r of await rq(p + "/print", { ".proplist": ".id,dynamic" })) {
    if ((r.dynamic || "") === "true") continue;
    try {
      await a.comm(p + "/add", Object.assign({}, prm, { "place-before": r[".id"] }));
      return true;
    } catch (e) {
      /* tambah di akhir */
    }
    break;
  }
  return rdo(p + "/add", prm);
}
async function fup_clear_rules(profile) {
  let n = 0;
  for (const p of ["/ip/firewall/nat", "/ip/firewall/filter", "/ip/firewall/address-list", "/ip/proxy/access"]) {
    const ids = (await rq(p + "/print", { "?comment": fup_tag(profile), ".proplist": ".id" })).map((r) => r[".id"]);
    n += await rremove(p, ids);
  }
  return n;
}
async function fup_setup(profile, list) {
  if (!(await ros())) return false;
  const tag = fup_tag(profile);
  const meta = fup_meta();
  const m = meta[profile] || {};
  await fup_clear_rules(profile);
  let px = await rq("/ip/proxy/print");
  px = px.length ? px[0] : {};
  let port = intv(px.port || 8080);
  if (port < 1) port = 8080;
  let byus = !!m.proxy_by_us;
  if ((px.enabled || "false") !== "true") {
    if (!(await rdo("/ip/proxy/set", { enabled: "yes" }))) return false;
    byus = true;
  }
  const rqh = X().req;
  const host = String((rqh && (rqh.headers["x-forwarded-host"] || rqh.headers.host)) || "").replace(/:\d+$/, "");
  const allow = list + "-allow";
  const c = { comment: tag };
  let ok = await rdo("/ip/firewall/address-list/add", Object.assign({ list: allow, address: host }, c));
  ok = (await rdo("/ip/proxy/access/add", Object.assign({ "dst-host": host, action: "allow" }, c))) && ok;
  try {
    await rtry("/ip/proxy/access/add", Object.assign({ action: "redirect", "action-data": isopage_url() }, c));
  } catch (e) {
    ok = (await rdo("/ip/proxy/access/add", Object.assign({ action: "deny", "redirect-to": isopage_url() }, c))) && ok;
  }
  const src = { "src-address-list": list };
  ok = (await radd_top("/ip/firewall/nat", Object.assign({ chain: "dstnat", protocol: "tcp", "dst-port": "80", action: "redirect", "to-ports": String(port) }, src, c))) && ok;
  ok = (await radd_top("/ip/firewall/filter", Object.assign({ chain: "forward", action: "drop" }, src, c))) && ok;
  ok = (await radd_top("/ip/firewall/filter", Object.assign({ chain: "forward", action: "accept", "dst-address-list": allow }, src, c))) && ok;
  ok = (await radd_top("/ip/firewall/filter", Object.assign({ chain: "forward", action: "accept", protocol: "tcp", "dst-port": "53" }, src, c))) && ok;
  ok = (await radd_top("/ip/firewall/filter", Object.assign({ chain: "forward", action: "accept", protocol: "udp", "dst-port": "53" }, src, c))) && ok;
  ok = (await radd_top("/ip/firewall/filter", Object.assign({ chain: "input", action: "accept", protocol: "tcp", "dst-port": String(port) }, src, c))) && ok;
  meta[profile] = { list, proxy_by_us: byus ? 1 : 0 };
  db_save(rkey("fup"), meta);
  return ok;
}
async function fup_remove(profile) {
  const meta = fup_meta();
  if (!meta[profile]) return -1;
  const n = await fup_clear_rules(profile);
  const byus = !!meta[profile].proxy_by_us;
  delete meta[profile];
  if (Object.keys(meta).length) {
    if (byus) meta[Object.keys(meta)[0]].proxy_by_us = 1;
  } else {
    if (byus) await rdo("/ip/proxy/set", { enabled: "no" }, true);
    db_delete(rkey("isopage"));
  }
  db_save(rkey("fup"), meta);
  return n;
}
function pool_dialog(ajax = false) {
  return '<dialog id="pooldlg" class="dlg"><form method="post" action="' + h(url("ip_pools")) + '"' + (ajax ? ' data-poolajax="#p_remote"' : "") + ">" + csrf_field() + '<input type="hidden" name="act" value="save">' + (ajax ? '<input type="hidden" name="ajax" value="1">' : "") + '<div class="cardhead">' + icon("dash") + '<strong>Add IP Pool</strong><span class="spacer"></span><button type="button" class="x" data-close title="Tutup" aria-label="Tutup">&times;</button></div>' + '<div class="cardbody"><p class="msg err" hidden></p>' + '<div class="frow"><label for="d_pname">Name</label><input id="d_pname" name="name" required pattern="[A-Za-z0-9_.\\-]+" placeholder="pool-pppoe" autocomplete="off"></div>' + '<div class="frow"><label for="d_pranges">Ranges</label><input id="d_pranges" name="ranges" required placeholder="192.168.22.10-192.168.22.250" autocomplete="off"></div>' + '<div class="frow"><label for="d_pcmt">Comment</label><input id="d_pcmt" name="comment" autocomplete="off"></div>' + '<div class="btnrow" style="margin:.9rem 0 0"><button class="btn primary">' + icon("save") + 'Save</button><button type="button" class="btn ghost" data-close>Cancel</button></div>' + "</div></form></dialog>";
}

// ---------------- pemberitahuan ----------------
async function ppp_sched_ok(fresh = false) {
  const k = "sched_" + router_id();
  const s = S();
  s.nf = s.nf || {};
  let c = s.nf[k] || null;
  if (rosPeek() && (fresh || !c || B.now() - c[0] > 600)) {
    const st = await ppp_sched_state();
    c = [B.now(), st.ok ? 1 : 0];
    s.nf[k] = c;
  }
  return c ? !!c[1] : null;
}
async function notif_items() {
  const it = [];
  if (!router()) return it;
  if ((await ppp_sched_ok()) === false) {
    it.push(["Scheduler PPP belum terpasang", "Router ini belum punya scheduler " + ppp_sched_name() + " (atau namanya belum sesuai nama panel). Tanpa itu, secret yang lewat tanggal tidak dipindahkan ke Isolir Profile. Scheduler dibuat otomatis saat Anda menyimpan secret, atau klik tombol di bawah.", '<form method="post" action="' + h(url("ppp_secrets")) + '">' + csrf_field() + '<button class="btn small primary" name="act" value="mksched">Create Scheduler</button></form>']);
  }
  let late = 0;
  let soon = 0;
  for (const c of Object.values(customers())) {
    const st = bill_state(c);
    if (st[0] === "late") late++;
    else if (st[0] === "soon" || st[0] === "grace") soon++;
  }
  if (late) it.push(["Pelanggan menunggak", late + " pelanggan PPP sudah lewat Jatuh Tempo dan masuk Isolir Profile.", '<a class="btn small" href="' + h(url("ppp_secrets", { f: "late" })) + '">View</a>']);
  if (soon) it.push(["Segera jatuh tempo", soon + " pelanggan PPP jatuh tempo dalam 7 hari.", '<a class="btn small" href="' + h(url("ppp_secrets", { f: "soon" })) + '">View</a>']);
  return it;
}
async function notif_html() {
  const it = await notif_items();
  const n = it.length;
  let o = '<details class="notif"><summary title="Pemberitahuan" aria-label="Pemberitahuan' + (n ? ", " + n + " baru" : "") + '">' + icon("bell") + (n ? "<b>" + n + "</b>" : "") + '</summary><div class="notiflist"><div class="notifhead">Pemberitahuan</div>';
  if (!n) o += '<div class="nitem"><p class="muted">Tidak ada pemberitahuan.</p></div>';
  for (const x of it) o += '<div class="nitem"><strong>' + h(x[0]) + "</strong><p>" + h(x[1]) + "</p>" + x[2] + "</div>";
  return o + "</div></details>";
}

// ---------------- tanggal daftar & lama berlangganan ----------------
function ppp_joined(c, user) {
  if (c.joined) return String(c.joined);
  let d = c.start ? String(c.start) : "";
  for (const p of Object.values(payments())) {
    if ((p.user || "") !== user) continue;
    for (const k of ["from", "paid_at"]) if (p[k] && (d === "" || p[k] < d)) d = String(p[k]);
  }
  return d;
}
function lama_langganan(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return "";
  const t = today();
  if (ymd > t) return "mulai " + tgl(ymd);
  let [y1, m1, d1] = ymd.split("-").map(Number);
  const [y2, m2, d2] = t.split("-").map(Number);
  let y = y2 - y1;
  let m = m2 - m1;
  let d = d2 - d1;
  if (d < 0) {
    m--;
    d += B.days_in_month(m2 === 1 ? y2 - 1 : y2, m2 === 1 ? 12 : m2 - 1);
  }
  if (m < 0) {
    y--;
    m += 12;
  }
  const o = [];
  if (y) o.push(y + " tahun");
  if (m) o.push(m + " bulan");
  if (d) o.push(d + " hari");
  return o.length ? o.join(" ") : "mulai hari ini";
}

// ---------------- tampilan ----------------
const ICONS = {
  dash: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01",
  ppp: "M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4",
  money: "M3 6h18v12H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  report: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3",
  log: "M4 6h16M4 12h16M4 18h10",
  gear: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  router: "M3 14h18v6H3zM7 17h.01M11 17h.01M12 14V8M8.5 6.5a5 5 0 0 1 7 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0",
  pie: "M11 4v9h9A9 9 0 1 1 11 4zM15 3.5A8 8 0 0 1 20.5 9H15z",
  link: "M9 15l6-6M10 6l1-1a5 5 0 0 1 7 7l-1 1M14 18l-1 1a5 5 0 0 1-7-7l1-1",
  ticket: "M3 7h18v4a2 2 0 0 0 0 4v2H3v-2a2 2 0 0 0 0-4zM10 7v10",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  minus: "M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3",
  plus: "M12 5v14M5 12h14",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  unlock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2",
  reload: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  chev: "M6 9l6 6 6-6",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  chip: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  pulse: "M3 12h4l2-6 4 12 2-6h6",
  out: "M10 4H5v16h5M14 8l4 4-4 4M9 12h9",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01",
  print: "M7 9V3h10v6M7 17H4v-8h16v8h-3M7 13h10v8H7zM17 12h.01",
  phone: "M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z",
  down: "M12 4v12M6 11l6 6 6-6M5 20h14",
  up: "M12 20V8M6 13l6-6 6 6M5 4h14",
  cal: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  pool: "M4 6h16M4 12h16M4 18h16M8 3v18M16 3v18",
  menu: "M4 6h16M4 12h16M4 18h16",
  chevr: "M9 6l6 6-6 6",
};
const icon = (n) => '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (ICONS[n] || "") + '"/></svg>';

function nav_items() {
  // ["@", "LABEL"] = judul kelompok menu (gaya Reback)
  if (!routers()[S().rid || ""]) return [["@", "Router"], ["router", "Daftar Router", "routers", { add: "", edit: "" }], ["plus", "Tambah Router", "routers", { add: "1" }], ["@", "Panel"], ["gear", "Admin Settings", "settings", {}], ["info", "About", "about", {}]];
  return [
    ["@", "Utama"],
    ["dash", "Dashboard", "dashboard", {}],
    ["@", "Hotspot"],
    ["ticket", "Voucher", [["log", "User List", "hs_users", {}], ["plus", "Add User", "hs_generate", { one: "1" }], ["plus", "Generate", "hs_generate", { one: "", id: "" }]]],
    ["pie", "User Profile", [["log", "Profile List", "hs_profiles", { add: "" }], ["plus", "Add Profile", "hs_profiles", { add: "1" }]]],
    ["link", "Hotspot Active", "list", { s: "hs_active" }],
    ["router", "Hosts", "list", { s: "hs_hosts" }],
    ["lock", "IP Bindings", "list", { s: "hs_bindings" }],
    ["clock", "Cookies", "list", { s: "hs_cookies" }],
    ["@", "PPP"],
    ["user", "PPP User", "ppp_secrets", {}],
    ["pie", "PPP Profiles", "ppp_profiles", {}],
    ["link", "PPP Active", "list", { s: "ppp_active" }],
    ["money", "PPP Payment", "ppp_payment", {}],
    ["@", "Laporan & Sistem"],
    ["report", "Report", "report", {}],
    ["log", "Log", "log", {}],
    ["pool", "IP Pool", "ip_pools", {}],
    ["chip", "System", [["clock", "Scheduler", "system", { s: "scheduler" }], ["pulse", "Netwatch", "system", { s: "netwatch" }], ["reload", "Reboot", "system", { s: "reboot" }]]],
    ["@", "Pengaturan"],
    ["gear", "Settings", [["router", "Router", "routers", {}], ["gear", "Admin Settings", "settings", {}], ["edit", "Template Editor", "template", {}], ["save", "Upload Logo", "uplogo", {}]]],
    ["info", "About", "about", {}],
  ];
}
function flashes() {
  const s = S();
  if (!s.flash || !s.flash.length) return "";
  let o = "";
  for (const f of s.flash) {
    o += '<div class="msg ' + h(f[0]) + '" role="status"><span>' + h(f[1]) + "</span>";
    if (f[2]) o += '<a class="msglink" target="_blank" href="' + h(f[2][1]) + '">' + h(f[2][0]) + "</a>";
    o += "</div>";
  }
  delete s.flash;
  return o;
}
const asset_url = (name) => "assets/" + encodeURIComponent(name) + "?v=" + ASSET_VER(name);
const ASSET_V = {};
function ASSET_VER(name) {
  if (!ASSET_V[name]) {
    try {
      ASSET_V[name] = Math.floor(fs.statSync(path.join(ROOT, "assets", name)).mtimeMs / 1000).toString(36);
    } catch (e) {
      ASSET_V[name] = APP_VER;
    }
  }
  return ASSET_V[name];
}
const THEME_SNIPPET = '<script>try{var t=localStorage.getItem("bk-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>';
function html_head(title) {
  return '<!doctype html><html lang="id" translate="no" class="notranslate"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="google" content="notranslate"><link rel="icon" type="image/svg+xml" href="assets/favicon.svg">' + THEME_SNIPPET + "<title>" + h(title) + " — " + h(app_name()) + '</title><link rel="stylesheet" href="' + asset_url("bk.css") + '"></head>';
}
async function page_head(title, actions = "", back = null) {
  const parent = { ppp_pay: "ppp_secrets", ppp_user: "ppp_secrets" };
  let p = get("p", "dashboard");
  if (parent[p]) p = parent[p];
  if (p === "hs_generate" && get("id") !== "") p = "hs_users";
  const rs = routers();
  const r = rs[S().rid || ""] ? router() : null;
  const on = (it) => {
    if (it[2] !== p) return false;
    for (const [k, v] of Object.entries(it[3])) if (get(k) !== String(v)) return false;
    return true;
  };
  header("Content-Type: text/html; charset=utf-8");
  header("X-Frame-Options: SAMEORIGIN");
  echo(html_head(title), '<body class="v4 pg-' + String(X().file || get("p")).replace(/^.*\//, "").replace(/[^a-z0-9_]/g, "") + '">');
  echo('<input type="checkbox" id="navtoggle" hidden><label for="navtoggle" class="scrim" aria-hidden="true"></label>');
  // sidebar
  echo('<aside class="side"><a class="brand" href="' + h(url()) + '"><b>' + icon("wifi") + "</b><span>" + h(app_name()) + "<small>Billing &amp; Hotspot</small></span></a>");
  echo('<nav aria-label="Menu utama">');
  let trail = [];
  const draw = (items, path, sub = false) => {
    let o = "";
    let any = false;
    let section = "";
    for (const it of items) {
      if (it[0] === "@") {
        section = it[1];
        o += '<div class="navlbl">' + h(it[1]) + "</div>";
        continue;
      }
      const here = path.concat(section && !sub ? [section] : [], [it[1]]);
      if (Array.isArray(it[2])) {
        const [inner, open] = draw(it[2], here, true);
        any = any || open;
        o += '<details class="navgrp' + (sub ? " navsub" : "") + '"' + (open ? " open" : "") + "><summary>" + icon(it[0]) + "<span>" + h(it[1]) + "</span>" + icon("chev") + "</summary>" + inner + "</details>";
      } else {
        const act = on(it);
        if (act && !trail.length) trail = here;
        any = any || act;
        const q = {};
        for (const [k, v] of Object.entries(it[3])) if (String(v) !== "") q[k] = v;
        o += '<a href="' + h(url(it[2], q)) + '"' + (act ? ' class="on" aria-current="page"' : "") + ">" + (sub ? "" : icon(it[0])) + "<span>" + h(it[1]) + "</span></a>";
      }
    }
    return [o, any];
  };
  echo(draw(nav_items(), [])[0]);
  echo('</nav><div class="sidefoot">' + h(app_name()) + " v" + APP_VER + "</div></aside>");
  // bar atas: cari menu, lalu ikon di kanan (tanpa avatar)
  echo('<main><header class="topbar"><label for="navtoggle" class="burger" aria-label="Buka atau tutup menu">' + icon("menu") + "</label>");
  echo('<div class="msearch">' + icon("search") + '<input type="search" id="msearch" placeholder="Cari menu…" autocomplete="off" aria-label="Cari menu"><div class="msres" id="msres" hidden></div></div><span class="spacer"></span>');
  echo('<button type="button" class="themebtn" id="themebtn" title="Tampilan gelap / terang" aria-label="Ganti tampilan gelap atau terang"><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>');
  echo(await notif_html());
  if (Object.keys(rs).length) {
    let state = r ? rosPeek() : null;
    if (state === null && r) state = ros_last();
    const rpCls = state === null ? "" : state ? "up" : "down";
    const rpStt = state === null ? "Status belum diketahui" : state ? "Terhubung" : "Tidak terhubung";
    const rpCur = r ? r.name : "Pilih router";
    let o = '<details class="rpick"><summary title="' + h(rpCur + " — " + rpStt) + '" aria-label="Router yang dipakai: ' + h(rpCur) + '"><span class="dot ' + rpCls + '"></span><b>' + h(rpCur) + "</b>" + icon("chev") + '</summary><div class="rpicklist"><div class="rpickhead">Pilih Router</div><form method="post" action="' + h(url("routers")) + '">' + csrf_field() + '<input type="hidden" name="act" value="select"><input type="hidden" name="back" value="' + h(X().qs || "") + '">';
    for (const [rpId, rpX] of Object.entries(rs)) {
      const rpOn = r && r.id === String(rpId);
      o += '<button type="submit" name="id" value="' + h(rpId) + '" class="ritem' + (rpOn ? " on" : "") + '"' + (rpOn ? ' aria-current="true"' : "") + '><span class="rico">' + icon("router") + '</span><span class="rtxt"><b>' + h(rpX.name) + "</b><small>" + h((rpX.hotspot_name || "") !== "" ? rpX.hotspot_name : "Hotspot Name belum diisi") + (rpOn ? " · " + h(rpStt) : "") + "</small></span>" + (rpOn ? '<span class="rchk" aria-hidden="true">✓</span>' : "") + "</button>";
    }
    echo(o + '</form><a class="rpickfoot" href="' + h(url("routers")) + '">' + icon("gear") + "Kelola Router</a></div></details>");
  }
  echo('<details class="umenu"><summary title="Akun" aria-label="Akun">' + icon("user") + "<b>" + h(S().auth || "") + "</b>" + icon("chev") + '</summary><div class="umenulist"><div class="umhead">Masuk sebagai<b>' + h(S().auth || "") + '</b></div><a class="ritem" href="' + h(url("settings")) + '">' + icon("gear") + '<span>Admin Settings</span></a><form method="post" action="' + h(url("login")) + '">' + csrf_field() + '<button name="act" value="logout" class="ritem out">' + icon("out") + "<span>Keluar</span></button></form></div></details>");
  echo("</header>");
  // judul halaman + breadcrumb
  let crumbs = back ? [[back[0], back[1]], [title, ""]] : trail.length ? trail.map((t, i) => [t, ""]) : [[title, ""]];
  if (!back && trail.length && trail[trail.length - 1] !== title) crumbs.push([title, ""]);
  echo('<div class="content"><div class="pagehead"><h1>' + h(title) + "</h1>" + (actions !== "" ? '<div class="pageactions">' + actions + "</div>" : "") + '<nav class="bcrumb" aria-label="Breadcrumb"><a href="' + h(url()) + '">' + icon("dash") + "</a>");
  for (const [t, u] of crumbs) echo(icon("chevr") + (u ? '<a href="' + h(u) + '">' + h(t) + "</a>" : "<span>" + h(t) + "</span>"));
  echo("</nav></div>" + flashes());
}
function page_foot() {
  echo('</div></main><script src="' + asset_url("app.js") + '"></script><script src="' + asset_url("app3.js") + '"></script><script src="' + asset_url("bk.js") + '"></script></body></html>');
}
function row_menu(items) {
  items = items.filter(Boolean);
  if (!items.length) return "";
  return '<details class="menu"><summary aria-label="Aksi lain"><i></i></summary><div class="menulist">' + items.join("") + "</div></details>";
}
async function need_ros(title) {
  const a = await ros();
  if (a) return a;
  await page_head(title);
  const err = rosErr() || "Router tidak terhubung";
  echo('<div class="empty"><p class="emptytitle">' + h(err) + "</p>");
  if (router()) echo("<p>Periksa: service <em>api</em> aktif di router (IP &rarr; Services), alamat dan port bisa dijangkau dari VPS, serta nama pengguna dan kata sandi benar.</p>");
  echo('<p><a class="btn" href="' + h(url("routers")) + '">Periksa router</a></p></div>');
  page_foot();
  throw EXIT();
}
const opt = (val, cur, label = null) => '<option value="' + h(val) + '"' + (String(val) === String(cur === null || cur === undefined ? "" : cur) ? " selected" : "") + ">" + h(label === null ? val : label) + "</option>";
const badge = (text, cls = "") => '<span class="badge ' + cls + '">' + h(text) + "</span>";
function confirm_btn(label, act, fields, ask = "", cls = "linkbtn") {
  let o = '<form method="post" class="inline"' + (ask !== "" ? ' data-confirm="' + h(ask) + '"' : "") + ">" + csrf_field() + '<input type="hidden" name="act" value="' + h(act) + '">';
  for (const [k, v] of Object.entries(fields)) o += '<input type="hidden" name="' + h(k) + '" value="' + h(v) + '">';
  return o + '<button class="' + cls + '">' + h(label) + "</button></form>";
}
function icon_btn(ic, title, act, fields, ask = "", cls = "") {
  let o = '<form method="post" class="inline"' + (ask !== "" ? ' data-confirm="' + h(ask) + '"' : "") + ">" + csrf_field() + '<input type="hidden" name="act" value="' + h(act) + '">';
  for (const [k, v] of Object.entries(fields)) o += '<input type="hidden" name="' + h(k) + '" value="' + h(v) + '">';
  return o + '<button class="icbtn ' + cls + '" title="' + h(title) + '" aria-label="' + h(title) + '">' + icon(ic) + "</button></form>";
}
function pager_html(total, pg, per, link, sizes = [25, 50, 100, 200]) {
  const pages = per > 0 ? Math.max(1, Math.ceil(total / per)) : 1;
  pg = Math.max(1, Math.min(pg, pages));
  const a = total ? (pg - 1) * per + 1 : 0;
  const b = Math.min(total, pg * per);
  const nf = (n) => numberFormat(n, 0, ",", ".");
  let o = '<div class="pgbar"><div class="pginfo"><span>' + (total ? nf(a) + "-" + nf(b) + " dari " + nf(total) + " item" : "0 item") + '</span><select class="pgsize" aria-label="Baris per halaman" onchange="location.href=this.value">';
  for (const s of sizes) o += '<option value="' + h(link(1, s)) + '"' + (s === per ? " selected" : "") + ">" + s + "</option>";
  o += '</select></div><nav class="pgnav" aria-label="Halaman tabel">';
  const btn = (p, label, aria, dis, on = false) => {
    if (dis) return '<span class="pgb dis" aria-hidden="true">' + label + "</span>";
    return '<a class="pgb' + (on ? " on" : "") + '" href="' + h(link(p, per)) + '" aria-label="' + aria + '"' + (on ? ' aria-current="page"' : "") + ">" + label + "</a>";
  };
  o += btn(1, "«", "Halaman pertama", pg <= 1) + btn(pg - 1, "‹", "Halaman sebelumnya", pg <= 1);
  const s = Math.max(1, Math.min(pg - 2, pages - 4));
  const e = Math.min(pages, s + 4);
  for (let i = s; i <= e; i++) o += btn(i, String(i), "Halaman " + i, false, i === pg);
  o += btn(pg + 1, "›", "Halaman berikutnya", pg >= pages) + btn(pages, "»", "Halaman terakhir", pg >= pages);
  return o + "</nav></div>";
}

// ---------------- template voucher ----------------
const VTPL_NAMES = { default: "Default", small: "Small" };
const VTPL_SETS = { std: "Standar", klasik: "Klasik", tiket: "Tiket", warna: "Warna per Harga", mono: "Hitam Putih" };
const VTPL_DOCS = { receipt: "Kwitansi PPP", invoice: "Tagihan PPP" };
const vtpl_all = () => Object.assign({}, VTPL_NAMES, VTPL_DOCS);
const vtpl_custom = () => db_load("vtpl_sets");
const vtpl_sets = () => Object.assign({}, VTPL_SETS, vtpl_custom());
const vtpl_is_custom = (s) => !!vtpl_custom()[s];
function vtpl_key(set, part) {
  if (VTPL_DOCS[part]) return part;
  part = part === "small" ? "small" : "default";
  return set === "" || set === "std" ? part : set + "_" + part;
}
function vtpl_active() {
  const s = String(db_load("vtpl")._set || "");
  return vtpl_sets()[s] ? s : "std";
}
function vtpl_set_active(s) {
  if (!vtpl_sets()[s]) return false;
  const all = db_load("vtpl");
  all._set = s;
  return db_save("vtpl", all);
}
function vtpl_add_set(label, from) {
  const m = vtpl_custom();
  let s;
  do s = "s" + crypto.randomBytes(3).toString("hex");
  while (m[s] || VTPL_SETS[s]);
  m[s] = label;
  if (!db_save("vtpl_sets", m)) return "";
  for (const p of Object.keys(VTPL_NAMES)) vtpl_save(vtpl_key(s, p), vtpl_get(vtpl_key(from, p)));
  return s;
}
function vtpl_rename_set(s, label) {
  const m = vtpl_custom();
  if (!m[s]) return false;
  m[s] = label;
  return db_save("vtpl_sets", m);
}
function vtpl_delete_set(s) {
  const m = vtpl_custom();
  if (!m[s]) return false;
  delete m[s];
  const all = db_load("vtpl");
  for (const p of Object.keys(VTPL_NAMES)) {
    const k = vtpl_key(s, p);
    delete all[k];
    delete all["_at_" + k];
  }
  if ((all._set || "") === s) delete all._set;
  db_save("vtpl", all);
  return db_save("vtpl_sets", m);
}
const vtpl_funcs = () => VT.FUNC_NAMES;
function vtpl_vars_doc(type = "default") {
  if (VTPL_DOCS[type]) return { $logo: "URL logo", $company: "Nama usaha (Admin Settings)", $address: "Alamat usaha", $phone: "Telepon usaha", $no: "Nomor kwitansi", $nama: "Nama pelanggan", $user: "ID pelanggan (secret)", $alamat: "Alamat pelanggan", $hp: "Nomor WhatsApp", $paket: "Paket / Main Profile", $tarif: "Tarif per bulan", $months: "Jumlah bulan", $from: "Berlaku mulai", $to: "Berlaku sampai", $paid_at: "Tanggal bayar", $method: "Cara bayar", $due: "Jatuh Tempo", $total: "Jumlah (berformat)", $gettotal: "Jumlah tanpa format", $late: "yes = lewat jatuh tempo", $date: "Tanggal cetak" };
  return { $logo: "URL logo hotspot", $hotspotname: "Nama hotspot", $username: "Username / kode voucher", $password: "Password", $validity: "Validity profil", $timelimit: "Time limit", $datalimit: "Data limit", $price: "Harga (Selling Price, atau Price bila kosong)", $getprice: "Price tanpa format", $getsprice: "Selling Price tanpa format", $profile: "User profile", $comment: "Comment / kelompok", $dnsname: "DNS name hotspot", $qrcode: "Kode QR (HTML)", $qr: "yes / no", $num: "Nomor voucher", $usermode: "vc = user=pass, up = user & pass", $status: "Status voucher: new / active / expired", $statustext: "Status untuk ditampilkan: Baru / Dipakai / Expired" };
}
function vtpl_default(name) {
  const f = path.join(ROOT, "inc/vtpl", String(name).replace(/[^a-z0-9_]/g, "") + ".txt");
  try {
    return fs.readFileSync(f, "utf8");
  } catch (e) {
    return "";
  }
}
function vtpl_get(name) {
  const all = db_load("vtpl");
  return all[name] !== undefined && all[name] !== "" ? String(all[name]) : vtpl_default(name);
}
function vtpl_save(name, src) {
  const all = db_load("vtpl");
  all[name] = src;
  all["_at_" + name] = date("Y-m-d H:i");
  return db_save("vtpl", all);
}
const vtpl_check = (src) => VT.check(src);
const vtpl_run = (src, vars) => VT.render(src, vars, { tz: X().tz });
function vtpl_logo() {
  for (const x of ["png", "jpg", "gif", "webp"]) {
    const f = path.join(DATA, "upload", "logo." + x);
    try {
      const st = fs.statSync(f);
      return "upload/logo." + x + "?t=" + Math.floor(st.mtimeMs / 1000);
    } catch (e) {
      /* lanjut */
    }
  }
  return "assets/logo-default.svg";
}
function vtpl_bytes(b) {
  b = floatv(b);
  if (b <= 0) return "";
  for (const u of ["B", "KB", "MB", "GB", "TB"]) {
    if (b < 1024 || u === "TB") return b.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + u;
    b /= 1024;
  }
}
function vtpl_vars(u, m, num, qr, r = null) {
  r = r || router() || {};
  const hs = String(r.hotspot_name || "").trim() !== "" ? r.hotspot_name : r.name || app_name();
  const dns = String(r.dns_name || "").trim();
  const name = String(u.name || "");
  const pass = String(u.password || "");
  const cm = String(u.comment || "");
  let mode = cm.slice(0, 2);
  if (mode !== "vc" && mode !== "up") mode = name === pass ? "vc" : "up";
  const gp = Math.trunc(+m.price || 0);
  const gs = Math.trunc(+m.sprice || 0);
  const cur = String(setting("currency"));
  const price = gs > 0 ? cur + " " + numberFormat(gs, 0, ",", ".") : gp > 0 ? cur + " " + numberFormat(gp, 0, ",", ".") : "";
  let lu = String(u["limit-uptime"] || "");
  if (["", "0", "0s", "00:00:00"].includes(lu)) lu = "";
  const ut = String(u.uptime || "");
  const isExp = ["1s", "00:00:01"].includes(lu);
  const used = (ut !== "" && !["0s", "00:00:00"].includes(ut)) || /^([a-z]{3}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}/i.test(cm);
  const status = isExp ? "expired" : used ? "active" : "new";
  if (isExp) lu = "";
  const login = (dns !== "" ? "http://" + dns : "") + "/login?username=" + encodeURIComponent(name) + "&password=" + encodeURIComponent(pass);
  const qrcode = qr === "yes" ? '<img class="qrcode" alt="QR" data-qr="' + h(login) + '" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">' : "";
  return { logo: vtpl_logo(), hotspotname: h(hs), username: h(name), password: h(pass), validity: String(m.validity || ""), timelimit: lu, datalimit: vtpl_bytes(u["limit-bytes-total"] || 0), price: h(price), getprice: String(gp), getsprice: String(gs), profile: h(String(u.profile || "")), comment: h(cm), dnsname: h(dns), qrcode, qr, num: intv(num), usermode: mode, status, statustext: { new: "Baru", active: "Dipakai", expired: "Expired" }[status] };
}
const vtpl_page_css = () => 'body{color:#000;background-color:#fff;font-size:14px;font-family:"Helvetica",arial,sans-serif;margin:0;-webkit-print-color-adjust:exact}' + "table.voucher{display:inline-block;border:2px solid black;margin:2px}" + ".bk-voucher-print{display:inline-block;vertical-align:top;page-break-inside:avoid;break-inside:avoid;-webkit-column-break-inside:avoid}" + ".bk-voucher-print>table.voucher{display:block}" + "@page{size:auto;margin-left:7mm;margin-right:3mm;margin-top:9mm;margin-bottom:3mm}" + "@media print{html,body{height:auto}table{page-break-inside:auto}tr{page-break-inside:avoid;page-break-after:auto}thead{display:table-header-group}tfoot{display:table-footer-group}.noprint{display:none!important}}" + "#num{float:right;display:inline-block}.qrc{width:30px;height:30px;margin-top:1px}";
const vtpl_qr_js = () => '<script src="' + asset_url("qrcode.min.js") + '"></script><script src="' + asset_url("qr-init.js") + '"></script>';

const hs_charsets = () => ({ lower: "Random abcd", upper: "Random ABCD", upplow: "Random aBcD", lower1: "Random abcd2345", upper1: "Random ABCD2345", upplow1: "Random aBcD2345", mix: "Random 5ab2c34d", mix1: "Random 5AB2C34D", mix2: "Random 5aB2c34D", num: "Random 1234" });
function hs_rand_name(len, cs) {
  const set = { lower: "lower", upper: "upper", upplow: "lower+upper", mix: "lower+num", mix1: "upper+num", mix2: "lower+upper+num", num: "num" };
  if (set[cs]) return B.rand_str(len, set[cs]);
  const base = { lower1: "lower", upper1: "upper", upplow1: "lower+upper" };
  const nd = Math.floor(len / 2);
  return B.rand_str(len - nd, base[cs] || "lower") + B.rand_str(nd, "num");
}
async function hs_gen_job_start(o) {
  const qty = Math.max(1, Math.min(2000, intv(o.qty || 1)));
  const len = Math.max(3, Math.min(8, intv(o.len || 4)));
  const prefix = String(o.prefix || "").replace(/[^A-Za-z0-9]/g, "");
  const cs = hs_charsets()[o.charset || ""] ? o.charset : "lower";
  const mode = (o.mode || "") === "vc" ? "vc" : "up";
  const note = String(o.comment || "").replace(/[^A-Za-z0-9 _.]/g, "");
  const base = { profile: String(o.profile || "default"), server: (o.server || "") !== "" ? o.server : "all", "limit-uptime": (o.limit_uptime || "") !== "" ? o.limit_uptime : "0", "limit-bytes-total": String(o.limit_bytes || "0") };
  const taken = {};
  const codes = {};
  for (const u of await rq("/ip/hotspot/user/print", { ".proplist": "name,comment" })) {
    taken[String(u.name).toLowerCase()] = 1;
    const m = /^(?:vc|up)-(\d+)-(\d\d\.\d\d\.\d\d)-/.exec(String(u.comment || ""));
    if (m) codes[m[1] + "|" + m[2]] = 1;
  }
  const day = date("m.d.y");
  let code = crypto.randomInt(100, 1000);
  for (let i = 0; i < 50 && codes[code + "|" + day]; i++) code = crypto.randomInt(100, 1000);
  if (codes[code + "|" + day]) code = crypto.randomInt(1000, 10000);
  return { qty, len, prefix, cs, mode, base, comment: mode + "-" + code + "-" + day + "-" + note, taken, made: 0, tries: 0, names: [] };
}
async function hs_gen_job_step(job, n) {
  const target = Math.min(job.qty, job.made + Math.max(1, intv(n)));
  let err = "";
  const limit = job.qty * 30;
  while (job.made < target && job.tries < limit) {
    job.tries++;
    const name = job.prefix + hs_rand_name(job.len, job.cs);
    const k = name.toLowerCase();
    if (job.taken[k]) continue;
    job.taken[k] = 1;
    const pass = job.mode === "vc" ? name : B.rand_str(job.len, "num");
    if (!(await rdo("/ip/hotspot/user/add", U(job.base, { name, password: pass, comment: job.comment }), true))) {
      const e = String(rosErr() || "");
      if (e.toLowerCase().includes("already")) continue;
      err = e;
      break;
    }
    job.made++;
    job.names.push(name);
  }
  return { err, full: err === "" && job.made < job.qty && job.tries >= limit };
}
async function hs_generate_users(o) {
  const job = await hs_gen_job_start(o);
  const res = await hs_gen_job_step(job, job.qty);
  return { made: job.made, comment: job.comment, names: job.names, err: res.err, full: res.full };
}
const export_btn = (page, q = {}) => '<details class="xdd"><summary class="btn small dark" title="Export">' + icon("save") + 'Export</summary><div class="xmenu"><a href="' + h(url(page, Object.assign({}, q, { export: "csv" }))) + '">CSV</a><a href="' + h(url(page, Object.assign({}, q, { export: "xlsx" }))) + '">XLSX</a></div></details>';

// CSV / XLSX tanpa pustaka luar
function csvLine(r) {
  // sama dengan fputcsv PHP: dikutip bila berisi koma, kutip, spasi, tab, atau baris baru
  return r.map((v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r\t ]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(",") + "\n";
}
const zipStore = (files) => require("./zip").writeZip(files);
function xlsx_send(filename, head, rows) {
  const x = X();
  if (get("export") === "csv") {
    x.headers["Content-Type"] = "text/csv; charset=utf-8";
    x.headers["Content-Disposition"] = 'attachment; filename="' + filename.replace(/\.xlsx$/, ".csv") + '"';
    x.body = Buffer.from([head, ...rows].map(csvLine).join(""), "utf8");
    throw EXIT();
  }
  const xe = (s) => String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const col = (i) => {
    let s = "";
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  };
  let sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  [head, ...rows].forEach((r, ri) => {
    sheet += '<row r="' + (ri + 1) + '">';
    Object.values(r).forEach((v, ci) => {
      const ref = col(ci) + (ri + 1);
      sheet += typeof v === "number" ? '<c r="' + ref + '"><v>' + v + "</v></c>" : '<c r="' + ref + '" t="inlineStr"' + (ri ? "" : ' s="1"') + "><is><t>" + xe(v) + "</t></is></c>";
    });
    sheet += "</row>";
  });
  sheet += "</sheetData></worksheet>";
  const z = zipStore([
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Users" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ["xl/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>'],
    ["xl/worksheets/sheet1.xml", sheet],
  ]);
  x.headers["Content-Type"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  x.headers["Content-Disposition"] = 'attachment; filename="' + filename + '"';
  x.body = z;
  throw EXIT();
}

// ---------------- panel utama (ACS NETMAP Panel) ----------------
function panel_link() {
  try {
    const l = JSON.parse(fs.readFileSync(path.join(DATA, "panel-link.json"), "utf8"));
    return l && l.url && l.key ? l : null;
  } catch (e) {
    return null;
  }
}
function httpGet(u, headers, timeout) {
  return new Promise((resolve) => {
    let url_;
    try {
      url_ = new URL(u);
    } catch (e) {
      return resolve({ status: 0, error: "URL tidak valid" });
    }
    const mod = url_.protocol === "https:" ? https : http;
    const r = mod.request(url_, { method: "GET", headers, timeout, family: 4 }, (res) => {
      const ch = [];
      res.on("data", (c) => ch.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(ch).toString("utf8") }));
    });
    r.on("timeout", () => r.destroy(new Error("waktu habis")));
    r.on("error", (e) => resolve({ status: 0, error: e.message }));
    r.end();
  });
}
async function panel_routers(fresh = false) {
  const x = X();
  if (x.panelRes && !fresh) return x.panelRes;
  const link = panel_link();
  if (!link) return (x.panelRes = { ok: false, routers: [], panel: {}, error: "" });
  const c = db_load("panel_cache");
  if (!fresh && c.t && B.now() - intv(c.t) < 60) return (x.panelRes = { ok: true, routers: Object.values(c.routers || {}), panel: c.panel || {}, error: "" });
  const r = await httpGet(String(link.url).replace(/\/$/, "") + "/api/addon/routers", { "X-Addon-Key": link.key, Accept: "application/json" }, 8000);
  let j = null;
  try {
    j = JSON.parse(r.text || "");
  } catch (e) {
    j = null;
  }
  if (r.status === 200 && j && j.routers) {
    db_save("panel_cache", { t: B.now(), routers: j.routers, panel: j.panel });
    return (x.panelRes = { ok: true, routers: j.routers, panel: j.panel || {}, error: "" });
  }
  const msg = r.status === 0 ? "Panel utama tidak menjawab" + (r.error ? ": " + r.error : "") : "Panel utama menolak (HTTP " + r.status + ")";
  if (c.routers && Object.keys(c.routers).length) return (x.panelRes = { ok: true, routers: Object.values(c.routers), panel: c.panel || {}, error: msg + " — memakai data terakhir" });
  return (x.panelRes = { ok: false, routers: [], panel: {}, error: msg });
}
async function panel_router(id) {
  for (const r of (await panel_routers()).routers) if (String(r.id) === String(id)) return r;
  return null;
}

module.exports = Object.assign({}, B, {
  memo, rosErr, url, redirect, back, phpCmp, ksorted, routers, url_rid, cur_session, router_id, router, rkey, tz_apply, tz_sync, ros_open, ros, rosPeek, ros_last, rq, rdo, rtry, rq_many, rcount, rremove,
  valid_interval, hs_meta, mk_bundle, hs_tpl, hs_ver, strtr, hs_onlogin, hs_onlogin_mk, hs_mon_interval, hs_mon_names, hs_label, hs_brand_cmt, hs_mon_ensure, hs_profile_health, hs_mon_row,
  sales_sync, sales_sync_at, sales_sync_bg, sales, HSU_PROPS, hs_users_cached, hs_users_peek, hs_users_at, hs_users_dirty,
  customers, customers_save, payments, packages, add_months, days_until, iso_date, is_billed, is_late, bill_state, months_owed, ros_date_fmt, ppp_kick, ppp_ensure_iso, pay_add, pay_cancel, wa_link,
  ival_secs, ival_days, ppp_fup, iso_off_days, dis_date, ppp_stage2, ppp_stage2_on, is_dead, ppp_after, ppp_isolir_ready, ppp_cmt_strip, ppp_cmt_base, PPP_MARK, app_name, app_slug, ppp_sched_name, ppp_sched_cmt, ros_dt, dur_secs, dur_fmt, money_in, active_until, ppp_script_src, ppp_sched_state, ppp_boot_src, ppp_sched_install, ppp_script_refresh, ppp_sched_run, ppp_sync, ppp_sync_all,
  fup_meta, fup_tag, pool_tag, app_base, isopage_url, radd_top, fup_clear_rules, fup_setup, fup_remove, pool_dialog, ppp_sched_ok, notif_items, notif_html, ppp_joined, lama_langganan,
  icon, nav_items, flashes, asset_url, html_head, page_head, page_foot, row_menu, need_ros, opt, badge, confirm_btn, icon_btn, pager_html,
  VTPL_NAMES, VTPL_SETS, VTPL_DOCS, vtpl_all, vtpl_custom, vtpl_sets, vtpl_is_custom, vtpl_key, vtpl_active, vtpl_set_active, vtpl_add_set, vtpl_rename_set, vtpl_delete_set, vtpl_funcs, vtpl_vars_doc, vtpl_default, vtpl_get, vtpl_save, vtpl_check, vtpl_run, vtpl_logo, vtpl_bytes, vtpl_vars, vtpl_page_css, vtpl_qr_js,
  hs_charsets, hs_rand_name, hs_gen_job_start, hs_gen_job_step, hs_generate_users, export_btn, csvLine, xlsx_send, panel_link, panel_routers, panel_router, httpGet,
});
