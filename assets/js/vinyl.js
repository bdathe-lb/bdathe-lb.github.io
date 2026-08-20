/* ═══════════════════════════════════════════════════════════
   音 · vinyl — the machine

   Two ways to put a record on, because they answer to different hands: click
   one and it flies to the platter on its own, or pick it up and carry it
   there. Both end in the same place, and the keyboard gets the first one for
   free since the grab handle is a real button.

   The click path is one ritual, written so each beat is a thing a hand would
   actually do: the disc comes out of its sleeve, the lid opens, the record
   travels through the air and is lowered onto the spindle from above, the
   lid shuts, the platter comes up to speed, and only then does the arm drop
   and the music start. Overlap the mechanical moves and it reads as a
   machine being operated; play them as a progress bar and the object dies.

   Playback is a vendored 30s iTunes preview (same-origin <audio>). The
   platter and arm follow currentTime. Full tracks stay as outbound links.

   The click that starts the ritual also starts a muted play, so the unmute
   at the end of the arm-drop is still in the user-gesture window.

   The machine is self-contained: platter, arm and the local preview
   all live in this file.
   ═══════════════════════════════════════════════════════════ */

(function () {
  var items = window.VINYL || [];
  if (!items.length) return;

  var stage = document.getElementById('vstage');
  var rack  = document.getElementById('rack');
  if (!stage || !rack) return;

  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var lid      = document.getElementById('lid');
  var platter  = stage.querySelector('.platter');
  var machine  = document.getElementById('machine');
  var vdisc    = document.getElementById('vdisc');
  var vlabel   = document.getElementById('vdiscLabel');
  var tonearm  = document.getElementById('tonearm');
  var hudHint  = document.getElementById('hudHint');
  var elTitle  = document.getElementById('vTitle');
  var elArtist = document.getElementById('vArtist');
  var elPos    = document.getElementById('vPos');
  var elDur    = document.getElementById('vDur');
  var scrub    = document.getElementById('vScrub');
  var btnPlay  = document.getElementById('vPlay');
  var btnEject = document.getElementById('vEject');

  var note      = document.getElementById('vnote');
  var noteMeta  = document.getElementById('vnoteMeta');
  var noteBody  = document.getElementById('vnoteBody');
  var noteLinks = document.getElementById('vnoteLinks');

  var recs = Array.prototype.slice.call(rack.querySelectorAll('.rec'));
  var audio = document.getElementById('vAudio');

  var seated = null;       // index of the record on the platter, or null
  var playing = false;
  var ended = false;
  var busy = false;

  /* Decode the small label used by the travelling record before it moves.
     Creating an <img> and starting a transform animation in the same task can
     make the first frame pay for decode, paint and layer promotion together.
     Keep one promise per URL so hover, focus and click all share the work. */
  var warmed = Object.create(null);
  function warmCover(src) {
    if (!src) return Promise.resolve();
    if (warmed[src]) return warmed[src];

    warmed[src] = new Promise(function (resolve) {
      var im = new Image();
      var done = function () { resolve(); };
      im.decoding = 'async';
      im.src = src;
      if (im.decode) im.decode().then(done, done);
      else if (im.complete) done();
      else { im.addEventListener('load', done, { once: true }); im.addEventListener('error', done, { once: true }); }
    });
    return warmed[src];
  }

  var mmss = function (ms) {
    if (!ms || ms < 0) return '0:00';
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  };

  var wait = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    });
  }

  function hint(msg) {
    if (hudHint) hudHint.textContent = msg;
  }

  /* Every animation gets the same latch: whichever of 'finish' and a backstop
     timer arrives first resolves, the other finds it already closed. A
     browser throttles animations in a backgrounded tab and 'finish' then
     never fires at all — without this, clicking a record and switching tabs
     leaves a machine that is still empty and a record stuck in mid-air. */
  function settled(anim, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var fire = function () { if (!done) { done = true; resolve(); } };
      if (anim) anim.addEventListener('finish', fire);
      setTimeout(fire, ms + 140);
    });
  }

  /* ── the platter turns ────────────────────────────────────
     Angle accumulated by hand rather than a CSS animation, so it can spin up
     and coast down instead of snapping. The loop is idle whenever the record
     is still.                                                             */
  var speed = 0, target = 0, deg = 0, raf = null, last = 0;

  function frame(t) {
    var dt = last ? Math.min(64, t - last) : 16;
    last = t;
    speed += (target - speed) * (1 - Math.exp(-dt / 280));
    deg = (deg + speed * (dt / 1000) * 200) % 360;   // 200°/s ≈ 33⅓ rpm
    vdisc.style.setProperty('--deg', deg.toFixed(2) + 'deg');
    if (target > 0 || speed > 0.003) raf = requestAnimationFrame(frame);
    else { raf = null; last = 0; speed = 0; }
  }
  function spin(on) {
    target = on ? 1 : 0;
    stage.classList.toggle('spinning', on);
    if (still) return;
    if (raf === null && (target > 0 || speed > 0.003)) raf = requestAnimationFrame(frame);
  }

  /* ── the lid ── */
  function setLid(open) {
    stage.dataset.lid = open ? 'open' : 'closed';
    lid.setAttribute('aria-pressed', String(open));
  }
  lid.addEventListener('click', function () {
    if (busy) return;
    setLid(stage.dataset.lid !== 'open');
  });

  function setArm(on) {
    stage.classList.add('arm-cue');
    stage.dataset.arm = on ? 'on' : 'parked';
  }

  function showMachine() {
    var deck = stage.querySelector('.deck3d') || machine;
    if (!deck) return false;
    var box = deck.getBoundingClientRect();
    if (box.top >= 64 && box.bottom <= innerHeight - 48) return false;
    /* html { scroll-behavior: smooth } would turn even an 'auto' scroll
       into a glide, and the flyer is positioned from viewport rects —
       measuring while the page is still moving puts the record in the
       wrong sky. Instant, then one frame, then fly. */
    var html = document.documentElement;
    var prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    deck.scrollIntoView({ block: 'center', behavior: 'instant' });
    html.style.scrollBehavior = prev;
    return true;
  }

  /* ── the flyer ────────────────────────────────────────────
     What travels is a stand-in, not the rack item — so nothing in the rack's
     layout has to be disturbed to move a record across the page.

     Sized at its destination and scaled *down* to its start, with the origin
     at the centre: rotation and scale then both happen about the record's
     own middle, which is the only place a spinning disc can turn about.   */
  function flyer(endSize, cover) {
    var f = document.createElement('div');
    f.className = 'vflyer';
    f.style.cssText = 'width:' + endSize + 'px;height:' + endSize + 'px;top:0;left:0;transform-origin:50% 50%';

    var grooves = document.createElement('span');
    grooves.className = 'vflyer-grooves';
    f.appendChild(grooves);

    if (cover) {
      var im = document.createElement('img');
      im.src = cover;
      im.alt = '';
      im.decoding = 'async';
      f.appendChild(im);
    }

    var hole = document.createElement('span');
    hole.className = 'vflyer-hole';
    f.appendChild(hole);

    document.body.appendChild(f);
    return f;
  }

  function discBox() {
    /* Read the real record, not the circular platter. Its client rect already
       includes the deck's perspective and the narrow-screen scale, so this is
       the exact box the flyer must occupy on its final frame. Visibility does
       not affect layout, therefore this also works while the machine is empty. */
    var p = vdisc.getBoundingClientRect();
    return { left: p.left, top: p.top, width: p.width, height: p.height, size: p.width };
  }

  var LIFT = 280, OPEN_READY = 440, FLIGHT = 980, SETTLE = 220;
  var LID_DOWN = 360, ARM_DROP = 560, ARM_PARK = 360, HOME = 640;

  /* ── the placing animation ────────────────────────────────
     A cubic, not a flat lerp: the record lifts off the shelf, travels, then
     is lowered onto the spindle from above — the last third is a place, not
     a slide. It stays closer to a circle in the air and only lies down into
     the platter's already-measured ellipse as it descends.

     First and last frames match the elements they replace, so the hand-off
     is a swap of two identical pictures rather than a jump.              */
  function flight(fromRect, toBox, cover, homeward) {
    var endSize = toBox.width || toBox.size;
    var endHeight = toBox.height || endSize;
    var f = flyer(endSize, cover);

    var x0 = fromRect.left + fromRect.width / 2;
    var y0 = fromRect.top + (fromRect.height || fromRect.width) / 2;
    var x1 = toBox.left + endSize / 2;
    var y1 = toBox.top + endHeight / 2;

    var dist = Math.hypot(x1 - x0, y1 - y0);
    var lift = Math.min(170, Math.max(72, dist * 0.38));
    var hover = Math.min(58, Math.max(28, endSize * 0.18));

    var p1x, p1y, p2x, p2y;
    if (homeward) {
      p1x = x0;
      p1y = y0 - hover;
      p2x = x1 + (x0 - x1) * 0.18;
      p2y = y1 - lift;
    } else {
      p1x = x0 + (x1 - x0) * 0.22;
      p1y = y0 - lift;
      p2x = x1;
      p2y = y1 - hover;
    }

    var sx0 = fromRect.width / endSize;
    var sy0 = (fromRect.height || fromRect.width) / endSize;
    var sy1 = endHeight / endSize;
    var half = endSize / 2;
    var frames = [];
    var N = 24;

    for (var k = 0; k <= N; k++) {
      var t = k / N;
      var u = 1 - t;
      var x = u*u*u*x0 + 3*u*u*t*p1x + 3*u*t*t*p2x + t*t*t*x1;
      var y = u*u*u*y0 + 3*u*u*t*p1y + 3*u*t*t*p2y + t*t*t*y1;

      /* Lie down only on the way in, and only at the end. Going home the
         destination is a square sleeve, so the same late blend just stands
         the disc back up. */
      var flatten = t < 0.62 ? 0 : (t - 0.62) / 0.38;
      flatten = flatten * flatten * (3 - 2 * flatten);

      var air = 1 + Math.sin(Math.PI * t) * 0.055;
      var sx = (sx0 + (1 - sx0) * t) * air;
      var syMid = (sy0 + (1 - sy0) * t) * air;
      var sy = syMid + (sy1 - syMid) * flatten;

      var rz = Math.sin(Math.PI * t) * (homeward ? -7 : 7);
      var elev = Math.sin(Math.PI * t);
      var fade = homeward && t > 0.82 ? 1 - (t - 0.82) / 0.18 * 0.65 : 1;

      frames.push({
        offset: t,
        transform: 'translate3d(' + (x - half) + 'px,' + (y - half) + 'px,0)' +
                   ' rotate(' + rz.toFixed(2) + 'deg)' +
                   ' scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')',
        boxShadow: '0 ' + (6 + elev * 20).toFixed(1) + 'px ' +
                   (10 + elev * 26).toFixed(1) + 'px rgba(28, 34, 42, ' +
                   (0.26 + elev * 0.16).toFixed(3) + ')',
        opacity: fade
      });
    }

    f.style.transform = frames[0].transform;
    f.style.boxShadow = frames[0].boxShadow;
    var duration = homeward ? HOME : FLIGHT;
    return nextFrame()
      .then(function () {
        return settled(
          f.animate(frames, {
            duration: duration,
            easing: homeward ? 'cubic-bezier(.4,.02,.2,1)' : 'cubic-bezier(.22,.02,.12,1)',
            fill: 'forwards'
          }),
          duration
        );
      })
      .then(function () { return f; });
  }

  /* ── seating a record ──
     Landing is kept deliberately small: only the visible machine and its HUD
     change in the hand-off frame. The preview unmutes after the flyer is gone. */
  function seat(i) {
    var t = items[i];
    if (seated !== null && recs[seated]) recs[seated].classList.remove('seated');
    seated = i;
    ended = false;
    recs[i].classList.add('seated');

    deg = 0;
    speed = 0;
    vdisc.style.setProperty('--deg', '0deg');

    if (t.cover2x) vlabel.alt = t.album || t.title;
    stage.dataset.state = 'loaded';
    stage.style.setProperty('--tone', t.tone);

    elTitle.textContent = t.title;
    elArtist.textContent = t.artist + (t.album ? ' · ' + t.album : '');
    progress(0, 0);
  }

  function clearMachine(rec) {
    if (rec) rec.classList.remove('seated');
    seated = null;
    ended = false;
    elTitle.textContent = '—';
    elArtist.textContent = '当前唱片机中无唱片';
    hint('');
    btnPlay.disabled = true;
    btnEject.disabled = true;
    progress(0, 0);
    hideNote();
    stage.dataset.state = 'empty';
    stage.dataset.arm = 'parked';
    stage.classList.remove('playing', 'spinning');
    stopPreview();
  }

  function armPreview(url) {
    if (!audio || !url) return;
    if (!audio.src || audio.src.indexOf(url) === -1) {
      audio.src = url;
      audio.load();
    }
    try { audio.currentTime = 0; } catch (err) {}
    audio.muted = true;
    var p = audio.play();
    if (p) p.catch(function () {});
  }

  function startPreview() {
    if (!audio || !audio.src) return;
    try { audio.currentTime = 0; } catch (err) {}
    audio.muted = false;
    var p = audio.play();
    if (p) p.then(function () { setPlaying(true); }).catch(function () {});
    else setPlaying(true);
  }

  function stopPreview() {
    if (!audio) return;
    audio.pause();
    try { audio.currentTime = 0; } catch (err) {}
    audio.muted = false;
  }

  function activate(i) {
    showNote(items[i]);
    startPreview();
  }

  /* ── put the current record back on the shelf ── */
  function putAway() {
    if (seated === null) return Promise.resolve();
    var i = seated, rec = recs[i];

    stopPreview();
    setPlaying(false);
    spin(false);
    hideNote();

    var finish = function () {
      stage.dataset.state = 'empty';
      clearMachine(rec);
    };

    if (still) {
      finish();
      setLid(true);
      return Promise.resolve();
    }

    hint('取下唱片…');
    setArm(false);
    var opening = stage.dataset.lid !== 'open';
    if (opening) setLid(true);

    return wait(Math.max(opening ? OPEN_READY : 80, ARM_PARK))
      .then(function () {
        var box = discBox();
        var to = rec.querySelector('.rec-sleeve').getBoundingClientRect();
        var cover = items[i].cover || items[i].cover2x;
        stage.classList.add('handoff');
        stage.dataset.state = 'empty';
        seated = null;
        ended = false;
        elTitle.textContent = '—';
        elArtist.textContent = '当前唱片机中无唱片';
        btnPlay.disabled = true;
        btnEject.disabled = true;
        progress(0, 0);
        return flight(box, to, cover, true).then(function (f) {
          if (f) f.remove();
          clearMachine(rec);
          stage.classList.remove('arm-cue', 'handoff');
        });
      });
  }

  /* ── 开盖 → 放入 → 合盖 → 转盘 → 落臂 → 出声 ───────────── */
  function place(i, fromRect) {
    if (still) {
      if (items[i].cover2x) vlabel.src = items[i].cover2x;
      setLid(true);
      seat(i);
      setArm(true);
      spin(true);
      btnPlay.disabled = !items[i].preview;
      btnEject.disabled = false;
      hint(items[i].preview ? '正在播放' : '');
      busy = false;
      activate(i);
      return Promise.resolve();
    }

    var rec = recs[i];
    var travelCover = items[i].cover || items[i].cover2x;

    var coverReady = Promise.all([
      warmCover(travelCover),
      warmCover(items[i].cover2x)
    ]);
    if (items[i].cover2x) vlabel.src = items[i].cover2x;

    var opening = stage.dataset.lid !== 'open';
    if (opening) setLid(true);
    if (!fromRect) rec.classList.add('launching');
    hint('抽出唱片…');

    return Promise.all([
      wait(Math.max(opening ? OPEN_READY : 0, fromRect ? 0 : LIFT)),
      coverReady
    ])
      .then(function () {
        if (fromRect) return fromRect;
        return rec.querySelector('.rec-disc').getBoundingClientRect();
      })
      .then(function (from) {
        var targetBox = discBox();
        rec.classList.add('flying');
        hint('放到唱盘上…');
        return flight(from, targetBox, travelCover, false);
      })
      .then(function (f) {
        stage.classList.add('handoff');
        seat(i);
        return nextFrame().then(function () {
          if (f) f.remove();
          stage.classList.remove('handoff');
          rec.classList.remove('launching', 'flying');
        });
      })
      .then(function () {
        if (!still) {
          vdisc.animate(
            [{ scale: '1.04' }, { scale: '0.992' }, { scale: '1' }],
            { duration: SETTLE, easing: 'cubic-bezier(.2,.7,.3,1)' }
          );
        }
        hint('合上机盖…');
        setLid(false);
        return wait(still ? 0 : Math.max(SETTLE, LID_DOWN));
      })
      .then(function () {
        hint('唱机启动…');
        spin(true);
        setArm(true);
        return wait(still ? 0 : ARM_DROP);
      })
      .then(function () {
        stage.classList.remove('arm-cue');
        btnPlay.disabled = !items[i].preview;
        btnEject.disabled = false;
        hint(items[i].preview ? '正在播放' : '');
        busy = false;
        activate(i);
      });
  }

  function ritual(i, fromRect) {
    if (busy || !items[i] || !items[i].id) return Promise.resolve();
    if (seated === i) return Promise.resolve();

    busy = true;
    /* Muted play on the same tap, so unmute after the arm drops is still
       a continuation of the gesture rather than a cold play(). */
    armPreview(items[i].preview);
    var scrolled = showMachine();

    var chain = (scrolled ? nextFrame() : Promise.resolve())
      .then(function () { return seated !== null ? putAway() : Promise.resolve(); });
    return chain
      .then(function () { return place(i, fromRect); })
      .then(function () { busy = false; })
      .catch(function () {
        stage.classList.remove('handoff', 'arm-cue');
        recs.forEach(function (rec) { rec.classList.remove('launching', 'flying'); });
        busy = false;
      });
  }

  function eject() {
    if (seated === null || busy) return Promise.resolve();
    busy = true;
    return putAway()
      .then(function () {
        busy = false;
        hint('');
      })
      .catch(function () { busy = false; });
  }

  /* ── readouts ── */
  function progress(pos, dur) {
    var p = dur > 0 ? Math.min(1, pos / dur) : 0;
    stage.style.setProperty('--p', p.toFixed(4));
    if (tonearm) tonearm.style.setProperty('--p', p.toFixed(4));
    if (scrub) scrub.style.setProperty('--p', p.toFixed(4));
    elPos.textContent = mmss(pos);
    elDur.textContent = dur > 0 ? mmss(dur) : '--:--';
  }

  function setPlaying(on) {
    playing = on;
    stage.classList.toggle('playing', on);
    btnPlay.textContent = on ? '❚❚' : '▶';
    spin(on);
    if (!busy && seated !== null) hint(on ? '正在播放' : '已暂停');
  }

  function fillNote(t) {
    note.style.setProperty('--tone', t.tone);
    noteMeta.textContent = [t.artist, t.album, t.genre, t.date].filter(Boolean).join(' · ');
    noteBody.innerHTML = '';
    var p = document.createElement('p');
    p.textContent = t.summary || '';
    if (t.note) noteBody.innerHTML = t.note; else noteBody.appendChild(p);

    noteLinks.innerHTML = '';
    [['SPOTIFY ↗', t.spotify], ['QQ 音乐 ↗', t.qqmusic]].forEach(function (pair) {
      if (!pair[1]) return;
      var a = document.createElement('a');
      a.textContent = pair[0];
      a.href = pair[1];
      a.target = '_blank';
      a.rel = 'noopener';
      noteLinks.appendChild(a);
    });
  }

  function showNote(t) {
    if (!note) return;
    fillNote(t);
    note.setAttribute('aria-hidden', 'false');
    if (still || note.classList.contains('on')) {
      note.classList.add('on');
      return;
    }
    /* 先把字写进收着的盒子里，再等两帧拉开 —— 否则 hidden→显示
       会在同一帧里排版整块说明，和转盘抢主线程。 */
    void note.offsetHeight;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { note.classList.add('on'); });
    });
  }

  function hideNote() {
    if (!note) return;
    note.classList.remove('on');
    note.setAttribute('aria-hidden', 'true');
  }

  /* ── local preview ── */
  if (audio) {
    audio.addEventListener('timeupdate', function () {
      if (seated === null || busy) return;
      var dur = audio.duration;
      if (!dur || !isFinite(dur)) return;
      progress(audio.currentTime * 1000, dur * 1000);
    });
    audio.addEventListener('play', function () {
      if (!audio.muted) setPlaying(true);
    });
    audio.addEventListener('pause', function () {
      if (seated !== null && !busy && !audio.muted) setPlaying(false);
    });
    audio.addEventListener('ended', function () {
      if (seated === null) return;
      ended = true;
      setPlaying(false);
      spin(false);
      setArm(false);
      hint('');
    });
  }

  /* ── picking a record up ──────────────────────────────────
     pointerdown starts a carry; if the pointer never really travels it is
     treated as a click and the record flies over by itself. That way the
     same handle serves both the reader who drags and the one who taps.   */
  recs.forEach(function (rec) {
    var grab = rec.querySelector('.rec-grab');
    var i = +rec.dataset.i;
    var travelCover = items[i].cover || items[i].cover2x;

    var warm = function () {
      warmCover(travelCover);
      warmCover(items[i].cover2x);
      if (items[i].preview) {
        var pre = new Audio();
        pre.preload = 'auto';
        pre.src = items[i].preview;
      }
    };
    grab.addEventListener('pointerenter', warm, { once: true, passive: true });
    grab.addEventListener('focus', warm, { once: true, passive: true });
    grab.addEventListener('pointerdown', function () {
      armPreview(items[i].preview);
    }, { passive: true });

    grab.addEventListener('click', function (e) {
      if (grab.dataset.dragged === '1') { grab.dataset.dragged = '0'; return; }
      if (rec.classList.contains('seated') || busy) return;
      e.preventDefault();
      ritual(i);
    });

    grab.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || still || busy) return;
      if (rec.classList.contains('seated')) return;
      warm();

      var start = rec.querySelector('.rec-sleeve').getBoundingClientRect();
      var moved = false, f = null;
      var size = start.width;

      var move = function (ev) {
        if (!moved) {
          if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) < 6) return;
          moved = true;
          grab.dataset.dragged = '1';
          rec.classList.add('dragging');
          stage.classList.add('carrying');
          if (stage.dataset.lid !== 'open') setLid(true);
          f = flyer(size, travelCover);
        }
        f.style.transform = 'translate(' + (ev.clientX - size / 2) + 'px,' +
                                           (ev.clientY - size / 2) + 'px)';
      };

      var up = function (ev) {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        stage.classList.remove('carrying');
        rec.classList.remove('dragging');
        if (!moved) return;

        var p = platter.getBoundingClientRect();
        var over = ev.clientX > p.left - 40 && ev.clientX < p.right + 40 &&
                   ev.clientY > p.top - 40 && ev.clientY < p.bottom + 40;

        var from = { left: ev.clientX - size / 2, top: ev.clientY - size / 2, width: size };
        if (f) f.remove();

        if (over) { ritual(i, from); return; }

        var back = rec.querySelector('.rec-sleeve').getBoundingClientRect();
        var g = flyer(back.width, travelCover);
        var d = back.width / 2;
        settled(g.animate([
          { transform: 'translate(' + from.left + 'px,' + from.top + 'px) scale(' + (size / back.width) + ')' },
          { transform: 'translate(' + (back.left + back.width / 2 - d) + 'px,' +
                                      (back.top + back.height / 2 - d) + 'px) scale(1)' }
        ], { duration: 420, easing: 'cubic-bezier(.4,.02,.2,1)', fill: 'forwards' }), 420)
          .then(function () { g.remove(); });
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  });

  /* ── transport ── */
  btnPlay.addEventListener('click', function () {
    if (!audio || seated === null || busy) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (ended || audio.ended) {
      ended = false;
      try { audio.currentTime = 0; } catch (err) {}
      setArm(true);
      spin(true);
    }
    audio.muted = false;
    var p = audio.play();
    if (p) p.catch(function () {});
  });
  btnEject.addEventListener('click', eject);

  addEventListener('keydown', function (e) {
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    if (document.querySelector('.cmdk.on')) return;
    if (e.key === ' ' && e.target === document.body && seated !== null && !busy) {
      e.preventDefault();
      btnPlay.click();
    }
  });

  setLid(false);
  progress(0, 0);
})();
