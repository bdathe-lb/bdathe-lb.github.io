/* ═══════════════════════════════════════════════════════════
   影 · 相册 —— 翻页 与 拿起来

   两件事，都是"同一个元素换个位置"，不是重新渲染：

     翻页 —— 翻动的那一叶有正反两个真面。正面是刚才那一页的拷贝，
             背面是即将到来的那一页的拷贝，整叶绕订口转 180°。
             下面的跨页在翻页一开始就换成新的了（右半边露出来的必须
             是新的那一页），所以左半边额外压一张旧页的拷贝，等翻动
             的那一叶落到它上面，两者同时撤走。

     看图 —— 那张 <a class="photo"> 被从相角里搬进看图位。搬的是元素
             本身，所以这正是 same-document view transition 想要的形状：
             给它一个名字，让浏览器在两个盒子之间补间，再把名字摘掉。
             相角画在 .mount 上，留在原地 —— 那正是这个方向要说的事。

   没有这个文件，四叶顺着铺下来仍是一本能看完的相册，每张照片仍是
   通往原图的链接。album.css 末尾那段 :not(.album-live) 就是那条路。
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var book = document.getElementById('alBook');
  var turner = document.getElementById('alTurner');
  var lb = document.getElementById('alLb');
  var frame = document.getElementById('alFrame');
  if (!book || !turner || !lb || !frame) return;

  var spreads = Array.prototype.slice.call(book.querySelectorAll('.spread'));
  if (!spreads.length) return;

  var root = document.documentElement;
  /* 模板里已经写过一次（要赶在第一帧之前），这里补一次是为了这个文件
     单独被引用时也成立 */
  root.classList.add('album-live');

  /* 看图位写在 <main> 里，而 .shell 在 z-index:1 上开了一个层叠上下文 ——
     于是它自己的 z-index 写多高都没用，整块仍然压在导航栏（z-index:40）
     底下，右上角那个 ✕ 正好被导航栏吃掉。抬到 body 上，z-index 才是它
     字面的意思。app.js 里 /photos/ 的灯箱是同一个坑，同一个解法。 */
  if (lb.parentNode !== document.body) document.body.appendChild(lb);

  var front = turner.querySelector('.face.front');
  var back = turner.querySelector('.face.back');
  var live = document.getElementById('alLive');
  var veil = document.getElementById('alVeil');
  var closeBtn = document.getElementById('alClose');
  var capT = document.getElementById('alCapT');
  var capM = document.getElementById('alCapM');

  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var narrow = matchMedia('(max-width: 860px)');

  /* 压页由脚本造：它纯粹是翻页这一下的产物，没有脚本时不该存在 */
  var hold = document.createElement('div');
  hold.className = 'holdover';
  hold.setAttribute('aria-hidden', 'true');
  book.appendChild(hold);

  var cur = 0;
  var busy = false;
  var pending = -1;
  var timers = [];

  function say(t) { if (live) live.textContent = t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function fmt(d) { return (d || '').replace(/-/g, '.'); }

  /* ── 翻页 ─────────────────────────────────────────── */

  function paint(n) {
    spreads.forEach(function (el, i) {
      el.classList.toggle('on', i === n);
      el.setAttribute('aria-hidden', i === n ? 'false' : 'true');
    });
    cur = n;
  }

  function finishTurn() {
    if (!busy) return;
    clearTimers();
    var n = pending;
    turner.className = 'turner';
    hold.className = 'holdover';
    /* 再 paint 一次兜底，而且它是幂等的：标签页在后台时 rAF 根本不跑，
       上面那次换跨页就没发生过，翻页会静悄悄地失效。 */
    if (n >= 0) paint(n);
    pending = -1;
    busy = false;
    announce();
  }

  /* 转满了 180° 就立刻撤。用固定 820ms 的话，前进那一下动画 740ms 就
     停了，剩下八九十毫秒 3D 那一叶还压在真叶子上 —— 透视里对不齐的
     半个像素会看成重影，然后"啪"地消失。animationend 冒泡，硫酸纸和
     背光的动画也在这棵树上，只认转页自己的名字。 */
  turner.addEventListener('animationend', function (e) {
    if (e.target !== turner) return;
    if (e.animationName !== 'turnF' && e.animationName !== 'turnB') return;
    finishTurn();
  });

  function turn(next) {
    if (busy || next === cur || next < 0 || next >= spreads.length) return;
    var dir = next > cur ? 'f' : 'b';

    /* 窄屏上没有订口可绕，立体翻页也就无从谈起 —— 换成整页推走，
       方向仍然跟着翻页的方向 */
    if (still || narrow.matches || !turner.animate) {
      var to = spreads[next];
      to.style.setProperty('--dir', dir === 'f' ? '24px' : '-24px');
      paint(next);
      announce();
      return;
    }

    busy = true;
    pending = next;
    clearTimers();

    var from = spreads[cur];
    var into = spreads[next];
    /* 一张纸的正面是"刚才的那一页"，背面是"即将到来的那一页" ——
       前进时是 旧右 / 新左，后退时是 旧左 / 新右 */
    var faceF = from.querySelector(dir === 'f' ? '.leaf.r' : '.leaf.l');
    var faceB = into.querySelector(dir === 'f' ? '.leaf.l' : '.leaf.r');
    var keep = from.querySelector(dir === 'f' ? '.leaf.l' : '.leaf.r');

    front.replaceChildren(leafClone(faceF));
    back.replaceChildren(leafClone(faceB));
    hold.replaceChildren(leafClone(keep));
    hold.className = 'holdover on ' + (dir === 'f' ? 'l' : 'r');
    turner.className = 'turner on ' + dir;

    /* 先摆好拷贝、再换底下的跨页、下一帧才开转。

       三张拷贝的排版、绘制，加上合成层的建立，不能挤在动画第 0 帧 ——
       那一下就是"点下去先顿一住"。.on 只负责显示，.go 才带动画。

       paint(next) 也必须在开转之前：跨页已经叠在同一个盒子里，换的是
       visibility，本身不重排；但还是要让新的那一叶在被盖住的时候画完，
       转到一半露出来的才是已经在 GPU 里的纸，不是一块刚解码的空相框。 */
    void turner.offsetWidth;
    paint(next);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (!busy) return;                 /* 中途被打断就不转了 */
        turner.classList.add('go');
      });
    });

    /* animationend 才是正路。这条超时只防动画没发出结束（去了后台、
       中途被切到窄屏）。到点了而 end 已经来过，finishTurn 是空操作。 */
    timers.push(setTimeout(finishTurn, 1200));
  }

  /* 每一叶只拷一次，之后反复用同一个节点 —— 每次翻页都重新 cloneNode
     整叶（连同里面的 <img>）是白花的功夫，而且正好花在最不该花的那一帧。
     一次翻页里 front / back / 压页 用到的必是三张不同的叶子，所以一叶
     一个节点够用。 */
  var clones = [];
  function leafClone(leaf) {
    var i = leaf.dataset.leaf;
    if (!clones[i]) clones[i] = clean(leaf);
    return clones[i];
  }

  /* 拷贝进去的那一叶不该再被找到第二次：id 会重、焦点会跑进去，
     链接也不该是活的 */
  function clean(leaf) {
    var c = leaf.cloneNode(true);
    c.removeAttribute('id');
    c.setAttribute('aria-hidden', 'true');
    c.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
    c.querySelectorAll('a, button').forEach(function (el) {
      el.setAttribute('tabindex', '-1');
      el.removeAttribute('href');
    });
    return c;
  }

  function announce() {
    var t = spreads[cur].querySelector('.leaf-t b');
    say('第 ' + (cur + 1) + ' / ' + spreads.length + ' 跨页' + (t ? ' · ' + t.textContent : ''));
  }

  paint(0);

  /* 把每一叶的拷贝和每一张图的解码都提前做掉。点下去那一帧再 clone
     整叶、再让刚显出来的 <img> 解码，代价正好打在手指上。 */
  spreads.forEach(function (s) {
    s.querySelectorAll('.leaf').forEach(function (leaf) { leafClone(leaf); });
    s.querySelectorAll('img').forEach(function (img) {
      if (img.decode) img.decode().catch(function () {});
    });
  });

  /* ── 拿起来 ───────────────────────────────────────── */

  var open = null;   // 手上的那一张
  var home = null;   // 它原来贴在哪一个相角里
  var flying = false;

  /* 一次飞行，开合共用：给照片起名 → 让浏览器在两个盒子之间补间 →
     把名字摘掉。名字必须在 startViewTransition 之前写上 —— 旧状态是
     在那一刻被快照的，写在回调里的名字只存在于新状态，浏览器就没有
     可以补间的起点，照片会直接消失。 */
  function fly(el, mutate, after, back) {
    if (still || !document.startViewTransition) {
      mutate();
      if (after) after();
      return;
    }
    flying = true;
    root.classList.add('album-swap');
    if (back) root.classList.add('album-back');
    el.style.viewTransitionName = 'photo-open';

    var done = function () {
      el.style.viewTransitionName = '';
      root.classList.remove('album-swap', 'album-back');
      flying = false;
      if (after) after();
    };
    document.startViewTransition(mutate).finished.then(done, done);
  }

  /* ── 大图：在按下之前就备好 ───────────────────────
     贴在台纸上的是 900px 的那一版，拿到手上要看 1800px 的。原来的做法
     是等飞行落定再换，于是照片总要在停稳之后再"清"一下 —— 那一下很
     显眼，因为它发生在动画刚结束、眼睛正盯着它的时刻。

     现在改成：指针一落到照片上（或者它拿到焦点、或者刚按下去）就先把
     大图取来解码好。等真的点下去时它多半已经躺在内存里，于是换 src 这
     件事可以放进 mutate 里 —— view transition 拍新状态的那一帧拍到的
     就已经是清晰的那张，全程没有"先糊后清"。

     没来得及备好的情况（点得太快、网太慢）还走老路：落定之后再换。 */
  var ready = Object.create(null);   // full url -> true，已解码
  var warming = Object.create(null); // full url -> Promise，正在解码

  function warm(a) {
    var full = a && a.dataset.full;
    if (!full || ready[full] || warming[full]) return;
    var pre = new Image();
    pre.src = full;
    var done = pre.decode ? pre.decode() : Promise.resolve();
    warming[full] = done.then(function () { ready[full] = true; },
                              function () { /* 取不到就算了，老路兜着 */ });
  }

  function sharpen(a) {
    var img = a.querySelector('img');
    var full = a.dataset.full;
    if (!img || !full || img.src.indexOf(full) > -1) return;
    if (!a.dataset.thumb) a.dataset.thumb = img.getAttribute('src');

    var put = function () { if (open === a) { img.src = full; ready[full] = true; } };

    /* 悬停的时候就备好了：这时换只是下一帧的事，照片已经停稳，
       看不出换过。 */
    if (ready[full]) { requestAnimationFrame(put); return; }

    /* 没备好才走慢路 —— 等它解码完，也等飞行确实落定，
       别把一次解码插进动画里。 */
    var pre = new Image();
    pre.src = full;
    var decoded = pre.decode ? pre.decode().catch(function () {}) : Promise.resolve();
    var landed = new Promise(function (r) { setTimeout(r, still ? 0 : 420); });
    Promise.all([decoded, landed]).then(put);
  }

  /* 四个角在照片进出的那一下张一下又合上。类名要先摘掉再重排一次，
     否则同一个动画不会重播。 */
  function flexCorners(mount) {
    if (still || !mount) return;
    mount.classList.remove('corner-flex');
    void mount.offsetWidth;
    mount.classList.add('corner-flex');
    setTimeout(function () { mount.classList.remove('corner-flex'); }, 620);
  }

  function show(a) {
    if (flying || open || busy) return;
    home = a.parentNode;

    /* 照片一走，这一格就只剩 18px 的内边距，整叶往上跳两百像素 ——
       纱底下的相册整个重排，放回来再跳回去。先把当前高度钉住，那一格
       就成了一个空着的相角，而不是一个消失的洞。 */
    home.style.height = home.offsetHeight + 'px';

    fly(a, function () {
      frame.appendChild(a);
      home.classList.add('is-lent');
      lb.classList.add('on');
      lb.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lb-open');
      if (capT) capT.textContent = a.dataset.caption || a.dataset.title || '';
      if (capM) capM.textContent = fmt(a.dataset.date) + ' · ' + (a.dataset.title || '');
      open = a;
    }, function () {
      if (closeBtn) closeBtn.focus({ preventScroll: true });
      sharpen(a);
      say('已打开 ' + (a.dataset.title || '') + ' · ' + (a.dataset.caption || ''));
    });
  }

  function hide() {
    if (flying || !open) return;
    var a = open;
    var mount = home;

    fly(a, function () {
      mount.appendChild(a);
      mount.classList.remove('is-lent');
      lb.classList.remove('on');
      lb.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lb-open');
      open = null;
    }, function () {
      /* 大图换回小图要等飞行结束，不然收回去的路上会重新解码一次。
         已经备好的那张就留着 —— 再点开一次就是即时的。 */
      var img = a.querySelector('img');
      var full = a.dataset.full;
      if (img && a.dataset.thumb && !(full && ready[full])) img.src = a.dataset.thumb;
      mount.style.height = '';
      a.focus({ preventScroll: true });
      home = null;
      /* 相角只在放回来的时候弹：飞行期间 root 被按住不动，页面画的是
         快照，任何在册子上跑的动画都看不见；而且开着的时候相册还压在
         97% 的纱底下。落回相角的这一下才是有人在看的那一刻。 */
      flexCorners(mount);
    }, true);
  }

  /* 想看它，就是取大图的时机 —— 指针落上去、拿到焦点、刚按下去。
     等松手才开始取，那半秒钟正好落在动画里。 */
  ['pointerover', 'focusin', 'pointerdown'].forEach(function (ev) {
    book.addEventListener(ev, function (e) {
      var a = e.target.closest && e.target.closest('.photo');
      if (a && !a.closest('.turner') && !a.closest('.holdover')) warm(a);
    }, { passive: true });
  });

  /* 每张照片本身是一条通往原图的链接，没有脚本时点开就是那张图；
     有脚本时这一下归我们。 */
  book.addEventListener('click', function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    if (e.target.closest('.turner') || e.target.closest('.holdover')) {
      e.preventDefault();
      return;
    }
    var a = e.target.closest('.photo');
    if (a) {
      e.preventDefault();
      show(a);
      return;
    }
    /* 点台纸翻页：左叶往后，右叶往前。照片自己仍是拿起来看。 */
    var leaf = e.target.closest('.leaf');
    if (!leaf) return;
    if (leaf.classList.contains('r')) turn(cur + 1);
    else if (leaf.classList.contains('l')) turn(cur - 1);
  });

  if (closeBtn) closeBtn.addEventListener('click', hide);
  if (veil) veil.addEventListener('click', hide);
  frame.addEventListener('click', function (e) {
    if (e.target.closest('.photo')) hide();
  });

  addEventListener('keydown', function (e) {
    /* ⌘K 浮在所有东西上面，它开着的时候 Escape 是它的 */
    if (document.querySelector('.cmdk.on')) return;
    if (open) {
      if (e.key === 'Escape') { e.preventDefault(); hide(); }
      return;
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); turn(cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); turn(cur - 1); }
  });
})();
