(function () {
    // tanpa isi-otomatis (autofill / autocomplete) browser di seluruh panel
    var off = function (root) {
        root.querySelectorAll('form').forEach(function (f) { f.setAttribute('autocomplete', 'off'); });
        root.querySelectorAll('input, textarea, select').forEach(function (el) {
            var t = (el.getAttribute('type') || 'text').toLowerCase();
            if (t === 'hidden' || t === 'checkbox' || t === 'radio' || t === 'file' || t === 'submit' || t === 'button') return;
            el.setAttribute('autocomplete', t === 'password' ? 'new-password' : 'off');
        });
    };
    off(document);
})();
(function () {
  // validasi formulir: kolom yang salah jadi merah dan diberi keterangan di bawahnya
  var fieldMsg = function (el) {
    var v = el.validity, ph = el.getAttribute('placeholder');
    if (v.valueMissing) return el.type === 'file' ? 'Pilih filenya dulu' : (el.tagName === 'SELECT' ? 'Wajib dipilih' : 'Wajib diisi');
    if (v.patternMismatch || v.typeMismatch) return 'Format tidak sesuai' + (ph ? '. Contoh: ' + ph : '');
    if (v.rangeUnderflow) return 'Paling kecil ' + el.min;
    if (v.rangeOverflow) return 'Paling besar ' + el.max;
    if (v.stepMismatch) return 'Harus kelipatan ' + el.step;
    if (v.tooLong) return 'Paling banyak ' + el.maxLength + ' karakter';
    if (v.tooShort) return 'Paling sedikit ' + el.minLength + ' karakter';
    if (v.badInput) return 'Isi dengan angka';
    return el.validationMessage || 'Isian tidak sesuai';
  };
  var clearErr = function (el) {
    el.classList.remove('invalid');
    el.removeAttribute('aria-invalid');
    if (el._err) { el._err.remove(); el._err = null; }
  };
  var markErr = function (el, text) {
    clearErr(el);
    el.classList.add('invalid');
    el.setAttribute('aria-invalid', 'true');
    var m = document.createElement('small');
    m.className = 'ferr'; m.textContent = text;
    var host = el.closest('.join') || el;
    host.insertAdjacentElement('afterend', m);
    el._err = m;
  };
  window.bkMarkErr = markErr;
  document.querySelectorAll('form').forEach(function (f) { f.noValidate = true; });
  document.addEventListener('submit', function (e) {
    var f = e.target, b = e.submitter;
    if (!f.elements || (b && b.formNoValidate)) return;
    var first = null;
    Array.prototype.forEach.call(f.elements, function (el) {
      if (!el.willValidate) return;
      if (el.checkValidity()) { clearErr(el); return; }
      markErr(el, fieldMsg(el));
      if (!first) first = el;
    });
    if (!first) return;
    e.preventDefault(); e.stopPropagation();
    first.scrollIntoView({ block: 'center' });
    first.focus({ preventScroll: true });
  }, true);
  var onEdit = function (e) {
    var el = e.target;
    if (el.classList && el.classList.contains('invalid') && el.checkValidity()) clearErr(el);
  };
  document.addEventListener('input', onEdit);
  document.addEventListener('change', onEdit);

  // nomor urut di semua tabel daftar (ditambahkan sebelum fitur urut supaya indeks kolomnya benar)
  var numbered = [];
  var renumber = function () {
    numbered.forEach(function (t) {
      var n = parseInt(t.dataset.noStart || '0', 10) || 0; // halaman berikutnya (server) melanjutkan nomor
      Array.prototype.forEach.call(t.tBodies[0].rows, function (tr) {
        var c = tr.querySelector(':scope > td.no'); if (c) c.textContent = tr.style.display === 'none' ? '' : ++n;
      });
    });
  };
  document.querySelectorAll('main table').forEach(function (t) {
    if (!t.tHead || !t.tBodies[0] || t.classList.contains('readme') || t.classList.contains('kv') || t.id === 'dlog') return;
    var hr = t.tHead.rows[0];
    if (!hr) return;
    var th = document.createElement('th');
    th.className = 'no nosort'; th.textContent = 'No';
    // kolom No sesudah kolom centang (bila ada), selain itu paling kiri
    var after = hr.cells[0] && hr.cells[0].classList.contains('chk') ? 1 : 0;
    hr.insertBefore(th, hr.cells[after] || null);
    Array.prototype.forEach.call(t.tBodies[0].rows, function (tr) {
      if (tr.cells.length === 1 && tr.cells[0].colSpan > 1) { tr.cells[0].colSpan += 1; return; }
      var td = document.createElement('td');
      td.className = 'no';
      tr.insertBefore(td, tr.cells[after] || null);
    });
    numbered.push(t);
  });
  renumber();
  document.addEventListener('input', function (e) { if (e.target.matches && e.target.matches('[data-filter]')) setTimeout(renumber, 0); });

  // baris yang bisa diklik
  document.addEventListener('click', function (e) {
    var tr = e.target.closest && e.target.closest('tr[data-href]');
    if (tr && !e.target.closest('a,button,form,summary,details,input')) location.href = tr.dataset.href;
  });

  // urutkan tabel dengan klik judul kolom
  document.querySelectorAll('table.sortable').forEach(function (t) {
    var ths = t.querySelectorAll('thead th');
    ths.forEach(function (th, i) {
      if (th.classList.contains('nosort')) return;
      th.addEventListener('click', function () {
        var dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
        ths.forEach(function (x) { delete x.dataset.dir; });
        th.dataset.dir = dir;
        var body = t.tBodies[0], rows = Array.prototype.slice.call(body.rows);
        var val = function (tr) {
          var c = tr.cells[i];
          return c ? (c.dataset.v !== undefined ? c.dataset.v : c.textContent.trim()) : '';
        };
        rows.sort(function (a, b) {
          var r = val(a).localeCompare(val(b), undefined, { numeric: true, sensitivity: 'base' });
          return dir === 'asc' ? r : -r;
        });
        rows.forEach(function (r) { body.appendChild(r); });
        renumber();
      });
    });
  });

  // label kolom untuk tampilan kartu di HP (dibaca CSS lewat data-label)
  document.querySelectorAll('main table.grid-t').forEach(function (t) {
    if (!t.tHead || !t.tBodies[0]) return;
    var heads = Array.prototype.map.call(t.tHead.rows[0].cells, function (th) { return th.classList.contains('chk') || th.classList.contains('dotc') ? '' : th.textContent.trim(); });
    Array.prototype.forEach.call(t.tBodies[0].rows, function (tr) {
      Array.prototype.forEach.call(tr.cells, function (td, i) { if (heads[i] && !td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i]); });
    });
  });

  // jumlah baris yang tampil setelah disaring
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var sel = el.dataset.count, inp = document.querySelector('[data-filter="' + sel + '"]');
    if (!inp) return;
    inp.addEventListener('input', function () {
      setTimeout(function () {
        var n = 0;
        document.querySelectorAll(sel + ' tbody tr').forEach(function (tr) { if (tr.style.display !== 'none') n++; });
        el.textContent = n;
      }, 0);
    });
  });

  // lihat / sembunyikan kata sandi
  document.querySelectorAll('[data-eye]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = document.querySelector(b.dataset.eye);
      if (i) i.type = i.type === 'password' ? 'text' : 'password';
    });
  });

  // tombol Reset di kolom Start Date: isi tanggal hari ini, Jatuh Tempo dihitung ulang dari Validity
  var parseIval = function (v) {
    v = (v || '').trim().toLowerCase();
    if (!/^(\d+[wdhm])+$/.test(v)) return 0;
    var u = { w: 604800, d: 86400, h: 3600, m: 60 }, t = 0;
    v.replace(/(\d+)([wdhm])/g, function (_, n, k) { t += parseInt(n, 10) * u[k]; });
    return t;
  };
  var ymd = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  document.querySelectorAll('[data-today]').forEach(function (b) {
    var s0 = document.querySelector(b.dataset.today);
    b._old = s0 ? s0.value : '';
    if (s0) s0.addEventListener('change', function () { b._old = s0.value; });
    b.addEventListener('click', function () {
      var st = document.querySelector(b.dataset.today), due = document.querySelector(b.dataset.recalc), val = document.querySelector(b.dataset.validity);
      var now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      st.value = ymd(start);
      // data-months: Jatuh Tempo = Start Date + N bulan (tanggal disesuaikan bila bulan tujuan lebih pendek)
      if (b.dataset.months && due) {
          var mo = parseInt(b.dataset.months, 10) || 1, dd = new Date(start.getFullYear(), start.getMonth() + mo, 1);
          dd.setDate(Math.min(start.getDate(), new Date(dd.getFullYear(), dd.getMonth() + 1, 0).getDate()));
          due.value = ymd(dd); due.dataset.auto = due.value; b._old = st.value;
          
          [st, due].forEach(function (el) { el.dispatchEvent(new Event('input', { bubbles: true })); });
          return;
      }
      var secs = val ? parseIval(val.value) : 0;
      // tanpa Validity: pertahankan lama masa aktif yang sekarang (Jatuh Tempo lama dikurangi Start Date lama)
      if (!secs && due && due.value && b._old) {
        var span = Math.round((new Date(due.value + 'T00:00:00') - new Date(b._old + 'T00:00:00')) / 1000);
        if (span > 0) secs = span;
      }
      if (due && secs > 0) due.value = ymd(new Date(start.getTime() + secs * 1000));
      else if (due && val && window.bkMarkErr) window.bkMarkErr(val, 'Isi Validity dulu (misalnya 30d) supaya Jatuh Tempo bisa dihitung');
      b._old = st.value;
      [st, due].forEach(function (el) { if (el) el.dispatchEvent(new Event('input', { bubbles: true })); });
    });
  });

  // lonceng pemberitahuan: tutup saat klik di luar
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.notif[open], details.rpick[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
  });

  // isian uang: tampil 10.000 / 100.000 selagi diketik
  var fmtMoney = function (el) {
    var d = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    el.value = d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  document.querySelectorAll('[data-money]').forEach(function (el) {
    el.addEventListener('input', function () { fmtMoney(el); });
    fmtMoney(el);
  });
  var pk = document.getElementById('paket'), tf = document.getElementById('tarif');
  if (pk && tf && tf.hasAttribute('data-money')) pk.addEventListener('change', function () { setTimeout(function () { fmtMoney(tf); }, 0); });

  // jam router dan uptime berjalan tiap detik, dalam angka
  var ticks = document.querySelectorAll('[data-tick]');
  if (ticks.length) {
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var t0 = Date.now();
    setInterval(function () {
      var add = Math.round((Date.now() - t0) / 1000);
      ticks.forEach(function (el) {
        var t = parseInt(el.dataset.secs, 10) + add;
        if (isNaN(t)) return;
        var d = Math.floor(t / 86400), r = t % 86400;
        var hms = p2(Math.floor(r / 3600)) + ':' + p2(Math.floor(r % 3600 / 60)) + ':' + p2(r % 60);
        el.textContent = el.dataset.tick === 'clock' ? hms : (d ? d + 'd ' : '') + hms;
      });
    }, 1000);
  }

  // terima pembayaran: total selalu tarif x jumlah bulan
  var pf = document.getElementById('payform');
  if (pf) {
    var payFix = function () {
      setTimeout(function () {
        var n = Math.max(1, Math.min(120, parseInt(document.getElementById('months').value, 10) || 1));
        var t = (parseFloat(pf.dataset.tarif) || 0) * n;
        document.getElementById('amount').value = t;
        document.getElementById('total').textContent = pf.dataset.cur + ' ' + String(Math.round(t)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      }, 0);
    };
    pf.addEventListener('click', payFix);
    pf.addEventListener('input', payFix);
    payFix();
  }

  // popup: buka / tutup
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]'), c = e.target.closest('[data-close]');
    if (o) {
      e.preventDefault();
      var d = document.querySelector(o.dataset.open);
      if (d && d.showModal) { var m = d.querySelector('.msg'); if (m) m.hidden = true; d.showModal(); }
    }
    if (c) { var dl = c.closest('dialog'); if (dl) dl.close(); }
  });

  // popup Add IP Pool di form profil: simpan tanpa meninggalkan halaman, lalu pilih pool barunya
  document.querySelectorAll('form[data-poolajax]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = f.querySelector('.msg'), btn = f.querySelector('.btn.primary');
      var fail = function (t) { msg.textContent = t; msg.hidden = false; };
      btn.disabled = true;
      fetch(f.action, { method: 'POST', body: new FormData(f), credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) return fail(d.error || 'Pool gagal dibuat.');
          var sel = document.querySelector(f.dataset.poolajax), o = document.createElement('option');
          o.value = d.name; o.textContent = d.name + ' (' + d.ranges + ')';
          sel.appendChild(o); sel.value = d.name;
          f.reset(); f.closest('dialog').close();
        })
        .catch(function () { fail('Tidak ada jawaban dari panel. Muat ulang halaman lalu coba lagi.'); })
        .then(function () { btn.disabled = false; });
    });
  });

  // form secret: tolak simpan bila secret dan Main Profile sama-sama tanpa alamat
  var sf = document.getElementById('secretform'), iw = document.getElementById('ipwarn');
  if (sf && iw) {
    sf.addEventListener('submit', function (e) {
      var b = e.submitter;
      if (e.defaultPrevented || !b || b.value !== 'save') return;
      var sel = sf.elements.profile, o = sel.options[sel.selectedIndex], miss = [];
      if (!o) return;
      if (!sf.elements.remote.value.trim() && !o.dataset.remote) miss.push('Remote Address');
      if (!sf.elements.local.value.trim() && !o.dataset.local) miss.push('Local Address');
      iw.hidden = !miss.length;
      if (!miss.length) return;
      e.preventDefault();
      if (miss.indexOf('Remote Address') >= 0) markErr(sf.elements.remote, 'Wajib diisi karena profil ' + o.value + ' tidak punya IP pool');
      if (miss.indexOf('Local Address') >= 0) markErr(sf.elements.local, 'Wajib diisi karena profil ' + o.value + ' tidak punya Local Address');
      iw.textContent = miss.join(' dan ') + ' belum ada: profil ' + o.value + ' tidak punya ' + (miss[0] === 'Remote Address' ? 'IP pool' : 'Local Address') +
        ' dan di secret ini juga kosong. Isi di sini, atau lengkapi profilnya di PPP Profiles.';
      iw.scrollIntoView({ block: 'center' });
    });
  }

  // log hotspot & PPP di dashboard
  var lg = document.getElementById('dlog');
  if (lg) {
    var body = lg.tBodies[0];
    var load = function () {
      if (document.hidden) return;
      fetch(lg.dataset.url, { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          body.textContent = '';
          var rows = d.ok ? d.rows : [];
          if (!rows.length) rows = [{ t: '', m: d.ok ? 'Belum ada catatan hotspot atau PPP.' : 'Log tidak bisa dimuat.' }];
          rows.forEach(function (x) {
            var tr = body.insertRow();
            tr.insertCell().textContent = x.t;
            tr.insertCell().textContent = x.m;
          });
        })
        .catch(function () {});
    };
    load();
    setInterval(load, 15000);
  }
})();

