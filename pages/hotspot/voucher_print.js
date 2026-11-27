// Cetak voucher dengan template (Settings > Template Editor); juga pratinjau dari Template Editor
"use strict";
const crypto = require("crypto");
module.exports = async function (C) {
  const { X, h, get, post, url, echo, header, need_ros, rq, hs_meta, dur_secs, date, vtpl_sets, vtpl_active, vtpl_get, vtpl_key, vtpl_check, vtpl_run, vtpl_vars, vtpl_page_css, vtpl_qr_js, VTPL_NAMES, router } = C;
  await need_ros("Print");
  const preview = X().method === "POST" && post("act") === "preview";
  let ids = Array.isArray(X().POST.ids) ? X().POST.ids.map(String) : [];
  if (!ids.length && get("ids") !== "") ids = get("ids").split(",").filter((x) => x !== "");
  const single = get("id") !== "" || get("user") !== "";
  if (get("id") !== "") ids = [get("id")];
  const fProfile = get("profile");
  const fComment = get("comment");
  const q = get("q").toLowerCase();
  const uname = get("user");
  const fs = ["online", "new", "exp"].includes(get("f")) ? get("f") : "";
  let set = vtpl_sets()[get("set")] ? get("set") : vtpl_active();
  let tpl = get("tpl") === "small" || get("small") === "yes" ? "small" : "default";
  let qr = get("qr") === "yes" ? "yes" : "no";
  if (preview) {
    tpl = post("part") === "small" ? "small" : "default";
    set = vtpl_sets()[post("set")] ? post("set") : "std";
    qr = post("qr") === "yes" ? "yes" : "no";
  }
  const meta = {};
  for (const p of await rq("/ip/hotspot/user/profile/print", { ".proplist": "name,on-login" })) meta[p.name] = hs_meta(p["on-login"] || "");
  const users = [];
  const uq = { ".proplist": ".id,name,password,profile,limit-uptime,limit-bytes-total,comment,uptime,mac-address" };
  if (!preview && !ids.length) {
    if (uname !== "") uq["?name"] = uname;
    else if (fComment !== "") uq["?comment"] = fComment;
  }
  const all = await rq("/ip/hotspot/user/print", uq);
  const online = {};
  if (fs === "online") for (const a of await rq("/ip/hotspot/active/print", { ".proplist": "user" })) online[a.user || ""] = 1;
  const expOf = (cm) => /^([a-z]{3}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}/.test(String(cm || ""));
  const nmax = parseInt(post("n", "1"), 10) || 1;
  for (const u of all) {
    if ((u.name || "") === "default-trial") continue;
    if (preview) {
      users.push(u);
      if (users.length >= nmax) break;
      continue;
    }
    if (uname !== "") {
      if (u.name !== uname) continue;
    } else if (ids.length) {
      if (!ids.includes(u[".id"])) continue;
    } else {
      if (fProfile === "" && fComment === "" && q === "" && fs === "") continue;
      if (fs === "online" && !online[u.name]) continue;
      if (fs === "new" && ((String(u.uptime || "") !== "" && dur_secs(u.uptime) > 0) || expOf(u.comment))) continue;
      if (fs === "exp" && !["1s", "00:00:01"].includes(String(u["limit-uptime"] || ""))) continue;
      if (fProfile !== "" && (u.profile || "") !== fProfile) continue;
      if (fComment !== "" && (u.comment || "") !== fComment) continue;
      if (q !== "" && !(u.name + " " + (u.comment || "") + " " + (u["mac-address"] || "")).toLowerCase().includes(q)) continue;
    }
    users.push(u);
  }
  if (preview && !users.length) users.push({ name: "contoh123", password: "1234", profile: "default", comment: "up-123-" + date("m.d.y") + "-", "limit-uptime": "", "limit-bytes-total": 0 });
  const src = preview ? String(X().POST.src || "").replace(/\r/g, "") : vtpl_get(vtpl_key(set, tpl));
  const err = vtpl_check(src);
  const title = "Voucher-" + ((router() || {}).name || "") + "-" + (fProfile !== "" ? fProfile : (users[0] && users[0].profile) || "") + "-" + fComment;
  header("Content-Type: text/html; charset=utf-8");
  header("X-Frame-Options: SAMEORIGIN");
  echo('<!DOCTYPE html>\n<html lang="id" translate="no" class="notranslate">\n<head><link rel="icon" type="image/svg+xml" href="assets/favicon.svg">\n<meta name="google" content="notranslate" />\n<title>' + h(title) + '</title>\n<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n<meta http-equiv="pragma" content="no-cache" />\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<style>' + vtpl_page_css() + "\n");
  echo(".noprint{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;margin:0 0 8px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;font:13px Inter,system-ui,sans-serif}\n.noprint a,.noprint button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;text-decoration:none;cursor:pointer}\n.noprint .on{background:#2563eb;border-color:#2563eb;color:#fff}.noprint .pr{background:#2563eb;border-color:#2563eb;color:#fff;font-weight:600}\n.noprint span{color:#64748b;margin-left:auto}\n.noprint select{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;min-width:180px}\n.noprint b{font-weight:600;color:#64748b;font-size:12px;letter-spacing:.04em;text-transform:uppercase}\n.tplerr{margin:12px;padding:10px 12px;border-radius:8px;background:#fee2e2;color:#991b1b;font:13px system-ui,sans-serif}\n</style>\n</head>\n");
  echo("<body" + (!preview && !err && users.length && get("noprint") !== "1" ? ' onload="window.print()"' : "") + ">\n");
  if (!preview) {
    const base = {};
    for (const [k, v] of Object.entries({ id: get("id"), user: uname, ids: ids.length && !single ? ids.join(",") : "", profile: fProfile, comment: fComment, q: get("q") })) if (v !== "") base[k] = v;
    let sel = '<select aria-label="Template voucher" onchange="location.href=this.value">';
    for (const [k, v] of Object.entries(vtpl_sets())) sel += '<option value="' + h(url("voucher_print", Object.assign({}, base, { set: k, tpl, qr }))) + '"' + (k === set ? " selected" : "") + ">" + h(v) + "</option>";
    sel += "</select>";
    const lnk = (t, qq, label) => '<a class="' + (t === tpl && qq === qr ? "on" : "") + '" href="' + h(url("voucher_print", Object.assign({}, base, { set, tpl: t, qr: qq }))) + '">' + h(label) + "</a>";
    echo('<div class="noprint"><b>Template</b>' + sel + lnk("default", "no", "Default") + lnk("default", "yes", "QR") + lnk("small", "no", "Small") + '<button class="pr" onclick="window.print()">Print ' + users.length + " voucher</button><span>Tambah atau ubah template di Settings &rsaquo; Template Editor</span></div>");
  }
  if (err) echo('<div class="tplerr">Template ' + h(vtpl_sets()[set] + " " + VTPL_NAMES[tpl]) + " tidak bisa dipakai: " + h(err) + "</div>");
  else if (!users.length) echo('<p class="tplerr" style="background:#f1f5f9;color:#475569">Tidak ada voucher yang dipilih.</p>');
  else {
    const seen = new Set();
    users.forEach((u, i) => {
      const m = meta[u.profile || ""] || { price: 0, sprice: 0, validity: "" };
      // CSS template cukup sekali di halaman, tidak diulang untuk tiap voucher
      const html = vtpl_run(src, vtpl_vars(u, m, i + 1, qr)).replace(/<style\b[^>]*>[\s\S]*?<\/style>\s*/gi, (x) => {
        const k = crypto.createHash("md5").update(x).digest("hex");
        if (seen.has(k)) return "";
        seen.add(k);
        return x;
      });
      echo('<div class="bk-voucher-print">' + html + "</div>");
    });
    if (qr === "yes") echo(vtpl_qr_js());
  }
  echo("\n</body>\n</html>\n");
};
