/* LoqSat orbit view: a WebGL Earth lit by the real sun, every satellite in the CelesTrak active catalogue, and one
   sample conjunction and its coordination record.
   Textures: public-domain Earth mosaics, via three-globe (MIT). */
(() => {
  const canvas = document.getElementById('globe');
  const wrap = document.getElementById('globe-wrap');
  if (!canvas || !window.THREE) { wrap && wrap.classList.add('no-gl'); return; }
  const T = THREE, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (T.ColorManagement) T.ColorManagement.enabled = false;
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { wrap.classList.add('no-gl'); return; }
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.LinearSRGBColorSpace || 'srgb-linear';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 1, 0.05, 200);
  const rad = Math.PI / 180, R_E = 6371, MU = 398600.4418, K = reduce ? 1 : 60;

  // ---- sun and earth rotation from the clock ----
  function astro(ms) {
    const d = ms / 86400000 + 2440587.5 - 2451545.0;
    const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = ((280.46061837 + 360.98564736629 * d) % 360) * rad;
    return { sun: new T.Vector3(Math.cos(dec) * Math.cos(ra), Math.sin(dec), -Math.cos(dec) * Math.sin(ra)), gmst, ra };
  }

  // ---- earth ----
  const loader = new T.TextureLoader();
  const tex = (f) => { const t = loader.load(f); t.anisotropy = 8; return t; };
  const earthMat = new T.ShaderMaterial({
    uniforms: { day: { value: tex('earth-day.jpg') }, night: { value: tex('earth-night.jpg') }, water: { value: tex('earth-water.jpg') }, sun: { value: new T.Vector3(1, 0, 0) } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform sampler2D water; uniform vec3 sun;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 n=normalize(vN); vec3 v=normalize(cameraPosition-vW); float d=dot(n,sun);
        vec3 dc=texture2D(day,vUv).rgb; vec3 nc=texture2D(night,vUv).rgb; float w=texture2D(water,vUv).r;
        float lit=smoothstep(-0.10,0.22,d);
        vec3 dayCol=dc*(0.30+0.92*clamp(d+0.18,0.0,1.0));
        vec3 h=normalize(sun+v); float spec=pow(max(dot(n,h),0.0),48.0)*w*0.55*lit;
        vec3 nightCol=nc*vec3(1.0,0.82,0.55)*1.6+dc*0.05;
        vec3 col=mix(nightCol,dayCol,lit)+spec*vec3(1.0,0.96,0.88);
        float fr=pow(1.0-max(dot(n,v),0.0),2.6);
        col=mix(col,vec3(0.56,0.76,1.0),fr*0.65*(0.25+0.75*lit));
        gl_FragColor=vec4(col,1.0);
      }`
  });
  const earth = new T.Mesh(new T.SphereGeometry(1, 160, 80), earthMat);
  scene.add(earth);
  const clouds = new T.Mesh(new T.SphereGeometry(1.008, 96, 48), new T.ShaderMaterial({
    uniforms: { map: { value: tex('earth-clouds.jpg') }, sun: earthMat.uniforms.sun }, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sun; varying vec2 vUv; varying vec3 vN;
      void main(){ float c=texture2D(map,vUv).r; float d=dot(normalize(vN),sun); float lit=smoothstep(-0.1,0.3,d); gl_FragColor=vec4(vec3(1.0)*(0.25+0.75*lit), c*0.8*(0.15+0.85*lit)); }`
  }));
  scene.add(clouds);

  // atmosphere: glow measured by how far the view ray passes from the limb
  const atmoMat = new T.ShaderMaterial({
    uniforms: { sun: earthMat.uniforms.sun },
    transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 sun; varying vec3 vW;
      void main(){
        vec3 dir=normalize(vW-cameraPosition); vec3 c=cameraPosition-dot(cameraPosition,dir)*dir; float b=length(c);
        float g = b>1.0 ? pow(clamp(1.0-(b-1.0)/0.16,0.0,1.0),2.6) : pow(b,10.0)*0.55;
        float day=clamp(dot(normalize(c),sun)*0.8+0.55,0.15,1.0);
        gl_FragColor=vec4(vec3(0.42,0.66,1.0),g*0.9*day);
      }`
  });
  scene.add(new T.Mesh(new T.SphereGeometry(1.16, 96, 48), atmoMat));

  // ---- satellites: the public active catalogue ----
  const pointMat = (size) => new T.ShaderMaterial({
    uniforms: { size: { value: size * renderer.getPixelRatio() }, maxR: { value: 100 }, dim: { value: 1 }, minS: { value: 0.55 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec3 color; attribute float scale; varying vec3 vC; uniform float size; uniform float maxR; uniform float minS;
      void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); float s = scale > 0.0 ? scale : 1.0;
        gl_PointSize = (scale < 0.0 || length(position) > maxR) ? 0.0 : size*s*clamp(3.2/-mv.z,minS,1.6); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; uniform float dim; void main(){ vec2 p=gl_PointCoord-0.5; float r=length(p); if(r>0.5) discard;
      vec3 col = r<0.30 ? vC : vec3(0.98,0.99,1.0); float a = r<0.40 ? 1.0 : (1.0-(r-0.40)/0.10)*0.85; gl_FragColor=vec4(col,a*dim); }`
  });
  const GROUPS = [
    { key: 'starlink', re: /^STARLINK/, color: 0x2f6fd6, scale: 1 },
    { key: 'oneweb', re: /^ONEWEB/, color: 0x7a4fd0, scale: 1 },
    { key: 'nav', re: /NAVSTAR|GPS |GLONASS|GALILEO|GSAT0|BEIDOU|IRNSS|QZS/, color: 0x1f9e6e, scale: 1.5 },
    { key: 'stations', re: /^(ISS \(|CSS \(|TIANGONG)/, color: 0xe2672b, scale: 2.2 },
    { key: 'other', re: /./, color: 0x334a6b, scale: 1 }
  ];
  const sat = window.satellite, cat = window.LOQSAT_CATALOGUE;
  const rows = (sat && cat && cat.rows) || [];
  const N = rows.length, recs = new Array(N), grp = new Uint8Array(N), meta = new Array(N);
  const eci = new Float32Array(N * 3), vel = new Float32Array(N * 3), om = new Float32Array(N), at = new Float64Array(N);
  const satPos = new Float32Array(N * 3), satCol = new Float32Array(N * 3), satScale = new Float32Array(N);
  const groupOn = GROUPS.map(() => true), groupCount = GROUPS.map(() => 0);
  rows.forEach(([name, l1, l2], i) => {
    try { recs[i] = sat.twoline2satrec(l1, l2); } catch (e) { recs[i] = null; }
    const g = GROUPS.findIndex((x) => x.re.test(name)); grp[i] = g; groupCount[g]++;
    meta[i] = { name, norad: l1.slice(2, 7).trim() };
    const c = new T.Color(GROUPS[g].color); satCol.set([c.r, c.g, c.b], i * 3); satScale[i] = GROUPS[g].scale;
  });
  const satGeo = new T.BufferGeometry();
  satGeo.setAttribute('position', new T.BufferAttribute(satPos, 3)); satGeo.setAttribute('color', new T.BufferAttribute(satCol, 3)); satGeo.setAttribute('scale', new T.BufferAttribute(satScale, 1));
  const satMat = pointMat(4.4), satPts = new T.Points(satGeo, satMat); satPts.frustumCulled = false; scene.add(satPts);
  function prop(i, ms) {
    const r = recs[i]; at[i] = ms; if (!r) { eci[i * 3] = NaN; return; }
    let pv; try { pv = sat.propagate(r, new Date(ms)); } catch (e) { pv = null; }
    if (!pv || !pv.position || isNaN(pv.position.x)) { eci[i * 3] = NaN; return; }
    // TEME km to scene units: x stays, scene y is north (eci z), scene z is -eci y
    eci[i * 3] = pv.position.x / R_E; eci[i * 3 + 1] = pv.position.z / R_E; eci[i * 3 + 2] = -pv.position.y / R_E;
    // q: the in-plane vector 90 degrees ahead of p, same length; om: angular rate. Positions between
    // propagations rotate p toward q, which is exact for a circular orbit and close for near-circular ones.
    const px = eci[i * 3], py = eci[i * 3 + 1], pz = eci[i * 3 + 2], vx = pv.velocity.x / R_E, vy = pv.velocity.z / R_E, vz = -pv.velocity.y / R_E;
    const hx = py * vz - pz * vy, hy = pz * vx - px * vz, hz = px * vy - py * vx, h = Math.hypot(hx, hy, hz), rr = Math.hypot(px, py, pz);
    const qx = (hy * pz - hz * py) / h, qy = (hz * px - hx * pz) / h, qz = (hx * py - hy * px) / h;
    vel[i * 3] = qx; vel[i * 3 + 1] = qy; vel[i * 3 + 2] = qz; om[i] = h / (rr * rr);
  }
  let cursor = 0;
  function updateSats(ms, budget) {
    for (let k = 0; k < budget && N; k++) { prop(cursor, ms); cursor = (cursor + 1) % N; }
    for (let i = 0; i < N; i++) {
      const dt = (ms - at[i]) / 1000, x = eci[i * 3];
      if (x !== x || !groupOn[grp[i]]) { satScale[i] = -1; continue; }
      satScale[i] = GROUPS[grp[i]].scale;
      const th = om[i] * dt, c = Math.cos(th), sn = Math.sin(th);
      satPos[i * 3] = x * c + vel[i * 3] * sn; satPos[i * 3 + 1] = eci[i * 3 + 1] * c + vel[i * 3 + 1] * sn; satPos[i * 3 + 2] = eci[i * 3 + 2] * c + vel[i * 3 + 2] * sn;
    }
    satGeo.attributes.position.needsUpdate = true; satGeo.attributes.scale.needsUpdate = true;
  }

  // ---- the sample conjunction ----
  const conj = { active: false, P: new T.Vector3(), aim: new T.Vector3(0, 0, 1), a: null, b: null, tca: 0, phase: 0, raise: 0 };
  const lineMat = (hex, op) => new T.LineBasicMaterial({ color: hex, transparent: true, opacity: op, depthWrite: false });
  const ringGeo = (u, v, r) => { const p = []; for (let i = 0; i <= 256; i++) { const t = i / 256 * 2 * Math.PI; p.push(u.clone().multiplyScalar(Math.cos(t) * r).add(v.clone().multiplyScalar(Math.sin(t) * r))); } return new T.BufferGeometry().setFromPoints(p); };
  const ringA = new T.Line(new T.BufferGeometry(), lineMat(0xe2672b, 0.95)), ringB = new T.Line(new T.BufferGeometry(), lineMat(0x2f6fd6, 0.95));
  const ringA0 = new T.Line(new T.BufferGeometry(), new T.LineDashedMaterial({ color: 0xe2672b, dashSize: 0.02, gapSize: 0.02, transparent: true, opacity: 0.6 }));
  [ringA, ringB, ringA0].forEach((l) => { l.visible = false; scene.add(l); });
  const pairGeo = new T.BufferGeometry(); pairGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
  pairGeo.setAttribute('color', new T.BufferAttribute(new Float32Array([0.886, 0.404, 0.169, 0.184, 0.435, 0.839]), 3));
  const pair = new T.Points(pairGeo, pointMat(13)); pair.visible = false; pair.frustumCulled = false; pair.renderOrder = 3; scene.add(pair);
  const marker = new T.Mesh(new T.RingGeometry(0.018, 0.024, 48), new T.MeshBasicMaterial({ color: 0xe2672b, transparent: true, side: T.DoubleSide, depthWrite: false }));
  marker.visible = false; scene.add(marker);

  // ---- camera: follows the sun so the lit side faces the viewer; drag to turn ----
  const view = { yaw: -0.98, pitch: 0.24, dist: 5.4, tYaw: -0.98, tPitch: 0.24, tDist: 5.4, focus: null, focusK: 0 };
  // with nobody touching it, the view turns slowly round the polar axis (west to east), which shows the Earth
  // turning with its satellites and its real lighting together; it waits a moment after a drag or key press
  const SPIN = 0.05, SPIN_WAIT = 2.5;
  let simMs = Date.now(), last = performance.now(), dragging = null, idle = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; view.tYaw -= (e.clientX - dragging.x) * 0.005; view.tPitch = Math.max(-1.2, Math.min(1.2, view.tPitch + (e.clientY - dragging.y) * 0.004)); dragging = { x: e.clientX, y: e.clientY }; idle = 0; });
  const endDrag = () => { dragging = null; idle = 0; }; canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (e) => { const k = { ArrowLeft: [0.15, 0], ArrowRight: [-0.15, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[e.key]; if (!k) return; e.preventDefault(); view.tYaw += k[0]; view.tPitch = Math.max(-1.2, Math.min(1.2, view.tPitch + k[1])); idle = 0; });

  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(canvas); resize();

  const countEl = document.getElementById('globe-count'), clockEl = document.getElementById('globe-clock'), tag = document.getElementById('tag');
  const caption = document.getElementById('globe-caption'), capStep = document.getElementById('cap-step'), capNow = document.getElementById('cap-now');
  const pad = (n) => String(n).padStart(2, '0'), utc = (ms) => { const d = new Date(ms); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC'; };
  function updateCount() { let n = 0; GROUPS.forEach((g, i) => { if (groupOn[i]) n += groupCount[i]; }); if (countEl) countEl.textContent = n.toLocaleString('en-US'); }
  updateCount();
  document.querySelectorAll('[data-group]').forEach((b) => {
    const i = GROUPS.findIndex((g) => g.key === b.dataset.group), c = b.querySelector('.measure');
    if (c && i >= 0) c.textContent = groupCount[i].toLocaleString('en-US');
    b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); groupOn[i] = on; updateCount(); });
  });
  let farView = false, speed = K;
  const homeDist = () => (farView ? 12 : 5.4);
  document.querySelectorAll('[data-far]').forEach((b) => b.addEventListener('click', () => {
    farView = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', farView); view.tPitch = farView ? 0.55 : 0.24; if (!conj.active) view.tDist = homeDist();
  }));
  const speedEl = document.getElementById('globe-speed');
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    const real = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', real);
    speed = real ? 1 : K; if (real) simMs = Date.now(); if (speedEl) speedEl.textContent = real ? 'Real time' : K + '× real time';
  }));
  // click a dot to name it
  let downAt = null, picked = -1;
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4 || conj.active) return;
    const rc = canvas.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top;
    const cp = camera.position, v = new T.Vector3(); let best = -1, bd = 14 * 14;
    for (let i = 0; i < N; i++) { if (satScale[i] < 0) continue; v.set(satPos[i * 3], satPos[i * 3 + 1], satPos[i * 3 + 2]);
      if (v.length() > satMat.uniforms.maxR.value) continue;
      // skip dots hidden behind the Earth
      const toS = v.clone().sub(cp), L = toS.length(); toS.divideScalar(L); const tc = -cp.dot(toS), d2 = cp.lengthSq() - tc * tc;
      if (d2 < 1 && tc < L) continue;
      v.project(camera); const x = (v.x * 0.5 + 0.5) * rc.width, y = (-v.y * 0.5 + 0.5) * rc.height, dd = (x - mx) ** 2 + (y - my) ** 2;
      if (dd < bd) { bd = dd; best = i; } }
    picked = best; if (best < 0) tag.classList.remove('on');
  });

  let visible = true;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(canvas);
  const tmp = new T.Vector3(), camDir = new T.Vector3();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!visible) return;
    const slow = conj.active ? conj.timeScale : 1;
    simMs += dt * 1000 * (conj.active ? K : speed) * slow;
    const a = astro(simMs); earthMat.uniforms.sun.value.copy(a.sun); earth.rotation.y = a.gmst; clouds.rotation.y = a.gmst + simMs / 1000 * 2e-6;
    const t = simMs / 1000;
    updateSats(simMs, Math.ceil(N / 40));
    satMat.uniforms.maxR.value = view.dist > 9 ? 100 : 3.2; satMat.uniforms.minS.value = view.dist > 9 ? 0.7 : 0.55;
    satMat.uniforms.dim.value += ((conj.active ? 0.22 : 1) - satMat.uniforms.dim.value) * Math.min(1, dt * 3);

    // camera
    if (!dragging && !conj.active && !reduce) { idle += dt; if (idle > SPIN_WAIT) { const s = SPIN * dt * Math.min(1, (idle - SPIN_WAIT) / 2); view.tYaw -= s; view.yaw -= s; } }
    const k = 1 - Math.pow(0.0015, dt);
    view.yaw += (view.tYaw - view.yaw) * k; view.pitch += (view.tPitch - view.pitch) * k; view.dist += (view.tDist - view.dist) * k * 0.6;
    const sunAz = Math.atan2(-a.sun.z, a.sun.x);
    const az = sunAz + view.yaw, el = view.pitch;
    camDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az));
    view.focusK += ((conj.active ? 1 : 0) - view.focusK) * k * 0.7;
    if (view.focusK > 0.001) camDir.lerp(conj.aim, view.focusK).normalize();
    camera.position.copy(camDir).multiplyScalar(view.dist);
    camera.lookAt(0, 0, 0);
    // keep the globe a little right of centre on wide screens
    const w = canvas.clientWidth; camera.setViewOffset(w, canvas.clientHeight, 0, 0, w, canvas.clientHeight);

    if (conj.active) stepConj(t, now); else if (picked >= 0) showPick();
    renderer.render(scene, camera);
    if (clockEl && Math.floor(now / 500) !== frame.lastTick) { frame.lastTick = Math.floor(now / 500); clockEl.textContent = utc(simMs); }
  }

  function showPick() {
    const i = picked; tmp.set(satPos[i * 3], satPos[i * 3 + 1], satPos[i * 3 + 2]); const alt = Math.round((tmp.length() - 1) * R_E);
    tmp.project(camera); tag.style.left = (tmp.x * 0.5 + 0.5) * canvas.clientWidth + 'px'; tag.style.top = (-tmp.y * 0.5 + 0.5) * canvas.clientHeight + 'px';
    const html = meta[i].name + ' · NORAD ' + meta[i].norad + ' · <b>' + alt.toLocaleString('en-US') + ' km</b>';
    if (tag.innerHTML !== html) tag.innerHTML = html; tag.classList.add('on');
  }
  function orbitPos(o, t, r) { const th = o.w * (t - conj.tcaS); return o.u.clone().multiplyScalar(Math.cos(th) * r).add(o.v.clone().multiplyScalar(Math.sin(th) * r)); }
  function stepConj(t, now) {
    const rA = conj.a.r + conj.raise, pA = orbitPos(conj.a, t, rA), pB = orbitPos(conj.b, t, conj.b.r);
    const arr = pairGeo.attributes.position.array; arr.set([pA.x, pA.y, pA.z, pB.x, pB.y, pB.z]); pairGeo.attributes.position.needsUpdate = true;
    marker.position.copy(conj.P); marker.lookAt(conj.P.clone().multiplyScalar(2));
    const pulse = 1 + 0.35 * Math.sin(now / 180); marker.scale.setScalar(conj.raise ? 1 : pulse);
    // narration sits in a caption at the corner of the globe, clear of the two spacecraft and the marker
    const left = conj.tcaS - t, mins = Math.max(0, Math.round(left / 60));
    const html = conj.label || (left > 0 ? 'Closest approach in ' + mins + ' min · <b>miss 182 m</b>' : 'Passed');
    if (capNow && capNow.innerHTML !== html) capNow.innerHTML = html;
    if (capStep && capStep.textContent !== conj.step) capStep.textContent = conj.step;
  }

  // ---- the coordination record ----
  const list = document.getElementById('record-list'), state = document.getElementById('record-state');
  const btnVerify = document.querySelector('[data-verify]'), btnTamper = document.querySelector('[data-tamper]');
  async function sha(text) { if (!crypto.subtle) return null; const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''); }
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 150) : ms));
  const GENESIS = '0'.repeat(64);
  let running = false, entries = [], tampered = false;
  const body = (e) => e.time + '|' + e.actor + '|' + e.text;
  function row(e, i) {
    const tr = document.createElement('tr'); tr.className = e.cls || '';
    tr.innerHTML = '<td class="measure"></td><td class="measure"></td><td></td><td></td><td class="measure h"></td>';
    tr.children[0].textContent = String(i + 1).padStart(2, '0'); tr.children[1].textContent = e.time;
    tr.children[2].textContent = e.actor; tr.children[3].textContent = e.text; tr.children[4].textContent = e.hash.slice(0, 12);
    return tr;
  }
  function render() { if (!list) return; list.innerHTML = ''; entries.forEach((e, i) => { const tr = row(e, i); list.appendChild(tr); requestAnimationFrame(() => tr.classList.add('in')); }); }
  async function record(actor, text, cls) {
    const prevHash = entries.length ? entries[entries.length - 1].hash : GENESIS;
    const e = { time: utc(simMs), actor, text, cls }; e.hash = (await sha(prevHash + '\n' + body(e))) || '-'.repeat(64);
    entries.push(e);
    if (list) { const tr = row(e, entries.length - 1); list.appendChild(tr); requestAnimationFrame(() => tr.classList.add('in')); }
    conj.step = entries.length + ' of 6 · ' + text;
    dispatchEvent(new CustomEvent('loqsat:step', { detail: [0, 1, 2, 3, 4, 4][entries.length - 1] }));
    setState('Recording', '');
  }
  function setState(text, cls) { if (state) { state.textContent = text; state.className = 'state ' + cls; } }
  async function verify() {
    if (!entries.length) { setState('Nothing recorded yet. Run a conjunction first.', ''); return; }
    let prev = GENESIS, bad = -1;
    for (let i = 0; i < entries.length; i++) { const h = await sha(prev + '\n' + body(entries[i])); if (h !== entries[i].hash && bad < 0) bad = i; prev = entries[i].hash; }
    list && Array.from(list.children).forEach((tr, i) => tr.classList.toggle('broken', bad >= 0 && i >= bad));
    if (bad < 0) setState('Chain verified. All ' + entries.length + ' hashes match.', 'ok');
    else setState('Chain broken at entry ' + String(bad + 1).padStart(2, '0') + '. Its hash no longer matches what was written.', 'bad');
  }
  btnVerify && btnVerify.addEventListener('click', verify);
  btnTamper && btnTamper.addEventListener('click', () => {
    if (entries.length < 2) { setState('Run a conjunction first, then try to change it.', ''); return; }
    const e = entries[1];
    if (!tampered) { e.orig = e.text; e.text = e.text.replace('182 m', '1,820 m'); tampered = true; btnTamper.textContent = 'Put entry 02 back'; }
    else { e.text = e.orig; tampered = false; btnTamper.textContent = 'Change entry 02'; }
    list.children[1].children[3].textContent = e.text; verify();
  });
  function setup() {
    // pick a point a little up and right of where the camera is looking, at 550 km
    const up = new T.Vector3(0, 1, 0), right = new T.Vector3().crossVectors(camDir, up).normalize();
    const P = camDir.clone().add(right.multiplyScalar(0.12)).add(new T.Vector3(0, 0.14, 0)).normalize();
    const r = 1 + 550 / R_E, w = Math.sqrt(MU / Math.pow(r * R_E, 3));
    const t1 = new T.Vector3().crossVectors(P, up).normalize(), t2 = new T.Vector3().crossVectors(P, t1).normalize();
    const vA = t1.clone().multiplyScalar(Math.cos(0.5)).add(t2.clone().multiplyScalar(Math.sin(0.5))).normalize();
    const vB = t1.clone().multiplyScalar(Math.cos(2.0)).add(t2.clone().multiplyScalar(Math.sin(2.0))).normalize();
    conj.P.copy(P).multiplyScalar(r);
    // aim the camera just below P, so the approach sits a little above the middle of the view
    const rs = new T.Vector3().crossVectors(up, P).normalize(), us = new T.Vector3().crossVectors(rs, P.clone().negate()).normalize();
    conj.aim = P.clone().add(rs.multiplyScalar(0.06)).add(us.multiplyScalar(-0.1)).normalize();
    conj.a = { u: P.clone(), v: vA, r, w }; conj.b = { u: P.clone(), v: vB, r: r + 0.00003, w };
    conj.raise = 0; conj.label = '';
    ringA.geometry.dispose(); ringA.geometry = ringGeo(conj.a.u, conj.a.v, r);
    ringB.geometry.dispose(); ringB.geometry = ringGeo(conj.b.u, conj.b.v, conj.b.r);
    ringA0.geometry.dispose(); ringA0.geometry = ringGeo(conj.a.u, conj.a.v, r); ringA0.computeLineDistances(); ringA0.visible = false;
    [ringA, ringB, pair, marker].forEach((m) => { m.visible = true; });
  }
  async function run(btn) {
    if (running) return; running = true; picked = -1; btn && (btn.disabled = true);
    // on a narrow screen the globe sits below the button: bring it into view so the run can be watched
    if (btn && btn.closest('.hero')) { const r = wrap.getBoundingClientRect(); if (r.bottom > innerHeight + 4) wrap.scrollIntoView({ block: 'end', behavior: reduce ? 'auto' : 'smooth' }); }
    entries = []; tampered = false; if (btnTamper) btnTamper.textContent = 'Change entry 02'; if (list) list.innerHTML = ''; conj.step = '';
    setup();
    const simWin = 3 * 60; // sample: three simulated minutes of approach, slowed for the viewer
    conj.timeScale = 0.12; conj.tcaS = simMs / 1000 + simWin; conj.active = true; tag.classList.remove('on'); caption && caption.classList.add('on'); wrap.classList.add('playing');
    view.tDist = 3.9;
    await record('Operator A', 'Screening request for spacecraft A');
    await wait(1100);
    await record('Data supplier', 'CDM received: miss 182 m, Pc 2.1e-4', 'warn');
    await wait(1100);
    await record('LoqSat', 'Same advisory routed to A and B');
    await wait(1100);
    await record('Operator A', 'Offers a +0.12 m/s burn');
    await wait(1000);
    await record('Operator B', 'Accepts. Agreement recorded', 'done');
    ringA0.visible = true;
    const r0 = conj.a.r, r1 = r0 + 0.012; // drawn exaggerated so the change is visible
    const t0 = performance.now(); await new Promise((res) => { const go = (n) => { const k = Math.min(1, (n - t0) / (reduce ? 1 : 1200)); conj.raise = (r1 - r0) * (1 - Math.pow(1 - k, 3)); ringA.geometry.dispose(); ringA.geometry = ringGeo(conj.a.u, conj.a.v, r0 + conj.raise); k < 1 ? requestAnimationFrame(go) : res(); }; requestAnimationFrame(go); });
    conj.label = 'After burn · <b>miss 1.4 km</b>';
    conj.timeScale = 1;
    await new Promise((res) => { const chk = () => (simMs / 1000 > conj.tcaS + 40 ? res() : setTimeout(chk, 100)); chk(); });
    await record('LoqSat', 'Closest approach passed at 1.4 km. Closed', 'done');
    setState('Event closed. Press Verify, or try changing an entry.', '');
    await wait(2200);
    caption && caption.classList.remove('on'); wrap.classList.remove('playing'); conj.active = false;
    dispatchEvent(new CustomEvent('loqsat:step', { detail: -1 }));
    [ringA, ringB, ringA0, pair, marker].forEach((m) => { m.visible = false; });
    view.tDist = homeDist(); idle = 0;
    running = false; btn && (btn.disabled = false);
  }
  document.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => run(b)));
  requestAnimationFrame(frame);
})();
