// Penerjemah template voucher (subset PHP, gaya Mikhmon) untuk Bilingku versi Node.js.
// Mendukung: HTML biasa, <?php ... ?>, <?= ... ?>, variabel, teks '...' dan "..." (dengan $var / {$var}),
// angka, if / elseif / else if / else (kurung kurawal atau ":" ... endif;), echo, penugasan (= .= += -= *= /=),
// ++ / --, operator perbandingan & logika PHP, ternary, ??, cast (int)/(float)/(string)/(bool), isset/empty,
// indeks [..], dan fungsi aman yang sama dengan versi PHP (lihat FUNCS). Selain itu ditolak.
"use strict";

const FUNC_NAMES = ["substr", "strlen", "strpos", "explode", "preg_replace", "date", "strtoupper", "strtolower", "intval", "sprintf", "number_format", "date_default_timezone_set", "str_replace", "ucfirst", "ucwords", "trim", "round", "floor", "ceil", "implode", "str_pad", "htmlspecialchars", "floatval", "abs", "min", "max", "nl2br", "rtrim", "ltrim", "count"];

class TplError extends Error {}

// ---------------- Tokenizer ----------------
function tokenize(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  const push = (t, v, extra) => out.push(Object.assign({ t, v, line }, extra || {}));
  while (i < n) {
    // HTML di luar tag PHP
    const open = src.indexOf("<?", i);
    const html = open < 0 ? src.slice(i) : src.slice(i, open);
    if (html) push("html", html);
    line += (html.match(/\n/g) || []).length;
    if (open < 0) break;
    i = open + 2;
    let echo = false;
    if (src.startsWith("php", i)) i += 3;
    else if (src[i] === "=") {
      echo = true;
      i++;
    }
    if (echo) push("kw", "echo");
    // kode PHP sampai ?>
    for (;;) {
      if (i >= n) return out;
      const c = src[i];
      if (c === "\n") {
        line++;
        i++;
        continue;
      }
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (src.startsWith("?>", i)) {
        i += 2;
        if (src[i] === "\n") {
          i++;
          line++;
        } // seperti PHP: satu baris baru setelah ?> ditelan
        push(";", ";", { close: true });
        break;
      }
      if (c === "#" || src.startsWith("//", i)) {
        while (i < n && src[i] !== "\n" && !src.startsWith("?>", i)) i++;
        continue;
      }
      if (src.startsWith("/*", i)) {
        const e = src.indexOf("*/", i + 2);
        const seg = src.slice(i, e < 0 ? n : e + 2);
        line += (seg.match(/\n/g) || []).length;
        i = e < 0 ? n : e + 2;
        continue;
      }
      if (c === "$") {
        const m = /^\$([A-Za-z_]\w*)/.exec(src.slice(i));
        if (!m) throw new TplError(`Baris ${line}: "$" tidak valid`);
        push("var", m[1]);
        i += m[0].length;
        continue;
      }
      if (c === "'") {
        let j = i + 1;
        let s = "";
        while (j < n && src[j] !== "'") {
          if (src[j] === "\\" && (src[j + 1] === "'" || src[j + 1] === "\\")) {
            s += src[j + 1];
            j += 2;
          } else {
            if (src[j] === "\n") line++;
            s += src[j++];
          }
        }
        if (j >= n) throw new TplError(`Baris ${line}: teks '...' tidak ditutup`);
        push("str", s);
        i = j + 1;
        continue;
      }
      if (c === '"') {
        let j = i + 1;
        const parts = [];
        let s = "";
        const flush = () => {
          if (s) parts.push(s);
          s = "";
        };
        while (j < n && src[j] !== '"') {
          const ch = src[j];
          if (ch === "\\") {
            const e = src[j + 1];
            const map = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', $: "$", v: "\v", f: "\f", 0: "\0" };
            if (e in map) {
              s += map[e];
              j += 2;
            } else {
              s += ch;
              j++;
            }
          } else if (ch === "$" && /[A-Za-z_]/.test(src[j + 1] || "")) {
            const m = /^\$([A-Za-z_]\w*)/.exec(src.slice(j));
            flush();
            parts.push({ var: m[1] });
            j += m[0].length;
          } else if (ch === "{" && src[j + 1] === "$") {
            const e = src.indexOf("}", j);
            const m = /^\{\$([A-Za-z_]\w*)\}$/.exec(src.slice(j, e + 1));
            if (!m) throw new TplError(`Baris ${line}: {$...} di dalam teks hanya boleh berisi variabel`);
            flush();
            parts.push({ var: m[1] });
            j = e + 1;
          } else {
            if (ch === "\n") line++;
            s += ch;
            j++;
          }
        }
        if (j >= n) throw new TplError(`Baris ${line}: teks "..." tidak ditutup`);
        flush();
        if (parts.some((p) => typeof p !== "string")) push("istr", parts);
        else push("str", parts.join(""));
        i = j + 1;
        continue;
      }
      const num = /^(\d+\.\d+|\.\d+|\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (num && /\d|\./.test(c) && (c !== "." || /\d/.test(src[i + 1] || ""))) {
        push("num", Number(num[0]));
        i += num[0].length;
        continue;
      }
      const id = /^[A-Za-z_]\w*/.exec(src.slice(i));
      if (id) {
        const w = id[0].toLowerCase();
        if (["if", "elseif", "else", "endif", "echo", "isset", "empty", "and", "or", "xor", "true", "false", "null", "print"].includes(w)) push("kw", w);
        else push("id", id[0]);
        i += id[0].length;
        continue;
      }
      // cast (int) (float) (string) (bool) (integer) (double) (boolean)
      const cast = /^\(\s*(int|integer|float|double|string|bool|boolean)\s*\)/i.exec(src.slice(i));
      if (cast) {
        push("cast", cast[1].toLowerCase());
        i += cast[0].length;
        continue;
      }
      const ops = ["===", "!==", "**=", "<=>", "??", "==", "!=", "<>", "<=", ">=", "&&", "||", ".=", "+=", "-=", "*=", "/=", "%=", "++", "--", "**", ";", "(", ")", "{", "}", "[", "]", ",", ".", "=", "+", "-", "*", "/", "%", "<", ">", "!", "?", ":", "&", "|"];
      const op = ops.find((o) => src.startsWith(o, i));
      if (!op) throw new TplError(`Baris ${line}: tanda "${c}" tidak diizinkan di template`);
      if (op === ";") push(";", ";");
      else push("op", op === "<>" ? "!=" : op);
      i += op.length;
    }
  }
  return out;
}

// ---------------- Parser ----------------
function parse(src) {
  // versi PHP menjalankan eval('?>' . template): satu baris baru di awal template ikut "ditelan"
  const T = tokenize(String(src).replace(/^\r?\n/, ""));
  let p = 0;
  const peek = (k = 0) => T[p + k];
  const is = (t, v, k = 0) => {
    const x = T[p + k];
    return x && x.t === t && (v === undefined || x.v === v);
  };
  const isOp = (v) => is("op", v);
  const next = () => T[p++];
  const lineAt = () => (peek() ? peek().line : T.length ? T[T.length - 1].line : 1);
  const expect = (t, v) => {
    const x = next();
    if (!x || x.t !== t || (v !== undefined && x.v !== v)) throw new TplError(`Baris ${x ? x.line : lineAt()}: diharapkan "${v || t}"`);
    return x;
  };
  const skipSemis = () => {
    while (is(";")) p++;
  };

  function parseBlockUntil(stops) {
    const body = [];
    for (;;) {
      skipSemis();
      const x = peek();
      if (!x) {
        if (stops) throw new TplError(`Baris ${lineAt()}: blok tidak ditutup`);
        return body;
      }
      if (stops && x.t === "kw" && stops.includes(x.v)) return body;
      if (stops && stops.includes("}") && isOp("}")) return body;
      body.push(statement());
    }
  }
  function statement() {
    const x = peek();
    if (x.t === "html") {
      p++;
      return { k: "html", v: x.v };
    }
    if (isOp("{")) {
      p++;
      const b = parseBlockUntil(["}"]);
      expect("op", "}");
      return { k: "block", body: b };
    }
    if (x.t === "kw" && (x.v === "echo" || x.v === "print")) {
      p++;
      const args = [expr()];
      while (isOp(",")) {
        p++;
        args.push(expr());
      }
      endStmt();
      return { k: "echo", args };
    }
    if (x.t === "kw" && x.v === "if") return ifStmt();
    if (x.t === "kw" && ["else", "elseif", "endif"].includes(x.v)) throw new TplError(`Baris ${x.line}: "${x.v}" tanpa if`);
    const e = expr();
    endStmt();
    return { k: "expr", e };
  }
  function endStmt() {
    if (is(";")) {
      p++;
      return;
    }
    if (!peek() || isOp("}")) return;
    throw new TplError(`Baris ${lineAt()}: diharapkan ";"`);
  }
  function ifStmt() {
    p++; // if / elseif
    expect("op", "(");
    const cond = expr();
    expect("op", ")");
    if (isOp(":")) {
      // sintaks alternatif: if (x): ... elseif (y): ... else: ... endif;
      p++;
      const then = parseBlockUntil(["elseif", "else", "endif"]);
      let els = null;
      if (is("kw", "elseif")) els = [ifStmtAlt()];
      else if (is("kw", "else")) {
        p++;
        if (is("kw", "if")) els = [ifStmtAlt()];
        else {
          expect("op", ":");
          els = parseBlockUntil(["endif"]);
          expect("kw", "endif");
          endStmt();
        }
      } else {
        expect("kw", "endif");
        endStmt();
      }
      return { k: "if", cond, then, els };
    }
    const then = [statementOrSemi()];
    let els = null;
    skipCloseSemis();
    if (is("kw", "elseif")) els = [ifStmt()];
    else if (is("kw", "else")) {
      p++;
      skipCloseSemis();
      if (is("kw", "if")) els = [ifStmt()];
      else els = [statementOrSemi()];
    }
    return { k: "if", cond, then, els };
  }
  function ifStmtAlt() {
    p++;
    expect("op", "(");
    const cond = expr();
    expect("op", ")");
    expect("op", ":");
    const then = parseBlockUntil(["elseif", "else", "endif"]);
    let els = null;
    if (is("kw", "elseif")) els = [ifStmtAlt()];
    else if (is("kw", "else")) {
      p++;
      expect("op", ":");
      els = parseBlockUntil(["endif"]);
      expect("kw", "endif");
      endStmt();
    } else {
      expect("kw", "endif");
      endStmt();
    }
    return { k: "if", cond, then, els };
  }
  // "?>" setelah "}" atau sebelum else adalah pemisah, bukan pernyataan kosong
  function skipCloseSemis() {
    let k = 0;
    while (is(";", undefined, k) && T[p + k].close) k++;
    if (k && (is("kw", "else", k) || is("kw", "elseif", k))) p += k;
  }
  function statementOrSemi() {
    while (is(";") && T[p].close) p++;
    return statement();
  }

  // Ekspresi (urutan prioritas PHP)
  function expr() {
    return lowOr();
  }
  function lowOr() {
    let l = lowAnd();
    while (is("kw", "or") || is("kw", "xor")) {
      const o = next().v;
      l = { k: "bin", o: o === "or" ? "||" : "xor", l, r: lowAnd() };
    }
    return l;
  }
  function lowAnd() {
    let l = assign();
    while (is("kw", "and")) {
      p++;
      l = { k: "bin", o: "&&", l, r: assign() };
    }
    return l;
  }
  function assign() {
    const l = ternary();
    const x = peek();
    if (x && x.t === "op" && ["=", ".=", "+=", "-=", "*=", "/=", "%=", "**="].includes(x.v)) {
      if (l.k !== "var" && l.k !== "idx") throw new TplError(`Baris ${x.line}: hanya variabel yang bisa diberi nilai`);
      p++;
      return { k: "assign", o: x.v, target: l, r: assign() };
    }
    return l;
  }
  function ternary() {
    let c = coalesce();
    while (isOp("?")) {
      p++;
      if (isOp(":")) {
        p++;
        c = { k: "elvis", c, b: coalesce() };
        continue;
      }
      const a = assign();
      expect("op", ":");
      c = { k: "tern", c, a, b: assign() };
    }
    return c;
  }
  function coalesce() {
    const l = orExpr();
    if (isOp("??")) {
      p++;
      return { k: "coal", l, r: coalesce() };
    }
    return l;
  }
  const binLevel = (ops, nextFn) => () => {
    let l = nextFn();
    while (peek() && peek().t === "op" && ops.includes(peek().v)) {
      const o = next().v;
      l = { k: "bin", o, l, r: nextFn() };
    }
    return l;
  };
  const unary = () => {
    const x = peek();
    if (x && x.t === "op" && (x.v === "!" || x.v === "-" || x.v === "+")) {
      p++;
      return { k: "un", o: x.v, e: unary() };
    }
    if (x && x.t === "cast") {
      p++;
      return { k: "cast", to: x.v, e: unary() };
    }
    if (x && x.t === "op" && (x.v === "++" || x.v === "--")) {
      p++;
      const t = postfix();
      return { k: "incdec", o: x.v, pre: true, target: t };
    }
    return pow();
  };
  const pow = () => {
    const b = postfix();
    if (isOp("**")) {
      p++;
      return { k: "bin", o: "**", l: b, r: unary() };
    }
    return b;
  };
  const mul = binLevel(["*", "/", "%"], unary);
  const add = binLevel(["+", "-"], mul);
  const cat = binLevel(["."], add);
  const cmp = binLevel(["<", ">", "<=", ">=", "<=>"], cat);
  const eq = binLevel(["==", "!=", "===", "!=="], cmp);
  const band = binLevel(["&"], eq);
  const bor = binLevel(["|"], band);
  const andExpr = binLevel(["&&"], bor);
  const orExpr = binLevel(["||"], andExpr);

  function postfix() {
    let e = primary();
    for (;;) {
      if (isOp("[")) {
        p++;
        const i = isOp("]") ? null : expr();
        expect("op", "]");
        e = { k: "idx", e, i };
      } else if (isOp("++") || isOp("--")) {
        if (e.k !== "var" && e.k !== "idx") break;
        e = { k: "incdec", o: next().v, pre: false, target: e };
      } else if (isOp("(")) {
        throw new TplError(`Baris ${lineAt()}: memanggil hasil ekspresi sebagai fungsi tidak diizinkan`);
      } else break;
    }
    return e;
  }
  function primary() {
    const x = next();
    if (!x) throw new TplError(`Baris ${lineAt()}: ekspresi tidak lengkap`);
    if (x.t === "num") return { k: "lit", v: x.v };
    if (x.t === "str") return { k: "lit", v: x.v };
    if (x.t === "istr") return { k: "istr", parts: x.v };
    if (x.t === "var") {
      const v = x.v.toLowerCase();
      if (v === "this" || v === "globals" || v.startsWith("_")) throw new TplError(`Baris ${x.line}: variabel $${x.v} tidak diizinkan`);
      return { k: "var", n: x.v };
    }
    if (x.t === "kw" && x.v === "true") return { k: "lit", v: true };
    if (x.t === "kw" && x.v === "false") return { k: "lit", v: false };
    if (x.t === "kw" && x.v === "null") return { k: "lit", v: null };
    if (x.t === "kw" && (x.v === "isset" || x.v === "empty")) {
      expect("op", "(");
      const args = [expr()];
      while (isOp(",")) {
        p++;
        args.push(expr());
      }
      expect("op", ")");
      return { k: x.v, args };
    }
    if (x.t === "id") {
      const f = x.v.toLowerCase();
      if (!isOp("(")) throw new TplError(`Baris ${x.line}: "${x.v}" tidak dikenal`);
      if (!FUNC_NAMES.includes(f)) throw new TplError(`Baris ${x.line}: fungsi ${x.v}() tidak diizinkan`);
      p++;
      const args = [];
      if (!isOp(")")) {
        args.push(expr());
        while (isOp(",")) {
          p++;
          args.push(expr());
        }
      }
      expect("op", ")");
      return { k: "call", f, args };
    }
    if (x.t === "op" && x.v === "(") {
      const e = expr();
      expect("op", ")");
      if (isOp("(")) throw new TplError(`Baris ${x.line}: memanggil hasil ekspresi sebagai fungsi tidak diizinkan`);
      return e;
    }
    if (x.t === "op" && x.v === "[") {
      const items = [];
      while (!isOp("]")) {
        items.push(expr());
        if (isOp(",")) p++;
        else break;
      }
      expect("op", "]");
      return { k: "arr", items };
    }
    throw new TplError(`Baris ${x.line}: "${x.v}" tidak diizinkan di sini`);
  }
  const prog = parseBlockUntil(null);
  return prog;
}

// ---------------- Semantik PHP ----------------
const isNumStr = (s) => typeof s === "string" && /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(s);
function toNum(v) {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null || v === undefined) return 0;
  if (Array.isArray(v) || typeof v === "object") return v.length !== undefined ? (v.length ? 1 : 0) : 1;
  const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(String(v));
  return m ? Number(m[0]) : 0;
}
function toInt(v) {
  const n = toNum(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function numStr(n) {
  if (Number.isInteger(n)) return String(n);
  if (!Number.isFinite(n)) return n > 0 ? "INF" : n < 0 ? "-INF" : "NAN";
  let s = String(Number(n.toPrecision(14)));
  if (/e/.test(s)) s = s.replace(/e\+?/, "E+").replace("E+-", "E-");
  return s;
}
function toStr(v) {
  if (v === null || v === undefined || v === false) return "";
  if (v === true) return "1";
  if (typeof v === "number") return numStr(v);
  if (Array.isArray(v) || typeof v === "object") return "Array";
  return String(v);
}
function truthy(v) {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v !== "" && v !== "0";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
// Perbandingan longgar PHP 8
function looseEq(a, b) {
  if (typeof a === "boolean" || typeof b === "boolean") return truthy(a) === truthy(b);
  if (a === null || a === undefined) return b === null || b === undefined || b === "" || b === 0 || (Array.isArray(b) && !b.length);
  if (b === null || b === undefined) return looseEq(b, a);
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "number" && typeof b === "string") return isNumStr(b) ? a === toNum(b) : numStr(a) === b;
  if (typeof b === "number" && typeof a === "string") return looseEq(b, a);
  if (typeof a === "string" && typeof b === "string") return isNumStr(a) && isNumStr(b) ? toNum(a) === toNum(b) : a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}
function cmp(a, b) {
  if (typeof a === "string" && typeof b === "string" && !(isNumStr(a) && isNumStr(b))) return a < b ? -1 : a > b ? 1 : 0;
  if ((typeof a === "string" && !isNumStr(a) && typeof b === "number") || (typeof b === "string" && !isNumStr(b) && typeof a === "number")) {
    const x = toStr(a);
    const y = toStr(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = toNum(a);
  const y = toNum(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
const strictEq = (a, b) => (typeof a === typeof b && a === b) || (a === null && b === null) || (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b));
const arith = (n) => (Number.isFinite(n) && Number.isInteger(n) ? n : n);
const escHtml = (s, quotes = true) => toStr(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, quotes ? "&quot;" : '"').replace(/'/g, quotes ? "&#039;" : "'");
const utf8 = (s) => Buffer.from(toStr(s), "utf8");

// date() PHP
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function tzParts(ts, tz) {
  const d = new Date(ts * 1000);
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", timeZoneName: "shortOffset" });
  const o = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  const off = /GMT([+-]\d+)(?::(\d+))?/.exec(o.timeZoneName || "") || [];
  const offMin = off[1] ? +off[1] * 60 + (off[1][0] === "-" ? -1 : 1) * (+off[2] || 0) : 0;
  return { Y: +o.year, m: +o.month, d: +o.day, H: +o.hour, i: +o.minute, s: +o.second, w: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday), off: offMin };
}
function phpDate(fmt, ts, tz) {
  const p = tzParts(ts, tz);
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap(p.Y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const doy = dim.slice(0, p.m - 1).reduce((a, x) => a + x, 0) + p.d - 1;
  let out = "";
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    const h12 = p.H % 12 || 12;
    const offs = `${p.off < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(p.off) / 60))}`;
    switch (c) {
      case "d": out += pad(p.d); break;
      case "D": out += DAYS[p.w].slice(0, 3); break;
      case "j": out += p.d; break;
      case "l": out += DAYS[p.w]; break;
      case "N": out += p.w || 7; break;
      case "S": out += p.d % 10 === 1 && p.d !== 11 ? "st" : p.d % 10 === 2 && p.d !== 12 ? "nd" : p.d % 10 === 3 && p.d !== 13 ? "rd" : "th"; break;
      case "w": out += p.w; break;
      case "z": out += doy; break;
      case "F": out += MONTHS[p.m - 1]; break;
      case "M": out += MONTHS[p.m - 1].slice(0, 3); break;
      case "m": out += pad(p.m); break;
      case "n": out += p.m; break;
      case "t": out += dim[p.m - 1]; break;
      case "L": out += leap(p.Y) ? 1 : 0; break;
      case "Y": case "o": out += p.Y; break;
      case "y": out += pad(p.Y % 100); break;
      case "a": out += p.H < 12 ? "am" : "pm"; break;
      case "A": out += p.H < 12 ? "AM" : "PM"; break;
      case "g": out += h12; break;
      case "G": out += p.H; break;
      case "h": out += pad(h12); break;
      case "H": out += pad(p.H); break;
      case "i": out += pad(p.i); break;
      case "s": out += pad(p.s); break;
      case "u": out += "000000"; break;
      case "v": out += "000"; break;
      case "e": out += tz; break;
      case "T": out += tz === "UTC" ? "UTC" : offs; break;
      case "P": out += `${offs}:${pad(Math.abs(p.off) % 60)}`; break;
      case "O": out += `${offs}${pad(Math.abs(p.off) % 60)}`; break;
      case "Z": out += p.off * 60; break;
      case "U": out += ts; break;
      case "\\": i++; out += fmt[i] || ""; break;
      default: out += c;
    }
  }
  return out;
}
function numberFormat(n, dec = 0, dp = ".", ts = ",") {
  n = toNum(n);
  dec = Math.max(0, toInt(dec));
  const neg = n < 0;
  const f = Math.abs(n).toFixed(dec);
  let [i, d] = f.split(".");
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, toStr(ts));
  const s = d ? i + toStr(dp) + d : i;
  return neg && Number(f) !== 0 ? "-" + s : s;
}
function sprintf(fmt, ...args) {
  let a = 0;
  return toStr(fmt).replace(/%(?:(\d+)\$)?([-+ 0]|'.)*(\d+)?(?:\.(\d+))?([bcdeEfFgGosuxX%])/g, (m, argn, _f, width, prec, conv) => {
    if (conv === "%") return "%";
    const flags = (/%(?:\d+\$)?((?:[-+ 0]|'.)*)/.exec(m) || [])[1] || "";
    const v = argn ? args[+argn - 1] : args[a++];
    let s;
    switch (conv) {
      case "d": s = String(toInt(v)); if (flags.includes("+") && toInt(v) >= 0) s = "+" + s; break;
      case "u": s = String(toInt(v) >>> 0); break;
      case "f": case "F": s = toNum(v).toFixed(prec === undefined ? 6 : +prec); break;
      case "e": case "E": s = toNum(v).toExponential(prec === undefined ? 6 : +prec); if (conv === "E") s = s.toUpperCase(); break;
      case "g": case "G": s = numStr(toNum(v)); break;
      case "x": s = (toInt(v) >>> 0).toString(16); break;
      case "X": s = (toInt(v) >>> 0).toString(16).toUpperCase(); break;
      case "o": s = (toInt(v) >>> 0).toString(8); break;
      case "b": s = (toInt(v) >>> 0).toString(2); break;
      case "c": s = String.fromCharCode(toInt(v)); break;
      default: s = toStr(v); if (prec !== undefined) s = s.slice(0, +prec);
    }
    if (width && s.length < +width) {
      const padc = flags.includes("0") && conv !== "s" ? "0" : /'(.)/.test(flags) ? /'(.)/.exec(flags)[1] : " ";
      if (flags.includes("-")) s = s.padEnd(+width, " ");
      else if (padc === "0" && /^[+-]/.test(s)) s = s[0] + s.slice(1).padStart(+width - 1, "0");
      else s = s.padStart(+width, padc);
    }
    return s;
  });
}
// Ubah regex PHP "/pola/flag" menjadi RegExp JavaScript
function phpRegex(p) {
  p = toStr(p);
  const d = p[0];
  const end = { "(": ")", "{": "}", "[": "]", "<": ">" }[d] || d;
  const j = p.lastIndexOf(end);
  if (j <= 0) throw new TplError("Pola preg_replace tidak valid");
  const body = p.slice(1, j);
  const fl = p.slice(j + 1);
  let f = "g";
  if (fl.includes("i")) f += "i";
  if (fl.includes("m")) f += "m";
  if (fl.includes("s")) f += "s";
  if (fl.includes("u")) f += "u";
  return new RegExp(body, f);
}
const trimChars = (s, chars, l, r) => {
  s = toStr(s);
  const set = chars === undefined ? " \t\n\r\0\x0B" : toStr(chars);
  let a = 0;
  let b = s.length;
  if (l) while (a < b && set.includes(s[a])) a++;
  if (r) while (b > a && set.includes(s[b - 1])) b--;
  return s.slice(a, b);
};
const strSlice = (s, start, len) => {
  // substr PHP berbasis byte; untuk teks ASCII hasilnya sama
  const b = utf8(s);
  const n = b.length;
  let st = toInt(start);
  if (st < 0) st = Math.max(0, n + st);
  if (st > n) return "";
  let en = n;
  if (len !== undefined && len !== null) {
    const l = toInt(len);
    en = l < 0 ? n + l : Math.min(n, st + l);
  }
  return en <= st ? "" : b.subarray(st, en).toString("utf8");
};

function makeFuncs(ctx) {
  return {
    substr: (s, st, l) => strSlice(s, st, l),
    strlen: (s) => utf8(s).length,
    strpos: (h, n, o) => {
      const i = toStr(h).indexOf(toStr(n), toInt(o || 0));
      return i < 0 ? false : i;
    },
    explode: (d, s, lim) => {
      const parts = toStr(s).split(toStr(d));
      if (lim !== undefined && toInt(lim) > 0 && parts.length > toInt(lim)) return parts.slice(0, toInt(lim) - 1).concat([parts.slice(toInt(lim) - 1).join(toStr(d))]);
      return parts;
    },
    preg_replace: (pat, rep, s) => {
      const doOne = (pt, rp, str) => toStr(str).replace(phpRegex(pt), toStr(rp).replace(/\\(\d)|\$\{(\d+)\}/g, (m, a, b) => "$" + (a || b)));
      if (Array.isArray(pat)) return pat.reduce((acc, pt, i) => doOne(pt, Array.isArray(rep) ? rep[i] ?? "" : rep, acc), s);
      return doOne(pat, rep, s);
    },
    date: (f, t) => phpDate(toStr(f), t === undefined ? Math.floor(Date.now() / 1000) : toInt(t), ctx.tz),
    strtoupper: (s) => toStr(s).toUpperCase(),
    strtolower: (s) => toStr(s).toLowerCase(),
    intval: (v) => toInt(v),
    floatval: (v) => toNum(v),
    sprintf: (f, ...a) => sprintf(f, ...a),
    number_format: (n, d, dp, ts) => numberFormat(n, d === undefined ? 0 : d, dp === undefined ? "." : dp, ts === undefined ? "," : ts),
    date_default_timezone_set: (tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: toStr(tz) });
        ctx.tz = toStr(tz);
        return true;
      } catch (e) {
        return false;
      }
    },
    str_replace: (s, r, sub) => {
      const one = (str) => {
        let out = toStr(str);
        const ss = Array.isArray(s) ? s : [s];
        ss.forEach((x, i) => {
          const rr = Array.isArray(r) ? r[i] ?? "" : r;
          if (toStr(x) !== "") out = out.split(toStr(x)).join(toStr(rr));
        });
        return out;
      };
      return Array.isArray(sub) ? sub.map(one) : one(sub);
    },
    ucfirst: (s) => toStr(s).charAt(0).toUpperCase() + toStr(s).slice(1),
    ucwords: (s) => toStr(s).replace(/(^|[\s\t\r\n\f\v])(\S)/g, (m, a, b) => a + b.toUpperCase()),
    trim: (s, c) => trimChars(s, c, true, true),
    rtrim: (s, c) => trimChars(s, c, false, true),
    ltrim: (s, c) => trimChars(s, c, true, false),
    round: (v, p) => {
      const f = 10 ** toInt(p || 0);
      const x = toNum(v) * f;
      return (Math.sign(x) * Math.round(Math.abs(x) + 1e-9)) / f;
    },
    floor: (v) => Math.floor(toNum(v)),
    ceil: (v) => Math.ceil(toNum(v)),
    implode: (g, a) => (Array.isArray(g) ? g.map(toStr).join(toStr(a)) : (Array.isArray(a) ? a : []).map(toStr).join(toStr(g))),
    str_pad: (s, len, pad = " ", type = 1) => {
      s = toStr(s);
      len = toInt(len);
      pad = toStr(pad) || " ";
      if (len <= s.length) return s;
      const need = len - s.length;
      const fill = (k) => pad.repeat(Math.ceil(k / pad.length)).slice(0, k);
      type = toInt(type);
      if (type === 0) return fill(need) + s;
      if (type === 2) return fill(Math.floor(need / 2)) + s + fill(Math.ceil(need / 2));
      return s + fill(need);
    },
    htmlspecialchars: (s) => escHtml(s),
    abs: (v) => Math.abs(toNum(v)),
    min: (...a) => (a.length === 1 && Array.isArray(a[0]) ? a[0] : a).reduce((x, y) => (cmp(y, x) < 0 ? y : x)),
    max: (...a) => (a.length === 1 && Array.isArray(a[0]) ? a[0] : a).reduce((x, y) => (cmp(y, x) > 0 ? y : x)),
    nl2br: (s) => toStr(s).replace(/(\r\n|\n|\r)/g, "<br />$1"),
    count: (a) => (Array.isArray(a) ? a.length : a && typeof a === "object" ? Object.keys(a).length : 1),
  };
}

// ---------------- Interpreter ----------------
function run(prog, vars, opts = {}) {
  const ctx = { tz: opts.tz || "Asia/Jakarta", out: "", steps: 0 };
  const F = makeFuncs(ctx);
  const V = Object.assign({}, vars);
  const tick = () => {
    if (++ctx.steps > 200000) throw new TplError("Template terlalu berat (lebih dari 200.000 langkah)");
  };
  const getRef = (t) => {
    if (t.k === "var") return { get: () => V[t.n], set: (v) => (V[t.n] = v) };
    if (t.k === "idx") {
      const base = getRef(t.e);
      return {
        get: () => {
          const c = base.get();
          if (c === undefined || c === null) return null;
          if (t.i === null) return null;
          const k = ev(t.i);
          if (typeof c === "string") {
            const i = toInt(k);
            return c[i < 0 ? c.length + i : i] ?? "";
          }
          return c[typeof k === "boolean" ? +k : k] ?? null;
        },
        set: (v) => {
          let c = base.get();
          if (c === undefined || c === null || c === "") {
            c = [];
            base.set(c);
          }
          if (typeof c === "string") throw new TplError("Mengubah huruf di dalam teks tidak didukung");
          if (t.i === null) c.push(v);
          else c[toStr(ev(t.i))] = v;
        },
      };
    }
    throw new TplError("Target tidak valid");
  };
  function ev(e) {
    tick();
    switch (e.k) {
      case "lit": return e.v;
      case "istr": return e.parts.map((x) => (typeof x === "string" ? x : toStr(V[x.var]))).join("");
      case "var": return V[e.n] === undefined ? null : V[e.n];
      case "idx": return getRef(e).get();
      case "arr": return e.items.map(ev);
      case "un": {
        const v = ev(e.e);
        return e.o === "!" ? !truthy(v) : e.o === "-" ? -toNum(v) : toNum(v);
      }
      case "cast": {
        const v = ev(e.e);
        if (e.to === "int" || e.to === "integer") return toInt(v);
        if (e.to === "float" || e.to === "double") return toNum(v);
        if (e.to === "bool" || e.to === "boolean") return truthy(v);
        return toStr(v);
      }
      case "incdec": {
        const r = getRef(e.target);
        const old = r.get();
        const nv = toNum(old) + (e.o === "++" ? 1 : -1);
        r.set(nv);
        return e.pre ? nv : old;
      }
      case "assign": {
        const r = getRef(e.target);
        const v = ev(e.r);
        let nv = v;
        if (e.o === ".=") nv = toStr(r.get()) + toStr(v);
        else if (e.o !== "=") nv = binop(e.o.slice(0, -1), r.get(), v);
        r.set(nv);
        return nv;
      }
      case "tern": return truthy(ev(e.c)) ? ev(e.a) : ev(e.b);
      case "elvis": {
        const c = ev(e.c);
        return truthy(c) ? c : ev(e.b);
      }
      case "coal": {
        let v;
        try {
          v = ev(e.l);
        } catch (err) {
          v = null;
        }
        return v === null || v === undefined ? ev(e.r) : v;
      }
      case "isset": return e.args.every((a) => {
        const v = ev(a);
        return v !== null && v !== undefined;
      });
      case "empty": return !truthy(ev(e.args[0]));
      case "call": return F[e.f](...e.args.map(ev));
      case "bin": {
        if (e.o === "&&") return truthy(ev(e.l)) && truthy(ev(e.r));
        if (e.o === "||") return truthy(ev(e.l)) || truthy(ev(e.r));
        if (e.o === "xor") return truthy(ev(e.l)) !== truthy(ev(e.r));
        return binop(e.o, ev(e.l), ev(e.r));
      }
    }
    throw new TplError("Ekspresi tidak dikenal");
  }
  function binop(o, a, b) {
    switch (o) {
      case ".": return toStr(a) + toStr(b);
      case "+": return arith(toNum(a) + toNum(b));
      case "-": return arith(toNum(a) - toNum(b));
      case "*": return arith(toNum(a) * toNum(b));
      case "/": {
        const y = toNum(b);
        if (y === 0) throw new TplError("Pembagian dengan nol");
        return toNum(a) / y;
      }
      case "%": {
        const y = toInt(b);
        if (y === 0) throw new TplError("Modulo dengan nol");
        return toInt(a) % y;
      }
      case "**": return toNum(a) ** toNum(b);
      case "==": return looseEq(a, b);
      case "!=": return !looseEq(a, b);
      case "===": return strictEq(a, b);
      case "!==": return !strictEq(a, b);
      case "<": return cmp(a, b) < 0;
      case ">": return cmp(a, b) > 0;
      case "<=": return cmp(a, b) <= 0;
      case ">=": return cmp(a, b) >= 0;
      case "<=>": return cmp(a, b);
      case "&": return toInt(a) & toInt(b);
      case "|": return toInt(a) | toInt(b);
    }
    throw new TplError(`Operator ${o} tidak dikenal`);
  }
  function exec(list) {
    for (const s of list) {
      tick();
      if (s.k === "html") ctx.out += s.v;
      else if (s.k === "echo") ctx.out += s.args.map((a) => toStr(ev(a))).join("");
      else if (s.k === "expr") ev(s.e);
      else if (s.k === "block") exec(s.body);
      else if (s.k === "if") {
        if (truthy(ev(s.cond))) exec(s.then);
        else if (s.els) exec(s.els);
      }
    }
  }
  exec(prog);
  return ctx.out;
}

// Periksa template: '' bila aman, atau pesan kesalahan (dipakai sebelum menyimpan)
function check(src) {
  try {
    parse(String(src));
  } catch (e) {
    return e instanceof TplError ? e.message : "Template tidak valid: " + e.message;
  }
  if (/<\s*input\b/i.test(src)) return "Tag <input> tidak diizinkan di template.";
  return "";
}
const CACHE = new Map();
// Jalankan template untuk satu voucher / dokumen; kesalahan tampil sebagai teks merah seperti versi PHP
function render(src, vars, opts) {
  src = String(src);
  let prog = CACHE.get(src);
  if (!prog) {
    const err = check(src);
    if (err) return `<div style="color:#c00;font:12px sans-serif">Template ditolak: ${escHtml(err)}</div>`;
    prog = parse(src);
    if (CACHE.size > 50) CACHE.clear();
    CACHE.set(src, prog);
  }
  try {
    return run(prog, vars, opts);
  } catch (e) {
    return `<div style="color:#c00;font:12px sans-serif">Template error: ${escHtml(e.message)}</div>`;
  }
}

module.exports = { render, check, phpDate, numberFormat, sprintf, FUNC_NAMES, escHtml, toStr };
