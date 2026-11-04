/* Page motion: reveal sections as they scroll in, stagger card groups, count the headline figures up once,
   focus the step in view and drift the Earth Signals photo. The illustrated scenes and the planner are in scenes.js. */
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
})();