// bar memuat halaman: langsung terlihat saat menu / tautan / form diklik, supaya perpindahan halaman terasa responsif
(function () {
  var bar = document.createElement('div');
  bar.id = 'pgload';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  var start = function () { bar.className = 'on'; };
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || a.target === '_blank' || a.hasAttribute('download')) return;
    var h = a.getAttribute('href');
    if (!h || h.charAt(0) === '#' || h.indexOf('javascript:') === 0 || a.host !== location.host || /export=|voucher_print|invoice_print/.test(h)) return;
    start();
  });
  document.addEventListener('submit', function (e) {
    setTimeout(function () { if (!e.defaultPrevented && !(e.target.target === '_blank')) start(); }, 0);
  });
  document.addEventListener('change', function (e) { if (e.target.matches && e.target.matches('select[onchange*="location"]')) start(); });
  window.addEventListener('pageshow', function () { bar.className = ''; });
})();

// tampilan gelap / terang: tombol di topbar, pilihan disimpan di browser (bawaan mengikuti setelan perangkat)
(function () {
    var b = document.getElementById('themebtn');
    if (!b) return;
    var root = document.documentElement;
    var isDark = function () {
        var t = root.getAttribute('data-theme');
        if (t) return t === 'dark';
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    };
    var label = function () { b.title = isDark() ? 'Ganti ke tampilan terang' : 'Ganti ke tampilan gelap'; };
    label();
    b.addEventListener('click', function () {
        var t = isDark() ? 'light' : 'dark';
        root.setAttribute('data-theme', t);
        try { localStorage.setItem('bk-theme', t); } catch (e) {}
        label();
    });
})();

