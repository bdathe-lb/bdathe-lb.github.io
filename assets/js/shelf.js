/* ═══════════════════════════════════════════════════════════
   文 · 书架 + 卡片箱

   Two objects, one gesture each, and both of them are the gesture that
   object actually has:

     书 —— 勾住书顶往外一带，抽出来，转过身看封面。
     卡 —— 从箱里提起一截，抽出来。

   Whichever comes out, its particulars open in the one panel under the
   furniture (#readpost) — a book or a card taken out and laid on the
   table. Only one thing is out at a time; taking another puts the first
   back. A second click on what is already out opens it to read.

   Neither is a modal. Both leave the furniture where it is: the book
   comes out of a gap that stays open behind it (the next book leans in),
   and the card rises out of a box that is still full.

   Everything degrades to links. Without this file the books are still
   <a> to the article and the cards are still <a> to the note — the CSS
   alone gives them a hover and nothing on the page is dead.
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var live = document.getElementById('shelfLive');
  function say(t) { if (live) live.textContent = t; }

  var rp = document.getElementById('readpost');
  var caseEl = document.getElementById('case');
  var tray = document.getElementById('tray');
  if (!rp || (!caseEl && !tray)) return;

  var rpK = document.getElementById('rpK');
  var rpT = document.getElementById('rpT');
  var rpS = document.getElementById('rpS');
  var rpM = document.getElementById('rpM');
  var rpGo = document.getElementById('rpGo');
  var rpTags = document.getElementById('rpTags');

  var books = caseEl ? Array.prototype.slice.call(caseEl.querySelectorAll('.book')) : [];
  var cards = tray ? Array.prototype.slice.call(tray.querySelectorAll('.slot.card')) : [];
  var out = null;

  /* 一本书、一张卡在架上都是一条 <a>，拖动它会触发浏览器自己的链接拖拽，
     把它从家具里「拽」出去 —— 那不是这里要的动作 */
  [caseEl, tray].forEach(function (el) {
    if (el) el.addEventListener('dragstart', function (e) { e.preventDefault(); });
  });

  function fill(el) {
    var isCard = el.classList.contains('card');
    rpK.textContent = isCard ? '笔记 · 从卡片箱里抽出' : '随笔 · 从书架上抽出';
    rpT.textContent = el.getAttribute('data-title') || '';
    rpS.textContent = el.getAttribute('data-summary') || '';
    rpM.textContent = el.getAttribute('data-date') + ' · '
      + el.getAttribute('data-words') + ' 字 · '
      + el.getAttribute('data-minutes') + ' 分钟';
    rpGo.setAttribute('href', el.getAttribute('data-url') || '#');

    rpTags.textContent = '';
    (el.getAttribute('data-tags') || '').split('|').forEach(function (t) {
      if (!t) return;
      var s = document.createElement('span');
      s.textContent = t;
      rpTags.appendChild(s);
    });

    rp.setAttribute('data-state', 'open');
    if (!still) {
      rp.classList.remove('swap');
      void rp.offsetWidth;          /* 重排一次，动画才会重新播 */
      rp.classList.add('swap');
    }
  }

  function take(el) {
    if (out) out.classList.remove('out');
    out = el;
    el.classList.add('out');
    if (tray) tray.classList.toggle('picked', el.classList.contains('card'));
    fill(el);
    say('抽出《' + el.getAttribute('data-title') + '》');
  }
  function shelve() {
    if (out) out.classList.remove('out');
    out = null;
    if (tray) tray.classList.remove('picked');
    rp.setAttribute('data-state', 'empty');
    rp.classList.remove('swap');
  }

  function grab(sel, dimClass) {
    return function (e) {
      var el = e.target.closest ? e.target.closest(sel) : null;
      if (!el || el.classList.contains(dimClass)) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
      /* 已经抽出来的那一件，再点一次就是打开它读 ——
         先看一眼再决定读不读，和真的从架上拿书是同一个顺序 */
      if (el === out) return;
      e.preventDefault();
      take(el);
    };
  }
  if (caseEl) caseEl.addEventListener('click', grab('.book', 'dim'));
  if (tray) tray.addEventListener('click', grab('.slot.card', 'sunk'));

  /* 点房间别处，把抽出来的放回去。摊开的那一栏除外：
     那里还承担「读全文」。 */
  document.addEventListener('click', function (e) {
    if (!out) return;
    var t = e.target;
    if (out.contains(t) || rp.contains(t)) return;
    var other = t.closest ? t.closest('.book, .slot.card') : null;
    if (other && !other.classList.contains('dim') && !other.classList.contains('sunk')) return;
    shelve();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') shelve(); });

  /* ═══════════════════════════════════════════════════════
     标签 —— 一个筛选同时作用在两件家具上。
     书退到后面去，卡沉回箱底；两边的位置都一格不动，
     因为年份的结构不该被一次筛选改写。
     ═══════════════════════════════════════════════════════ */
  (function tagbar() {
    var bar = document.querySelector('.filters');
    if (!bar) return;
    var empty = document.getElementById('filterEmpty');
    var hit = function (el, tag) {
      return tag === 'all' || (el.getAttribute('data-tags') || '').split('|').indexOf(tag) > -1;
    };

    bar.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tool[data-tag]') : null;
      if (!b) return;
      Array.prototype.forEach.call(bar.querySelectorAll('.tool[data-tag]'), function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      var tag = b.getAttribute('data-tag');
      var n = 0;
      books.forEach(function (el) { var h = hit(el, tag); el.classList.toggle('dim', !h); if (h) n++; });
      cards.forEach(function (el) { var h = hit(el, tag); el.classList.toggle('sunk', !h); if (h) n++; });
      if (out && (out.classList.contains('dim') || out.classList.contains('sunk'))) shelve();
      if (empty) empty.hidden = n > 0;
      say(tag === 'all' ? '显示全部 ' + n + ' 篇' : '#' + tag + ' · ' + n + ' 篇');
    });
  })();
})();
