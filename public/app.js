(function () {
  'use strict';
  const app = document.getElementById('app');
  const NS = 'http://www.w3.org/2000/svg';
  const S = { pub: null, me: null, needsSetup: false, editing: null, mode: 'login' };

  // ---------- helper ----------
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      const v = attrs[k];
      if (k === 'class') n.className = v;
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v);
    });
    [].concat(kids == null ? [] : kids).forEach((c) => {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function logoIcon() {
    const s = document.createElementNS(NS, 'svg');
    [['width', 26], ['height', 26], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', '#C22F54'], ['stroke-width', 2], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']].forEach((a) => s.setAttribute(a[0], a[1]));
    const r = document.createElementNS(NS, 'rect');
    [['x', 3], ['y', 5], ['width', 18], ['height', 14], ['rx', 3]].forEach((a) => r.setAttribute(a[0], a[1]));
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M3 8l9 6 9-6');
    s.appendChild(r); s.appendChild(p);
    return s;
  }
  function api(method, url, body) {
    return fetch(url, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'portal' },
      body: body ? JSON.stringify(body) : undefined
    }).then((r) => r.json().catch(() => ({})).then((j) => {
      if (!r.ok) throw new Error(j.error || 'Terjadi kesalahan.');
      return j;
    }), () => { throw new Error('Tidak bisa terhubung ke server.'); });
  }
  const tint = (hex) => hex + '22';
  const find = (id) => S.pub.paket.filter((p) => p.id === id)[0] || S.pub.paket[0];
  function waLink(p) {
    return 'https://wa.me/' + p.wa + '?text=' + encodeURIComponent('Halo, saya mau pesan ' + p.nama + '.');
  }
  function box() { return el('div', { class: 'msg', style: 'display:none' }); }
  function say(b, type, text) { b.className = 'msg ' + type; b.style.display = 'block'; b.textContent = text; }
  function formData(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = v; });
    return o;
  }
  function field(label, name, opt) {
    opt = opt || {};
    const input = opt.area
      ? el('textarea', { name, rows: opt.rows || 3, placeholder: opt.ph || '' }, opt.value || '')
      : el('input', { name, type: opt.type || 'text', placeholder: opt.ph || '', value: opt.value, required: opt.req ? 'required' : false, autocomplete: opt.auto || 'off', minlength: opt.min, maxlength: opt.max });
    return el('label', {}, [label, input, opt.hint ? el('span', { class: 'hint' }, opt.hint) : null]);
  }

  // ---------- kerangka ----------
  function header(active) {
    return el('header', { class: 'top' }, el('div', { class: 'wrap' }, [
      el('a', { class: 'logo', href: '#/' }, [logoIcon(), S.pub.settings.brand]),
      el('nav', { class: 'menu' }, [
        el('a', { href: '#/', class: active === 'home' ? 'on' : '' }, 'Katalog'),
        el('a', { href: '#/penjual', class: active === 'penjual' ? 'on' : '' }, 'Penjual')
      ])
    ]));
  }
  function footer() {
    const s = S.pub.settings;
    const bits = [s.brand];
    if (s.whatsapp) bits.push('WhatsApp ' + s.whatsapp);
    if (s.email) bits.push(s.email);
    return el('footer', {}, el('div', { class: 'wrap' }, [
      el('span', {}, bits.join(' · ')),
      el('a', { href: '#/penjual', style: 'font-weight:700;color:#1B1F3B' }, 'Masuk sebagai penjual')
    ]));
  }
  function embedView(url, kind) {
    if (!url) return el('div', { class: 'empty' }, 'URL ' + kind + ' belum diisi.');
    return el('div', {}, [
      el('div', { class: 'url' }, [el('span', {}, url), el('a', { href: url, target: '_blank', rel: 'noopener' }, 'Buka di tab baru ↗')]),
      el('iframe', { src: url, title: kind, loading: 'lazy', allow: 'clipboard-write; fullscreen', sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads' })
    ]);
  }
  function emptyCatalog() {
    return el('div', { class: 'empty' }, 'Belum ada web contoh. Penjual bisa menambahkannya dari menu Penjual.');
  }

  // ---------- 1. katalog ----------
  function pageHome() {
    const list = S.pub.paket;
    const cards = list.map((p) => el('article', { class: 'card' }, [
      el('div', { class: 'thumb', style: 'background:' + tint(p.warna) }, el('div', { class: 'mini' }, [
        el('i'),
        el('div', {}, [el('b', { style: 'color:' + p.warna }, p.nama), el('span', { style: 'background:' + p.warna }), el('span', { style: 'background:' + p.warna + ';width:50%' })])
      ])),
      el('div', { class: 'body' }, [
        el('span', { class: 'tag', style: 'background:' + tint(p.warna) + ';color:' + p.warna }, p.kategori),
        el('h3', {}, p.nama),
        p.deskripsi ? el('p', {}, p.deskripsi) : null,
        el('div', { class: 'row' }, [
          el('span', { class: 'price' }, p.harga),
          el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
            el('a', { class: 'btn fill', style: 'background:' + p.warna, href: '#/contoh/' + p.id }, 'Lihat Contoh'),
            p.wa ? el('a', { class: 'btn line', href: waLink(p), target: '_blank', rel: 'noopener' }, 'Pesan') : null
          ])
        ])
      ])
    ]));
    return el('div', {}, [
      header('home'),
      el('section', { class: 'wrap hero' }, [
        el('h1', {}, S.pub.settings.tagline),
        el('p', {}, 'Buka contoh website kartu ucapan langsung di sini, bandingkan modelnya, lalu pesan yang paling cocok.')
      ]),
      el('section', { class: 'wrap' }, cards.length ? el('div', { class: 'grid' }, cards) : emptyCatalog()),
      el('section', { class: 'dark' }, el('div', { class: 'wrap steps' }, [
        el('div', {}, [el('b', {}, '1'), el('h3', {}, 'Pilih & lihat contoh'), el('span', {}, 'Buka contoh langsung di portal ini.')]),
        el('div', {}, [el('b', {}, '2'), el('h3', {}, 'Pesan ke penjual'), el('span', {}, 'Kirim data acara lewat WhatsApp.')]),
        el('div', {}, [el('b', {}, '3'), el('h3', {}, 'Terima link website'), el('span', {}, 'Penjual membuatkan lalu mengirim link-nya.')])
      ])),
      footer()
    ]);
  }

  // ---------- 2. lihat contoh ----------
  function pageContoh(id) {
    if (!S.pub.paket.length) return el('div', {}, [header('home'), el('div', { class: 'wrap' }, emptyCatalog()), footer()]);
    const p = find(id);
    let device = 'desktop';
    const frame = el('div', { class: 'frame desktop' });
    const segDev = el('div', { class: 'seg' });
    function draw() {
      frame.className = 'frame ' + device;
      frame.replaceChildren(embedView(p.contohUrl, 'contoh ' + p.nama));
      segDev.replaceChildren.apply(segDev, [['desktop', 'Desktop'], ['mobile', 'Ponsel']].map((d) =>
        el('button', { class: device === d[0] ? 'on' : '', onclick: () => { device = d[0]; draw(); } }, d[1])));
    }
    draw();
    const tabs = el('div', { class: 'seg' }, S.pub.paket.map((x) => el('a', { class: x.id === p.id ? 'on' : '', href: '#/contoh/' + x.id }, x.nama)));
    return el('div', {}, [
      header('home'),
      el('div', { class: 'bar' }, el('div', { class: 'wrap' }, [tabs, segDev])),
      el('div', { class: 'wrap' }, el('div', { class: 'stage' }, [
        el('div', { class: 'view' }, frame),
        el('aside', { class: 'side' }, [
          el('span', { class: 'tag', style: 'background:' + tint(p.warna) + ';color:' + p.warna }, p.kategori),
          el('h2', {}, p.nama),
          p.deskripsi ? el('p', { style: 'margin:0;color:#5A6080;line-height:1.55' }, p.deskripsi) : null,
          p.fitur && p.fitur.length ? el('ul', {}, p.fitur.map((f) => el('li', {}, f))) : null,
          el('div', { class: 'pr' }, [el('span', {}, 'Harga'), el('b', { style: 'color:#1B1F3B;font-size:22px' }, p.harga || '-')]),
          p.wa ? el('a', { class: 'btn fill', style: 'background:' + p.warna, href: waLink(p), target: '_blank', rel: 'noopener' }, 'Pesan template ini') : null,
          el('a', { class: 'btn line', href: '#/' }, 'Kembali ke katalog')
        ])
      ])),
      footer()
    ]);
  }

  // ---------- 3. penjual: masuk / daftar / setup ----------
  function viewSetup() {
    const b = box();
    const form = el('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      api('POST', '/api/setup', formData(form)).then((r) => { S.me = r.user; S.needsSetup = false; return refresh(); })
        .catch((x) => say(b, 'err', x.message));
    } }, [
      field('Nama brand', 'brand', { ph: 'Nama toko kamu' }),
      field('Nama kamu', 'nama', { req: true }),
      field('Nomor WhatsApp', 'wa', { ph: '08123456789', req: true }),
      field('ID pemilik', 'username', { req: true, auto: 'username', hint: 'Huruf kecil, angka, titik, strip, atau garis bawah (3-30 karakter).' }),
      field('Password', 'password', { type: 'password', req: true, min: 8, auto: 'new-password', hint: 'Minimal 8 karakter.' }),
      b,
      el('button', { class: 'btn fill', type: 'submit' }, 'Buat akun pemilik')
    ]);
    return el('div', { class: 'wrap' }, el('div', { class: 'panel narrow' }, [
      el('h2', {}, 'Siapkan portal'),
      el('p', { class: 'notice' }, 'Belum ada pemilik. Buat akun pemilik sekarang. Akun ini yang menyetujui reseller.'),
      form
    ]));
  }

  function viewLogin() {
    const daftar = S.mode === 'daftar';
    const b = box();
    const form = el('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      if (daftar) {
        api('POST', '/api/register', formData(form)).then((r) => { form.reset(); say(b, 'ok', r.message); })
          .catch((x) => say(b, 'err', x.message));
      } else {
        api('POST', '/api/login', formData(form)).then((r) => { S.me = r.user; return refresh(); })
          .catch((x) => say(b, 'err', x.message));
      }
    } }, daftar ? [
      field('Nama', 'nama', { req: true }),
      field('Nomor WhatsApp', 'wa', { ph: '08123456789', req: true, hint: 'Nomor ini dipakai pembeli untuk memesan dari webmu.' }),
      field('ID yang diinginkan', 'username', { req: true, auto: 'username' }),
      field('Password', 'password', { type: 'password', req: true, min: 8, auto: 'new-password', hint: 'Minimal 8 karakter.' }),
      b,
      el('button', { class: 'btn fill', type: 'submit' }, 'Kirim pendaftaran')
    ] : [
      field('ID', 'username', { req: true, auto: 'username' }),
      field('Password', 'password', { type: 'password', req: true, auto: 'current-password' }),
      b,
      el('button', { class: 'btn fill', type: 'submit' }, 'Masuk')
    ]);
    return el('div', { class: 'wrap' }, el('div', { class: 'panel narrow' }, [
      el('h2', {}, daftar ? 'Daftar jadi reseller' : 'Masuk penjual'),
      daftar ? el('p', { class: 'notice' }, 'Pendaftaran harus disetujui pemilik dulu sebelum kamu bisa masuk.') : null,
      form,
      el('button', { class: 'btn line small', onclick: () => { S.mode = daftar ? 'login' : 'daftar'; render(); } }, daftar ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar reseller')
    ]));
  }

  // ---------- 3b. dasbor penjual ----------
  function dashNav(sub, pending) {
    const items = [['', 'Admin Panel'], ['kelola', 'Kelola Web']];
    if (S.me.role === 'owner') {
      items.push(['reseller', 'Reseller' + (pending ? ' (' + pending + ')' : '')]);
      items.push(['pengaturan', 'Pengaturan']);
    }
    items.push(['akun', 'Akun']);
    return el('div', { class: 'bar' }, el('div', { class: 'wrap' }, [
      el('div', { class: 'seg' }, items.map((i) => el('a', { class: (sub || '') === i[0] || (i[0] === '' && sub === 'admin') ? 'on' : '', href: '#/penjual' + (i[0] ? '/' + i[0] : '') }, i[1]))),
      el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
        el('span', { class: 'notice' }, S.me.nama + (S.me.role === 'owner' ? ' (pemilik)' : ' (reseller)')),
        el('button', { class: 'btn line small', onclick: () => { api('POST', '/api/logout').then(() => { S.me = null; location.hash = '#/penjual'; return refresh(); }); } }, 'Keluar')
      ])
    ]));
  }

  function tabAdmin(list, arg) {
    if (!list.length) return el('div', { class: 'wrap', style: 'padding:20px' }, el('div', { class: 'panel' }, [
      el('h2', {}, 'Belum ada web'),
      el('p', { class: 'notice' }, 'Tambahkan web contoh dan admin panel dulu di menu Kelola Web.'),
      el('a', { class: 'btn fill', href: '#/penjual/kelola' }, 'Tambah web')
    ]));
    const p = list.filter((x) => x.id === arg)[0] || list[0];
    const tabs = el('div', { class: 'seg' }, list.map((x) => el('a', { class: x.id === p.id ? 'on' : '', href: '#/penjual/admin/' + x.id }, 'Admin ' + x.nama)));
    return el('div', { class: 'wrap', style: 'padding-top:16px;padding-bottom:40px' }, [
      el('div', { class: 'toolbar', style: 'margin-bottom:12px' }, [tabs, el('a', { class: 'btn line small', href: '#/contoh/' + p.id }, 'Lihat contoh ' + p.nama)]),
      el('div', { class: 'view', style: 'padding:12px' }, el('div', { class: 'frame wide' }, embedView(p.adminUrl, 'admin ' + p.nama))),
      el('p', { class: 'notice' }, 'Login memakai akun admin panel masing-masing. Kalau tampilan kosong, klik "Buka di tab baru".')
    ]);
  }

  function paketForm(p) {
    const b = box();
    const v = p || {};
    const form = el('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      const d = formData(form);
      d.fitur = String(d.fitur || '').split('\n');
      (p ? api('PUT', '/api/paket/' + p.id, d) : api('POST', '/api/paket', d))
        .then(() => { S.editing = null; return refresh(); })
        .catch((x) => say(b, 'err', x.message));
    } }, [
      el('div', { class: 'two' }, [field('Nama web', 'nama', { req: true, value: v.nama, ph: 'Template Ulang Tahun' }), field('Kategori', 'kategori', { value: v.kategori, ph: 'Ulang tahun' })]),
      field('Deskripsi singkat', 'deskripsi', { area: true, value: v.deskripsi }),
      field('Fitur (satu per baris)', 'fitur', { area: true, rows: 4, value: (v.fitur || []).join('\n') }),
      el('div', { class: 'two' }, [field('Harga', 'harga', { value: v.harga, ph: 'Rp 50.000' }), field('Warna kartu', 'warna', { type: 'color', value: v.warna || '#C22F54' })]),
      field('URL web contoh (untuk pembeli)', 'contohUrl', { req: true, type: 'url', value: v.contohUrl, ph: 'https://contoh.domainkamu.com' }),
      field('URL admin panel (untuk penjual)', 'adminUrl', { req: true, type: 'url', value: v.adminUrl, ph: 'https://admin.domainkamu.com', hint: 'Hanya terlihat oleh penjual yang login. Pembeli tidak bisa melihatnya.' }),
      b,
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
        el('button', { class: 'btn fill', type: 'submit' }, p ? 'Simpan perubahan' : 'Tambah web'),
        el('button', { class: 'btn line', type: 'button', onclick: () => { S.editing = null; render(); } }, 'Batal')
      ])
    ]);
    return el('div', { class: 'panel' }, [el('h2', {}, p ? 'Ubah web' : 'Tambah web baru'), form]);
  }

  function tabKelola(list) {
    const mine = list.filter((p) => p.canEdit);
    const rows = mine.map((p) => el('div', { class: 'item' }, [
      el('div', { class: 'info' }, [
        el('b', {}, [el('span', { class: 'dot', style: 'background:' + p.warna }), p.nama, p.hidden ? el('span', { class: 'pill warn' }, 'Disembunyikan') : null]),
        el('small', {}, p.kategori + ' · ' + (p.harga || '-') + (S.me.role === 'owner' ? ' · oleh ' + p.ownerNama : ''))
      ]),
      el('div', { class: 'acts' }, [
        el('button', { class: 'btn line small', onclick: () => { S.editing = p; render(); } }, 'Ubah'),
        S.me.role === 'owner' ? el('button', { class: 'btn line small', onclick: () => {
          api('PUT', '/api/paket/' + p.id, Object.assign({}, p, { hidden: !p.hidden })).then(refresh).catch((x) => alert(x.message));
        } }, p.hidden ? 'Tampilkan' : 'Sembunyikan') : null,
        el('button', { class: 'btn danger small', onclick: () => {
          if (confirm('Hapus "' + p.nama + '"? Ini tidak bisa dibatalkan.')) api('DELETE', '/api/paket/' + p.id).then(refresh).catch((x) => alert(x.message));
        } }, 'Hapus')
      ])
    ]));
    return el('div', { class: 'wrap', style: 'padding-top:20px;padding-bottom:40px' }, [
      S.editing ? paketForm(S.editing === 'new' ? null : S.editing) : null,
      el('div', { class: 'panel' }, [
        el('div', { class: 'toolbar' }, [
          el('h2', {}, S.me.role === 'owner' ? 'Semua web' : 'Web milikmu'),
          el('button', { class: 'btn fill', onclick: () => { S.editing = 'new'; render(); window.scrollTo(0, 0); } }, '+ Tambah web baru')
        ]),
        rows.length ? el('div', { class: 'list' }, rows) : el('p', { class: 'notice' }, 'Belum ada web. Klik "Tambah web baru" untuk memasukkan web contoh dan admin panelmu.')
      ])
    ]);
  }

  function tabReseller(users) {
    const pending = users.filter((u) => u.status === 'pending');
    const others = users.filter((u) => u.status !== 'pending');
    const call = (id, action, body) => api('POST', '/api/users/' + id + '/' + action, body).then(refresh).catch((x) => alert(x.message));
    const b = box();
    const form = el('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      api('POST', '/api/users', formData(form)).then(() => { form.reset(); return refresh(); }).catch((x) => say(b, 'err', x.message));
    } }, [
      el('div', { class: 'two' }, [field('Nama', 'nama', { req: true }), field('Nomor WhatsApp', 'wa', { req: true, ph: '08123456789' })]),
      el('div', { class: 'two' }, [field('ID', 'username', { req: true }), field('Password', 'password', { type: 'password', req: true, min: 8, auto: 'new-password' })]),
      b,
      el('button', { class: 'btn fill', type: 'submit' }, 'Buat reseller')
    ]);
    return el('div', { class: 'wrap', style: 'padding-top:20px;padding-bottom:40px' }, [
      el('div', { class: 'panel' }, [
        el('h2', {}, 'Menunggu persetujuan'),
        pending.length ? el('div', { class: 'list' }, pending.map((u) => el('div', { class: 'item' }, [
          el('div', { class: 'info' }, [el('b', {}, u.nama), el('small', {}, 'ID: ' + u.username + ' · WA: ' + u.wa)]),
          el('div', { class: 'acts' }, [
            el('button', { class: 'btn fill small', onclick: () => call(u.id, 'approve') }, 'Setujui'),
            el('button', { class: 'btn danger small', onclick: () => { if (confirm('Tolak pendaftaran ' + u.nama + '?')) call(u.id, 'reject'); } }, 'Tolak')
          ])
        ]))) : el('p', { class: 'notice' }, 'Tidak ada pendaftaran baru.')
      ]),
      el('div', { class: 'panel' }, [
        el('h2', {}, 'Reseller'),
        others.length ? el('div', { class: 'list' }, others.map((u) => el('div', { class: 'item' }, [
          el('div', { class: 'info' }, [
            el('b', {}, [u.nama, el('span', { class: 'pill ' + (u.status === 'active' ? 'ok' : 'warn') }, u.status === 'active' ? 'Aktif' : 'Nonaktif')]),
            el('small', {}, 'ID: ' + u.username + ' · WA: ' + u.wa)
          ]),
          el('div', { class: 'acts' }, [
            u.status === 'active'
              ? el('button', { class: 'btn line small', onclick: () => call(u.id, 'disable') }, 'Nonaktifkan')
              : el('button', { class: 'btn line small', onclick: () => call(u.id, 'enable') }, 'Aktifkan'),
            el('button', { class: 'btn line small', onclick: () => {
              const pw = prompt('Password baru untuk ' + u.username + ' (minimal 8 karakter):');
              if (pw) call(u.id, 'resetpw', { password: pw });
            } }, 'Reset password'),
            el('button', { class: 'btn danger small', onclick: () => {
              if (confirm('Hapus akun ' + u.nama + '? Web miliknya pindah ke kamu.')) call(u.id, 'delete');
            } }, 'Hapus')
          ])
        ]))) : el('p', { class: 'notice' }, 'Belum ada reseller.')
      ]),
      el('div', { class: 'panel' }, [el('h2', {}, 'Buat reseller langsung'), el('p', { class: 'notice' }, 'Akun yang kamu buat di sini langsung aktif tanpa perlu persetujuan lagi.'), form])
    ]);
  }

  function tabPengaturan() {
    const s = S.pub.settings;
    const b = box();
    const form = el('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      api('PUT', '/api/settings', formData(form)).then(() => { say(b, 'ok', 'Tersimpan.'); return api('GET', '/api/public').then((p) => { S.pub = p; }); })
        .catch((x) => say(b, 'err', x.message));
    } }, [
      field('Nama brand', 'brand', { value: s.brand }),
      field('Tagline di beranda', 'tagline', { value: s.tagline }),
      el('div', { class: 'two' }, [field('Nomor WhatsApp utama', 'whatsapp', { value: s.whatsapp, hint: 'Dipakai untuk web milikmu dan web tanpa reseller.' }), field('Email', 'email', { type: 'email', value: s.email })]),
      b,
      el('button', { class: 'btn fill', type: 'submit' }, 'Simpan')
    ]);
    return el('div', { class: 'wrap', style: 'padding-top:20px;padding-bottom:40px' }, el('div', { class: 'panel' }, [el('h2', {}, 'Pengaturan portal'), form]));
  }

  function tabAkun() {
    const b1 = box(), b2 = box();
    const f1 = el('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      api('PUT', '/api/profile', formData(f1)).then((r) => { S.me = r.user; say(b1, 'ok', 'Tersimpan.'); }).catch((x) => say(b1, 'err', x.message));
    } }, [
      el('div', { class: 'two' }, [field('Nama', 'nama', { value: S.me.nama }), field('Nomor WhatsApp', 'wa', { value: S.me.wa })]),
      b1, el('button', { class: 'btn fill', type: 'submit' }, 'Simpan')
    ]);
    const f2 = el('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      const d = formData(f2);
      api('POST', '/api/password', { old: d.old, new: d.new }).then(() => { f2.reset(); say(b2, 'ok', 'Password diganti.'); }).catch((x) => say(b2, 'err', x.message));
    } }, [
      field('Password lama', 'old', { type: 'password', req: true, auto: 'current-password' }),
      field('Password baru', 'new', { type: 'password', req: true, min: 8, auto: 'new-password', hint: 'Minimal 8 karakter.' }),
      b2, el('button', { class: 'btn fill', type: 'submit' }, 'Ganti password')
    ]);
    return el('div', { class: 'wrap', style: 'padding-top:20px;padding-bottom:40px' }, [
      el('div', { class: 'panel' }, [el('h2', {}, 'Profil (ID: ' + S.me.username + ')'), f1]),
      el('div', { class: 'panel' }, [el('h2', {}, 'Ganti password'), f2])
    ]);
  }

  function pagePenjual(sub, arg) {
    const shell = (inner) => el('div', {}, [header('penjual'), inner, footer()]);
    if (S.needsSetup) return Promise.resolve(shell(viewSetup()));
    if (!S.me) return Promise.resolve(shell(viewLogin()));
    sub = sub || '';
    const wantUsers = S.me.role === 'owner';
    return Promise.all([
      api('GET', '/api/paket'),
      wantUsers ? api('GET', '/api/users') : Promise.resolve({ users: [] })
    ]).then((r) => {
      const list = r[0].paket, users = r[1].users;
      const pending = users.filter((u) => u.status === 'pending').length;
      let body;
      if (sub === 'kelola') body = tabKelola(list);
      else if (sub === 'reseller' && wantUsers) body = tabReseller(users);
      else if (sub === 'pengaturan' && wantUsers) body = tabPengaturan();
      else if (sub === 'akun') body = tabAkun();
      else body = tabAdmin(list, arg);
      return el('div', {}, [header('penjual'), dashNav(sub, pending), body, footer()]);
    });
  }

  // ---------- router ----------
  let token = 0;
  function render() {
    const my = ++token;
    const h = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    let out;
    try {
      if (h[0] === 'contoh') out = Promise.resolve(pageContoh(h[1]));
      else if (h[0] === 'penjual') out = pagePenjual(h[1], h[2]);
      else out = Promise.resolve(pageHome());
    } catch (e) { out = Promise.reject(e); }
    out.then((node) => {
      if (my !== token) return;
      app.replaceChildren(node);
    }).catch((e) => {
      if (my !== token) return;
      if (/login/i.test(e.message)) { S.me = null; }
      app.replaceChildren(el('div', { class: 'wrap' }, el('div', { class: 'panel narrow' }, [el('h2', {}, 'Ada masalah'), el('p', { class: 'notice' }, e.message), el('button', { class: 'btn fill', onclick: () => refresh() }, 'Coba lagi')])));
    });
  }
  function refresh() {
    return Promise.all([api('GET', '/api/public'), api('GET', '/api/me')]).then((r) => {
      S.pub = r[0]; S.me = r[1].user; S.needsSetup = r[1].needsSetup;
      render();
    }).catch((e) => {
      app.replaceChildren(el('div', { class: 'wrap' }, el('div', { class: 'panel narrow' }, [el('h2', {}, 'Tidak bisa memuat portal'), el('p', { class: 'notice' }, e.message), el('button', { class: 'btn fill', onclick: () => refresh() }, 'Coba lagi')])));
    });
  }
  window.addEventListener('hashchange', render);
  refresh();
})();
