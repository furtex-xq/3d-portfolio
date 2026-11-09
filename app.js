import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATS, MODELS, RENDERS } from './assets/data.js?v=1';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => innerWidth <= 760;
const byId = Object.fromEntries(MODELS.map(m => [m.id, m]));
const $ = s => document.querySelector(s);

/* ---------- общие помощники ---------- */
function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
function trisText(n) {
  const v = n >= 1000 ? `${(Math.round(n / 100) / 10).toLocaleString('ru-RU')} тыс.` : n.toLocaleString('ru-RU');
  return `<b>${v}</b> треугольников`;
}
const easeOutBack = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeIn = t => t * t * t;

/* ---------- загрузка моделей ---------- */
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
const cache = new Map();
function loadModel(id) {
  if (!cache.has(id)) {
    cache.set(id, gltfLoader.loadAsync(`assets/models/${id}.glb`).then(g => {
      g.scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = false;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => { if (m.transparent) m.depthWrite = false; });
        }
      });
      return g.scene;
    }).catch(e => { cache.delete(id); throw e; }));
  }
  return cache.get(id);
}
// Модель ставится на пьедестал: по центру, низом на y=0, примерно одного размера
function fitted(src) {
  const obj = src.clone(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = Math.min(1.9 / Math.max(size.x, size.z, 1e-6), 2.05 / Math.max(size.y, 1e-6));
  obj.scale.setScalar(s);
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x, -box.min.y, -c.z);
  const g = new THREE.Group();
  g.add(obj);
  g.userData.height = (box.max.y - box.min.y);
  return g;
}

/* ---------- сцена: свет, пьедестал, искры ---------- */
function makeScene(renderer) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xfff4ea, 2.2);
  key.position.set(3, 6, 4);
  const rim = new THREE.DirectionalLight(0xb9a2ff, 2.4);
  rim.position.set(-4, 3, -4);
  const fill = new THREE.HemisphereLight(0xcfc2ff, 0x2a1f45, 0.6);
  scene.add(key, rim, fill);
  return scene;
}

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Восьмигранный пьедестал — как на рендерах
function makePedestal() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x2c2350, roughness: 0.42, metalness: 0.15 });
  const top = new THREE.MeshStandardMaterial({ color: 0x3d3170, roughness: 0.3, metalness: 0.1 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x8ef0d3, toneMapped: false });
  const tier = (r1, r2, h, y, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 8), mat);
    m.position.y = y; m.rotation.y = Math.PI / 8; g.add(m); return m;
  };
  tier(1.42, 1.5, 0.16, 0.08, body);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.435, 1.435, 0.03, 8, 1, true), glow);
  ring.position.y = 0.175; ring.rotation.y = Math.PI / 8; g.add(ring);
  tier(1.22, 1.3, 0.14, 0.26, top);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(1.225, 1.225, 0.02, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xc9b9ff, toneMapped: false, transparent: true, opacity: 0.6 }));
  lip.position.y = 0.335; lip.rotation.y = Math.PI / 8; g.add(lip);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6),
    new THREE.MeshBasicMaterial({ map: glowTexture('rgba(5,3,12,0.75)', 'rgba(5,3,12,0)'), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002;
  g.add(shadow);
  g.userData.top = 0.34;
  return g;
}

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(32, 2); g.quadraticCurveTo(35, 29, 62, 32); g.quadraticCurveTo(35, 35, 32, 62);
  g.quadraticCurveTo(29, 35, 2, 32); g.quadraticCurveTo(29, 29, 32, 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeSparkles(count, seed) {
  const pos = new Float32Array(count * 3);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, r = 1.7 + rnd() * 1.1;
    pos.set([Math.cos(a) * r, 0.5 + rnd() * 2.6, Math.sin(a) * r], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: starTexture(), size: 0.16, transparent: true, depthWrite: false, color: 0xfff6ff, toneMapped: false });
  return new THREE.Points(geo, mat);
}

function makeRenderer(canvas, alpha) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, isMobile() ? 1.75 : 2));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  if (alpha) r.setClearColor(0x000000, 0);
  return r;
}

let webglOK = true;
try { webglOK = !!document.createElement('canvas').getContext('webgl2'); } catch { webglOK = false; }

/* ======================================================
   Тур: липкая сцена, модель меняется по мере прокрутки
   ====================================================== */