// pagination tabel di browser: "1-50 dari 618 item" + jumlah baris, lalu tombol « ‹ 1 2 3 › » (tampilan sama dengan pager_html di server)
(function () {
    var SIZES = [10, 14, 25, 50, 100, 0];
    // jumlah baris awal: 50, atau sesuai data-pgsize tabelnya (mis. Report per hari 14); tidak diingat antar halaman
    var getSize = function (t) { var v = parseInt(t.dataset.pgsize, 10); return SIZES.indexOf(v) >= 0 ? v : 50; };
    var setSize = function () {};
    var nf = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
    // semua tabel daftar di halaman (bukan di dalam pop up, bukan yang sudah punya bar halaman dari server)
    document.querySelectorAll('main .tablewrap > table.grid-t').forEach(function (t) {
        var tw = t.parentElement;
        if (!t.tBodies[0] || t.closest('dialog') || t.hasAttribute('data-nopager') || (tw.nextElementSibling && tw.nextElementSibling.classList.contains('pgbar'))) return;
        var body = t.tBodies[0], size = getSize(t), page = 1;
        // ringkasan sederhana ("4 dari 4 item") diganti bar ini; ringkasan berisi keterangan lain tetap ditampilkan
        var sp = t.id ? document.querySelector('[data-count="#' + t.id + '"]') : null, p = sp ? sp.closest('p.count') : null;
        if (p && /^\s*[\d.]+\s+dari\s+[\d.]+\s+[a-z]+\s*$/i.test(p.textContent)) p.hidden = true;
        // jumlah polos tanpa keterangan lain (mis. "2 router") juga sudah tercakup di bar
        var nx = tw.nextElementSibling;
        if (nx && nx.matches('p.count') && /^\s*[\d.]+\s+[a-z]+\s*$/i.test(nx.textContent)) nx.hidden = true;
        var bar = document.createElement('div'); bar.className = 'pgbar';
        var info = document.createElement('div'); info.className = 'pginfo';
        var txt = document.createElement('span');
        var sel = document.createElement('select'); sel.className = 'pgsize'; sel.setAttribute('aria-label', 'Baris per halaman');
        SIZES.forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s ? s : 'Semua'; if (s === size) o.selected = true; sel.appendChild(o); });
        info.appendChild(txt); info.appendChild(sel);
        var nav = document.createElement('nav'); nav.className = 'pgnav'; nav.setAttribute('aria-label', 'Halaman tabel');
        bar.appendChild(info); bar.appendChild(nav);
        tw.parentNode.insertBefore(bar, tw.nextSibling);
        var rows = function () { return Array.prototype.filter.call(body.rows, function (tr) { return !(tr.cells.length === 1 && tr.cells[0].colSpan > 1); }); };
        var mk = function (label, aria, to, dis, on) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'pgb' + (dis ? ' dis' : '') + (on ? ' on' : ''); b.textContent = label;
            b.setAttribute('aria-label', aria); if (on) b.setAttribute('aria-current', 'page');
            if (dis) b.disabled = true; else b.addEventListener('click', function () { page = to; render(); t.scrollIntoView({ block: 'nearest' }); });
            nav.appendChild(b);
        };
        var busy = false;
        var render = function () {
            busy = true;
            var all = rows(), vis = all.filter(function (tr) { return tr.style.display !== 'none'; }), n = vis.length;
            var pages = size ? Math.max(1, Math.ceil(n / size)) : 1;
            if (page > pages) page = pages;
            var a = size ? (page - 1) * size : 0, b = size ? Math.min(n, a + size) : n;
            all.forEach(function (tr) { tr.classList.remove('pg-hide'); });
            vis.forEach(function (tr, i) { if (i < a || i >= b) tr.classList.add('pg-hide'); });
            txt.textContent = n ? nf(a + 1) + '-' + nf(b) + ' dari ' + nf(n) + ' item' : '0 item';
            nav.textContent = '';
            mk('«', 'Halaman pertama', 1, page <= 1); mk('‹', 'Halaman sebelumnya', page - 1, page <= 1);
            var s = Math.max(1, Math.min(page - 2, pages - 4)), e = Math.min(pages, s + 4);
            for (var i = s; i <= e; i++) mk(String(i), 'Halaman ' + i, i, false, i === page);
            mk('›', 'Halaman berikutnya', page + 1, page >= pages); mk('»', 'Halaman terakhir', pages, page >= pages);
            // data-pgfill: kotak tabel selalu setinggi jumlah baris per halaman (mis. 15), walau datanya lebih sedikit
            if (t.hasAttribute('data-pgfill')) {
                tw.style.minHeight = '';
                if (size && window.innerWidth > 640) {
                    var vr = vis.filter(function (tr) { return !tr.classList.contains('pg-hide'); })[0];
                    var rh = vr ? vr.offsetHeight : 44, th = t.tHead ? t.tHead.offsetHeight : 44;
                    tw.style.minHeight = (th + rh * size + (tw.offsetHeight - tw.clientHeight)) + 'px';
                }
            }
            setTimeout(function () { busy = false; if (window.bkFit) window.bkFit(); }, 0);
        };
        sel.addEventListener('change', function () { size = parseInt(sel.value, 10) || 0; setSize(size); page = 1; render(); });
        // saringan / pencarian / urutan berubah: hitung ulang (saringan baru kembali ke halaman 1)
        var tm = null;
        new MutationObserver(function (list) {
            if (busy) return;
            var filtered = list.some(function (m) { return m.type === 'attributes'; });
            clearTimeout(tm); tm = setTimeout(function () { if (filtered) page = 1; render(); }, 30);
        }).observe(body, { attributes: true, attributeFilter: ['style'], subtree: true, childList: true });
        render();
    });
})();

