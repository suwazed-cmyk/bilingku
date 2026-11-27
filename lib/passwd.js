// Password admin: scrypt. Hash bcrypt lama dari versi PHP diverifikasi sekali lewat php / python3 lalu diganti.
"use strict";
const crypto = require("crypto");
const { execFile } = require("child_process");
function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${h.toString("base64")}`;
}
function runCmd(cmd, args, input) {
  return new Promise((resolve) => {
    let p;
    try {
      p = execFile(cmd, args, { timeout: 15000 }, (err, out) => resolve({ code: err ? (err.code === "ENOENT" ? -2 : 1) : 0, out: String(out || "") }));
    } catch (e) {
      return resolve({ code: -2, out: "" });
    }
    p.on("error", () => resolve({ code: -2, out: "" }));
    if (input != null) p.stdin.end(input);
  });
}
async function verifyPw(pw, hash) {
  hash = String(hash || "");
  if (hash.startsWith("scrypt$")) {
    const [, salt, h] = hash.split("$");
    const a = crypto.scryptSync(String(pw), Buffer.from(salt, "base64"), 32, { N: 16384, r: 8, p: 1 });
    const b = Buffer.from(h, "base64");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (/^\$2[aby]\$\d\d\$/.test(hash)) {
    const php = await runCmd("php", ["-r", '$p=stream_get_contents(STDIN); echo password_verify($p, $argv[1]) ? "1" : "0";', hash], pw);
    if (php.code === 0) return php.out.trim() === "1";
    const py = await runCmd("python3", ["-c", "import sys,crypt,hmac;p=sys.stdin.read();h=sys.argv[1].replace('$2y$','$2b$',1);print('1' if hmac.compare_digest(crypt.crypt(p,h) or '',h) else '0')", hash], pw);
    if (py.code === 0) return py.out.trim() === "1";
  }
  return false;
}
module.exports = { hashPw, verifyPw };