function initTour() {
  const canvas = $('#stageCanvas');
  const chapters = [...document.querySelectorAll('.chapter')];
  $('#stageTotal').textContent = chapters.length;
  document.querySelectorAll('[data-spec]').forEach(el => {
    const m = byId[el.dataset.spec];
    if (m) el.innerHTML = `<span>${trisText(m.tris)}</span><span>${CATS[m.cat]}</span>`;
  });
  if (!webglOK) { canvas.remove(); return; }

  const renderer = makeRenderer(canvas, true);
  const scene = makeScene(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 1.25, 0);

  const turn = new THREE.Group();       // крутится целиком
  const pedestal = makePedestal();
  const holder = new THREE.Group();
  holder.position.y = pedestal.userData.top;
  turn.add(pedestal, holder);
  const sparkA = makeSparkles(26, 7), sparkB = makeSparkles(22, 99);
  scene.add(turn, sparkA, sparkB);

  // пьедестал «выезжает» при загрузке
  let intro = REDUCED ? 1 : 0;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const r = 1.75;
    let d;
    if (isMobile()) {
      d = Math.max(r / Math.sin(hf / 2) * 1.02, r / Math.sin(vf / 2) * 1.9);
      camera.setViewOffset(w, h, 0, h * 0.2, w, h);
    } else {
      d = Math.max(r / Math.sin(vf / 2) * 1.05, r / Math.sin(hf / 2) * 2);
      camera.setViewOffset(w, h, -w * 0.17, 0, w, h);
    }
    const el = THREE.MathUtils.degToRad(13);
    camera.position.set(0, target.y + d * Math.sin(el), d * Math.cos(el));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  /* --- смена моделей --- */
  let current = null, leaving = null, token = 0, activeIdx = -1;
  const loader = $('#stageLoader');
  const word = $('#stageWord');
  async function show(idx) {
    if (idx === activeIdx) return;
    activeIdx = idx;
    const ch = chapters[idx];
    chapters.forEach((c, i) => c.classList.toggle('active', i === idx));
    $('#stageNum').textContent = idx + 1;
    word.classList.add('out');
    setTimeout(() => { word.textContent = ch.dataset.word; word.classList.remove('out'); }, 260);
    const my = ++token;
    if (current) { leaving = { obj: current, t: 0 }; current = null; }
    const slow = setTimeout(() => loader.classList.add('on'), 250);
    try {
      const src = await loadModel(ch.dataset.model);
      if (my !== token) return;
      const obj = fitted(src);
      obj.scale.setScalar(0.0001);
      holder.add(obj);
      current = obj; current.userData.t = 0;
      preload(idx + 1);
    } catch (e) { console.warn('model', e); }
    finally { clearTimeout(slow); if (my === token) loader.classList.remove('on'); }
  }
  function preload(i) {
    const ch = chapters[i];
    if (ch) setTimeout(() => loadModel(ch.dataset.model).catch(() => {}), 400);
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) show(chapters.indexOf(e.target)); });
  }, { rootMargin: '-45% 0px -45% 0px' });
  chapters.forEach(c => io.observe(c));
  show(0);

  /* --- вращение: авто + палец/мышь + прокрутка --- */
  let drag = 0, vel = 0, down = false, lastX = 0, scrollRot = 0, hintGone = false;
  canvas.addEventListener('pointerdown', e => { down = true; lastX = e.clientX; vel = 0; });
  addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    vel = dx * 0.012; drag += vel;
    if (!hintGone && Math.abs(drag) > 0.4) { hintGone = true; $('#stageHint').classList.add('gone'); }
  });
  const up = () => { down = false; };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);

  const tour = $('.tour');
  function tourProgress() {
    const r = tour.getBoundingClientRect();
    return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
  }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); }).observe(tour);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });

  const clock = new THREE.Clock();
  let auto = -0.5, running = false;
  function frame() {
    if (!visible || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (!REDUCED) auto += dt * 0.28;
    if (!down) { vel *= 0.94; drag += vel; }
    scrollRot += (tourProgress() * Math.PI * 2.5 - scrollRot) * 0.08;
    turn.rotation.y = auto + drag + (REDUCED ? 0 : scrollRot);

    if (intro < 1) intro = Math.min(1, intro + dt * 0.9);
    const ie = easeOutBack(intro);
    pedestal.scale.setScalar(0.6 + 0.4 * ie);
    turn.position.y = (1 - ie) * -0.8;

    if (leaving) {
      leaving.t = Math.min(1, leaving.t + dt * 3.2);
      const k = 1 - easeIn(leaving.t);
      leaving.obj.scale.setScalar(Math.max(k, 0.0001));
      leaving.obj.rotation.y += dt * 6;
      if (leaving.t >= 1) { holder.remove(leaving.obj); leaving = null; }
    }
    if (current && !leaving) {
      const u = current.userData;
      u.t = Math.min(1, u.t + dt * (REDUCED ? 10 : 1.5));
      current.scale.setScalar(Math.max(easeOutBack(u.t), 0.0001));
      current.position.y = REDUCED ? 0 : Math.sin(t * 1.4) * 0.035; // лёгкое «дыхание»
    }
    sparkA.rotation.y = t * 0.05; sparkB.rotation.y = -t * 0.04;
    sparkA.material.opacity = 0.55 + 0.45 * Math.sin(t * 1.7);
    sparkB.material.opacity = 0.55 + 0.45 * Math.sin(t * 1.7 + Math.PI);
    renderer.render(scene, camera);
  }
  function loop() { if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); } }
  loop();
}

