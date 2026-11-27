// ZIP sederhana tanpa pustaka luar (dipakai backup/restore dan ekspor XLSX).
"use strict";
const zlib = require("zlib");
function writeZip(files) {
  const parts = [];
  const central = [];
  let off = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, content] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), "utf8");
    const comp = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data) >>> 0;
    const nb = Buffer.from(name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(dosTime, 10);
    lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nb.length, 26);
    parts.push(lh, nb, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(dosTime, 12);
    ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nb.length, 28);
    ch.writeUInt32LE(off, 42);
    central.push(ch, nb);
    off += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
// Baca isi ZIP: [{ name, data }]. Melempar Error bila bukan ZIP.
function readZip(buf, maxTotal = 200 * 1024 * 1024) {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      e = i;
      break;
    }
  }
  if (e < 0) throw new Error("bukan file ZIP");
  const n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const out = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP rusak");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28);
    const xl = buf.readUInt16LE(p + 30);
    const cl = buf.readUInt16LE(p + 32);
    const lo = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nl).toString("utf8");
    p += 46 + nl + xl + cl;
    const lnl = buf.readUInt16LE(lo + 26);
    const lxl = buf.readUInt16LE(lo + 28);
    const start = lo + 30 + lnl + lxl;
    const raw = buf.subarray(start, start + csize);
    total += usize;
    if (total > maxTotal) throw new Error("isi ZIP terlalu besar");
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(usize, 1) + 1024 });
    else continue;
    if (name.endsWith("/")) continue;
    out.push({ name, data });
  }
  return out;
}
module.exports = { writeZip, readZip };
