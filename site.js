/* Page motion: reveal sections as they scroll in, stagger card groups, count the headline figures up once,
   focus the step in view, drift the Earth Signals photo, and run the maneuver planner. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = document.querySelectorAll('[data-reveal], [data-stagger]');
  document.querySelectorAll('[data-stagger]').forEach((g) => Array.from(g.children).forEach((c, i) => c.style.setProperty('--d', Math.min(i, 9) * 80 + 'ms')));
  const countUp = (root) => root.querySelectorAll('.big').forEach((el) => {
    const node = el.firstChild; if (!node || node.nodeType !== 3) return;
    const raw = node.textContent.replace(/,/g, '').trim(); if (!/^\d+$/.test(raw)) return; // 1.2 (M) stays as written
    const target = parseInt(raw, 10); if (!target || reduce) return;
    const t0 = performance.now(), dur = 1400;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.textContent = Math.round(target * e).toLocaleString('en-US'); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  if (!('IntersectionObserver' in window)) els.forEach((e) => e.classList.add('in'));
  else {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return; en.target.classList.add('in'); countUp(en.target); io.unobserve(en.target);
    }), { rootMargin: '0px 0px -10% 0px' });
    els.forEach((e) => io.observe(e));
  }

  // ---- scroll-linked: the step nearest the reading line is in focus; the photo drifts a little ----
  const flow = document.querySelector('.flow'), steps = flow ? Array.from(flow.children) : [];
  const photo = document.querySelector('[data-parallax]');
  let playing = -1, ticking = false;
  const setStep = (n) => steps.forEach((li, i) => li.classList.toggle('on', i === n));
  window.addEventListener('loqsat:step', (e) => { playing = e.detail; if (playing >= 0) setStep(playing); else onScroll(); });
  function onScroll() {
    ticking = false;
    const vh = innerHeight;
    if (steps.length && playing < 0) {
      const line = vh * 0.45; let best = -1, bd = Infinity;
      const top = flow.getBoundingClientRect();
      if (top.bottom > 0 && top.top < vh) steps.forEach((li, i) => { const r = li.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - line); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) setStep(best);
    }
    if (photo && !reduce) {
      const r = photo.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) { const k = ((r.top + r.height / 2) - vh / 2) / (vh / 2 + r.height / 2); photo.style.setProperty('--py', (k * -4).toFixed(2) + '%'); }
    }
  }
  if (flow && !reduce) flow.classList.add('live');
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } };
  addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); onScroll();

  // ---- maneuver planner ----
  const form = document.getElementById('planner');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const inMiss = $('p-miss'), inLead = $('p-lead'), inDv = $('p-dv');
  const PX = 60, CX = 320, CY = 180, EARLY = 24, SAFE = 1000; // 60 px per km on the drawing
  let XMAX = 300;
  const svg = $('planner-svg');
  function frameSvg() { // a narrower window on small screens keeps the labels readable
    const narrow = svg.clientWidth < 520, x0 = narrow ? 130 : 0, w = narrow ? 380 : 640;
    svg.setAttribute('viewBox', x0 + ' 0 ' + w + ' 340'); XMAX = x0 + w - CX - 20;
    $('p-along').setAttribute('x', x0 + 12); $('p-off').setAttribute('x', x0 + w - 12);
  }
  const km = (m) => (m < 1000 ? Math.round(m) + ' m' : (m < 100000 ? (m / 1000).toFixed(2) : Math.round(m / 1000).toLocaleString('en-US')) + ' km');
  const cm = (v) => (v < 0.1 ? v.toFixed(2) : v < 10 ? v.toFixed(2).replace(/0$/, '') : v.toFixed(1)) + ' cm/s';
  const fill = (el) => el.style.setProperty('--fill', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
  const shown = { miss: +inMiss.value, shift: 0 }, target = { miss: 0, shift: 0 };
  let anim = 0, say = 0;
  const live = $('p-live');
  function draw() {
    const y = CY - Math.min(shown.miss, 2600) / 1000 * PX, xr = shown.shift / 1000 * PX, x = CX + Math.min(xr, XMAX - 8);
    $('p-track').setAttribute('y1', y); $('p-track').setAttribute('y2', y);
    $('p-before').setAttribute('cy', y);
    $('p-after').setAttribute('cx', x); $('p-after').setAttribute('cy', y);
    $('p-push').setAttribute('y1', y); $('p-push').setAttribute('y2', y); $('p-push').setAttribute('x2', Math.max(CX, x - 9));
    $('p-gap').setAttribute('x2', x); $('p-gap').setAttribute('y2', y);
    $('p-off').setAttribute('y', y - 12); $('p-off').setAttribute('visibility', xr > XMAX - 8 ? 'visible' : 'hidden');
  }
  function tween() {
    const k = 0.18; let done = true;
    for (const key of ['miss', 'shift']) { const d = target[key] - shown[key]; if (Math.abs(d) > 0.5) { shown[key] += d * k; done = false; } else shown[key] = target[key]; }
    draw(); anim = done ? 0 : requestAnimationFrame(tween);
  }
  function update() {
    [inMiss, inLead, inDv].forEach(fill);
    const miss = +inMiss.value, hours = +inLead.value, dv = +inDv.value; // m, h, cm/s
    const shift = 3 * (dv / 100) * hours * 3600, sep = Math.hypot(miss, shift), ok = sep >= SAFE;
    $('p-miss-out').textContent = km(miss); $('p-lead-out').textContent = hours + ' h'; $('p-dv-out').textContent = cm(dv);
    $('p-sep').textContent = km(sep); $('p-shift').textContent = km(shift);
    const v = $('p-verdict'); v.textContent = ok ? 'Clears 1 km' : 'Inside 1 km'; v.className = 'status ' + (ok ? 'next' : 'warn');
    const n = (hours + EARLY) / hours, dvEarly = dv / n;
    $('p-early').innerHTML = 'Act ' + EARLY + ' hours earlier (' + (hours + EARLY) + ' h out) and a ' + cm(dvEarly) + ' burn gives the same result: <b>a burn ' + n.toFixed(1) + ' times smaller</b>.';
    const need = miss >= SAFE ? 0 : Math.sqrt(SAFE * SAFE - miss * miss) / (3 * hours * 3600) * 100;
    $('p-min').textContent = miss >= SAFE ? 'Already outside 1 km with no burn.' : 'Smallest burn that clears 1 km at ' + hours + ' h: ' + cm(need) + '. At ' + (hours + EARLY) + ' h it would be ' + cm(need * hours / (hours + EARLY)) + '.';
    target.miss = miss; target.shift = shift;
    inMiss.setAttribute('aria-valuetext', km(miss)); inLead.setAttribute('aria-valuetext', hours + ' hours'); inDv.setAttribute('aria-valuetext', cm(dv));
    clearTimeout(say); say = setTimeout(() => { live.textContent = 'New separation ' + km(sep) + ', ' + (ok ? 'clears' : 'inside') + ' 1 km. ' + $('p-early').textContent; }, 600);
    if (reduce) { shown.miss = miss; shown.shift = shift; draw(); } else if (!anim) anim = requestAnimationFrame(tween);
  }
  form.addEventListener('input', update);
  frameSvg(); addEventListener('resize', () => { frameSvg(); draw(); });
  update();
})();
