/* ═══════════════════════════════════════════════════════════
   诗 · 笺 — 拿起来读

   The page is a heap of 笺 on a desk. Each one carries both of its faces
   in the markup (see verse.css), so opening one is not a render: it is
   that element being moved out of the heap and into the reading frame,
   and changing which face it shows.

   That is precisely the shape a same-document view transition wants.
   Naming the sheet for the length of the flight makes the browser tween
   it between its two boxes, so a 208×290 slip lying at an angle in the
   corner of the desk becomes a full 笺 squared up in the middle of the
   screen. No flyer, no cloned node, no measuring: the two states are
   true DOM and the browser interpolates.

   Then the writing. The new state is captured with .ink off, so the
   sheet arrives blank; the class goes on afterwards and the 句 come in
   one line at a time. Paper first, ink second — which is the order it
   actually happens in.
   ═══════════════════════════════════════════════════════════ */

(function () {
  var heap  = document.getElementById('jianHeap');
  var lb    = document.getElementById('jianLb');
  var frame = document.getElementById('jianOpen');
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

  /* The sheets fall onto the desk once, on arrival. The class has to come off
     afterwards: a 笺 flying back from the reading frame re-matches .is-filed,
     and with the rule still live it would replay the whole drop instead of
     simply landing where it came from. */
  heap.classList.add('settling');
  setTimeout(function () { heap.classList.remove('settling'); },
    heap.querySelectorAll('.jian').length * 60 + 900);

  var live  = document.getElementById('jianLive');
  var close = document.getElementById('jianClose');
  var veil  = document.getElementById('jianVeil');

  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var busy = false;
  var open = null;   // the 笺 currently being read
  var home = null;   // where in the heap it came back to
  var from = null;   // what to give focus back to

  /* One flight, wrapped so open and close are the same three beats: name the
     sheet, let the browser morph it between the two states, unname it — and
     only then put the ink on.

     The name goes on BEFORE startViewTransition, which is the whole trick.
     The old state is snapshotted when that call is made, not when the
     callback runs, so a name written inside the callback exists only in the
     new state: the browser then has nothing to morph FROM, drops the old
     sheet into the root snapshot, and — because the root is deliberately
     held still here — the sheet you were reading simply blinks out of
     existence. It has to be named on both sides of the change. */
  function fly(el, mutate, after, back) {
    if (still || !document.startViewTransition) {
      mutate();
      if (after) after();
      return;
    }
    busy = true;
    root.classList.add('jian-swap');
    if (back) root.classList.add('jian-back');
    el.style.viewTransitionName = 'jian-open';

    var done = function () {
      el.style.viewTransitionName = '';
      root.classList.remove('jian-swap', 'jian-back');
      busy = false;
      if (after) after();
    };
    document.startViewTransition(mutate).finished.then(done, done);
  }

  /* The sheet must be painted once with its columns at opacity 0 before the
     class that moves them off it, or there is nothing to transition from. */
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

    var mutate = function () {
      frame.appendChild(el);
      el.classList.remove('is-filed', 'is-open', 'ink');
      el.classList.add('is-read');
      el.setAttribute('tabindex', '-1');
      lb.classList.add('on');
      lb.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lb-open');
      var tab = el.querySelector('.jian-tab');
      if (tab) tab.setAttribute('aria-expanded', 'false');
      open = el;
    };

    var land = function () {
      ink(el);
      if (close) close.focus({ preventScroll: true });
      if (live) {
        var t = el.querySelector('.jh-title');
        var g = el.querySelector('.jian-tag');
        live.textContent = '已展开 ' + (g ? g.textContent : '') + (t ? ' · ' + t.textContent : '');
      }
      try { history.replaceState(null, '', '#' + el.dataset.slug); } catch (e) {}
    };

    if (instant) { mutate(); land(); return; }
    /* a sheet still mid-drop would replay the drop when it comes back */
    heap.classList.remove('settling');
    fly(el, mutate, land);
  }

  function hide() {
    if (busy || !open) return;
    var el = open;

    fly(el, function () {
      heap.insertBefore(el, home);
      el.classList.remove('is-read', 'is-open', 'ink');
      el.classList.add('is-filed');
      el.removeAttribute('tabindex');
      lb.classList.remove('on');
      lb.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lb-open');
      open = null;
    }, function () {
      if (from) from.focus({ preventScroll: true });
      from = null;
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }, true);
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

  /* /poems/#zhe-gu-tian arrives with that 笺 already open. No flight for
     that one — there is no heap position for the eye to have followed it from. */
  var want = decodeURIComponent((location.hash || '').slice(1));
  if (want) {
    sheets.forEach(function (el) {
      if (el.dataset.slug === want) show(el, true);
    });
  }
})();