/* ======================================================
   3D-просмотр одной модели
   ====================================================== */
const viewer = (() => {
  const dlg = $('#viewer');
  let renderer, scene, camera, controls, holder, list = [], idx = 0, token = 0, raf = 0;

  function setup() {
    renderer = makeRenderer($('#viewerCanvas'), true);
    scene = makeScene(renderer);
    camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 14;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.autoRotate = !REDUCED;
    controls.autoRotateSpeed = 1.4;
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    const ped = makePedestal();
    holder = new THREE.Group();
    holder.position.y = ped.userData.top;
    scene.add(ped, holder, makeSparkles(20, 3));
    new ResizeObserver(resize).observe(renderer.domElement);
  }
  function resize() {
    const c = renderer.domElement, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function frameCamera(hgt) {
    const ty = 0.34 + hgt * 0.5;
    controls.target.set(0, ty, 0);
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const r = Math.max(1.6, hgt * 0.62 + 0.3);
    const d = Math.max(r / Math.sin(vf / 2), r / Math.sin(hf / 2)) * 1.05;
    camera.position.copy(controls.target).add(new THREE.Vector3(0.55, 0.38, 0.8).setLength(d));
    controls.update();
  }
  async function load(i) {
    idx = (i + list.length) % list.length;
    const m = list[idx];
    $('#viewerTitle').textContent = m.name;
    $('#viewerCat').textContent = CATS[m.cat];
    $('#viewerSpec').innerHTML = `<span>${trisText(m.tris)}</span><span>${idx + 1} из ${list.length}</span>`;
    const my = ++token;
    const loader = $('#viewerLoader');
    const slow = setTimeout(() => loader.classList.add('on'), 200);
    try {
      const src = await loadModel(m.id);
      if (my !== token) return;
      holder.clear();
      const obj = fitted(src);
      holder.add(obj);
      controls.autoRotate = !REDUCED;
      frameCamera(obj.userData.height);
      obj.scale.setScalar(0.0001); obj.userData.t = 0;
    } catch (e) { console.warn(e); }
    finally { clearTimeout(slow); if (my === token) loader.classList.remove('on'); }
  }
  const clock = new THREE.Clock();
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const obj = holder.children[0];
    if (obj && obj.userData.t < 1) {
      obj.userData.t = Math.min(1, obj.userData.t + dt * (REDUCED ? 10 : 1.8));
      obj.scale.setScalar(Math.max(easeOutBack(obj.userData.t), 0.0001));
    }
    controls.update();
    renderer.render(scene, camera);
  }
  function open(models, i) {
    if (!webglOK) return;
    if (!renderer) setup();
    list = models;
    dlg.showModal();
    resize();
    load(i);
    cancelAnimationFrame(raf); clock.getDelta(); frame();
  }
  dlg.addEventListener('close', () => { cancelAnimationFrame(raf); token++; });
  $('#viewerClose').onclick = () => dlg.close();
  $('#viewerPrev').onclick = () => load(idx - 1);
  $('#viewerNext').onclick = () => load(idx + 1);
  dlg.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') load(idx - 1);
    if (e.key === 'ArrowRight') load(idx + 1);
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  return { open };
})();

