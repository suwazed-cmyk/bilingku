(function () {
  // konfirmasi: popup profesional sebagai pengganti confirm() bawaan browser
  (function () {
    var NL = String.fromCharCode(10);
    var css = '.cfm{border:0;border-radius:16px;padding:0;width:min(420px,calc(100vw - 32px));background:var(--panel,#fff);color:var(--ink,#1f2d3a);box-shadow:0 24px 60px rgba(15,23,42,.35);overflow:hidden}' +
      '.cfm::backdrop{background:rgba(15,23,42,.5);backdrop-filter:blur(2px)}' +
      '.cfm[open]{animation:cfmIn .16s ease-out}' +
      '@keyframes cfmIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}' +
      '.cfm .cfm-body{display:flex;gap:1rem;align-items:flex-start;padding:1.4rem 1.4rem 1.1rem}' +
      '.cfm .cfm-ic{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(27,118,173,.14);color:#1b76ad}' +
      '.cfm.danger .cfm-ic{background:rgba(214,69,65,.14);color:#d64541}' +
      '.cfm .cfm-tx{min-width:0;flex:1}' +
      '.cfm h3{margin:.1rem 0 .4rem;font-size:1.08rem;font-weight:700;line-height:1.3}' +
      '.cfm p{margin:0;color:var(--muted,#6b7a89);font-size:.92rem;line-height:1.55;white-space:pre-line;word-break:break-word}' +
      '.cfm .cfm-foot{display:flex;justify-content:flex-end;gap:.6rem;padding:.9rem 1.4rem 1.1rem;background:var(--row,#f6f8fa);border-top:1px solid var(--line,#e3e8ee)}' +
      '.cfm .cfm-foot .btn{min-width:96px;justify-content:center}' +
      '@media(max-width:420px){.cfm .cfm-foot{flex-direction:column-reverse}.cfm .cfm-foot .btn{width:100%}}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var IC_Q = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5M12 17h.01"/></svg>';
    var IC_W = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>';
    var dlg = null, onYes = null;
    function build() {
      dlg = document.createElement('dialog');
      dlg.setAttribute('aria-labelledby', 'cfm-t');
      dlg.innerHTML = '<div class="cfm-body"><span class="cfm-ic"></span><div class="cfm-tx"><h3 id="cfm-t"></h3><p></p></div></div><div class="cfm-foot"><button type="button" class="btn ghost cfm-no">Cancel</button><button type="button" class="btn primary cfm-yes">Yes</button></div>';
      document.body.appendChild(dlg);
      dlg.querySelector('.cfm-no').addEventListener('click', function () { dlg.close(); });
      dlg.querySelector('.cfm-yes').addEventListener('click', function () { var fn = onYes; onYes = null; dlg.close(); if (fn) fn(); });
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener('close', function () { onYes = null; });
    }
    function ask(msg, opt, yes) {
      if (!dlg) build();
      var lines = String(msg).split(NL), title = 'Konfirmasi', body = String(msg);
      if (lines.length > 1 && lines[0].replace(/ /g, '') !== '') { title = lines[0]; body = lines.slice(1).join(NL); while (body.charAt(0) === NL) body = body.slice(1); }
      dlg.className = 'cfm' + (opt.danger ? ' danger' : '');
      dlg.querySelector('h3').textContent = opt.title || title;
      dlg.querySelector('p').textContent = body;
      dlg.querySelector('p').style.display = body ? '' : 'none';
      dlg.querySelector('.cfm-ic').innerHTML = opt.danger ? IC_W : IC_Q;
      var yb = dlg.querySelector('.cfm-yes');
      yb.textContent = opt.ok || 'Yes';
      yb.className = 'btn cfm-yes ' + (opt.danger ? 'bad' : 'primary');
      onYes = yes;
      dlg.showModal();
      (opt.danger ? dlg.querySelector('.cfm-no') : yb).focus();
    }
    document.addEventListener('submit', function (e) {
      var f = e.target, b = e.submitter;
      var msg = (b && b.dataset && b.dataset.confirm) || (f.dataset && f.dataset.confirm);
      if (!msg || e.defaultPrevented) return;
      if (f.__cfmOk) { f.__cfmOk = false; return; }
      e.preventDefault();
      var danger = !!(b && /danger|bad/.test(b.className)) || /hapus|putuskan|batalkan|delete|remove/i.test(msg);
      ask(msg, { danger: danger, ok: b && b.dataset ? b.dataset.ok : '' }, function () {
        f.__cfmOk = true;
        try { f.requestSubmit(b || undefined); } catch (x1) { try { f.requestSubmit(); } catch (x2) { f.submit(); } }
      });
    });
  })();

  // label kolom untuk tampilan kartu di layar sempit
  document.querySelectorAll('.cards table').forEach(function (t) {
    var heads = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
    t.querySelectorAll('tbody tr').forEach(function (tr) {
      Array.prototype.forEach.call(tr.children, function (td, i) { if (heads[i]) td.dataset.label = heads[i]; });
    });
  });

  // centang semua
  document.querySelectorAll('[data-checkall]').forEach(function (c) {
    c.addEventListener('change', function () {
      c.closest('table').querySelectorAll('tbody tr').forEach(function (tr) {
        var b = tr.querySelector('input[type=checkbox]');
        if (b && tr.style.display !== 'none' && !tr.classList.contains('pg-hide')) b.checked = c.checked;
      });
    });
  });

  // saring baris tabel
  document.querySelectorAll('[data-filter]').forEach(function (inp) {
    var rows = document.querySelectorAll(inp.dataset.filter + ' tbody tr');
    inp.addEventListener('input', function () {
      var q = inp.value.toLowerCase();
      rows.forEach(function (tr) { tr.style.display = tr.textContent.toLowerCase().indexOf(q) < 0 ? 'none' : ''; });
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
  });

  // menu baris: posisi tetap supaya tidak terpotong tabel, tutup saat klik di luar
  var openMenu = null;
  var closeMenu = function () { if (openMenu) { openMenu.open = false; openMenu = null; } };
  document.querySelectorAll('details.menu').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) { if (openMenu === d) openMenu = null; return; }
      if (openMenu && openMenu !== d) openMenu.open = false;
      openMenu = d;
      var list = d.querySelector('.menulist'), r = d.querySelector('summary').getBoundingClientRect();
      list.style.left = '0px'; list.style.top = '0px';
      var w = list.offsetWidth, h = list.offsetHeight;
      list.style.left = Math.max(8, r.right - w) + 'px';
      list.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
    });
  });
  document.addEventListener('click', function (e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openMenu) { var s = openMenu.querySelector('summary'); closeMenu(); s.focus(); } });
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('resize', closeMenu);

  // terima pembayaran: hitung total dan jatuh tempo baru
  var pf = document.getElementById('payform');
  if (pf) {
    var mi = document.getElementById('months'), am = document.getElementById('amount');
    var tarif = parseFloat(pf.dataset.tarif) || 0, jt = parseInt(pf.dataset.jt, 10) || 0, due = pf.dataset.due.split('-').map(Number);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var rupiah = function (n) { return pf.dataset.cur + ' ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
    var calc = function (keepAmount) {
      var n = Math.max(1, Math.min(120, parseInt(mi.value, 10) || 1));
      var t = due[0] * 12 + due[1] - 1 + n, y = Math.floor(t / 12), m = t % 12 + 1;
      var d = Math.min(jt || due[2], new Date(y, m, 0).getDate());
      document.getElementById('newdue').textContent = pad(d) + '/' + pad(m) + '/' + y;
      if (!keepAmount) am.value = tarif * n;
      document.getElementById('total').textContent = rupiah(parseFloat(am.value) || 0);
      pf.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', parseInt(c.dataset.months, 10) === n); });
    };
    pf.querySelectorAll('[data-step]').forEach(function (b) {
      b.addEventListener('click', function () { mi.value = Math.max(1, Math.min(120, (parseInt(mi.value, 10) || 1) + parseInt(b.dataset.step, 10))); calc(); });
    });
    pf.querySelectorAll('.chip').forEach(function (c) { c.addEventListener('click', function () { mi.value = c.dataset.months; calc(); }); });
    mi.addEventListener('input', function () { calc(); });
    am.addEventListener('input', function () { calc(true); });
    calc(true);
  }

  // tarif mengikuti harga paket
  var paket = document.getElementById('paket'), tarif = document.getElementById('tarif');
  if (paket && tarif) {
    var fill = function (force) {
      var h = paket.options[paket.selectedIndex] && paket.options[paket.selectedIndex].dataset.harga;
      if (h && (force || tarif.value === '' || tarif.value === '0')) tarif.value = h;
    };
    paket.addEventListener('change', function () { fill(true); });
    fill(false);
  }

  // grafik trafik
  var cv = document.getElementById('traffic');
  if (cv) {
    var sel = document.getElementById('iface'), rxv = document.getElementById('rxv'), txv = document.getElementById('txv');
    var rx = [], tx = [], N = 40, timer = null, busy = false;
    var fmt = function (b) {
      if (b >= 1e9) return (b / 1e9).toFixed(2) + ' Gbps';
      if (b >= 1e6) return (b / 1e6).toFixed(2) + ' Mbps';
      if (b >= 1e3) return (b / 1e3).toFixed(1) + ' kbps';
      return Math.round(b) + ' bps';
    };
    var css = function (v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); };
    var draw = function () {
      var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      var c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, w, h);
      var max = Math.max.apply(null, rx.concat(tx).concat([1000])) * 1.15;
      c.strokeStyle = css('--line'); c.fillStyle = css('--muted'); c.font = '11px sans-serif'; c.lineWidth = 1;
      for (var g = 0; g <= 3; g++) {
        var y = h - 14 - (h - 24) * g / 3;
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
        if (g) c.fillText(fmt(max * g / 3), 4, y - 3);
      }
      var line = function (a, col) {
        if (!a.length) return;
        c.strokeStyle = col; c.lineWidth = 2; c.beginPath();
        a.forEach(function (v, i) {
          var x = w - (a.length - 1 - i) * (w / (N - 1)), y = h - 14 - (h - 24) * v / max;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        });
        c.stroke();
      };
      line(tx, css('--warn')); line(rx, css('--accent'));
    };
    var tick = function () {
      if (busy || document.hidden || !sel.value) return;
      busy = true;
      fetch(cv.dataset.url + '&iface=' + encodeURIComponent(sel.value), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) return;
          rx.push(d.rx); tx.push(d.tx);
          if (rx.length > N) { rx.shift(); tx.shift(); }
          rxv.textContent = fmt(d.rx); txv.textContent = fmt(d.tx);
          var fb = function (b) { var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0; while (b >= 1024 && i < 4) { b /= 1024; i++; } return (i ? b.toFixed(b < 10 ? 2 : 1) : Math.round(b)) + ' ' + u[i]; };
          var rb = document.getElementById('rxb'), tb = document.getElementById('txb');
          if (rb && d.rxb !== undefined) rb.textContent = fb(d.rxb);
          if (tb && d.txb !== undefined) tb.textContent = fb(d.txb);
          draw();
        })
        .catch(function () {})
        .then(function () { busy = false; });
    };
    sel.addEventListener('change', function () { rx = []; tx = []; draw(); tick(); });
    window.addEventListener('resize', draw);
    draw(); tick(); timer = setInterval(tick, 3000);
  }
})();
