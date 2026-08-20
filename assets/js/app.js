/* ═══════════════════════════════════════════════════════════
   bdathe.wiki — one script, modules activate only when the
   elements they own are present on the page.
   window.SITE is injected by layouts/partials/site_data.html
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var S = window.SITE || { poems: [], music: [], photos: [], writing: [], sections: [] };
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var fmt = function (iso) {
    var p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[0] + '.' + p[1] + '.' + p[2] : iso;
  };

  /* deterministic pseudo-random from a string, so a song's waveform is
     always the same shape without storing it anywhere */
  var seedRand = function (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      return ((h >>> 0) % 1000) / 1000;
    };
  };

  /* ── 随时间 ─────────────────────────────────────────────
     head_theme.html has already painted the right colours and left its
     engine on window.__theme. One switch now, not a five-position dial:
     the background either follows the clock or holds at 昼.            */
  function theme() {
    var T = window.__theme;
    if (!T) return;
    var btn = document.getElementById('ambient');
    var label = document.getElementById('ambientLabel');
    var mode = T.mode;

    var NAME = { dawn: '晨', day: '昼', dusk: '暮', night: '夜' };

    var sync = function () {
      var on = mode === 'auto';
      if (btn) btn.setAttribute('aria-pressed', String(on));
      if (label) {
        label.textContent = on
          ? '自动 · ' + (NAME[document.documentElement.getAttribute('data-theme')] || '昼')
          : '已关闭';
      }
    };

    if (btn) {
      btn.addEventListener('click', function () {
        mode = mode === 'auto' ? 'off' : 'auto';
        if (mode === 'auto') {
          T.auto();
          try { localStorage.removeItem('theme-auto'); } catch (_) {}
        } else {
          T.off();
          try { localStorage.setItem('theme-auto', 'off'); } catch (_) {}
        }
        sync();
      });
    }

    /* a minute is finer than the eye can follow across a 4-hour drift, so the
       page simply changes under you without ever appearing to change */
    setInterval(function () {
      if (mode !== 'auto') return;
      T.auto();
      sync();
    }, 60000);

    sync();
  }

  /* ── nav: hairline on scroll + sliding underline ── */
  function nav() {
    var bar = document.querySelector('.nav');
    if (bar) {
      var onScroll = function () { bar.classList.toggle('stuck', window.scrollY > 8); };
      onScroll();
      addEventListener('scroll', onScroll, { passive: true });
    }

    var links = document.querySelector('.nav-links');
    if (!links) return;
    var ink = document.createElement('span');
    ink.className = 'nav-ink';
    links.appendChild(ink);

    var slideTo = function (el) {
      if (!el) { ink.classList.remove('show'); return; }
      var a = el.getBoundingClientRect();
      var b = links.getBoundingClientRect();
      ink.style.setProperty('--x', (a.left - b.left) + 'px');
      ink.style.setProperty('--w', a.width);
      ink.classList.add('show');
    };
    var home = function () { slideTo(links.querySelector('.nav-link.on')); };

    links.querySelectorAll('.nav-link').forEach(function (a) {
      a.addEventListener('mouseenter', function () { slideTo(a); });
      a.addEventListener('focus', function () { slideTo(a); });
    });
    links.addEventListener('mouseleave', home);
    addEventListener('resize', home);
    // measure after webfonts land, or the underline sits on stale widths
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(home);
    home();
  }

  /* ── cross-page continuity ────────────────────────────
     The 文 index has many titles and the article has one, so the shared name
     cannot be baked into the markup on both ends — every row would claim it
     and a view-transition-name has to be unique per document. Instead the row
     that is actually being followed takes the name on the way out, just
     before the navigation starts.

     Set on pointerdown rather than click: the browser needs the name in place
     when it snapshots the outgoing page, and pointerdown is the last moment
     that is guaranteed to be early enough. It survives a cancelled click
     harmlessly — the name is unique either way, and going back re-uses it to
     run the same morph in reverse.                                        */
  function continuity() {
    if (still || !document.startViewTransition) return;

    var rows = document.querySelectorAll('.entry');
    if (rows.length) {
      var claim = function (row) {
        rows.forEach(function (r) {
          var h = r.querySelector('h3');
          if (h) h.style.viewTransitionName = r === row ? 'articletitle' : '';
        });
      };
      rows.forEach(function (row) {
        row.addEventListener('pointerdown', function () { claim(row); });
        // keyboard follows the same path, and Enter fires no pointer event
        row.addEventListener('keydown', function (e) { if (e.key === 'Enter') claim(row); });
      });
    }

    /* 书架抽出后点「读全文」，以及卡片箱里直接点开的那张 */
    var rpGo = document.getElementById('rpGo');
    var rpT = document.getElementById('rpT');
    if (rpGo && rpT) {
      rpGo.addEventListener('pointerdown', function () {
        rpT.style.viewTransitionName = 'articletitle';
      });
    }
    var cards = document.querySelectorAll('.slot.card');
    if (cards.length) {
      var claimCard = function (card) {
        cards.forEach(function (c) {
          var t = c.querySelector('.card-title');
          if (t) t.style.viewTransitionName = c === card ? 'articletitle' : '';
        });
      };
      cards.forEach(function (card) {
        card.addEventListener('pointerdown', function () { claimCard(card); });
        card.addEventListener('keydown', function (e) { if (e.key === 'Enter') claimCard(card); });
      });
    }
  }

  /* ── reveal on scroll ─────────────────────────────────
     Browsers with scroll timelines handle this in CSS; this
     is the fallback path for everyone else.                */
  var io = null;
  function scanReveals() {
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    }
    document.querySelectorAll('.reveal, .marginalia').forEach(function (el, i) {
      if (el.dataset.seen) return;
      el.dataset.seen = '1';
      if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', i % 6);
      io.observe(el);
    });
  }
  window.scanReveals = scanReveals;

  /* ── ⌘K palette ───────────────────────────────────────
     Searches everything the site knows about, in one box.  */
  function palette() {
    var pal = document.getElementById('cmdk');
    if (!pal) return;
    var input = pal.querySelector('input');
    var list = pal.querySelector('.cmdk-list');
    var sel = 0, rows = [];

    var index = [];
    (S.sections || []).forEach(function (s) {
      index.push({ k: '页面', l: s.name, s: s.latin || '', url: s.url });
    });
    (S.writing || []).forEach(function (w) {
      index.push({ k: w.kind === 'note' ? '笔记' : '随笔', l: w.title, s: w.summary || '', url: w.url });
    });
    (S.poems || []).forEach(function (p) {
      index.push({ k: '诗', l: p.title, s: p.author + ' · ' + (p.excerpt || ''), url: p.url });
    });
    (S.music || []).forEach(function (m) {
      index.push({ k: '音', l: m.title, s: m.artist + ' · ' + (m.summary || ''), url: m.url });
    });
    (S.photos || []).forEach(function (p) {
      index.push({ k: '影', l: p.title, s: p.caption || '', url: p.url });
    });

    var render = function (q) {
      var hit = q
        ? index.filter(function (r) { return (r.l + r.s + r.k).toLowerCase().indexOf(q.toLowerCase()) > -1; })
        : index.slice(0, 8);
      sel = 0;
      list.textContent = '';
      if (!hit.length) {
        var empty = document.createElement('div');
        empty.className = 'cmdk-empty';
        empty.textContent = '没有找到「' + q + '」';
        list.appendChild(empty);
        rows = [];
        return;
      }
      rows = hit.slice(0, 40).map(function (r, i) {
        var el = document.createElement('div');
        el.className = 'cmdk-item' + (i === 0 ? ' sel' : '');
        ['k', 'l', 's'].forEach(function (cls) {
          var sp = document.createElement('span');
          sp.className = cls;
          sp.textContent = r[cls];
          el.appendChild(sp);
        });
        el.addEventListener('click', function () { location.href = r.url; });
        el.addEventListener('mousemove', function () { move(i); });
        list.appendChild(el);
        return { el: el, r: r };
      });
    };
    var move = function (i) {
      if (!rows.length) return;
      if (rows[sel]) rows[sel].el.classList.remove('sel');
      sel = (i + rows.length) % rows.length;
      rows[sel].el.classList.add('sel');
      rows[sel].el.scrollIntoView({ block: 'nearest' });
    };
    var open = function () {
      pal.classList.add('on');
      // the markup ships aria-hidden="true"; without clearing it here the
      // dialog is open on screen but invisible to assistive tech
      pal.setAttribute('aria-hidden', 'false');
      render('');
      input.value = '';
      setTimeout(function () { input.focus(); }, 20);
    };
    var close = function () {
      pal.classList.remove('on');
      pal.setAttribute('aria-hidden', 'true');
    };

    document.querySelectorAll('[data-cmdk]').forEach(function (b) { b.addEventListener('click', open); });
    input.addEventListener('input', function () { render(input.value.trim()); });
    pal.addEventListener('click', function (e) { if (e.target === pal) close(); });
    addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        pal.classList.contains('on') ? close() : open();
        return;
      }
      if (!pal.classList.contains('on')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown') { e.preventDefault(); move(sel + 1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(sel - 1); }
      if (e.key === 'Enter' && rows[sel]) location.href = rows[sel].r.url;
    });
  }

  /* ── cards that lean toward the pointer ────────────────
     The light sweep tracks the cursor through --cx/--cy, so the highlight
     lands where the card is being "pressed" rather than always centre. */
  function tilt() {
    if (still || !matchMedia('(pointer:fine)').matches) return;
    document.querySelectorAll('[data-tilt]').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width;
        var y = (e.clientY - r.top) / r.height;
        card.style.transform = 'perspective(1100px) rotateX(' + ((0.5 - y) * 4).toFixed(2)
          + 'deg) rotateY(' + ((x - 0.5) * 5).toFixed(2) + 'deg) translateY(-3px)';
        card.style.setProperty('--cx', (x * 100).toFixed(1) + '%');
        card.style.setProperty('--cy', (y * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }

  /* ── home: 行迹 — every entry, stacked by month ────────
     One column per month between the first entry and the last, each cell an
     entry sitting on the ones before it. Empty months keep their column, so
     the gaps are part of the record too — a quiet spring should look quiet
     rather than be closed up.                                             */
  function rings() {
    var field = document.getElementById('rings');
    if (!field) return;
    var tip = document.getElementById('tip');
    var note = document.getElementById('ringsNote');
    var LABEL = { wen: '文', shi: '诗', yin: '音', ying: '影' };

    var pts = [];
    (S.writing || []).forEach(function (w) { pts.push({ d: w.date, k: 'wen', l: w.title, u: w.url }); });
    (S.poems || []).forEach(function (p) { pts.push({ d: p.date, k: 'shi', l: p.title, u: p.url }); });
    (S.music || []).forEach(function (m) { pts.push({ d: m.date, k: 'yin', l: m.title, u: m.url }); });
    (S.photos || []).forEach(function (p) { pts.push({ d: p.date, k: 'ying', l: p.title, u: p.url }); });
    pts = pts.filter(function (p) { return p.d && !isNaN(+new Date(p.d)); });
    if (!pts.length) return;

    var key = function (dt) { return dt.getFullYear() * 12 + dt.getMonth(); };
    var months = pts.map(function (p) { return key(new Date(p.d)); });
    var m0 = Math.min.apply(null, months);
    var m1 = Math.max.apply(null, months);

    /* Long-dormant stretches would otherwise push the active months into a
       sliver. Past three years of columns the field scrolls instead. */
    var buckets = {};
    pts.forEach(function (p) {
      var m = key(new Date(p.d));
      (buckets[m] = buckets[m] || []).push(p);
    });

    var tallest = 1;
    Object.keys(buckets).forEach(function (m) { tallest = Math.max(tallest, buckets[m].length); });
    field.style.setProperty('--tallest', tallest);

    var frag = document.createDocumentFragment();
    for (var m = m0; m <= m1; m++) {
      var year = Math.floor(m / 12);
      var mon = (m % 12) + 1;
      var col = document.createElement('div');
      col.className = 'mo';

      var stack = document.createElement('span');
      stack.className = 'stack';

      // newest at the top of the column, so a stack reads the same way the
      // rest of the site does
      (buckets[m] || []).slice().sort(function (a, b) {
        return +new Date(a.d) - +new Date(b.d);
      }).forEach(function (p, i) {
        var cell = document.createElement('a');
        cell.className = 'cell';
        cell.dataset.kind = p.k;
        cell.href = p.u;
        cell.style.setProperty('--i', i);
        cell.setAttribute('aria-label', LABEL[p.k] + ' · ' + p.l + ' · ' + fmt(p.d));
        var enter = function () {
          if (!tip) return;
          tip.textContent = LABEL[p.k] + ' · ' + p.l + '  ' + fmt(p.d);
          var r = cell.getBoundingClientRect();
          var fr = field.getBoundingClientRect();
          tip.style.left = (r.left - fr.left + r.width / 2) + 'px';
          tip.classList.add('on');
        };
        cell.addEventListener('mouseenter', enter);
        cell.addEventListener('focus', enter);
        var leave = function () { if (tip) tip.classList.remove('on'); };
        cell.addEventListener('mouseleave', leave);
        cell.addEventListener('blur', leave);
        stack.appendChild(cell);
      });

      col.appendChild(stack);

      var lab = document.createElement('span');
      lab.className = 'mo-label mono';
      // the year only earns a label where it changes, or at the very start
      lab.textContent = (mon === 1 || m === m0) ? year + '.' + String(mon).padStart(2, '0')
                                                : String(mon).padStart(2, '0');
      if (mon === 1 || m === m0) lab.classList.add('year');
      col.appendChild(lab);

      frag.appendChild(col);
    }
    field.appendChild(frag);

    if (note) note.textContent = pts.length + ' 条 · ' + (m1 - m0 + 1) + ' 个月';

    // hovering a legend key isolates that kind
    var legend = document.getElementById('legend');
    if (!legend) return;
    legend.querySelectorAll('[data-kind]').forEach(function (k) {
      var kind = k.dataset.kind;
      k.addEventListener('mouseenter', function () {
        field.classList.add('filtering');
        field.querySelectorAll('.cell').forEach(function (c) {
          c.classList.toggle('match', c.dataset.kind === kind);
        });
      });
      k.addEventListener('mouseleave', function () { field.classList.remove('filtering'); });
    });
  }

  /* ── 诗: expand, 竖排, 释义 ── */
  function poems() {
    var list = document.querySelectorAll('.poem');
    if (!list.length) return;

    list.forEach(function (art) {
      var head = art.querySelector('.poem-head');
      var text = art.querySelector('.poem-text');
      var note = art.querySelector('.poem-note');
      var vBtn = art.querySelector('[data-v]');
      var nBtn = art.querySelector('[data-n]');
      var toggle = function () { art.classList.toggle('open'); };

      head.addEventListener('click', toggle);
      head.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
      if (vBtn) vBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        vBtn.setAttribute('aria-pressed', String(text.classList.toggle('vertical')));
      });
      if (nBtn) nBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var on = nBtn.getAttribute('aria-pressed') !== 'true';
        nBtn.setAttribute('aria-pressed', String(on));
        note.hidden = !on;
      });
    });

    var target = location.hash.slice(1);
    if (target) {
      var el = document.getElementById(target);
      if (el && el.classList.contains('poem')) {
        el.classList.add('in');
        setTimeout(function () {
          el.classList.add('open');
          el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
        }, 220);
      }
    }
  }

  /* ── 文: 随笔/笔记 × 标签 ──────────────────────────────
     Two independent axes intersected: an entry survives only if it matches
     the selected form *and* carries every selected tag. Tags toggle, so
     picking two of them narrows rather than widens — the opposite of the
     usual tag cloud, but it is the behaviour that actually helps when you
     are trying to find one thing you half remember.                      */
  function filters() {
    var entries = document.querySelectorAll('.entry');
    if (!entries.length) return;
    var formBtns = document.querySelectorAll('[data-f]');
    var tagBtns = document.querySelectorAll('[data-tag]');
    if (!formBtns.length && !tagBtns.length) return;
    var groups = document.querySelectorAll('.year-group');
    var empty = document.getElementById('filterEmpty');
    var form = 'all';
    var tags = [];

    var apply = function () {
      var shown = 0;
      entries.forEach(function (el) {
        var own = (el.dataset.tags || '').split('|').filter(Boolean);
        var ok = (form === 'all' || el.dataset.kind === form)
              && tags.every(function (t) { return own.indexOf(t) > -1; });
        el.classList.toggle('hide', !ok);
        if (ok) shown++;
      });
      // a year whose entries are all filtered out should take its rail with it
      groups.forEach(function (g) {
        var any = g.querySelector('.entry:not(.hide)');
        g.classList.toggle('hide', !any);
      });
      if (empty) empty.hidden = shown > 0;
    };

    formBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        form = btn.dataset.f;
        formBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        apply();
      });
    });

    tagBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.dataset.tag;
        var i = tags.indexOf(t);
        if (i > -1) tags.splice(i, 1); else tags.push(t);
        btn.setAttribute('aria-pressed', String(i === -1));
        apply();
      });
    });
  }

  /* ── 音: waveforms, mood wash, the note and the player ──
     Opening a row reveals what was written about the track and
     builds a Spotify player for it. The waveform is ornament —
     the sound comes from the embed.                          */
  function music() {
    var box = document.getElementById('tracks');
    if (!box) return;
    var wash = document.getElementById('wash');
    var items = Array.prototype.slice.call(box.querySelectorAll('.track-item'));
    var open = null;

    items.forEach(function (item) {
      var mood = item.dataset.mood || 'var(--accent)';
      var row = item.querySelector('.track');
      var wave = item.querySelector('.wave');

      if (wave) {
        var rnd = seedRand(item.dataset.seed || item.textContent);
        for (var k = 0; k < 34; k++) {
          var b = document.createElement('b');
          b.style.height = (4 + Math.round(rnd() * 20)) + 'px';
          b.style.setProperty('--k', k);
          wave.appendChild(b);
        }
      }

      item.addEventListener('mouseenter', function () {
        if (!wash) return;
        wash.style.setProperty('--wash', mood);
        wash.classList.add('on');
      });
      item.addEventListener('mouseleave', function () { if (wash) wash.classList.remove('on'); });

      row.addEventListener('click', function () { toggle(item); });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(item); }
      });
    });

    /* the iframe is created on first open and then left alone, so a track
       you come back to is still where you paused it */
    function mount(item) {
      var slot = item.querySelector('.track-player');
      if (!slot || slot.firstChild) return;
      var frame = document.createElement('iframe');
      frame.src = slot.dataset.embed;
      frame.loading = 'lazy';
      frame.title = '播放器';
      frame.allow = 'encrypted-media; clipboard-write; picture-in-picture';
      frame.setAttribute('frameborder', '0');
      slot.appendChild(frame);
    }

    /* one at a time — two players talking over each other is worse than
       having to click twice */
    function toggle(item) {
      var on = !item.classList.contains('open');
      if (open && open !== item) {
        open.classList.remove('open');
        open.querySelector('.track').setAttribute('aria-expanded', 'false');
      }
      item.classList.toggle('open', on);
      item.querySelector('.track').setAttribute('aria-expanded', String(on));
      open = on ? item : null;
      if (on) mount(item);
    }

    // 心情色谱 — the whole collection as one strip of colour
    var spec = document.getElementById('spectrum');
    if (spec) {
      items.forEach(function (item) {
        var b = document.createElement('b');
        b.style.background = item.dataset.mood || 'var(--muted)';
        b.title = item.dataset.seed || '';
        b.addEventListener('click', function () {
          item.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
          toggle(item);
        });
        spec.appendChild(b);
      });
    }
  }

  /* ── 影: attention, parallax, lightbox ── */
  function photos() {
    var grid = document.getElementById('grid');
    if (!grid) return;
    var lb = document.getElementById('lb');
    var lbImg = document.getElementById('lbImg');
    var lbTitle = document.getElementById('lbTitle');
    var lbMeta = document.getElementById('lbMeta');
    var active = null;
    var returnFocus = null;

    /* The lightbox is written inside <main>, and .shell opens a stacking
       context at z-index 1 — so however high the overlay's own z-index goes
       it still paints below the nav, which swallowed the close button. Lift
       it to the body, where its z-index means what it says. */
    if (lb.parentNode !== document.body) document.body.appendChild(lb);

    /* Only one photo is ever under the pointer, so one slot is enough. The
       cached box is in viewport coordinates, so scrolling invalidates it. */
    var dropBox = null;
    var forget = function () { if (dropBox) dropBox(); };
    addEventListener('scroll', forget, { passive: true });
    addEventListener('resize', forget);

    grid.querySelectorAll('.shot').forEach(function (fig) {
      var img = fig.querySelector('img');
      var open = function () { show(fig, img); };
      fig.addEventListener('click', open);
      fig.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); open(); }
      });
      // intent to look is a good moment to fetch the full file
      fig.addEventListener('mouseenter', function () { warm(fig); });
      fig.addEventListener('focus', function () { warm(fig); });
      fig.addEventListener('pointerdown', function () { warm(fig); }, { passive: true });

      /* The image drifts a few pixels against the cursor — just enough
         parallax to feel like it has depth, not enough to read as motion.
         Both halves of this used to happen inline on every mousemove: a
         getBoundingClientRect (a forced layout) and two style writes, at
         pointer rate, over a grid of full-bleed photos. The box is measured
         once per hover instead, and the write is folded into a frame. */
      if (!still) {
        var box = null, px = 0, py = 0, queued = false;
        var write = function () {
          queued = false;
          img.style.setProperty('--px', px + 'px');
          img.style.setProperty('--py', py + 'px');
        };
        var frame = function () {
          if (queued) return;
          queued = true;
          requestAnimationFrame(write);
        };
        fig.addEventListener('mouseenter', function () {
          box = fig.getBoundingClientRect();
          dropBox = function () { box = null; };
        });
        fig.addEventListener('mousemove', function (e) {
          if (!box) box = fig.getBoundingClientRect();
          px = (-((e.clientX - box.left) / box.width - 0.5) * 7).toFixed(2);
          py = (-((e.clientY - box.top) / box.height - 0.5) * 7).toFixed(2);
          frame();
        });
        fig.addEventListener('mouseleave', function () {
          dropBox = null;
          box = null; px = 0; py = 0;
          frame();
        });
      }
    });

    /* Full-size files are fetched ahead of the click. The first open used to
       start the zoom against an <img> with no bitmap yet, so its "after" box
       measured 0×0 and the photo appeared to collapse into the top-left
       corner before snapping back. Nothing animates until there is something
       real to animate to. */
    var cache = {};
    function warm(fig) {
      var url = fig.dataset.full;
      if (!url || cache[url]) return cache[url];
      var img = new Image();
      img.decoding = 'async';
      img.src = url;
      cache[url] = img;
      return img;
    }
    function show(fig, thumb) {
      var full = fig.dataset.full || '';
      var pre = warm(fig);
      /* Open with the already decoded preview. It has the same aspect ratio as
         the original, so switching to the sharp file later changes neither
         crop nor layout. The entrance itself only animates opacity/transform,
         which stays on the compositor instead of resizing a snapshot on every
         frame (the source of the old stutter). */
      var src = thumb.currentSrc || thumb.src;
      var w = +fig.dataset.w, h = +fig.dataset.h;

      // size the frame from metadata, never from whichever bitmap happens to
      // be in it — otherwise the high-resolution swap could cause a reflow
      if (w && h) {
        lbImg.style.aspectRatio = w + ' / ' + h;
        lbImg.style.width = 'min(100%, calc(78vh * ' + (w / h).toFixed(4) + '))';
        lbImg.style.height = 'auto';
      }
      lbImg.src = src;
      lbImg.alt = fig.dataset.title || '';
      lbTitle.textContent = fig.dataset.caption || '';
      lbMeta.textContent = fmt(fig.dataset.date || '') + ' · ' + (fig.dataset.title || '');
      lb.classList.remove('out');
      // Restart the entrance animation even if another photo is opened soon
      // after closing the previous one.
      void lb.offsetWidth;
      lb.classList.add('on');
      lb.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lb-open');
      returnFocus = fig;
      active = { fig: fig, thumb: thumb };
      requestAnimationFrame(function () {
        var close = document.getElementById('lbClose');
        if (close) close.focus({ preventScroll: true });
      });

      var sharpen = function () {
        if (!full || src === full) return;
        var swap = function () { if (active && active.fig === fig) lbImg.src = full; };
        /* Even a cached decode can briefly occupy the main thread. Wait until
           the entrance has finished before allowing the large bitmap swap. */
        var flightDone = new Promise(function (resolve) {
          setTimeout(resolve, still ? 0 : 380);
        });
        var decoded = pre && pre.decode
          ? pre.decode().catch(function () {})
          : new Promise(function (resolve) {
              if (!pre || pre.complete) resolve();
              else {
                pre.addEventListener('load', resolve, { once: true });
                pre.addEventListener('error', resolve, { once: true });
              }
            });
        Promise.all([flightDone, decoded]).then(swap);
      };

      sharpen();
    }

    function hide() {
      if (!lb.classList.contains('on') || !active) return;
      var closing = active;
      var done = function () {
        if (active !== closing) return;
        lb.classList.remove('out');
        lb.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('lb-open');
        active = null;
        if (returnFocus) returnFocus.focus({ preventScroll: true });
        returnFocus = null;
      };
      lb.classList.remove('on');
      if (still) { done(); return; }
      lb.classList.add('out');
      setTimeout(done, 260);
    }

    var close = document.getElementById('lbClose');
    if (close) close.addEventListener('click', hide);
    lb.addEventListener('click', function (e) { if (e.target === lb) hide(); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  }

  /* ── 文 single: reading line + hover footnotes ── */
  function article() {
    var art = document.querySelector('.prose');
    if (!art) return;

    var bar = document.getElementById('progress');
    if (bar) {
      var tick = function () {
        var r = art.getBoundingClientRect();
        var total = r.height - innerHeight * 0.7;
        var done = Math.min(Math.max(-r.top + innerHeight * 0.3, 0), Math.max(total, 1));
        bar.style.height = (done / Math.max(total, 1)) * 100 + 'vh';
      };
      tick();
      addEventListener('scroll', tick, { passive: true });
      addEventListener('resize', tick);
    }

    /* The margin holds a table of contents but had no idea where the reader
       was in it — so on anything longer than a screen it was a list of links
       rather than a position. Marking the section currently under the reading
       line turns it into one.

       Heading offsets are measured once and re-measured on resize and after
       the webfont lands, rather than on every scroll event: reading the
       position of a dozen headings per frame is a forced layout each time,
       and the answer only changes when the page reflows. */
    var margin = document.querySelector('.marginalia');
    var tocLinks = margin ? margin.querySelectorAll('a[href^="#"]') : [];
    if (tocLinks.length) {
      var heads = [], pos = [], current = null;
      tocLinks.forEach(function (a) {
        var id = decodeURIComponent(a.getAttribute('href').slice(1));
        var h = id && document.getElementById(id);
        if (h) heads.push({ el: h, link: a });
      });

      var measure = function () {
        pos = heads.map(function (h) { return h.el.getBoundingClientRect().top + scrollY; });
      };
      var spy = function () {
        if (!heads.length) return;
        // the reading line sits a third down the viewport, not at its top
        var y = scrollY + innerHeight * 0.3;
        var found = 0;
        for (var i = 0; i < pos.length; i++) { if (pos[i] <= y) found = i; else break; }
        if (found === current) return;
        if (current !== null && heads[current]) heads[current].link.classList.remove('on');
        current = found;
        heads[found].link.classList.add('on');
      };
      measure(); spy();
      addEventListener('scroll', spy, { passive: true });
      addEventListener('resize', function () { measure(); current = null; spy(); });
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { measure(); current = null; spy(); });
      }
    }

    /* the # in the gutter: put the section's URL on the clipboard and in the
       address bar, without the jump a bare anchor link would cause */
    art.querySelectorAll('.h-anchor').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var hash = a.getAttribute('href');
        var url = location.origin + location.pathname + hash;
        try { history.replaceState(null, '', hash); } catch (_) {}
        var flash = function () {
          a.classList.add('copied');
          setTimeout(function () { a.classList.remove('copied'); }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(flash, flash);
        } else { flash(); }
      });
    });

    var notes = art.querySelectorAll('.fn');
    if (!notes.length) return;
    var pop = document.createElement('div');
    pop.className = 'fn-pop';
    document.body.appendChild(pop);
    var hideTimer;
    notes.forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        clearTimeout(hideTimer);
        pop.textContent = el.dataset.fn || el.getAttribute('title') || '';
        var r = el.getBoundingClientRect();
        pop.style.visibility = 'hidden';
        pop.classList.add('on');
        requestAnimationFrame(function () {
          var w = pop.offsetWidth;
          pop.style.left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 12), innerWidth - w - 12) + 'px';
          pop.style.top = (r.bottom + scrollY + 10) + 'px';
          pop.style.visibility = 'visible';
        });
      });
      el.addEventListener('mouseleave', function () {
        hideTimer = setTimeout(function () { pop.classList.remove('on'); }, 120);
      });
    });
  }

  function boot() {
    theme();
    nav();
    continuity();
    palette();
    tilt();
    rings();
    poems();
    filters();
    music();
    photos();
    article();
    scanReveals();
    // last resort: nothing stays invisible for longer than a moment
    setTimeout(function () {
      document.querySelectorAll('.reveal, .marginalia').forEach(function (el) {
        el.classList.add('in');
      });
    }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