/* ======================================================
   Каталог
   ====================================================== */
function initCatalog() {
  const grid = $('#grid'), chips = $('#chips');
  const n = MODELS.length;
  $('#modelCount').textContent = n;
  $('#catalogTitle').lastChild.textContent = ` ${plural(n, 'модель', 'модели', 'моделей')}, которые можно покрутить`;
  let filter = 'all', shown = [];
  const tabs = [['all', 'Все', n], ...Object.entries(CATS).map(([k, v]) => [k, v, MODELS.filter(m => m.cat === k).length])];
  chips.innerHTML = tabs.map(([k, label, c]) =>
    `<button class="chip" role="tab" data-k="${k}" aria-selected="${k === 'all'}">${label}<small>${c}</small></button>`).join('');
  chips.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    filter = b.dataset.k;
    chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-selected', c === b));
    render();
  });
  const reveal = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  function render() {
    shown = filter === 'all' ? MODELS : MODELS.filter(m => m.cat === filter);
    grid.innerHTML = shown.map((m, i) => `
      <li style="transition-delay:${(i % 6) * 45}ms"><button class="card" data-i="${i}" aria-label="${m.name} — открыть в 3D">
        <span class="badge">3D</span>
        <img src="assets/thumbs/${m.id}.webp" alt="" width="480" height="480" loading="lazy" decoding="async">
        <span class="meta"><b>${m.name}</b><span>${CATS[m.cat]}</span></span>
      </button></li>`).join('');
    grid.querySelectorAll('li').forEach(li => reveal.observe(li));
  }
  grid.addEventListener('click', e => {
    const b = e.target.closest('.card'); if (!b) return;
    viewer.open(shown, +b.dataset.i);
  });
  // при наведении заранее подгружаем модель
  grid.addEventListener('pointerenter', e => {
    const b = e.target.closest?.('.card'); if (b) loadModel(shown[+b.dataset.i].id).catch(() => {});
  }, true);
  render();
}

/* ======================================================
   Рендеры + просмотр
   ====================================================== */
function initRenders() {
  const wrap = $('#renderGroups');
  const groups = [];
  RENDERS.forEach((r, i) => {
    let g = groups.find(x => x.name === r.group);
    if (!g) groups.push(g = { name: r.group, items: [] });
    g.items.push({ ...r, i });
  });
  wrap.innerHTML = groups.map(g => `
    <div class="rgroup">
      <h3>${g.name}<small>${g.items.length}</small></h3>
      <div class="rail">${g.items.map(r => `
        <button data-i="${r.i}" aria-label="${r.name}">
          <img src="assets/renders/${r.id}-s.webp" alt="${r.name}" loading="lazy" decoding="async"
               width="${Math.round(r.w / Math.max(r.w, r.h) * 640)}" height="${Math.round(r.h / Math.max(r.w, r.h) * 640)}">
          <span class="cap">${r.name}</span>
        </button>`).join('')}
      </div>
    </div>`).join('');

  const lb = $('#lightbox'), img = $('#lbImg');
  let cur = 0;
  function show(i) {
    cur = (i + RENDERS.length) % RENDERS.length;
    const r = RENDERS[cur];
    img.src = `assets/renders/${r.id}.webp`;
    img.alt = r.name;
    $('#lbCap').textContent = `${r.group} · ${r.name}`;
  }
  wrap.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    show(+b.dataset.i); lb.showModal();
  });
  $('#lbPrev').onclick = () => show(cur - 1);
  $('#lbNext').onclick = () => show(cur + 1);
  $('#lbClose').onclick = () => lb.close();
  lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
  lb.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'ArrowRight') show(cur + 1);
  });
  let sx = null;
  lb.addEventListener('pointerdown', e => { sx = e.clientX; });
  lb.addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
  });
}

/* ---------- шапка ---------- */
const top = $('.top');
const onScroll = () => top.classList.toggle('scrolled', scrollY > 30);
addEventListener('scroll', onScroll, { passive: true });
onScroll();
$('#year').textContent = new Date().getFullYear();

initTour();
initCatalog();
initRenders();
