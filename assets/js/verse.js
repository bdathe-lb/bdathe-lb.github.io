/* ═══════════════════════════════════════════════════════════
   诗 · 笺 — 拿起来读

   The page is one long desk of 笺. Each one carries both of its faces in
   the markup (see verse.css), so opening one is not a render: it is that
   element being moved out of the heap and into the reading frame, and
   changing which face it shows.

   How it moves. This used to be a same-document view transition that
   morphed the slip on the desk into the sheet in the frame. The two faces
   share nothing — a 208×290 slip, 竖排 and leaning, against a 468-wide
   sheet set 横排 and square — so the browser could only stretch one
   screenshot into the other and cross-fade them, and every open began with
   a whole-page snapshot that held the page still for a frame or two. It
   read as a stutter, not a gesture.

   So now it is two plain moves, both on transform and opacity only:
     拿起 — the slip lifts a little off the desk and fades;
     铺开 — the paper wash comes up, and the sheet rises into place.
   Putting it down is the same in reverse, a little quicker. Then the
   writing: the sheet arrives blank and the 句 come in one line at a time.
   Paper first, ink second — the order it actually happens in.
   ═══════════════════════════════════════════════════════════ */

(function () {
  var heap   = document.getElementById('jianHeap');
  var scroll = document.getElementById('jianScroll');
  var lb     = document.getElementById('jianLb');
  var frame  = document.getElementById('jianOpen');
  if (!heap || !lb || !frame) return;

  var sheets = Array.prototype.slice.call(heap.querySelectorAll('.jian'));
  if (!sheets.length) return;

  var root = document.documentElement;

  /* Everything that depends on this script hangs off .jian-live, and this
     line runs during parse (the tag carries no defer). So a 词 is never
     painted already inked on a page whose script then fails to load —
     without JS the sheets are simply links to /poems/#slug. */
  root.classList.add('jian-live');
  try { localStorage.removeItem('verse-mode'); } catch (e) {}

  /* The sheets fall onto the desk once, on arrival. The class has to come
     off afterwards, or a 笺 put back on the desk would replay the drop. */
  heap.classList.add('settling');
  setTimeout(function () { heap.classList.remove('settling'); }, sheets.length * 60 + 900);

  /* 字先到. The 文楷 webfont is cut into a few hundred unicode-range subsets
     and the browser fetches only those it has had to draw. A slip on the
     desk shows one line of its 词; the reading face shows all of it, and
     most of those characters have never been drawn — so the first time a
     词 was opened its subsets arrived mid-animation and the text re-set
     itself. Asking for them ahead of time (for one sheet the moment the
     pointer reaches it, for all of them once the page has sat idle) means
     the ink is there when the paper is. */
  var warmed = {};
  var face = (getComputedStyle(root).getPropertyValue('--serif') || '').split(',')[0].trim();
  function warm(el) {
    if (!face || !document.fonts || !document.fonts.load) return;
    var slug = el.dataset.slug;
    if (!slug || warmed[slug]) return;
    warmed[slug] = true;
    document.fonts.load('400 1rem ' + face, el.textContent).catch(function () {});
  }
  ['pointerover', 'focusin'].forEach(function (ev) {
    heap.addEventListener(ev, function (e) {
      var el = e.target.closest && e.target.closest('.jian');
      if (el) warm(el);
    }, { passive: true });
  });
  (window.requestIdleCallback || function (f) { setTimeout(f, 1); })(function () {
    setTimeout(function () { sheets.forEach(warm); }, 2000);
  });

  var live  = document.getElementById('jianLive');
  var close = document.getElementById('jianClose');
  var veil  = document.getElementById('jianVeil');

  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var busy = false;
  var open = null;   // the 笺 currently being read
  var home = null;   // where in the heap it goes back to
  var from = null;   // what to give focus back to

  /* ── 长案 ─────────────────────────────────────────────────
     With more 词 than fit, the desk runs off to the left. The scroller is
     direction: rtl, so it opens at the newest end with no script at all;
     here it only learns whether it is at the far end (to drop the fade that
     says "there is more this way"), and a mouse can drag it. Trackpads and
     touch scroll it natively. */
  if (scroll && scroll.classList.contains('long')) {
    var edge = function () {
      var max = scroll.scrollWidth - scroll.clientWidth;
      /* rtl scrollLeft runs from 0 at the right end to −max at the left */
      scroll.classList.toggle('at-start', scroll.scrollLeft <= -max + 2);
    };
    scroll.addEventListener('scroll', edge, { passive: true });
    addEventListener('resize', edge);
    edge();

    var drag = null;
    scroll.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, left: scroll.scrollLeft, moved: false };
    });
    addEventListener('pointermove', function (e) {
      if (!drag) return;
      var d = e.clientX - drag.x;
      if (!drag.moved && Math.abs(d) < 6) return;
      drag.moved = true;
      scroll.classList.add('dragging');
      scroll.scrollLeft = drag.left - d;
    });
    addEventListener('pointerup', function () {
      if (!drag) return;
      var moved = drag.moved;
      drag = null;
      scroll.classList.remove('dragging');
      /* a drag that ends on a slip must not also open it */
      if (moved) {
        var eat = function (e) { e.preventDefault(); e.stopPropagation(); };
        scroll.addEventListener('click', eat, { capture: true, once: true });
        setTimeout(function () { scroll.removeEventListener('click', eat, true); }, 0);
      }
    });
    scroll.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  /* ── 拿起 / 放下 ──────────────────────────────────────────
     Every beat is a class and a timer, on transform and opacity only: the
     compositor can run all of it without a layout or a paint. The lengths
     live in verse.css; these are just when to move on to the next beat. */
  var LIFT = 140, RISE = 300, SINK = 180;

  /* the sheet must be painted once with its lines at opacity 0 before the
     class that brings them in, or there is nothing to transition from */
  function ink(el) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add('ink'); });
    });
  }

  function show(el, instant) {
    if (busy || open === el) return;
    from = el.querySelector('.jian-grab');
    /* remembered as a sibling reference rather than an index: the heap is
       absolutely placed and its DOM order is the poems' order, so putting
       the sheet back in front of whatever followed it restores both */
    home = el.nextElementSibling;
    heap.classList.remove('settling');

    var into = function () {
      el.classList.remove('lifting', 'is-filed', 'is-open', 'ink');
      el.classList.add('is-read');
      el.setAttribute('tabindex', '-1');
      frame.appendChild(el);
      var tab = el.querySelector('.jian-tab');
      if (tab) {
        tab.setAttribute('aria-expanded', 'false');
        tab.querySelector('span').textContent = '今译';
      }
      lb.classList.add('on');
      lb.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lb-open');
      open = el;
    };

    var settled = function () {
      lb.classList.remove('rising');
      busy = false;
      ink(el);
      if (close) close.focus({ preventScroll: true });
      if (live) {
        var t = el.querySelector('.jh-title');
        var g = el.querySelector('.jian-tag');
        live.textContent = '已展开 ' + (g ? g.textContent : '') + (t ? ' · ' + t.textContent : '');
      }
      try { history.replaceState(null, '', '#' + el.dataset.slug); } catch (e) {}
    };

    if (instant || still) { into(); settled(); return; }

    busy = true;
    el.classList.add('lifting');               // 拿起
    setTimeout(function () {
      lb.classList.add('rising');              // 铺开
      into();
      setTimeout(settled, RISE);
    }, LIFT);
  }

  function hide() {
    if (busy || !open) return;
    var el = open;

    var back = function () {
      heap.insertBefore(el, home);
      el.classList.remove('is-read', 'is-open', 'ink');
      el.classList.add('is-filed');
      el.removeAttribute('tabindex');
      lb.classList.remove('on', 'sinking');
      lb.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lb-open');
      open = null;
    };
    var after = function () {
      busy = false;
      if (from) from.focus({ preventScroll: true });
      from = null;
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    };

    if (still) { back(); after(); return; }

    busy = true;
    lb.classList.add('sinking');               // 收起
    setTimeout(function () {
      back();
      el.classList.add('landing');             // 放回案上
      setTimeout(function () { el.classList.remove('landing'); after(); }, SINK + 40);
    }, SINK);
  }

  /* The hit target is an <a> to /poems/#slug so the page still works without
     this script; with it, the click is ours. */
  heap.addEventListener('click', function (e) {
    var a = e.target.closest('.jian-grab');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    show(a.closest('.jian'));
  });

  frame.addEventListener('click', function (e) {
    var tab = e.target.closest('.jian-tab');
    if (!tab) return;
    var art = tab.closest('.jian');
    var on = art.classList.toggle('is-open');
    tab.setAttribute('aria-expanded', on ? 'true' : 'false');
    tab.querySelector('span').textContent = on ? '收起' : '今译';
  });

  if (close) close.addEventListener('click', hide);
  if (veil) veil.addEventListener('click', hide);

  addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !open) return;
    /* ⌘K sits on top of everything and owns Escape while it is up */
    if (document.querySelector('.cmdk.on')) return;
    hide();
  });

  /* /poems/#zhe-gu-tian arrives with that 笺 already open. No motion for
     that one — there is no place on the desk the eye followed it from. */
  var want = decodeURIComponent((location.hash || '').slice(1));
  if (want) {
    sheets.forEach(function (el) {
      if (el.dataset.slug === want) show(el, true);
    });
  }
})();
