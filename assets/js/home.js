/* ═══════════════════════════════════════════════════════════
   案头 —— 首页
   只由 layouts/index.html 加载。app.js 照常在跑（导航、⌘K、
   .reveal、行迹都归它），这里只管这一页自己的那张图。

   一个分钟数，五个结果：

     日头在窗里的位置 · 两道光线的斜度 · 桌上光斑的落点 ·
     每件物件脚下排线的方向和长短 · 白天还是夜里

   这样"时刻"就不是画上去的装饰，而是整幅图的一个参数 —— 和页面背景
   读的是同一个钟（head_theme.html），所以窗里的天色和纸的颜色永远
   对得上。
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var plate = document.getElementById('stPlate');
  if (!plate) return;

  /* ── 钟 ────────────────────────────────────────────────
     日和月共用一条弧：05:00 从窗的左下角升起，12:30 到顶，20:00 落到
     右下角；20:00 到次日 05:00 换月牙，沿同一条弧再走一遍。落山定在
     20:00 而不是 21:00，是为了不出现"纸已经是夜色、窗里还挂着太阳"。 */
  var GLASS = { x0: 258, x1: 434, base: 190, rise: 112 };

  function arcAt(mins) {
    var lit = mins >= 300 && mins <= 1200;
    var t = lit ? (mins - 300) / 900
                : (mins >= 1200 ? (mins - 1200) / 540 : (mins + 240) / 540);
    t = Math.min(Math.max(t, 0), 1);
    return {
      night: !lit,
      t: t,
      x: GLASS.x0 + t * (GLASS.x1 - GLASS.x0),
      y: GLASS.base - Math.sin(t * Math.PI) * GLASS.rise,
      /* 正午最亮，晨昏最弱 */
      beam: lit ? 0.22 + Math.sin(t * Math.PI) * 0.58 : 0.16
    };
  }

  var greetEl = document.getElementById('stGreet');
  function greet(h) {
    if (!greetEl) return;
    var line = h < 5  ? '夜深了，早点休息。'
             : h < 9  ? '清早的光刚落在桌上。'
             : h < 12 ? '上午好，today is a good day。'
             : h < 14 ? '午后，适合读点长的东西。'
             : h < 18 ? '下午的光斜过来了。'
             : h < 22 ? '入夜，慢慢翻几页。'
                      : '夜里安静，随便逛逛。';
    if (greetEl.textContent !== line) greetEl.textContent = line;
  }

  /* 看图的时候没法等到中午。?t=13:20（或 ?t=800）把整幅图钉在那个时刻，
     方便一次看完晨昏昼夜四张。纸的颜色还是跟真实时间走 —— 那一支归
     head_theme.html 管。 */
  var pinned = (function () {
    var q = /[?&]t=([0-9]{1,2})(?::([0-9]{2}))?/.exec(location.search);
    if (!q) return null;
    var mins = q[2] === undefined ? +q[1] : +q[1] * 60 + +q[2];
    return mins >= 0 && mins < 1440 ? mins : null;
  })();

  function paint() {
    var now = new Date();
    var mins = pinned === null ? now.getHours() * 60 + now.getMinutes() : pinned;
    var s = arcAt(mins);

    plate.style.setProperty('--ox', s.x.toFixed(1) + 'px');
    plate.style.setProperty('--oy', s.y.toFixed(1) + 'px');
    plate.style.setProperty('--beam', s.beam.toFixed(2));
    plate.setAttribute('data-night', s.night ? 'on' : 'off');

    /* 光走日头的反方向：早上太阳在东，光就落到屋子的西边去。
       skewX 的原点在窗台（CSS 里写死 331 231），所以只要给一个角度，
       两道线的下端和桌上的光斑就一起挪过去。 */
    var deg = (0.5 - s.t) * 84;
    var rad = deg * Math.PI / 180;
    plate.style.setProperty('--ray', deg.toFixed(2) + 'deg');
    plate.style.setProperty('--px', (331 + 105 * Math.tan(rad)).toFixed(1) + 'px');
    plate.style.setProperty('--patch-o', (s.night ? 0.12 : 0.14 + s.beam * 0.42).toFixed(3));

    /* 影子倒向光走的那一边，太阳越低拖得越长 */
    var dir = deg >= 0 ? 1 : -1;
    var len = 0.5 + (1 - Math.sin(s.t * Math.PI)) * 1;
    plate.style.setProperty('--sh', (dir * (s.night ? 0.6 : len)).toFixed(2));
    plate.style.setProperty('--shade-o', (s.night ? 0.22 : 0.2 + s.beam * 0.45).toFixed(2));

    greet(Math.floor(mins / 60));
  }

  /* ── 物件 ──────────────────────────────────────────────
     SVG <a> 本来就能聚焦、能点，所以不用在图上盖一层看不见的按钮。
     .on 是预览态：题签、抬起、底下那一行读出。鼠标离开要卸掉，
     不然 CSS 的 :hover 走了、.on 还在，题签就会钉在桌上。 */
  function things() {
    var readout = document.getElementById('stReadout');
    var roK = document.getElementById('stRoK');
    var roT = document.getElementById('stRoT');
    var roM = document.getElementById('stRoM');
    var objects = Array.prototype.slice.call(plate.querySelectorAll('.stobj'));
    if (!objects.length) return;
    var touch = matchMedia('(hover: none)').matches;
    var current = null;
    var hideTimer = 0;

    var show = function (obj) {
      clearTimeout(hideTimer);
      current = obj;
      objects.forEach(function (o) { o.classList.toggle('on', o === obj); });
      if (!readout) return;
      roK.textContent = obj.dataset.kicker;
      roT.textContent = obj.dataset.title;
      roM.textContent = obj.dataset.meta;
      readout.setAttribute('aria-hidden', 'false');
      readout.classList.add('on');
      if (!still) {
        readout.classList.remove('swap');
        void readout.getBoundingClientRect().width;
        readout.classList.add('swap');
      }
    };

    var hide = function () {
      current = null;
      objects.forEach(function (o) { o.classList.remove('on'); });
      if (!readout) return;
      readout.classList.remove('on', 'swap');
      readout.setAttribute('aria-hidden', 'true');
    };

    var leave = function () {
      if (touch) return;
      clearTimeout(hideTimer);
      /* SVG 里 relatedTarget 经常是 null，短延时让移到邻件时
         下一次 show 把这次 hide 取消掉，避免闪一帧空。 */
      hideTimer = setTimeout(hide, 80);
    };

    /* 鼠标上，悬停是预览、离开收回、点击是进入。触屏没有悬停可用 ——
       一下点两件事会让那一行还没读到就翻页了，所以第一下预览，第二下才走。 */

    objects.forEach(function (obj) {
      obj.addEventListener('pointerenter', function () { if (!touch) show(obj); });
      obj.addEventListener('pointerleave', leave);
      obj.addEventListener('focus', function () { show(obj); });
      obj.addEventListener('blur', leave);
      obj.addEventListener('click', function (e) {
        if (touch && !obj.classList.contains('on')) { e.preventDefault(); show(obj); }
      });
    });

    if (touch) {
      document.addEventListener('pointerdown', function (e) {
        if (!current) return;
        var t = e.target;
        if (t && t.closest && t.closest('.stobj')) return;
        hide();
      });
    }
  }

  /* ── 指针带着整张纸挪一点 ──────────────────────────────
     位移写在 <svg> 这个替换元素上，不是写在里面的组上：那是一次合成层
     位移，图里那个 feDisplacementMap 不用跟着重算。 */
  function drift() {
    if (still || !matchMedia('(pointer:fine)').matches) return;
    plate.addEventListener('pointermove', function (e) {
      var r = plate.getBoundingClientRect();
      plate.classList.add('live');
      plate.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      plate.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    });
    plate.addEventListener('pointerleave', function () {
      plate.classList.remove('live');
      plate.style.setProperty('--mx', 0);
      plate.style.setProperty('--my', 0);
    });
  }

  paint();
  setInterval(paint, 30000);
  things();
  drift();
})();
