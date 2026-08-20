/* ═══════════════════════════════════════════════════════════
   文 · 书架 + 卡片箱

   Two objects, two gestures, and both of them are the gesture that
   object actually has:

     书 —— 勾住书顶往外一带，抽出来，转过身看封面。
     卡 —— 拇指拨过去，一叠让开，抽一张出来。

   Neither is a modal. Both leave the furniture where it is: the book
   comes out of a gap that stays open behind it (the next book leans in),
   and the card comes forward out of a box that is still full.

   Everything degrades to links. Without this file the books are still
   <a> to the article and the cards are still <a> to the note — the CSS
   alone gives them a hover and nothing on the page is dead.
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var live = document.getElementById('shelfLive');
  function say(t) { if (live) live.textContent = t; }

  /* 两件家具共用的标签筛选，注册在这里，由各自实现 */
  var filters = [];

  /* ═══════════════════════════════════════════════════════
     书架
     ═══════════════════════════════════════════════════════ */
  (function shelf() {
    var caseEl = document.getElementById('case');
    var rp = document.getElementById('readpost');
    if (!caseEl || !rp) return;

    var books = Array.prototype.slice.call(caseEl.querySelectorAll('.book'));
    if (!books.length) return;

    var rpHint = document.getElementById('rpHint');
    var HINT = rpHint ? rpHint.textContent : '';
    var rpK = document.getElementById('rpK');
    var rpT = document.getElementById('rpT');
    var rpS = document.getElementById('rpS');
    var rpM = document.getElementById('rpM');
    var rpGo = document.getElementById('rpGo');
    var rpTags = document.getElementById('rpTags');
    var out = null;

    /* 一本书在架上就是一条 <a>，拖动它会触发浏览器自己的链接拖拽，
       把书从架子上「拽」出去 —— 那不是这里要的动作 */
    caseEl.addEventListener('dragstart', function (e) { e.preventDefault(); });

    function fill(b) {
      rpT.textContent = b.getAttribute('data-title') || '';
      rpS.textContent = b.getAttribute('data-summary') || '';
      rpM.textContent = b.getAttribute('data-date') + ' · '
        + b.getAttribute('data-words') + ' 字 · '
        + b.getAttribute('data-minutes') + ' 分钟';
      rpGo.setAttribute('href', b.getAttribute('data-url') || '#');

      rpTags.textContent = '';
      var tags = (b.getAttribute('data-tags') || '').split('|');
      tags.forEach(function (t) {
        if (!t) return;
        var s = document.createElement('span');
        s.textContent = t;
        rpTags.appendChild(s);
      });

      if (rpHint) rpHint.textContent = '摊开 · 《' + (b.getAttribute('data-title') || '') + '》';
      rp.setAttribute('data-state', 'open');
      if (!still) {
        rp.classList.remove('swap');
        void rp.offsetWidth;          /* 重排一次，动画才会重新播 */
        rp.classList.add('swap');
      }
    }

    function take(b) {
      if (out) out.classList.remove('out');
      out = b;
      b.classList.add('out');
      fill(b);
      say('抽出《' + b.getAttribute('data-title') + '》');
    }
    function shelve() {
      if (out) out.classList.remove('out');
      out = null;
      if (rpHint) rpHint.textContent = HINT;
      rp.setAttribute('data-state', 'empty');
      rp.classList.remove('swap');
    }

    caseEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.book') : null;
      if (!b || b.classList.contains('dim')) return;
      /* 已经抽出来的那一本，再点一次就是打开它读 ——
         先看封面再决定读不读，和真的从架上拿书是同一个顺序 */
      if (b === out) return;
      e.preventDefault();
      take(b);
    });

    document.getElementById('rpBack').addEventListener('click', shelve);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') shelve(); });

    filters.push(function (tag) {
      var n = 0;
      books.forEach(function (b) {
        var hit = tag === 'all' || (b.getAttribute('data-tags') || '').split('|').indexOf(tag) > -1;
        b.classList.toggle('dim', !hit);
        if (hit) n++;
      });
      if (out && out.classList.contains('dim')) shelve();
      return n;
    });
  })();

  /* ═══════════════════════════════════════════════════════
     卡片箱
     ═══════════════════════════════════════════════════════ */
  (function box() {
    var tray = document.getElementById('tray');
    var rank = document.getElementById('slots');
    var ticks = document.getElementById('ticks');
    if (!tray || !rank) return;

    var slots = Array.prototype.slice.call(rank.querySelectorAll('.slot'));
    var cards = slots.filter(function (s) { return s.classList.contains('card'); });
    if (!cards.length) return;

    /* 卡距由模板算死（mul $i 76），卡宽在窄屏上会变 —— 量一张，
       别把 262 写进来，否则窄屏下抽卡的边界钳制会算错位置 */
    var PITCH = 76, SIG = 130;
    var CARD_W = cards[0].offsetWidth || 262;
    slots.forEach(function (s) { s._x = parseFloat(s.style.getPropertyValue('--x')) || 0; });

    var span = slots[slots.length - 1]._x + CARD_W;
    var minSh = Math.min(0, tray.clientWidth - span);
    var shift = 0, picked = null, dragging = false, raf = 0;
    var navL = document.getElementById('navL');
    var navR = document.getElementById('navR');

    function setShift(v) {
      shift = Math.max(minSh, Math.min(0, v));
      rank.style.setProperty('--shift', shift.toFixed(1) + 'px');
      navL.disabled = shift >= -1;
      navR.disabled = shift <= minSh + 1;
    }
    addEventListener('resize', function () {
      minSh = Math.min(0, tray.clientWidth - span);
      setShift(shift);
    });

    /* ── 拨开 ────────────────────────────────────────────
       每张卡离指针多远，就决定它开多少、让多远、抬多高。
       g 是高斯：正对指针的那张 g=1，越远越接近 0。
       让位用的是高斯的导数形状 —— 指针正下方不动，两侧各推开一段，
       再往外又归零。这正是一叠卡被拇指拨开时的样子，也是它和
       「前后各两张、每张一个固定角度」那种写法的全部区别。 */
    function riffle(px) {
      slots.forEach(function (s) {
        if (s === picked || s.classList.contains('sunk')) return;
        var u = (px - (s._x + PITCH / 2)) / SIG;
        var g = Math.exp(-u * u);
        var dx = -70 * u * Math.exp(0.5 - 0.5 * u * u);
        s.style.translate = (s._x + dx).toFixed(1) + 'px '
          + (-22 * g).toFixed(1) + 'px ' + (78 * g).toFixed(1) + 'px';
        s.style.rotate = 'y ' + (48 - 33 * g).toFixed(2) + 'deg';
        s.classList.toggle('near', g > 0.6 && s.classList.contains('card'));
      });
    }
    function rest() {
      slots.forEach(function (s) {
        if (s === picked) return;
        s.style.translate = '';
        s.style.rotate = '';
        s.classList.remove('near');
      });
      rank.classList.remove('rifling');
    }

    if (!still) {
      tray.addEventListener('pointermove', function (e) {
        if (picked || dragging) return;
        var px = e.clientX - rank.getBoundingClientRect().left;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          rank.classList.add('rifling');
          riffle(px);
        });
      });
      tray.addEventListener('pointerleave', function () { if (!picked) rest(); });
    }

    /* ── 拖整排 ── */
    var down = null;
    tray.addEventListener('dragstart', function (e) { e.preventDefault(); });
    tray.addEventListener('pointerdown', function (e) {
      /* 上一次拖拽如果在箱子外面松的手，click 不会来，这个标记会留着
         把下一次点击吃掉 —— 每次按下先清一遍 */
      tray._justDragged = false;
      down = { x: e.clientX, shift: shift, moved: false };
      try { tray.setPointerCapture(e.pointerId); } catch (err) {}
    });
    tray.addEventListener('pointermove', function (e) {
      if (!down) return;
      var d = e.clientX - down.x;
      if (!down.moved && Math.abs(d) > 6) {
        down.moved = dragging = true;
        rank.classList.add('dragging');
        tray.classList.add('dragging');
        rest();
      }
      if (down.moved) setShift(down.shift + d);
    });
    function endDrag() {
      if (down && down.moved) tray._justDragged = true;
      down = null;
      dragging = false;
      rank.classList.remove('dragging');
      tray.classList.remove('dragging');
    }
    tray.addEventListener('pointerup', endDrag);
    tray.addEventListener('pointercancel', endDrag);

    /* ── 抽出来 / 放回去 ──────────────────────────────
       就地朝读者的方向拔（Z +140），只有当它的正面会顶出箱口时，
       才带着整排挪最少的一段。 */
    function pick(card) {
      release();
      picked = card;
      tray.classList.add('picked');
      card.classList.add('lift');
      card.classList.remove('near');
      card.style.translate = card._x + 'px -74px 140px';
      card.style.rotate = 'y 0deg';

      var left = card._x + shift, right = left + CARD_W;
      if (right > tray.clientWidth - 40) setShift(shift - (right - (tray.clientWidth - 40)));
      else if (left < 30) setShift(shift + (30 - left));

      markTick(cards.indexOf(card));
      say('抽出《' + (card.getAttribute('aria-label') || '') + '》');
    }
    function release() {
      if (picked) {
        picked.classList.remove('lift');
        picked.style.translate = '';
        picked.style.rotate = '';
        picked = null;
      }
      tray.classList.remove('picked');
      markTick(-1);
    }

    tray.addEventListener('click', function (e) {
      if (tray._justDragged) { tray._justDragged = false; e.preventDefault(); return; }
      var card = e.target.closest ? e.target.closest('.slot.card') : null;
      if (!card || card.classList.contains('sunk')) { release(); return; }
      /* 已经抽出来的那一张，再点一次就是打开它读 */
      if (card === picked) return;
      e.preventDefault();
      pick(card);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') release(); });

    navL.addEventListener('click', function () { release(); setShift(shift + 320); });
    navR.addEventListener('click', function () { release(); setShift(shift - 320); });

    /* ── 索引条：一格一张，高即字数，年份换处加一道分隔 ── */
    var maxW = cards.reduce(function (m, c) { return Math.max(m, +c.getAttribute('data-words') || 0); }, 1);
    var lastY = null;
    cards.forEach(function (c) {
      var t = document.createElement('button');
      t.type = 'button';
      t.className = 'tick';
      var y = c.getAttribute('data-year');
      if (y !== lastY) { t.classList.add('yr'); t.setAttribute('data-y', y); lastY = y; }
      t.style.setProperty('--h', Math.round(5 + ((+c.getAttribute('data-words') || 0) / maxW) * 24) + 'px');
      t.setAttribute('aria-label', c.getAttribute('aria-label') || '');
      t.appendChild(document.createElement('i'));
      t.addEventListener('click', function () {
        if (c.classList.contains('sunk')) return;
        setShift(320 - c._x);
        pick(c);
      });
      ticks.appendChild(t);
    });
    function markTick(i) {
      Array.prototype.forEach.call(ticks.children, function (t, k) { t.classList.toggle('on', k === i); });
    }

    filters.push(function (tag) {
      release();
      rest();          /* 隔板上也可能还留着拨开时写下的行内样式 */
      var n = 0;
      cards.forEach(function (c) {
        var hit = tag === 'all' || (c.getAttribute('data-tags') || '').split('|').indexOf(tag) > -1;
        c.classList.toggle('sunk', !hit);
        c.style.translate = '';
        c.style.rotate = '';
        if (hit) n++;
      });
      Array.prototype.forEach.call(ticks.children, function (t, k) {
        t.disabled = cards[k].classList.contains('sunk');
        t.style.opacity = t.disabled ? '.3' : '';
      });
      var foot = document.getElementById('boxFoot');
      if (foot) foot.textContent = n + ' 张' + (tag === 'all' ? '' : ' · #' + tag);
      return n;
    });

    setShift(0);
  })();

  /* ═══════════════════════════════════════════════════════
     标签 —— 一个筛选同时作用在两件家具上。
     书退到后面去，卡沉回箱底；两边的位置都一格不动，
     因为年份的结构不该被一次筛选改写。
     ═══════════════════════════════════════════════════════ */
  (function tagbar() {
    var bar = document.querySelector('.filters');
    if (!bar || !filters.length) return;
    var empty = document.getElementById('filterEmpty');

    bar.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tool[data-tag]') : null;
      if (!b) return;
      Array.prototype.forEach.call(bar.querySelectorAll('.tool[data-tag]'), function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      var tag = b.getAttribute('data-tag');
      var n = filters.reduce(function (sum, f) { return sum + f(tag); }, 0);
      if (empty) empty.hidden = n > 0;
      say(tag === 'all' ? '显示全部 ' + n + ' 篇' : '#' + tag + ' · ' + n + ' 篇');
    });
  })();
})();
