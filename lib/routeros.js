// Klien RouterOS API (port 8728 / 8729-ssl), async, banyak perintah sekaligus lewat .tag.
// Login RouterOS v6.43+ / v7 dan login lama (challenge MD5). Port dari inc/routeros.php.
"use strict";
const net = require("net");
const tls = require("tls");
const crypto = require("crypto");

function encLen(l) {
  if (l < 0x80) return Buffer.from([l]);
  if (l < 0x4000) return Buffer.from([(l >> 8) | 0x80, l & 0xff]);
  if (l < 0x200000) return Buffer.from([(l >> 16) | 0xc0, (l >> 8) & 0xff, l & 0xff]);
  if (l < 0x10000000) return Buffer.from([(l >>> 24) | 0xe0, (l >> 16) & 0xff, (l >> 8) & 0xff, l & 0xff]);
  return Buffer.from([0xf0, (l >>> 24) & 0xff, (l >> 16) & 0xff, (l >> 8) & 0xff, l & 0xff]);
}
const encWord = (w) => {
  const b = Buffer.from(String(w), "utf8");
  return Buffer.concat([encLen(b.length), b]);
};
// Kata perintah dari params: 'kunci'=>nilai (atribut), '?kunci'=>nilai (query), indeks angka => kata mentah ('?#|')
function words(cmd, params) {
  const out = [cmd];
  if (Array.isArray(params)) {
    for (const x of params) out.push(String(x));
  } else {
    for (const [k, v] of Object.entries(params || {})) {
      if (/^\d+$/.test(k)) out.push(String(v));
      else if (k[0] === "?") out.push(`${k}=${v}`);
      else out.push(`=${k}=${v}`);
    }
  }
  return out;
}

