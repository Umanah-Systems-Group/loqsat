/* Illustrated scenes for the home page: the small pictures under the headline figures, the gold dust behind the
   Awardable badge, the two operators at their consoles, the 48-hour story of one event, and the maneuver planner.
   Every scene runs only while it is on screen and shows its finished state when motion is reduced. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const ns = 'http://www.w3.org/2000/svg';
  // calls fn(true) when el comes on screen and fn(false) when it leaves
  const watch = (el, fn, margin) => {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(true); return; }
    new IntersectionObserver((en) => en.forEach((e) => fn(e.isIntersecting)), { rootMargin: margin || '0px 0px -15% 0px' }).observe(el);
  };
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // ---- small pictures under the headline figures ----
  document.querySelectorAll('.viz').forEach((v) => {
    const kind = v.dataset.viz; let h = '';
    if (kind === 'dots') { for (let r = 0; r < 4; r++) for (let c = 0; c < 34; c++) h += `<circle cx="${3 + c * 6}" cy="${4 + r * 7}" r="1.5" style="--i:${c + r * 3}"/>`; }
    if (kind === 'dust') { for (let i = 0; i < 260; i++) h += `<circle cx="${(rnd() * 204).toFixed(1)}" cy="${(2 + rnd() * 24).toFixed(1)}" r="${(0.5 + rnd() * 0.9).toFixed(2)}" style="--i:${Math.floor(rnd() * 40)};--o:${(0.35 + rnd() * 0.65).toFixed(2)}"/>`; }
    if (kind === 'ticks') { for (let i = 0; i < 26; i++) { const hh = 6 + Math.round((0.35 + 0.65 * Math.abs(Math.sin(i * 0.7 + 1))) * 20 * (0.6 + rnd() * 0.4)); h += `<rect x="${i * 8}" y="${28 - hh}" width="4" height="${hh}" rx="1" style="--i:${i}"/>`; } }
    if (kind === 'cut') h = '<rect class="track" x="0" y="10" width="206" height="10" rx="5"/><rect class="gone" x="0" y="10" width="206" height="10" rx="5"/><rect class="left" x="0" y="10" width="206" height="10" rx="5"/><text x="206" y="6" text-anchor="end">17% left</text>';
    v.innerHTML = `<svg viewBox="0 0 208 30" focusable="false">${h}</svg>`;
  });
  document.querySelectorAll('.figures').forEach((f) => watch(f, (on) => { if (on) f.classList.add('viz-on'); }));

  // ---- gold dust behind the Awardable badge ----
  (function dust() {
    const cv = document.querySelector('.gold-dust'); if (!cv) return;
    const ctx = cv.getContext('2d'), P = [];
    let w = 0, h = 0, dpr = Math.min(2, devicePixelRatio || 1), on = false, raf = 0, last = 0;
    const size = () => { w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const make = () => ({ x: rnd() * w, y: rnd() * h, r: 0.4 + Math.pow(rnd(), 3) * 2, v: 4 + rnd() * 10, a: 0.15 + rnd() * 0.6, ph: rnd() * 6.28 });
    size(); for (let i = 0; i < 150; i++) P.push(make());
    addEventListener('resize', () => { size(); P.forEach((p) => { p.x = rnd() * w; p.y = rnd() * h; }); if (reduce) draw(0); });
    function draw(dt) {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      P.forEach((p) => {
        p.y -= p.v * dt; p.ph += dt * 1.6; if (p.y < -4) { Object.assign(p, make()); p.y = h + 4; }
        const pull = 1 - Math.min(1, Math.abs(p.x - cx) / (w * 0.55)); // denser and brighter near the badge
        const a = p.a * (0.55 + 0.45 * Math.sin(p.ph)) * (0.35 + 0.65 * pull);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fillStyle = `rgba(255, 214, 115, ${a.toFixed(3)})`; ctx.fill();
      });
    }
    const loop = (t) => { raf = on ? requestAnimationFrame(loop) : 0; draw(Math.min(0.05, (t - last) / 1000 || 0)); last = t; };
    if (reduce) { draw(0); return; }
    watch(cv, (v) => { on = v; if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }, '0px');
  })();

  // ---- two operators: warning to both, offer, counter, accept, sealed on the record ----
  (function ops() {
    const svg = $('ops'); if (!svg) return;
    const pa = $('ops-pa'), pb = $('ops-pb'), ab = $('ops-ab'), ka = $('pkt-a'), kb = $('pkt-b'), bub = $('bub'), bubT = $('bub-t'), say = $('ops-say');
    const La = pa.getTotalLength(), Lb = pb.getTotalLength(), Lab = ab.getTotalLength();
    const at = (p, L, k) => { const q = p.getPointAtLength(L * k); return q.x.toFixed(1) + ' ' + q.y.toFixed(1); };
    const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    const LINES = [
      [0, 'A warning reaches both operators at the same moment.'],
      [2000, 'Operator A offers to move.'],
      [3800, 'Operator B counters with a smaller burn.'],
      [5600, 'Operator A accepts. Both see the same terms.'],
      [7200, 'The agreement is sealed on the record.']
    ];
    const LOOP = 10400;
    let on = false, raf = 0, t0 = 0, line = -1;
    function render(t) {
      svg.classList.toggle('pulse-on', t < 1300);
      const k1 = Math.min(1, Math.max(0, (t - 200) / 1100));
      ka.setAttribute('transform', 'translate(' + at(pa, La, ease(k1)) + ')'); kb.setAttribute('transform', 'translate(' + at(pb, Lb, ease(k1)) + ')');
      ka.style.opacity = kb.style.opacity = (t > 150 && t < 1400) ? 1 : 0;
      svg.classList.toggle('warned', t >= 1300 && t < 7200);
      svg.classList.toggle('agreed', t >= 7200);
      let shown = false;
      [[2000, 'Offer', false], [3800, 'Counter', true], [5600, 'Accept', false]].forEach(([s, label, back]) => {
        if (t >= s && t < s + 1500) { const k = ease(Math.min(1, (t - s) / 1300)); bub.setAttribute('transform', 'translate(' + at(ab, Lab, back ? 1 - k : k) + ')'); bubT.textContent = label; shown = true; }
      });
      bub.style.opacity = shown ? 1 : 0;
      svg.querySelectorAll('.blk').forEach((b, i) => b.classList.toggle('on', t >= 7300 + i * 260));
      svg.classList.toggle('locked', t >= 8500);
      let n = 0; LINES.forEach(([s], i) => { if (t >= s) n = i; });
      if (n !== line) { line = n; say.textContent = LINES[n][1]; }
    }
    const loop = (now) => { if (!on) { raf = 0; return; } raf = requestAnimationFrame(loop); render((now - t0) % LOOP); };
    if (reduce) { render(9000); say.textContent = 'A warning reaches both operators at once; they offer, counter and accept, and the agreement is sealed on the record.'; return; }
    watch(svg, (v) => { on = v; if (on && !raf) { t0 = performance.now(); raf = requestAnimationFrame(loop); } }, '0px');
  })();

  // ---- the 48-hour story of one event ----
  (function story() {
    const svg = $('story'); if (!svg) return;
    const X = (h) => 20 + h / 48 * 920, DUR = 9000, SHIFT = 1296, MISS = 200;
    const ms = Array.from(svg.querySelectorAll('.ms')), head = $('st-head'), prog = $('st-prog'), band = $('st-band');
    const clock = $('st-clock'), sayEl = $('st-say'), miss = $('st-miss'), verdict = $('st-verdict'), btn = $('st-play');
    const SAY = [[0, 'The clock starts two days before the closest approach.'], [1, 'Routine screening for Operator A’s satellite.'],
      [12, 'A provider warns of a close approach. Both operators get the same advisory at once.'],
      [22, 'Operator A offers to move. Operator B counters with a smaller burn.'], [28, 'Both accept. The agreement is sealed on the record.'],
      [36, 'Operator A’s satellite fires a 1 cm/s push.'], [48, 'Closest approach. The two satellites pass 1.31 km apart.']];
    const km = (m) => (m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(2) + ' km');
    let raf = 0, t0 = 0, played = false, said = -1;
    function render(h) {
      const x = X(h);
      head.setAttribute('transform', 'translate(' + x.toFixed(1) + ' 0)'); prog.setAttribute('x2', x.toFixed(1));
      band.setAttribute('width', Math.max(0, Math.min(X(28), x) - X(12)).toFixed(1));
      ms.forEach((m) => m.classList.toggle('on', h >= +m.dataset.at));
      clock.textContent = h >= 48 ? 'TCA' : 'T-' + Math.ceil(48 - h) + ' h';
      const sep = Math.hypot(MISS, h > 36 ? SHIFT * (h - 36) / 12 : 0);
      miss.textContent = km(sep); const ok = sep >= 1000; verdict.textContent = ok ? 'Safe' : 'Too close'; verdict.className = 'status ' + (ok ? 'next' : 'warn');
      let n = 0; SAY.forEach(([a], i) => { if (h >= a) n = i; }); if (n !== said) { said = n; sayEl.textContent = SAY[n][1]; }
      svg.classList.toggle('done', h >= 48);
    }
    function play() {
      cancelAnimationFrame(raf);
      if (reduce) { render(48); return; }
      t0 = performance.now();
      const step = (now) => { const k = Math.min(1, (now - t0) / DUR); render(k * 48); if (k < 1) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    }
    render(reduce ? 48 : 0);
    btn.addEventListener('click', play);
    watch(svg, (v) => { if (v && !played) { played = true; play(); } });
  })();

  // ---- maneuver planner: two paths cross; your satellite fires, slides along its path, and the gap opens ----
  (function planner() {
    const svg = $('pl-svg'); if (!svg) return;
    const C = { x: 360, y: 190 }, PX = 60, MISS = 200, SAFE = 1000, EARLY = 24, CAP = 330;
    const UO = { x: 420 / Math.hypot(420, 380), y: -380 / Math.hypot(420, 380) };
    const lead = $('pl-lead'), dv = $('pl-dv'), you = $('pl-you'), other = $('pl-other'), ghost = $('pl-ghost'), flash = $('pl-flash');
    const gap = $('pl-gap'), gapT = $('pl-gap-t'), off = $('pl-off'), clock = $('pl-clock'), ev = $('pl-event'), live = $('pl-live');
    const yY = C.y - MISS / 1000 * PX;
    const km = (m) => (m < 1000 ? Math.round(m) + ' m' : (m < 100000 ? (m / 1000).toFixed(2) : Math.round(m / 1000).toLocaleString('en-US')) + ' km');
    const cm = (v) => (v < 0.1 ? v.toFixed(2) : v < 10 ? v.toFixed(2).replace(/0$/, '') : v.toFixed(1)) + ' cm/s';
    const fill = (el) => el.style.setProperty('--fill', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
    const shiftM = (H, V, t) => (t > -H ? 3 * (V / 100) * (t + H) * 3600 : 0); // metres moved along the path by hour t
    let raf = 0, say = 0;
    // t: hours relative to the closest approach (negative before it); S: hours the run starts before it
    function draw(t, S, H, V) {
      const k = t / S, base = C.x + k * 360, sPx = shiftM(H, V, t) / 1000 * PX, x = base + Math.min(sPx, CAP);
      other.setAttribute('transform', 'translate(' + (C.x + UO.x * k * 280).toFixed(1) + ' ' + (C.y + UO.y * k * 280).toFixed(1) + ')');
      you.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + yY + ')');
      ghost.setAttribute('x1', base.toFixed(1)); ghost.setAttribute('x2', x.toFixed(1)); ghost.setAttribute('y1', yY); ghost.setAttribute('y2', yY);
      off.setAttribute('visibility', sPx > CAP ? 'visible' : 'hidden');
      const end = t >= 0;
      [gap, gapT].forEach((e) => e.setAttribute('visibility', end ? 'visible' : 'hidden'));
      if (end) {
        const sep = Math.hypot(MISS, shiftM(H, V, 0));
        gap.setAttribute('x2', x.toFixed(1)); gap.setAttribute('y2', yY);
        gapT.textContent = km(sep); gapT.setAttribute('x', ((C.x + x) / 2).toFixed(1)); gapT.setAttribute('y', (yY - 14).toFixed(1));
        gapT.setAttribute('text-anchor', 'middle');
        svg.classList.toggle('safe', sep >= SAFE); svg.classList.toggle('close', sep < SAFE);
      } else svg.classList.remove('safe', 'close');
      clock.textContent = end ? 'Closest approach' : 'T-' + Math.max(1, Math.ceil(-t)) + ' h';
    }
    function numbers() {
      [lead, dv].forEach(fill);
      const H = +lead.value, V = +dv.value, sep = Math.hypot(MISS, shiftM(H, V, 0)), ok = sep >= SAFE;
      $('pl-lead-out').textContent = H + ' h before'; $('pl-dv-out').textContent = cm(V);
      $('pl-sep').textContent = km(sep);
      const v = $('pl-verdict'); v.textContent = ok ? 'Safe' : 'Still too close'; v.className = 'status ' + (ok ? 'next' : 'warn');
      const n = (H + EARLY) / H;
      $('pl-early').innerHTML = 'Fire ' + EARLY + ' hours earlier (' + (H + EARLY) + ' h before) and a ' + cm(V / n) + ' push does the same job: <b>' + n.toFixed(1) + ' times smaller</b>.';
      const need = Math.sqrt(SAFE * SAFE - MISS * MISS) / (3 * H * 3600) * 100;
      $('pl-min').textContent = 'Smallest push that clears 1 km when you fire ' + H + ' h before: ' + cm(need) + '. Fire at ' + (H + EARLY) + ' h and it is ' + cm(need * H / (H + EARLY)) + '.';
      lead.setAttribute('aria-valuetext', H + ' hours before closest approach'); dv.setAttribute('aria-valuetext', cm(V));
      clearTimeout(say); say = setTimeout(() => { live.textContent = 'Gap at closest approach ' + km(sep) + ', ' + (ok ? 'safe' : 'still too close') + '.'; }, 600);
      return { H, V };
    }
    function still() { cancelAnimationFrame(raf); ev.textContent = ''; const { H, V } = numbers(); draw(0, Math.max(H * 1.25, H + 3), H, V); }
    function play() {
      cancelAnimationFrame(raf);
      const { H, V } = numbers(), S = Math.max(H * 1.25, H + 3), DUR = 5200;
      if (reduce) { draw(0, S, H, V); return; }
      const t0 = performance.now(); let fired = false;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / DUR), t = -S + k * S;
        draw(t, S, H, V);
        if (!fired && t >= -H) {
          fired = true; ev.textContent = 'Fire: ' + cm(V);
          const p = you.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/);
          flash.setAttribute('cx', p[1]); flash.setAttribute('cy', p[2]);
          flash.animate([{ opacity: 1, transform: 'scale(0.4)' }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 900, easing: 'ease-out' });
        }
        if (k >= 1) ev.textContent = $('pl-verdict').textContent;
        if (k < 1) raf = requestAnimationFrame(step);
      };
      ev.textContent = ''; raf = requestAnimationFrame(step);
    }
    flash.style.transformBox = 'fill-box'; flash.style.transformOrigin = 'center';
    $('pl-form').addEventListener('input', still);
    $('pl-play').addEventListener('click', play);
    still();
    let played = false;
    watch(svg, (v) => { if (v && !played) { played = true; play(); } });
  })();
})();