// tabel ber-bar halaman: bila isinya sedikit, kotak tabel diperpanjang sampai bawah layar supaya bar halaman selalu di dasar halaman
(function () {
    var fit = function () {
        return; // v4.1: tabel tidak lagi dipanjangkan sampai dasar layar (kotak kosong terlihat berantakan)
        // kotak yang diperpanjang: tabel ber-bar halaman, atau kotak "kosong" (mis. Belum ada user yang terhubung)
        var bars = document.querySelectorAll('main .pgbar'), bar = bars.length === 1 ? bars[0] : null, w = bar && bar.previousElementSibling;
        if (bars.length > 1) return; // beberapa tabel di satu halaman (mis. Report): biarkan apa adanya
        if (!w || !w.classList.contains('tablewrap')) { w = document.querySelector('main .content .empty'); bar = w; if (w) w.classList.add('fill'); }
        if (!w) return;
        w.style.minHeight = '';
        if (window.innerWidth < 768) return;
        // kotak paling luar di dalam .content yang berisi tabel ini, lalu jarak dari bawahnya ke dasar layar
        var box = bar, ct = bar.closest('.content');
        if (!ct) return;
        while (box.parentElement && box.parentElement !== ct) box = box.parentElement;
        var cs = getComputedStyle(ct);
        box.style.marginBottom = '0px'; // jarak bawah sama di semua halaman: hanya padding halaman, tanpa margin kartu
        var gap = window.innerHeight - parseFloat(cs.paddingBottom) - (box.getBoundingClientRect().bottom + window.scrollY);
        if (gap > 1) w.style.minHeight = Math.floor(w.offsetHeight + gap) + 'px';
    };
    window.bkFit = fit;
    window.addEventListener('resize', fit);
    window.addEventListener('load', fit);
    fit();
})();

