// Cetak kwitansi (?pay=ID) atau tagihan berjalan (?user=NAMA) memakai template Kwitansi / Tagihan PPP
"use strict";
module.exports = async function (C) {
  const { X, h, get, post, echo, header, customers, payments, money, setting, tgl, date, today, months_owed, add_months, days_until, is_billed, vtpl_logo, vtpl_get, vtpl_check, vtpl_run, VTPL_DOCS, floatv, intv } = C;
  const cs = customers();
  const preview = X().method === "POST" && post("act") === "preview";
  const base = { logo: vtpl_logo(), company: h(setting("company")), address: h(setting("address")), phone: h(setting("phone")), date: h(tgl(today())) };
  const receiptVars = (p) => {
    const c = cs[p.user] || {};
    return Object.assign({}, base, { no: h(p.no), nama: h(p.nama), user: h(p.user), alamat: h(c.alamat || ""), hp: h(c.hp || ""), paket: h(p.paket), tarif: h(c.tarif ? money(c.tarif) : ""), months: intv(p.months), from: h(tgl(p.from)), to: h(tgl(p.to)), paid_at: h(tgl(p.paid_at)), method: h(p.method), due: h(c.due ? tgl(c.due) : ""), total: h(money(p.amount)), gettotal: String(Math.trunc(+p.amount || 0)), late: "no" });
  };
  const invoiceVars = (u, c) => {
    const n = months_owed(c);
    const t = floatv(c.tarif) * n;
    return Object.assign({}, base, { no: h(u), nama: h((c.nama || "") !== "" ? c.nama : u), user: h(u), alamat: h(c.alamat || ""), hp: h(c.hp || ""), paket: h(c.paket || ""), tarif: h(money(c.tarif || 0)), months: n, from: h(tgl(c.due || "")), to: h(tgl(add_months(c.due, n, c.jt || 0))), paid_at: "", method: "", due: h(tgl(c.due || "")), total: h(money(t)), gettotal: String(Math.trunc(t)), late: days_until(c.due) < 0 ? "yes" : "no" });
  };
  let tpl;
  let vars = null;
  let doc;
  let no;
  let src;
  const notFound = (msg) => {
    X().status = 404;
    X().headers["Content-Type"] = "text/plain; charset=utf-8";
    X().body = Buffer.from(msg);
    throw C.EXIT();
  };
  if (preview) {
    tpl = post("tpl") === "invoice" ? "invoice" : "receipt";
    src = String(X().POST.src || "").replace(/\r/g, "");
    if (tpl === "receipt") {
      const all = Object.values(payments());
      if (all.length) vars = receiptVars(all[all.length - 1]);
    } else
      for (const [u, c] of Object.entries(cs))
        if (is_billed(c)) {
          vars = invoiceVars(u, c);
          break;
        }
    if (!vars) vars = Object.assign({}, base, { no: "KW-" + date("Ym") + "-0001", nama: "Budi Santoso", user: "budi", alamat: "Jl. Contoh No. 1", hp: "08123456789", paket: "20M", tarif: h(money(150000)), months: 1, from: h(tgl(today())), to: h(tgl(add_months(today(), 1))), paid_at: h(tgl(today())), method: "Tunai", due: h(tgl(today())), total: h(money(150000)), gettotal: "150000", late: "no" });
    doc = VTPL_DOCS[tpl];
    no = vars.no;
  } else if (get("pay") !== "") {
    const p = payments()[get("pay")];
    if (!p) notFound("Pembayaran tidak ditemukan.");
    tpl = "receipt";
    vars = receiptVars(p);
    doc = "Kwitansi";
    no = p.no;
    src = vtpl_get(tpl);
  } else {
    const u = get("user");
    const c = cs[u];
    if (!c || !is_billed(c)) notFound("Pelanggan tidak punya tagihan.");
    tpl = "invoice";
    vars = invoiceVars(u, c);
    doc = "Tagihan";
    no = u;
    src = vtpl_get(tpl);
  }
  const err = vtpl_check(src);
  const unh = (s) => String(s).replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  header("Content-Type: text/html; charset=utf-8");
  header("X-Frame-Options: SAMEORIGIN");
  echo('<!doctype html><html lang="id" translate="no" class="notranslate"><head><link rel="icon" type="image/svg+xml" href="assets/favicon.svg"><meta name="google" content="notranslate"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>' + h(doc + " " + unh(no)) + "</title>\n<style>\nbody{margin:0;padding:1rem;background:#fff;color:#000;-webkit-print-color-adjust:exact}\n.noprint{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 1rem;font:13px Inter,system-ui,sans-serif}\n.noprint button,.noprint select{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;cursor:pointer}\n.noprint .pr{background:#2563eb;border-color:#2563eb;color:#fff;font-weight:600}\n.noprint span{color:#64748b;margin-left:auto}\n.tplerr{padding:10px 12px;border-radius:8px;background:#fee2e2;color:#991b1b;font:13px system-ui,sans-serif}\n@media print{.noprint{display:none!important}body{padding:0}}\n</style></head>\n<body>\n");
  if (!preview) echo('<div class="noprint"><button class="pr" onclick="window.print()">Print</button>\n<select aria-label="Ukuran kertas" onchange="document.body.classList.toggle(\'thermal\', this.value === \'58\')"><option value="a5">Kertas A5</option><option value="58">Struk 58 mm</option></select>\n<span>Template diatur di Settings &rsaquo; Template Editor</span></div>\n');
  echo(err ? '<div class="tplerr">Template ' + h(VTPL_DOCS[tpl]) + " tidak bisa dipakai: " + h(err) + "</div>" : vtpl_run(src, vars));
  echo("\n</body></html>\n");
};
