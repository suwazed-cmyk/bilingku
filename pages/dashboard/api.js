// Data ringan untuk dashboard (dipanggil lewat fetch)
"use strict";
module.exports = async function (C) {
  const { X, S, get, ros, rq, rosErr, now, IDLE_MAX, floatv } = C;
  let out = { ok: false };
  const a = get("a");
  if (a === "ping") out = { ok: true, left: Math.max(0, IDLE_MAX - (now() - (+S().seen || now()))) };
  else if (a === "traffic" && (await ros())) {
    const r = await rq("/interface/monitor-traffic", { interface: get("iface"), once: "" });
    if (r.length) out = { ok: true, rx: floatv(r[0]["rx-bits-per-second"]), tx: floatv(r[0]["tx-bits-per-second"]) };
    if (r.length && get("bytes") !== "") {
      const b = await rq("/interface/print", { "?name": get("iface"), ".proplist": "rx-byte,tx-byte" });
      if (b.length) {
        out.rxb = floatv(b[0]["rx-byte"]);
        out.txb = floatv(b[0]["tx-byte"]);
      }
    }
  } else if (a === "log" && (await ros())) {
    const rows = [];
    for (const l of await rq("/log/print", { ".proplist": "time,topics,message" })) if (/hotspot|ppp/i.test(l.topics || "")) rows.push({ t: l.time || "", m: l.message || "" });
    out = { ok: true, rows: rows.slice(-12).reverse() };
  }
  if (!out.ok) out.error = rosErr() || "gagal";
  X().headers["Content-Type"] = "application/json";
  X().body = Buffer.from(JSON.stringify(out));
};
