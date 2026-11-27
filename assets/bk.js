// Bilingku 4.2: cari menu di bar atas, dan menu bar atas tertutup saat klik di luar
(function () {
  var inp = document.getElementById("msearch"), box = document.getElementById("msres");
  if (inp && box) {
    // kumpulkan semua menu dari sidebar beserta kelompoknya
    var items = [];
    var grp = "";
    document.querySelectorAll(".side nav > *").forEach(function (el) {
      if (el.classList.contains("navlbl")) { grp = el.textContent; return; }
      var parent = el.tagName === "DETAILS" ? el.querySelector(":scope > summary span").textContent : "";
      (el.tagName === "A" ? [el] : el.querySelectorAll("a")).forEach(function (a) {
        items.push({ t: a.textContent.trim(), g: [grp, parent].filter(Boolean).join(" › "), u: a.getAttribute("href") });
      });
    });
    var sel = 0, list = [];
    var esc = function (s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var draw = function () {
      var q = inp.value.trim().toLowerCase();
      if (!q) { box.hidden = true; return; }
      list = items.filter(function (x) { return (x.t + " " + x.g).toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      if (sel >= list.length) sel = 0;
      box.innerHTML = list.length ? list.map(function (x, i) { return '<a href="' + esc(x.u) + '"' + (i === sel ? ' class="on"' : "") + "><b>" + esc(x.t) + "</b><small>" + esc(x.g) + "</small></a>"; }).join("") : '<div class="none">Menu tidak ditemukan</div>';
      box.hidden = false;
    };
    inp.addEventListener("input", function () { sel = 0; draw(); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { sel = Math.min(sel + 1, list.length - 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === "Enter") { if (list[sel]) location.href = list[sel].u; e.preventDefault(); }
      else if (e.key === "Escape") { inp.value = ""; box.hidden = true; }
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".msearch")) box.hidden = true; });
    // "/" untuk langsung mencari menu
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) { e.preventDefault(); inp.focus(); }
    });
  }
  // menu bar atas (notifikasi, router, akun): tutup saat klik di luar atau tekan Esc
  var tops = document.querySelectorAll(".topbar details");
  document.addEventListener("click", function (e) { tops.forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute("open"); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") tops.forEach(function (d) { d.removeAttribute("open"); }); });
  tops.forEach(function (d) { d.addEventListener("toggle", function () { if (d.open) tops.forEach(function (o) { if (o !== d) o.removeAttribute("open"); }); }); });
})();
