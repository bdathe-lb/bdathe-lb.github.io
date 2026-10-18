/* ═══════════════════════════════════════════════════════════
   音 · vinyl — the machine

   Two ways to put a record on, because they answer to different hands: click
   one and it flies to the platter on its own, or pick it up and carry it
   there. Both end in the same place, and the keyboard gets the first one for
   free since the grab handle is a real button.

   The click path is one ritual, written so each beat is a thing a hand would
   actually do: the disc comes out of its sleeve, the record travels through
   the air and is lowered onto the spindle from above, its sleeve is laid
   down by the machine, the platter comes up to speed as the arm swings over
   and is set down, and the music starts. The beats hand over to each other
   rather than wait for each other to finish — it used to be strictly one
   after another, and the pauses between them read as a machine thinking,
   not a hand moving.

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

  var sleeve   = document.getElementById('vsleeve');
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
  var elSay    = document.getElementById('vSay');

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

  /* An empty machine says so on the status line, and the two lines under it
     say what to do about it — including the drag, which nothing else on the
     page would ever tell you about. */
  var IDLE_TITLE = '从右边抽一张', IDLE_SUB = '点一下，或拖到唱盘上';
  function idle() {
    hud(IDLE_TITLE, IDLE_SUB);
  }

  /* While a record on the rack is being pointed at, the readout is showing
     that one instead (see peek). Anything the machine wants to say in the
     meantime is kept and put back when the pointer leaves. */
  var held = null;
  function hud(title, sub) {
    if (held) { held.title = title; held.sub = sub; return; }
    elTitle.textContent = title;
    elArtist.textContent = sub;
  }
  function hint(msg) {
    msg = msg || (seated === null ? '唱机空着' : '');
    if (held) { held.hint = msg; return; }
    if (hudHint) hudHint.textContent = msg;
  }

  /* ── 预告 ─────────────────────────────────────────────────
     Pointing at a sleeve reads it out — full title, full artist, its line —
     before anything is committed. The short line takes the progress bar's
     place, so the readout keeps its height and nothing below it moves. */
  function peek(i) {
    if (busy || i === seated || !items[i]) { unpeek(); return; }
    var t = items[i];
    if (!held) held = { title: elTitle.textContent, sub: elArtist.textContent, hint: hudHint.textContent };
    elTitle.textContent = t.title;
    elArtist.textContent = t.artist + (t.album ? ' · ' + t.album : '');
    hudHint.textContent = seated === null ? '点一下放上唱机' : '点一下换这张';
    if (elSay) { elSay.textContent = t.summary || ''; elSay.title = t.summary || ''; }
    stage.classList.add('peek');
  }
  function unpeek() {
    if (!held) return;
    var h = held;
    held = null;
    stage.classList.remove('peek');
    elTitle.textContent = h.title;
    elArtist.textContent = h.sub;
    hudHint.textContent = h.hint;
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
     The turning is a Web Animation — a revolution every 1.8s, 200°/s, which
     is 33⅓ near enough — so the compositor runs it and nothing on the main
     thread can make the record hitch. Script only touches its playbackRate,
     and only while it is spinning up or coasting down; at speed, or at rest,
     there is no loop at all.                                              */
  var turn = null, speed = 0, target = 0, raf = null, last = 0;

  function turning() {
    if (!turn) {
      turn = vdisc.animate(
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
        { duration: 1800, iterations: Infinity }
      );
      turn.pause();
    }
    return turn;
  }
  function ramp(t) {
    var dt = last ? Math.min(64, t - last) : 16;
    last = t;
    speed += (target - speed) * (1 - Math.exp(-dt / 280));
    if (Math.abs(target - speed) < 0.004) speed = target;
    turn.updatePlaybackRate(speed);
    if (speed !== target) { raf = requestAnimationFrame(ramp); return; }
    raf = null;
    last = 0;
    if (speed === 0) turn.pause();
  }
  function spin(on) {
    target = on ? 1 : 0;
    stage.classList.toggle('spinning', on);
    if (still) return;
    var a = turning();
    if (on && a.playState !== 'running') { a.updatePlaybackRate(speed); a.play(); }
    if (raf === null && speed !== target) raf = requestAnimationFrame(ramp);
  }
  /* a new record starts square to the spindle, not at the last one's angle */
  function stopTurn() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    last = 0;
    speed = 0;
    target = 0;
    if (turn) { turn.cancel(); turn = null; }
  }

  /* The arm is lifted for as long as it swings (.arm-up), and set down at
     the end of it; .arm-cue is the slow swing itself, which then gives way
     to the short transition that tracks the playing clip. */
  var armTimer = null;
  function setArm(on) {
    stage.classList.add('arm-cue', 'arm-up');
    stage.dataset.arm = on ? 'on' : 'parked';
    clearTimeout(armTimer);
    armTimer = setTimeout(function () {
      stage.classList.remove('arm-cue', 'arm-up');
    }, ARM_SWING);
  }

  function showMachine() {
    var deck = stage.querySelector('.deck') || machine;
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

  /* LIFT       the disc sliding out of its sleeve (rec.launching, 280ms in CSS)
     FLIGHT     rack → spindle
     SETTLE     the little give as it lands
     SPIN_AT    after landing: the platter starts
     ARM_AT     after landing: the arm starts its swing
     ARM_SWING  the swing (.arm-cue, 540ms in CSS), then ARM_SET to set it down
     ARM_PARK   on the way off: how long the arm has to lift and clear
     HOME       spindle → sleeve; a swap launches the next one before it lands */
  var LIFT = 240, FLIGHT = 760, SETTLE = 220, SPIN_AT = 120, ARM_AT = 140;
  var ARM_SWING = 540, ARM_SET = 180, ARM_PARK = 300, HOME = 600;

  /* ── the placing animation ────────────────────────────────
     A cubic, not a flat lerp: the record lifts off the shelf, travels, then
     is lowered onto the spindle from above — the last third is a place, not
     a slide. (The squash toward the destination's height at the end is left
     over from a platter seen in perspective; seen from above, the platter is
     a circle and it does nothing.)

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

    stopTurn();

    if (t.cover2x) vlabel.alt = t.album || t.title;
    stage.dataset.state = 'loaded';
    stage.style.setProperty('--tone', t.tone);
    if (sleeve) {
      if (t.cover2x && sleeve.getAttribute('src') !== t.cover2x) sleeve.src = t.cover2x;
      sleeve.alt = t.album || t.title;
      sleeve.classList.toggle('on', !!t.cover2x);
    }

    hud(t.title, t.artist + (t.album ? ' · ' + t.album : ''));
    progress(0, 0);
  }

  function clearMachine(rec) {
    if (rec) rec.classList.remove('seated');
    seated = null;
    ended = false;
    idle();
    hint('');
    btnPlay.disabled = true;
    btnEject.disabled = true;
    progress(0, 0);
    hideNote();
    stage.dataset.state = 'empty';
    stage.dataset.arm = 'parked';
    stage.classList.remove('playing', 'spinning');
    if (sleeve) sleeve.classList.remove('on');
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

  /* ── put the current record back on the shelf ──
     early: resolve once the record is most of the way home, so a swap can
     start pulling the next one out while this one is still landing. Eject
     waits for the whole trip. */
  function putAway(early) {
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
      return Promise.resolve();
    }

    hint('取下唱片…');
    setArm(false);

    return wait(ARM_PARK)
      .then(function () {
        var box = discBox();
        var to = rec.querySelector('.rec-sleeve').getBoundingClientRect();
        var cover = items[i].cover || items[i].cover2x;
        stage.classList.add('handoff');
        /* the machine is empty from the moment the record leaves it; only
           the sleeve keeps its .seated (its own disc hidden) until the
           flyer arrives to fill it */
        clearMachine(null);
        hint('取下唱片…');
        var home = flight(box, to, cover, true).then(function (f) {
          if (f) f.remove();
          rec.classList.remove('seated');
          stage.classList.remove('handoff');
          if (!busy) hint('');
        });
        return early ? Promise.race([home, wait(HOME * 0.55)]) : home;
      });
  }

  /* ── 抽出 → 放上 → 转盘 → 落臂 → 出声 ───────────────── */
  function place(i, fromRect) {
    if (still) {
      if (items[i].cover2x) vlabel.src = items[i].cover2x;
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
    /* label and sleeve take their picture now, while the record is still in
       the pile, so neither is decoded in the frame the record lands in */
    if (items[i].cover2x) {
      vlabel.src = items[i].cover2x;
      if (sleeve && !sleeve.classList.contains('on')) sleeve.src = items[i].cover2x;
    }

    if (!fromRect) rec.classList.add('launching');
    hint('抽出唱片…');

    return Promise.all([
      wait(fromRect ? 0 : LIFT),
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
        /* landed: the sleeve is laid down, the platter starts, and the arm
           sets off — overlapping, the way two hands would do it */
        vdisc.animate(
          [{ scale: '1.04' }, { scale: '0.992' }, { scale: '1' }],
          { duration: SETTLE, easing: 'cubic-bezier(.2,.7,.3,1)' }
        );
        setTimeout(function () { hint('唱机启动…'); spin(true); }, SPIN_AT);
        return wait(ARM_AT);
      })
      .then(function () {
        setArm(true);
        return wait(ARM_SWING + ARM_SET);
      })
      .then(function () {
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

    unpeek();
    busy = true;
    /* Muted play on the same tap, so unmute after the arm drops is still
       a continuation of the gesture rather than a cold play(). */
    armPreview(items[i].preview);
    var scrolled = showMachine();

    var chain = (scrolled ? nextFrame() : Promise.resolve())
      .then(function () { return seated !== null ? putAway(true) : Promise.resolve(); });
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
    return putAway(false)
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
    grab.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'mouse') peek(i);
    }, { passive: true });
    grab.addEventListener('focus', function () { peek(i); });
    grab.addEventListener('pointerleave', unpeek, { passive: true });
    grab.addEventListener('blur', unpeek);
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
          unpeek();
          grab.dataset.dragged = '1';
          rec.classList.add('dragging');
          stage.classList.add('carrying');
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

  /* ── 架底的淡出 ──
     The rack fades out at the bottom for as long as there is more below;
     the last row in view, or a rack that never needed to scroll, is drawn
     plain. */
  var atEnd = function () {
    rack.classList.toggle('at-end', rack.scrollTop + rack.clientHeight >= rack.scrollHeight - 2);
  };
  rack.addEventListener('scroll', atEnd, { passive: true });
  addEventListener('resize', atEnd);
  atEnd();

  progress(0, 0);
})();