class RouterOS {
  constructor() {
    this.error = "";
    this.sock = null;
    this.buf = Buffer.alloc(0);
    this.cur = [];
    this.pending = new Map();
    this.seq = 0;
    this.timeout = 6000;
    this.closed = true;
  }
  connect(host, port, user, pass, opts = {}) {
    this.timeout = opts.timeout || 6000;
    return new Promise((resolve) => {
      const done = (ok, err) => {
        if (err) this.error = err;
        resolve(ok);
      };
      const h = String(host || "").replace(/^\[|\]$/g, "");
      const s = (opts.ssl ? tls : net).connect({ host: h, port: +port || 8728, rejectUnauthorized: false });
      this.sock = s;
      this.closed = false;
      let opened = false;
      const t = setTimeout(() => {
        if (!opened) {
          s.destroy();
          done(false, `Tidak bisa terhubung ke ${h}:${port} (timeout)`);
        }
      }, this.timeout);
      s.on(opts.ssl ? "secureConnect" : "connect", async () => {
        opened = true;
        clearTimeout(t);
        try {
          await this.comm("/login", { name: user, password: pass });
          if (this.ret) {
            // RouterOS < 6.43: challenge MD5
            const chal = Buffer.from(this.ret, "hex");
            const md5 = crypto.createHash("md5").update(Buffer.concat([Buffer.from([0]), Buffer.from(pass, "utf8"), chal])).digest("hex");
            await this.comm("/login", { name: user, response: "00" + md5 });
          }
          done(true);
        } catch (e) {
          this.close();
          done(false, "Login ke router gagal: " + e.message);
        }
      });
      s.on("data", (d) => this.onData(d));
      s.on("error", (e) => {
        if (!opened) {
          clearTimeout(t);
          done(false, `Tidak bisa terhubung ke ${h}:${port} (${e.code || e.message})`);
        }
        this.fail(new Error("Koneksi ke router terputus"));
      });
      s.on("close", () => this.fail(new Error("Koneksi ke router terputus")));
    });
  }
  connected() {
    return !this.closed && this.sock && !this.sock.destroyed;
  }
  close() {
    this.closed = true;
    if (this.sock) this.sock.destroy();
    this.fail(new Error("Koneksi ditutup"));
  }
  fail(err) {
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
  onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (!b.length) return;
      let len;
      let n;
      const c = b[0];
      if ((c & 0x80) === 0) {
        len = c;
        n = 1;
      } else if ((c & 0xc0) === 0x80) {
        if (b.length < 2) return;
        len = ((c & 0x3f) << 8) | b[1];
        n = 2;
      } else if ((c & 0xe0) === 0xc0) {
        if (b.length < 3) return;
        len = ((c & 0x1f) << 16) | (b[1] << 8) | b[2];
        n = 3;
      } else if ((c & 0xf0) === 0xe0) {
        if (b.length < 4) return;
        len = ((c & 0x0f) * 0x1000000) + (b[1] << 16) + (b[2] << 8) + b[3];
        n = 4;
      } else {
        if (b.length < 5) return;
        len = b.readUInt32BE(1);
        n = 5;
      }
      if (b.length < n + len) return;
      const w = b.subarray(n, n + len).toString("utf8");
      this.buf = b.subarray(n + len);
      if (len === 0) {
        const s = this.cur;
        this.cur = [];
        this.sentence(s);
      } else this.cur.push(w);
    }
  }
  sentence(s) {
    if (!s.length) return;
    const type = s[0];
    let tag = null;
    const a = {};
    for (const w of s.slice(1)) {
      if (w.startsWith(".tag=")) tag = w.slice(5);
      else if (w[0] === "=") {
        const p = w.indexOf("=", 1);
        if (p > 0) a[w.slice(1, p)] = w.slice(p + 1);
      }
    }
    if (type === "!fatal") {
      this.close();
      return;
    }
    const p = this.pending.get(tag);
    if (!p) return;
    if (type === "!re") p.rows.push(a);
    else if (type === "!trap") {
      if (p.trap === null) p.trap = a.message || "perintah ditolak";
    } else if (type === "!done") {
      clearTimeout(p.timer);
      this.pending.delete(tag);
      p.ret = a.ret !== undefined ? a.ret : null;
      if (p.trap !== null) p.reject(Object.assign(new Error(p.trap), { trap: true, ret: p.ret }));
      else p.resolve(p);
    }
  }
  // Kirim satu perintah; hasil: daftar baris (!re). Melempar Error bila !trap.
  async comm(cmd, params) {
    const r = await this.raw(cmd, params);
    this.ret = r.ret;
    return r.rows;
  }
  raw(cmd, params) {
    if (!this.connected()) return Promise.reject(new Error("Tidak terhubung ke router"));
    const tag = "t" + ++this.seq;
    const ws = words(cmd, params);
    ws.push(".tag=" + tag);
    const buf = Buffer.concat(ws.map(encWord).concat([Buffer.from([0])]));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(tag);
        reject(new Error("Router tidak merespons (timeout)"));
        this.close();
      }, Math.max(this.timeout, 20000));
      this.pending.set(tag, { rows: [], trap: null, ret: null, resolve, reject, timer });
      this.sock.write(buf);
    });
  }
  // Beberapa perintah sekaligus: hasil per perintah {rows, ret, err}
  batch(cmds) {
    return Promise.all(cmds.map(([c, p]) => this.raw(c, p).then((r) => ({ rows: r.rows, ret: r.ret, err: null }), (e) => ({ rows: [], ret: null, err: e.message }))));
  }
  async count(path, query) {
    const q = Object.assign({}, query || {}, { "count-only": "" });
    await this.comm(path + "/print", q);
    return parseInt(this.ret, 10) || 0;
  }
}

// Kolam koneksi: dipakai ulang antar permintaan (hemat login ±200 ms), ditutup bila 2 menit tidak dipakai
const POOL = new Map();
async function open(host, port, user, pass, keep = true) {
  const key = crypto.createHash("sha1").update([host, port, user, pass].join("\0")).digest("hex");
  if (keep) {
    const c = POOL.get(key);
    if (c && c.api.connected()) {
      c.last = Date.now();
      return c.api;
    }
    if (c && c.opening) return c.opening;
  }
  const api = new RouterOS();
  const opening = api.connect(host, port, user, pass).then((ok) => (ok ? api : Object.assign(api, { failed: true })));
  if (keep) POOL.set(key, { api, last: Date.now(), opening });
  const r = await opening;
  if (keep) {
    if (r.failed) POOL.delete(key);
    else POOL.set(key, { api, last: Date.now() });
  }
  return r;
}
setInterval(() => {
  for (const [k, c] of POOL) {
    if (!c.opening && (!c.api.connected() || Date.now() - c.last > 120000)) {
      c.api.close();
      POOL.delete(k);
    }
  }
}, 30000).unref();

module.exports = { RouterOS, open, words };