// Report: kotak Per hari dan kolom kanan sama tinggi (mengikuti yang lebih tinggi), paling tinggi setara 14 baris Per hari;
// isi kolom kanan yang lebih panjang digulir di dalam kotaknya
(function () {
    var g = document.querySelector('.rgrid');
    if (!g || !g.children[1]) return;
    var left = g.children[0], right = g.children[1];
    var fit = function () {
        right.style.maxHeight = '';
        if (window.innerWidth <= 1000) return;
        var t = left.querySelector('table.grid-t'), tw = t && t.parentElement;
        if (!t) return;
        var row = t.tBodies[0] && t.tBodies[0].rows[0], rh = row ? row.offsetHeight : 44;
        tw.style.minHeight = '';
        var cap = left.offsetHeight - tw.offsetHeight + (t.tHead ? t.tHead.offsetHeight : 44) + rh * 14 + 2;
        right.style.maxHeight = cap + 'px';
    };
    window.addEventListener('resize', fit); window.addEventListener('load', fit);
    fit();
})();

// tombol Kosongkan di samping kolom tanggal (mis. Jatuh Tempo di PPP User)
document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-clear]');
    if (!b) return;
    var el = document.querySelector(b.dataset.clear);
    if (!el) return;
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.focus();
});

// kalender tanggal dengan pilihan None (dipakai Jatuh Tempo di PPP User): nilai asli di input tersembunyi (Y-m-d, kosong = None)
(function () {
    var BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    var HR = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var ymd = function (d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
    var parse = function (v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
    var plus1 = function (v) { var d = parse(v); if (!d) return ''; var t = new Date(d.getFullYear(), d.getMonth() + 1, 1); t.setDate(Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return ymd(t); };
    document.querySelectorAll('.dpk').forEach(function (box) {
        var inp = box.querySelector('input[type=hidden]'), btn = box.querySelector('.dpk-btn'), lbl = btn.querySelector('span');
        var follow = box.dataset.follow ? document.querySelector(box.dataset.follow) : null;
        var touched = box.dataset.fresh !== '1';
        var pop = null, view = null;
        var label = function () {
            var d = parse(inp.value);
            lbl.textContent = d ? p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() : 'None (tanpa jatuh tempo)';
            btn.classList.toggle('none', !d);
        };
        var set = function (v, byUser) { inp.value = v; if (byUser) touched = true; label(); inp.dispatchEvent(new Event('change', { bubbles: true })); };
        var close = function () { if (pop) { pop.remove(); pop = null; } };
        var draw = function () {
            var y = view.getFullYear(), m = view.getMonth(), sel = inp.value, today = ymd(new Date());
            var first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
            var h = '<div class="dpk-head"><button type="button" data-nav="-1" aria-label="Bulan sebelumnya">&lsaquo;</button><b>' + BLN[m] + ' ' + y + '</b><button type="button" data-nav="1" aria-label="Bulan berikutnya">&rsaquo;</button></div><div class="dpk-grid">';
            HR.forEach(function (x) { h += '<span class="dpk-wd">' + x + '</span>'; });
            for (var i = 0; i < first; i++) h += '<span></span>';
            for (var d = 1; d <= days; d++) { var v = y + '-' + p2(m + 1) + '-' + p2(d); h += '<button type="button" data-day="' + v + '" class="' + (v === sel ? 'on ' : '') + (v === today ? 'today' : '') + '">' + d + '</button>'; }
            h += '</div><div class="dpk-foot"><button type="button" data-none>None</button>' + (follow ? '<button type="button" data-auto title="1 bulan setelah Start Date">Otomatis</button>' : '') + '</div>';
            pop.innerHTML = h;
        };
        var open = function () {
            if (pop) return close();
            view = parse(inp.value) || parse(plus1(follow && follow.value)) || new Date();
            view = new Date(view.getFullYear(), view.getMonth(), 1);
            pop = document.createElement('div'); pop.className = 'dpk-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Pilih tanggal');
            box.appendChild(pop); draw();
            pop.addEventListener('click', function (e) {
                var t = e.target.closest('button'); if (!t) return;
                e.stopPropagation();
                if (t.dataset.nav) { view = new Date(view.getFullYear(), view.getMonth() + (+t.dataset.nav), 1); draw(); return; }
                if (t.dataset.day) set(t.dataset.day, true);
                else if (t.hasAttribute('data-none')) set('', true);
                else if (t.hasAttribute('data-auto')) set(plus1(follow.value), true);
                close(); btn.focus();
            });
        };
        btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
        document.addEventListener('click', function (e) { if (pop && !box.contains(e.target)) close(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop) { close(); btn.focus(); } });
        // diubah dari luar (mis. tombol Reset): perbarui tulisan
        inp.addEventListener('input', label);
        // pelanggan baru: selama tanggal belum dipilih sendiri, ikut Start Date + 1 bulan
        if (follow) follow.addEventListener('change', function () { if (!touched) set(plus1(follow.value), false); });
        label();
    });
})();

/* Logout otomatis: setelah 1 jam tanpa aktivitas server mengakhiri sesi; halaman yang masih terbuka ikut dialihkan ke Login. */
(function bkIdle() {
  if (!document.body || !/\bv3\b/.test(document.body.className)) return;
  var timer = null, busy = false;
  var plan = function (sec) { clearTimeout(timer); timer = setTimeout(check, sec * 1000); };
  var out = function () { location.href = './?p=login'; };
  var check = function () {
    if (busy) return;
    if (document.hidden) { plan(60); return; }
    busy = true;
    fetch('./?p=api&a=ping', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var d = null;
        try { d = JSON.parse(t); } catch (e) {}
        if (!d) { if (/name="pass"/.test(t)) out(); else plan(60); return; } if (!d.ok || !(d.left > 0)) { out(); return; }      // sesi sudah berakhir (server membalas halaman Login)
        plan(Math.max(30, Math.min(600, d.left + 3)));
      })
      .catch(function () { plan(60); })                            // jaringan putus: coba lagi, jangan dialihkan
      .then(function () { busy = false; });
  };
  plan(600);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
})();
document.addEventListener('click', function (e) { var tr = e.target.closest && e.target.closest('tr[data-href]'); if (!tr || e.target.closest('a,button,input,label,select,textarea,summary,details')) return; if (window.getSelection && String(window.getSelection())) return; location.href = tr.getAttribute('data-href'); }); // klik baris: buka halaman edit
document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.seg [data-tab]'); if (!b) return; b.parentNode.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x === b); var p = document.getElementById(x.getAttribute('data-tab')); if (p) p.hidden = x !== b; }); }); document.addEventListener('click', function (e) { document.querySelectorAll('details.xdd[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); }); }); document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('details.xdd[open]').forEach(function (d) { d.removeAttribute('open'); }); }); // dropdown Export: tutup saat klik di luar / Esc