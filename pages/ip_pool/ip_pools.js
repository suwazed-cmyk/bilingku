// IP Pool di router: daftar, tambah (popup), ubah, hapus
"use strict";
module.exports = async function (C) {
  const { X, h, get, post, url, back, redirect, flash, csrf_field, icon, echo, page_head, page_foot, need_ros, ros, rq, rdo, opt, row_menu, confirm_btn, pool_dialog } = C;
  const ajax = post("ajax") === "1";
  const jout = (d) => {
    X().headers["Content-Type"] = "application/json";
    X().body = Buffer.from(JSON.stringify(d));
    throw C.EXIT();
  };
  const fail = (m) => {
    if (ajax) jout({ ok: false, error: m });
    flash(m, "err");
    throw back();
  };
  if (!ajax) await need_ros("IP Pool");
  if (X().method === "POST") {
    if (post("act") === "delete") {
      if (await rdo("/ip/pool/remove", { ".id": post("id") })) flash("IP pool " + post("name") + " dihapus.");
      throw redirect("ip_pools");
    }
    const api = await ros();
    if (!api) fail(C.rosErr() || "Router tidak terhubung.");
    const id = post("id");
    const name = post("name");
    const ranges = post("ranges").replace(/ /g, "");
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) fail("Name hanya boleh huruf, angka, titik, garis bawah, dan tanda hubung.");
    if (!/^\d{1,3}(\.\d{1,3}){3}([-/][0-9.]+)?(,\d{1,3}(\.\d{1,3}){3}([-/][0-9.]+)?)*$/.test(ranges)) fail("Format Ranges salah. Contoh: 192.168.22.10-192.168.22.250");
    const p = { name, ranges, comment: post("comment") };
    if (id !== "") p["next-pool"] = post("next") !== "" ? post("next") : "none";
    try {
      await api.comm(id !== "" ? "/ip/pool/set" : "/ip/pool/add", Object.assign(id !== "" ? { ".id": id } : {}, p));
    } catch (e) {
      fail("Router menolak: " + e.message);
    }
    if (ajax) jout({ ok: true, name, ranges });
    flash("IP pool " + name + " disimpan.");
    throw redirect("ip_pools");
  }
  const pools = await rq("/ip/pool/print");
  let e = null;
  for (const x of pools) if (get("edit") !== "" && x[".id"] === get("edit")) e = x;
  await page_head("IP Pool");
  if (e) {
    echo('<div class="split"><form method="post" class="card">' + csrf_field() + '<input type="hidden" name="act" value="save"><input type="hidden" name="id" value="' + h(e[".id"]) + '"><div class="cardhead">' + icon("pool") + '<strong>Edit IP Pool</strong><span class="spacer"></span><a class="x" href="' + h(url("ip_pools")) + '" title="Tutup" aria-label="Tutup">&times;</a></div><div class="cardbody">');
    echo('<div class="frow"><label for="e_name">Name</label><input id="e_name" name="name" value="' + h(e.name) + '" required pattern="[A-Za-z0-9_.\\-]+"></div><div class="frow"><label for="e_ranges">Ranges</label><input id="e_ranges" name="ranges" value="' + h(e.ranges || "") + '" required></div>');
    echo('<div class="frow"><label for="e_next">Next Pool</label><select id="e_next" name="next"><option value="">none</option>' + pools.filter((x) => x[".id"] !== e[".id"]).map((x) => opt(x.name, e["next-pool"] || "")).join("") + '</select></div><div class="frow"><label for="e_cmt">Comment</label><input id="e_cmt" name="comment" value="' + h(e.comment || "") + '"></div>');
    echo('<div class="btnrow formfoot"><span class="spacer"></span><a class="btn" href="' + h(url("ip_pools")) + '">Batal</a><button class="btn primary">' + icon("save") + "Save</button></div></div></form>");
    echo('<section class="card"><div class="cardhead">' + icon("info") + '<strong>Read Me</strong></div><div class="cardbody"><table class="readme"><thead><tr><th>Rule</th><th>Explanation</th></tr></thead><tbody><tr><td>Ranges</td><td>Rentang alamat, misalnya 192.168.22.10-192.168.22.250. Beberapa rentang dipisah koma.</td></tr><tr><td>Next Pool</td><td>Pool cadangan yang dipakai bila pool ini habis.</td></tr><tr><td>Rename</td><td>Profil yang memakai pool ini ikut memakai nama barunya.</td></tr></tbody></table></div></section></div>');
  } else {
    const used = {};
    for (const p of await rq("/ppp/profile/print", { ".proplist": "name,remote-address" })) if ((p["remote-address"] || "") !== "") (used[p["remote-address"]] = used[p["remote-address"]] || []).push(p.name);
    echo('<section class="card"><div class="cardhead">' + icon("pool") + '<div class="ttl"><strong>IP Pool</strong><small>' + pools.length + ' pool di router</small></div><div class="tools"><a class="hl icon" href="' + h(url("ip_pools")) + '" title="Muat ulang" aria-label="Reload Data">' + icon("reload") + '</a><button type="button" class="hl pri" data-open="#pooldlg">' + icon("plus") + 'Add IP Pool</button></div></div><div class="cardbody">');
    if (!pools.length) echo('<div class="empty"><p class="emptytitle">Belum ada IP pool di router ini.</p><p><button type="button" class="btn primary" data-open="#pooldlg">Add IP Pool</button></p></div>');
    else {
      echo('<div class="tablewrap"><table id="tbl" class="grid-t sortable"><thead><tr><th>Name</th><th>Ranges</th><th>Next Pool</th><th>Dipakai profil PPP</th><th>Comment</th><th class="nosort"></th></tr></thead><tbody>');
      for (const x of pools) {
        const u = used[x.name] || [];
        echo('<tr><td class="key"><a class="namelink" href="' + h(url("ip_pools", { edit: x[".id"] })) + '">' + h(x.name) + '</a></td><td class="mono">' + h(x.ranges || "") + "</td><td>" + h((x["next-pool"] || "") === "none" ? "" : x["next-pool"] || "") + "</td><td>" + h(u.join(", ")) + "</td><td>" + h(x.comment || "") + '</td><td class="acts">' + row_menu(['<a href="' + h(url("ip_pools", { edit: x[".id"] })) + '">Edit</a>', confirm_btn("Remove", "delete", { id: x[".id"], name: x.name }, "Hapus IP pool " + x.name + "?" + (u.length ? " Pool ini masih dipakai profil " + u.join(", ") + "." : ""), "danger")]) + "</td></tr>");
      }
      echo('</tbody></table></div><p class="count"><span data-count="#tbl">' + pools.length + "</span> dari " + pools.length + " item</p>");
    }
    echo("</div></section>" + pool_dialog(false));
  }
  page_foot();
};
