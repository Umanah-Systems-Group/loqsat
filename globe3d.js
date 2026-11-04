/* LoqSat orbit view: a WebGL Earth lit by the real sun, every satellite in the CelesTrak active catalogue, and one
   sample conjunction and its coordination record.
   The look follows the app sign-in (deploy/public-demo/public/auth/assets/space.js): the same Earth, cloud and
   atmosphere shaders, the same starfield, the same satellite colours, and a few named satellites with orbit trails.
   On wide screens the canvas fills the hero and the Earth sits to the right of the copy; on narrow screens it is a
   square below the copy.
   Textures: public-domain Earth mosaics, via three-globe (MIT). */
(() => {
  const canvas = document.getElementById('globe');
  const wrap = document.getElementById('globe-wrap');
  if (!canvas || !window.THREE) { wrap && wrap.classList.add('no-gl'); return; }
  const T = THREE, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (T.ColorManagement) T.ColorManagement.enabled = false;
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false }); }
  catch (e) { wrap.classList.add('no-gl'); return; }
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.LinearSRGBColorSpace || 'srgb-linear';
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x02040a, 1);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 1, 0.05, 400);
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

  // ---- stars: fixed in the inertial frame, with a denser band for the Milky Way (as on the sign-in) ----
  (function stars() {
    const n = 2600, pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 3);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const band = new T.Vector3(0.35, 0.86, 0.37).normalize(), v = new T.Vector3();
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
      v.set(sq * Math.cos(th), u, sq * Math.sin(th));
      if (i % 5 < 2) { const off = v.dot(band); v.addScaledVector(band, -off * (1 - Math.abs((rnd() - 0.5) * 0.5))).normalize(); }
      pos.set([v.x * 160, v.y * 160, v.z * 160], i * 3);
      const b = Math.pow(rnd(), 3.2), warm = rnd();
      size[i] = 0.7 + b * 2.2;
      col.set([(0.55 + 0.45 * b) * (warm > 0.8 ? 1.0 : 0.85), (0.6 + 0.4 * b) * 0.92, (0.7 + 0.3 * b) * (warm > 0.8 ? 0.8 : 1.0)], i * 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('size', new T.BufferAttribute(size, 1)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    const p = new T.Points(g, new T.ShaderMaterial({
      uniforms: { dpr: { value: DPR } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'attribute float size; attribute vec3 color; uniform float dpr; varying vec3 vC; void main(){ vC=color; gl_PointSize=size*dpr; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vC; void main(){ vec2 q=gl_PointCoord*2.0-1.0; float r=dot(q,q); if(r>1.0) discard; gl_FragColor=vec4(vC*exp(-r*4.0)*0.9,1.0); }'
    }));
    p.frustumCulled = false; scene.add(p);
  })();

  // ---- earth, clouds, atmosphere: city lights at night, a warm band on the terminator, a faint night graticule ----
  const loader = new T.TextureLoader();
  const tex = (f) => { const t = loader.load(f); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };
  const big = Math.max(screen.width || 0, screen.height || 0) * DPR > 1800;
  const earthMat = new T.ShaderMaterial({
    uniforms: { day: { value: tex(big ? 'earth-day.jpg' : 'earth-day-2k.jpg') }, night: { value: tex('earth-night.jpg') }, water: { value: tex('earth-water.jpg') }, sun: { value: new T.Vector3(1, 0, 0) } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform sampler2D water; uniform vec3 sun;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 n=normalize(vN); vec3 v=normalize(cameraPosition-vW); float d=dot(n,sun);
        vec3 dc=texture2D(day,vUv).rgb; vec3 nc=texture2D(night,vUv).rgb; float w=texture2D(water,vUv).r;
        float lit=smoothstep(-0.16,0.16,d); float fr=pow(1.0-max(dot(n,v),0.0),2.4);
        vec3 dayCol=dc*(0.34+1.2*clamp(d+0.18,0.0,1.0));
        vec3 h=normalize(sun+v); float spec=pow(max(dot(n,h),0.0),110.0)*w*0.26*smoothstep(0.15,0.5,d);
        float city=smoothstep(0.16,0.55,nc.r); vec3 nightCol=nc*city*vec3(2.2,1.75,1.1)+dc*vec3(0.11,0.13,0.20);
        vec3 col=mix(nightCol,dayCol,lit)+spec*vec3(1.0,0.93,0.82);
        col+=vec3(1.0,0.45,0.2)*exp(-pow((d-0.02)/0.05,2.0))*0.035*(1.0-fr);
        col=mix(col,vec3(0.40,0.66,1.0),fr*0.75*(0.12+0.88*smoothstep(-0.25,0.35,d)));
        vec2 gq=abs(fract(vec2(vUv.x*24.0,vUv.y*12.0)+0.5)-0.5)/fwidth(vec2(vUv.x*24.0,vUv.y*12.0));
        float grid=1.0-min(min(gq.x,gq.y),1.0);
        col+=vec3(0.30,0.75,0.95)*grid*0.07*(1.0-lit)*(1.0-fr);
        gl_FragColor=vec4(col,1.0);
      }`
  });
  earthMat.extensions = { derivatives: true };
  const earth = new T.Mesh(new T.SphereGeometry(1, 160, 80), earthMat);
  scene.add(earth);
  const clouds = new T.Mesh(new T.SphereGeometry(1.006, 128, 64), new T.ShaderMaterial({
    uniforms: { map: { value: tex('earth-clouds.jpg') }, sun: earthMat.uniforms.sun }, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sun; varying vec2 vUv; varying vec3 vN;
      void main(){ float c=texture2D(map,vUv).r; float d=dot(normalize(vN),sun); float lit=smoothstep(-0.1,0.3,d); gl_FragColor=vec4(vec3(1.0,0.99,0.97)*(0.1+0.9*lit), c*0.82*(0.06+0.94*lit)); }`
  }));
  scene.add(clouds);
  // atmosphere: glow measured by how far the view ray passes from the limb, blue by day, deep blue at night
  scene.add(new T.Mesh(new T.SphereGeometry(1.16, 96, 48), new T.ShaderMaterial({
    uniforms: { sun: earthMat.uniforms.sun }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 sun; varying vec3 vW;
      void main(){ vec3 dir=normalize(vW-cameraPosition); vec3 c=cameraPosition-dot(cameraPosition,dir)*dir; float b=length(c);
        if(b<1.0) discard;
        float g=pow(clamp(1.0-(b-1.0)/0.16,0.0,1.0),3.2);
        float s=dot(normalize(c),sun); float day=smoothstep(-0.45,0.6,s);
        vec3 tint=mix(vec3(0.16,0.30,0.75),vec3(0.42,0.70,1.0),day)+vec3(0.9,0.45,0.2)*exp(-pow(s/0.22,2.0))*0.35;
        gl_FragColor=vec4(tint*g*(0.18+0.95*day),1.0); }`
  })));

  // ---- satellites: the public active catalogue ----
  // glow: the sign-in's additive dot (a bright core and a soft halo); otherwise a solid dot with a white rim
  const pointMat = (size, glow) => new T.ShaderMaterial({
    uniforms: { size: { value: size * renderer.getPixelRatio() }, maxR: { value: 100 }, dim: { value: 1 }, minS: { value: 0.55 } }, transparent: true, depthWrite: false,
    blending: glow ? T.AdditiveBlending : T.NormalBlending,
    vertexShader: `attribute vec3 color; attribute float scale; varying vec3 vC; uniform float size; uniform float maxR; uniform float minS;
      void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); float s = scale > 0.0 ? scale : 1.0;
        gl_PointSize = (scale < 0.0 || length(position) > maxR) ? 0.0 : size*s*clamp(3.2/-mv.z,minS,1.6); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: glow
      ? `varying vec3 vC; uniform float dim; void main(){ vec2 q=gl_PointCoord*2.0-1.0; float r=dot(q,q); if(r>1.0) discard;
          float core=exp(-r*9.0); float halo=exp(-r*2.6)*0.28; gl_FragColor=vec4((vC*(core+halo)+vec3(core*0.45))*dim,1.0); }`
      : `varying vec3 vC; uniform float dim; void main(){ vec2 p=gl_PointCoord-0.5; float r=length(p); if(r>0.5) discard;
          vec3 col = r<0.30 ? vC : vec3(0.98,0.99,1.0); float a = r<0.40 ? 1.0 : (1.0-(r-0.40)/0.10)*0.85; gl_FragColor=vec4(col,a*dim); }`
  });
  const GROUPS = [
    // the sign-in's colours; alpha dims the crowded groups so the Earth stays readable through them
    { key: 'starlink', re: /^STARLINK/, color: 0x8FE8FF, alpha: 0.55, scale: 0.8 },
    { key: 'oneweb', re: /^ONEWEB/, color: 0xBAA3FF, alpha: 0.9, scale: 1.1 },
    { key: 'nav', re: /NAVSTAR|GPS |GLONASS|GALILEO|GSAT0|BEIDOU|IRNSS|QZS/, color: 0xFFD673, alpha: 1, scale: 1.6 },
    { key: 'stations', re: /^(ISS \(|CSS \(|TIANGONG)/, color: 0xFF7A66, alpha: 1, scale: 2.4 },
    { key: 'other', re: /./, color: 0x7FA0FF, alpha: 0.5, scale: 0.85 }
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
    const c = new T.Color(GROUPS[g].color), al = GROUPS[g].alpha; satCol.set([c.r * al, c.g * al, c.b * al], i * 3); satScale[i] = GROUPS[g].scale;
  });
  const satGeo = new T.BufferGeometry();
  satGeo.setAttribute('position', new T.BufferAttribute(satPos, 3)); satGeo.setAttribute('color', new T.BufferAttribute(satCol, 3)); satGeo.setAttribute('scale', new T.BufferAttribute(satScale, 1));
  const satMat = pointMat(6.5, true), satPts = new T.Points(satGeo, satMat); satPts.frustumCulled = false; scene.add(satPts);
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

  // ---- a few named satellites with orbit trails and labels, as on the sign-in ----
  // One orbit of points, propagated once in the inertial frame; a bright head runs round it with the satellite.
  const TRAILED = [[/^ISS \(ZARYA\)$/, 'ISS'], [/^CSS \(TIANHE\)$/, 'TIANGONG'], [/^HST$/, 'HUBBLE'], [/^ONEWEB-0360$/, 'ONEWEB-0360']];
  const trails = [], labelHost = wrap;
  const trailMat = (hex) => { const c = new T.Color(hex); return new T.ShaderMaterial({
    uniforms: { head: { value: 0 }, px: { value: 1000 }, fade: { value: 1 }, col: { value: new T.Vector3(c.r, c.g, c.b) } },
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: `attribute float ph; uniform float head; uniform float px; uniform float fade; varying float vA;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
        float d=fract(head-ph+1.0); float k=d<0.30 ? pow(1.0-d/0.30,2.2) : 0.0;
        vA=fade*(0.10+0.90*k); gl_PointSize=clamp((0.006+0.016*pow(k,8.0))*px/-mv.z,1.5,9.0); }`,
    fragmentShader: `uniform vec3 col; varying float vA; void main(){ vec2 q=gl_PointCoord*2.0-1.0; float r=dot(q,q); if(r>1.0) discard; gl_FragColor=vec4((col+vec3(0.25))*exp(-r*3.0)*vA,1.0); }`
  }); };
  if (sat) TRAILED.forEach(([re, label]) => {
    const i = meta.findIndex((m) => m && re.test(m.name)); if (i < 0 || !recs[i]) return;
    const period = 2 * Math.PI / recs[i].no * 60000, t0 = Date.now(), n = 900, pos = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let pv; try { pv = sat.propagate(recs[i], new Date(t0 + period * k / (n - 1))); } catch (e) { pv = null; }
      if (!pv || !pv.position || isNaN(pv.position.x)) return;
      pos.set([pv.position.x / R_E, pv.position.z / R_E, -pv.position.y / R_E], k * 3); ph[k] = k / (n - 1);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('ph', new T.BufferAttribute(ph, 1));
    const mat = trailMat(GROUPS[grp[i]].color), pts = new T.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
    const el = document.createElement('div'); el.className = 'sat-label'; el.setAttribute('aria-hidden', 'true'); el.textContent = label; labelHost.appendChild(el);
    trails.push({ i, t0, period, pos, n, mat, pts, el });
  });

  // ---- the sample conjunction ----
  const conj = { active: false, P: new T.Vector3(), aim: new T.Vector3(0, 0, 1), a: null, b: null, tca: 0, phase: 0, raise: 0 };
  const lineMat = (hex, op) => new T.LineBasicMaterial({ color: hex, transparent: true, opacity: op, depthWrite: false });
  const ringGeo = (u, v, r) => { const p = []; for (let i = 0; i <= 256; i++) { const t = i / 256 * 2 * Math.PI; p.push(u.clone().multiplyScalar(Math.cos(t) * r).add(v.clone().multiplyScalar(Math.sin(t) * r))); } return new T.BufferGeometry().setFromPoints(p); };
  const ringA = new T.Line(new T.BufferGeometry(), lineMat(0xFF8A5C, 0.95)), ringB = new T.Line(new T.BufferGeometry(), lineMat(0x47D7EA, 0.95));
  const ringA0 = new T.Line(new T.BufferGeometry(), new T.LineDashedMaterial({ color: 0xFF8A5C, dashSize: 0.02, gapSize: 0.02, transparent: true, opacity: 0.6 }));
  [ringA, ringB, ringA0].forEach((l) => { l.visible = false; scene.add(l); });
  const pairGeo = new T.BufferGeometry(); pairGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
  pairGeo.setAttribute('color', new T.BufferAttribute(new Float32Array([1.0, 0.541, 0.361, 0.278, 0.843, 0.918]), 3));
  const pair = new T.Points(pairGeo, pointMat(13)); pair.visible = false; pair.frustumCulled = false; pair.renderOrder = 3; scene.add(pair);
  const marker = new T.Mesh(new T.RingGeometry(0.018, 0.024, 48), new T.MeshBasicMaterial({ color: 0xFF8A5C, transparent: true, side: T.DoubleSide, depthWrite: false }));
  marker.visible = false; scene.add(marker);

  // ---- where the visitor is, roughly, from the browser's time zone (no permission asked, nothing stored or sent) ----
  const ZONES = { 'America/New_York': [40.7, -74], 'America/Chicago': [41.9, -87.6], 'America/Denver': [39.7, -105], 'America/Phoenix': [33.4, -112], 'America/Los_Angeles': [34, -118.2],
    'America/Anchorage': [61.2, -149.9], 'Pacific/Honolulu': [21.3, -157.9], 'America/Toronto': [43.7, -79.4], 'America/Vancouver': [49.3, -123.1], 'America/Mexico_City': [19.4, -99.1],
    'America/Bogota': [4.7, -74.1], 'America/Lima': [-12, -77], 'America/Sao_Paulo': [-23.5, -46.6], 'America/Argentina/Buenos_Aires': [-34.6, -58.4], 'America/Santiago': [-33.4, -70.6],
    'America/Caracas': [10.5, -66.9], 'America/Halifax': [44.6, -63.6], 'Europe/London': [51.5, -0.1], 'Europe/Dublin': [53.3, -6.3], 'Europe/Lisbon': [38.7, -9.1], 'Europe/Paris': [48.9, 2.4],
    'Europe/Madrid': [40.4, -3.7], 'Europe/Berlin': [52.5, 13.4], 'Europe/Rome': [41.9, 12.5], 'Europe/Amsterdam': [52.4, 4.9], 'Europe/Brussels': [50.8, 4.4], 'Europe/Zurich': [47.4, 8.5],
    'Europe/Stockholm': [59.3, 18.1], 'Europe/Oslo': [59.9, 10.8], 'Europe/Warsaw': [52.2, 21], 'Europe/Athens': [38, 23.7], 'Europe/Istanbul': [41, 29], 'Europe/Kyiv': [50.5, 30.5],
    'Europe/Moscow': [55.8, 37.6], 'Africa/Lagos': [6.5, 3.4], 'Africa/Accra': [5.6, -0.2], 'Africa/Abidjan': [5.3, -4], 'Africa/Dakar': [14.7, -17.4], 'Africa/Cairo': [30, 31.2],
    'Africa/Nairobi': [-1.3, 36.8], 'Africa/Addis_Ababa': [9, 38.7], 'Africa/Johannesburg': [-26.2, 28], 'Africa/Casablanca': [33.6, -7.6], 'Africa/Kinshasa': [-4.3, 15.3],
    'Asia/Dubai': [25.2, 55.3], 'Asia/Riyadh': [24.7, 46.7], 'Asia/Tehran': [35.7, 51.4], 'Asia/Karachi': [24.9, 67], 'Asia/Kolkata': [19.1, 72.9], 'Asia/Calcutta': [19.1, 72.9],
    'Asia/Dhaka': [23.8, 90.4], 'Asia/Bangkok': [13.8, 100.5], 'Asia/Jakarta': [-6.2, 106.8], 'Asia/Singapore': [1.35, 103.8], 'Asia/Kuala_Lumpur': [3.1, 101.7], 'Asia/Manila': [14.6, 121],
    'Asia/Hong_Kong': [22.3, 114.2], 'Asia/Shanghai': [31.2, 121.5], 'Asia/Taipei': [25, 121.6], 'Asia/Seoul': [37.6, 127], 'Asia/Tokyo': [35.7, 139.7], 'Australia/Perth': [-31.9, 115.9],
    'Australia/Sydney': [-33.9, 151.2], 'Australia/Melbourne': [-37.8, 145], 'Australia/Brisbane': [-27.5, 153], 'Pacific/Auckland': [-36.8, 174.8] };
  const here = (() => {
    let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* older browsers */ }
    const z = ZONES[tz]; if (z) return { lat: z[0] * rad, lon: z[1] * rad };
    return { lat: 20 * rad, lon: -new Date().getTimezoneOffset() / 60 * 15 * rad }; // fall back to the UTC offset
  })();
  const localTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const pin = new T.Mesh(new T.RingGeometry(0.014, 0.022, 48), new T.MeshBasicMaterial({ color: 0xFFD673, transparent: true, side: T.DoubleSide, depthWrite: false }));
  scene.add(pin);
  const pinEl = document.createElement('div'); pinEl.className = 'sat-label you-label'; pinEl.setAttribute('aria-hidden', 'true'); labelHost.appendChild(pinEl);
  const herePos = new T.Vector3();
  function placePin(gmst) {
    const th = gmst + here.lon, c = Math.cos(here.lat);
    herePos.set(c * Math.cos(th), Math.sin(here.lat), -c * Math.sin(th));
    pin.position.copy(herePos).multiplyScalar(1.004); pin.lookAt(herePos.clone().multiplyScalar(2));
    const toCam = camera.position.clone().normalize(), facing = herePos.dot(toCam);
    const v = pin.position.clone().project(camera), x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
    pinEl.textContent = 'You are here · ' + localTime(Date.now());
    pinEl.style.transform = 'translate(' + Math.round(x + 12) + 'px,' + Math.round(y - 9) + 'px)';
    pinEl.classList.toggle('on', facing > 0.25 && !conj.active);
    pin.visible = facing > 0;
  }
  // the view turns to face the visitor's part of the world, so they see their own day or night
  const homeYaw = (a) => { const sunAz = Math.atan2(-a.sun.z, a.sun.x); let y = a.gmst + here.lon - sunAz; return y - Math.round(y / (2 * Math.PI)) * 2 * Math.PI; };
  const homePitch = Math.max(-0.9, Math.min(0.9, here.lat * 0.8));

  // ---- camera: faces the visitor's region; drag to turn ----
  const view = { yaw: -0.55, pitch: 0.3, dist: 5.4, tYaw: -0.55, tPitch: 0.3, tDist: 5.4, focus: null, focusK: 0 };
  // with nobody touching it, the view eases back to the visitor's region and sways gently there; it waits a moment
  // after a drag or key press
  const SPIN = 0.05, SPIN_WAIT = 2.5;
  let simMs = Date.now(), last = performance.now(), dragging = null, idle = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; view.tYaw -= (e.clientX - dragging.x) * 0.005; view.tPitch = Math.max(-1.2, Math.min(1.2, view.tPitch + (e.clientY - dragging.y) * 0.004)); dragging = { x: e.clientX, y: e.clientY }; idle = 0; });
  const endDrag = () => { dragging = null; idle = 0; }; canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (e) => { const k = { ArrowLeft: [0.15, 0], ArrowRight: [-0.15, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[e.key]; if (!k) return; e.preventDefault(); view.tYaw += k[0]; view.tPitch = Math.max(-1.2, Math.min(1.2, view.tPitch + k[1])); idle = 0; });

  // ---- layout: where the Earth sits. Wide: the canvas fills the hero and the Earth sits right of the copy, at a set
  // radius in pixels (the field of view is chosen so the home distance gives that radius). Narrow: a centred square.
  const wideQ = matchMedia('(min-width: 75.01rem)'), copyEl = document.querySelector('.hero-copy'), gridEl = document.querySelector('.hero-grid');
  const HOME_A = Math.asin(1 / 5.4);
  let W = 1, H = 1, px = 1000, keepOut = null;
  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight; if (!W || !H) return;
    renderer.setSize(W, H, false); camera.aspect = W / H;
    let r, cx, cy; keepOut = null;
    if (wideQ.matches && copyEl && gridEl) {
      const cr = canvas.getBoundingClientRect(), pr = copyEl.getBoundingClientRect(), gr = gridEl.getBoundingClientRect();
      const gTop = gr.top - cr.top, gh = gr.height, copyRight = pr.right - cr.left;
      r = Math.min(gh * 0.37, W * 0.23, 420);
      cx = Math.min(W - r - Math.max(48, W * 0.04), Math.max(copyRight + r + 72, W * 0.66));
      cy = gTop + gh * 0.5;
      keepOut = { right: copyRight + 24, top: pr.top - cr.top - 24, bottom: gTop + gh };
    } else { r = Math.min(W, H) * 0.35; cx = W / 2; cy = H / 2; }
    const half = Math.tan(HOME_A) * (H / 2) / r;
    camera.fov = 2 * Math.atan(half) / rad;
    camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H); // also updates the projection
    px = (H * DPR / 2) / half;
    trails.forEach((tr) => { tr.mat.uniforms.px.value = px; });
    // dots scale with the Earth, so a small globe is not buried under the catalogue
    satMat.uniforms.size.value = 4.2 * DPR * Math.max(0.42, Math.min(1, r / 330));
    wrap.style.setProperty('--cx', Math.round(cx) + 'px'); wrap.style.setProperty('--cy', Math.round(cy) + 'px'); wrap.style.setProperty('--r', Math.round(r) + 'px');
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); copyEl && ro.observe(copyEl); resize();
  wideQ.addEventListener && wideQ.addEventListener('change', resize);

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
  // real time by default, so the Earth shows the visitor's actual day or night; the chip speeds it up 60 times
  const speedBtn = document.querySelector('[data-speed]');
  let farView = false, speed = speedBtn && speedBtn.getAttribute('aria-pressed') === 'true' ? K : 1;
  const homeDist = () => (farView ? 12 : 5.4);
  document.querySelectorAll('[data-far]').forEach((b) => b.addEventListener('click', () => {
    farView = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', farView); view.tPitch = farView ? 0.55 : 0.3; if (!conj.active) view.tDist = homeDist();
  }));
  const speedEl = document.getElementById('globe-speed');
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    const fast = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', fast);
    speed = fast ? K : 1; if (!fast) simMs = Date.now(); if (speedEl) speedEl.textContent = fast ? K + '× real time' : 'Real time';
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
    if (!frame.homed) { frame.homed = true; view.yaw = view.tYaw = homeYaw(a); view.pitch = view.tPitch = homePitch; }
    if (!dragging && !conj.active && !reduce) { idle += dt; if (idle > SPIN_WAIT) { const home = homeYaw(a) + 0.25 * Math.sin(now / 1000 * SPIN); view.tPitch += (homePitch - view.tPitch) * Math.min(1, dt * 0.4); let d = home - view.tYaw; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; view.tYaw += d * Math.min(1, dt * 0.6 * Math.min(1, (idle - SPIN_WAIT) / 3)); } }
    const k = 1 - Math.pow(0.0015, dt);
    view.yaw += (view.tYaw - view.yaw) * k; view.pitch += (view.tPitch - view.pitch) * k; view.dist += (view.tDist - view.dist) * k * 0.6;
    const sunAz = Math.atan2(-a.sun.z, a.sun.x);
    const az = sunAz + view.yaw, el = view.pitch;
    camDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az));
    view.focusK += ((conj.active ? 1 : 0) - view.focusK) * k * 0.7;
    if (view.focusK > 0.001) camDir.lerp(conj.aim, view.focusK).normalize();
    camera.position.copy(camDir).multiplyScalar(view.dist);
    camera.lookAt(0, 0, 0);
    updateTrails(dt);
    placePin(a.gmst);

    if (conj.active) stepConj(t, now); else if (picked >= 0) showPick();
    renderer.render(scene, camera);
    if (clockEl && Math.floor(now / 500) !== frame.lastTick) { frame.lastTick = Math.floor(now / 500); clockEl.textContent = utc(simMs) + ' · ' + localTime(simMs) + ' yours'; }
  }

  let trailFade = 1;
  function updateTrails(dt) {
    trailFade += ((conj.active ? 0.15 : 1) - trailFade) * Math.min(1, dt * 3);
    trails.forEach((tr) => {
      const on = groupOn[grp[tr.i]]; tr.pts.visible = on;
      let head = ((simMs - tr.t0) / tr.period) % 1; if (head < 0) head += 1;
      tr.mat.uniforms.head.value = head; tr.mat.uniforms.fade.value = trailFade;
      const k = Math.min(tr.n - 1, Math.round(head * (tr.n - 1)));
      tmp.set(tr.pos[k * 3], tr.pos[k * 3 + 1], tr.pos[k * 3 + 2]);
      const cp = camera.position, d = tmp.clone().sub(cp), L = d.length(); d.divideScalar(L);
      const tc = -cp.dot(d), behind = cp.lengthSq() - tc * tc < 1 && tc > 0 && tc < L;
      tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H;
      let hide = !on || behind || conj.active || trailFade < 0.6 || tmp.z > 1 || x < 8 || y < 8 || x > W - 110 || y > H - 24;
      if (keepOut && ((x < keepOut.right && y > keepOut.top && y < keepOut.bottom) || y > keepOut.bottom - 30)) hide = true;
      tr.el.style.transform = 'translate(' + Math.round(x + 10) + 'px,' + Math.round(y - 8) + 'px)';
      tr.el.classList.toggle('on', !hide);
    });
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
