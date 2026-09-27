/* Live 3D product views for the Wisp site. Each view renders only while it is on screen. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWisp, createSilk, createMannequin, createHeadBust, PATTERNS, TAU } from './wisp-model.js';

export { PATTERNS };

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LED = new THREE.Color(0xeef8ff), BLUE = new THREE.Color(0x9fd8ff);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = u => u * u * (3 - 2 * u);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function glowTexture(inner, outer = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stage(canvas, { bloom = 0.5, exposure = 1.0, fov = 30 } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !bloom, powerPreference: 'high-performance' });
  } catch (e) {
    canvas.setAttribute('data-failed', '');
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.setClearColor(0x050608, 1);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pm.dispose();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.005, 60);
  let composer = null;
  if (bloom) {
    const hdr = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: hdr ? 4 : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), bloom, 0.45, 0.85));
    composer.addPass(new OutputPass());
  }
  const S = {
    renderer, scene, camera, composer, shiftX: 0, dirty: true, aspect: 1,
    resize() {
      const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
      renderer.setSize(w, h, false);
      if (composer) composer.setSize(w, h);
      S.aspect = w / h;
      const k = 1 + S.shiftX;
      camera.aspect = (w * k) / h;
      if (S.shiftX) camera.setViewOffset(w * k, h, 0, 0, w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      S.dirty = true;
    },
    render() { if (composer) composer.render(); else renderer.render(scene, camera); },
  };
  new ResizeObserver(() => S.resize()).observe(canvas);
  S.resize();
  return S;
}

// studio lighting shared by the product views
function studioLights(scene, k = 1) {
  const key = new THREE.DirectionalLight(0xffffff, 2.3 * k);
  key.position.set(0.7, 1.4, 1.0);
  const rim = new THREE.DirectionalLight(0xa6d4ff, 3.0 * k);
  rim.position.set(-1.3, 0.6, -1.1);
  const kick = new THREE.DirectionalLight(0xffd9b8, 0.55 * k);
  kick.position.set(1.2, -0.35, -0.5);
  scene.add(key, rim, kick);
}

// run tick + render while the canvas is visible; a single frame when motion is reduced
function animate(canvas, S, tick) {
  let visible = false, raf = 0;
  const start = performance.now();
  const frame = now => {
    raf = 0;
    if (!visible) return;
    const t = reduceMotion ? 2.2 : (now - start) / 1000;
    if (!reduceMotion || S.dirty) {
      tick(t);
      S.render();
      S.dirty = false;
    }
    raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(frame);
  }, { rootMargin: '160px' }).observe(canvas);
  tick(reduceMotion ? 2.2 : 0);
  S.render();
}

// additive light cone (apex at origin, opening toward +Z)
function makeBeam(color = 0xdff0ff, strength = 0.35) {
  const geo = new THREE.ConeGeometry(1, 1, 48, 1, true);
  geo.translate(0, -0.5, 0);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength } },
    vertexShader: `varying float vD; varying vec3 vN; varying vec3 vV;
      void main(){ vD = position.z; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float strength; varying float vD; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float fall = pow(1.0 - clamp(vD, 0.0, 1.0), 1.6); gl_FragColor = vec4(color, strength * edge * fall); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

function floorGlow(scene, radius, y, color = 'rgba(52,60,72,0.9)') {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshBasicMaterial({ map: glowTexture(color), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  scene.add(m);
  return m;
}

/* ---------------- hero: the drone hovering in a dark studio ---------------- */
export function mountHero(canvas) {
  const S = stage(canvas, { bloom: 0.62, exposure: 1.05, fov: 24 });
  if (!S) return null;
  const { scene, camera } = S;
  studioLights(scene, 1.05);
  floorGlow(scene, 0.34, -0.085);
  const w = createWisp({ shadows: false });
  scene.add(w.root);
  const beam = makeBeam(0xdff0ff, 0.32);
  beam.scale.set(0.14, 0.14, 0.62);
  beam.rotation.x = 0.28;
  w.lightOrigin.add(beam);
  // motes drifting through the beam
  const N = 140, pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) seed.set([Math.random() - 0.5, Math.random() - 0.5, Math.random(), Math.random() * TAU], i * 4);
  const motesGeo = new THREE.BufferGeometry();
  motesGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(motesGeo, new THREE.PointsMaterial({ size: 0.0016, map: glowTexture('rgba(255,255,255,1)'), color: 0xcfe9ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.frustumCulled = false;
  w.lightOrigin.add(motes);
  const onResize = () => { S.shiftX = S.aspect > 1.15 ? 0.58 : 0; };
  new ResizeObserver(() => { onResize(); S.resize(); }).observe(canvas);
  onResize();
  S.resize();
  animate(canvas, S, t => {
    const a = -0.7 + Math.sin(t * 0.17) * 0.42;
    const r = S.aspect > 1.15 ? 0.54 : Math.max(0.42, 0.4 / S.aspect);
    camera.position.set(Math.sin(a) * r, 0.11 + Math.sin(t * 0.23) * 0.018, Math.cos(a) * r);
    camera.lookAt(0, 0.004, 0);
    w.root.position.y = Math.sin(t * 1.3) * 0.004;
    w.root.rotation.set(Math.sin(t * 0.9) * 0.03, Math.sin(t * 0.21) * 0.3, Math.sin(t * 1.1) * 0.025);
    w.setRotor(t * 150, 1);
    w.setLight(0.28 + 0.05 * Math.sin(t * 2), LED);
    w.setHalo(0.8, BLUE);
    w.setNav(t % 1 < 0.5 ? 1 : 0.1);
    for (let i = 0; i < N; i++) {
      const j = i * 4, u = (seed[j + 2] + t * 0.04) % 1;
      pos[i * 3] = seed[j] * 0.1 * (0.2 + u) + Math.sin(t * 0.5 + seed[j + 3]) * 0.004;
      pos[i * 3 + 1] = seed[j + 1] * 0.1 * (0.2 + u) - u * 0.12;
      pos[i * 3 + 2] = u * 0.45;
    }
    motesGeo.attributes.position.needsUpdate = true;
  });
  return S;
}

/* ---------------- exploded view, driven by scroll ---------------- */
export const PARTS = [
  { id: 'canopy', name: 'Canopy' },
  { id: 'optics', name: 'Optics' },
  { id: 'pcb', name: 'Compute' },
  { id: 'rotors', name: 'Rotors' },
  { id: 'airframe', name: 'Airframe' },
  { id: 'battery', name: 'Power' },
  { id: 'dock', name: 'Dock latch' },
];
export function mountExplode(canvas, labelsEl) {
  const S = stage(canvas, { bloom: 0.45, exposure: 1.1, fov: 26 });
  if (!S) return null;
  const { scene, camera } = S;
  studioLights(scene, 1.1);
  floorGlow(scene, 0.4, -0.11, 'rgba(40,48,58,0.85)');
  const w = createWisp({ internals: true, shadows: false });
  scene.add(w.root);
  w.setHalo(0.8, BLUE);
  w.setLight(0.18, LED);
  w.setNav(1);
  const labels = PARTS.map((p, i) => {
    const el = document.createElement('div');
    el.className = 'plabel';
    el.textContent = `${String(i + 1).padStart(2, '0')} ${p.name}`;
    labelsEl.appendChild(el);
    return el;
  });
  const state = { target: 0, k: 0, active: 0, spin: 0 };
  const tmp = V3();
  animate(canvas, S, t => {
    state.k += (state.target - state.k) * (reduceMotion ? 1 : 0.1);
    w.setExplode(smooth(clamp(state.k, 0, 1)));
    w.root.rotation.y = -0.62 + Math.sin(t * 0.22) * 0.16;
    w.setRotor(t * 3, 0);
    const portrait = S.aspect < 1;
    const d = portrait ? 0.62 / Math.max(S.aspect, 0.55) : 0.5;
    camera.position.set(0.52 * d, 0.36 * d, 0.62 * d);
    camera.lookAt(0, 0.004, 0);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    PARTS.forEach((p, i) => {
      const part = w.parts[p.id];
      tmp.copy(part.userData.anchor);
      part.localToWorld(tmp);
      tmp.project(camera);
      labels[i].style.transform = `translate(${((tmp.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-3px, -50%)`;
      labels[i].classList.toggle('show', state.k > 0.55);
      labels[i].classList.toggle('on', i === state.active && state.k > 0.55);
    });
  });
  return {
    set(explode, active) {
      state.target = explode;
      state.active = active;
      S.dirty = true;
    },
  };
}

/* ---------------- Silk on a dress form ---------------- */
export function mountHarness(canvas, { view = 'back' } = {}) {
  const S = stage(canvas, { bloom: 0.38, exposure: 1.0, fov: 24 });
  if (!S) return null;
  const { scene, camera } = S;
  studioLights(scene, 0.9);
  floorGlow(scene, 0.6, 0.002, 'rgba(46,52,62,0.9)');
  const mq = createMannequin({ color: 0x464a52 });
  scene.add(mq.root);
  const silk = createSilk(mq.chest, { shadows: false });
  const w = createWisp({ shadows: false });
  silk.dock.add(w.root);
  w.setHalo(0.85, BLUE);
  w.setLight(0.02, LED);
  silk.buttonLed.color.copy(BLUE).multiplyScalar(1.6);
  const back = view === 'back';
  const base = back ? Math.PI : 0.55, swing = back ? 0.85 : 0.4;
  animate(canvas, S, t => {
    const a = base + Math.sin(t * 0.2) * swing;
    const r = (back ? 1.55 : 1.8) / Math.min(1, S.aspect * 1.2);
    camera.position.set(Math.sin(a) * r, 1.45, Math.cos(a) * r);
    camera.lookAt(0, back ? 1.3 : 1.27, 0);
    const breathe = 0.5 + 0.5 * Math.sin(t * TAU * 0.35);
    silk.led.color.copy(BLUE).multiplyScalar(0.9 + 0.5 * breathe);
    silk.nestLed.color.copy(BLUE).multiplyScalar(1 + breathe);
    w.setRotor(0, 0);
  });
  return S;
}

/* ---------------- Orbit patterns around a head ---------------- */
export const PATTERN_ORDER = ['orbit', 'figure8', 'dart', 'halo', 'spiral', 'wide'];
export function mountPatterns(canvas, { onChange } = {}) {
  const S = stage(canvas, { bloom: 0.6, exposure: 1.0, fov: 28 });
  if (!S) return null;
  const { scene, camera } = S;
  studioLights(scene, 0.85);
  floorGlow(scene, 1.1, -0.36, 'rgba(40,46,56,0.9)');
  const bust = createHeadBust({ color: 0x3f444c });
  scene.add(bust.root);
  const w = createWisp({ shadows: false });
  scene.add(w.root);
  const beam = makeBeam(0xdff0ff, 0.26);
  scene.add(beam);
  const spot = new THREE.SpotLight(0xeef8ff, 0, 3, 0.4, 0.5, 1.2);
  scene.add(spot, spot.target);
  const TN = 70, tp = new Float32Array(TN * 3), tc = new Float32Array(TN * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ size: 0.012, map: glowTexture('rgba(255,255,255,1)'), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  trail.frustumCulled = false;
  scene.add(trail);
  const eye = V3(0, 0.01, 0.09);
  const st = { id: 'orbit', since: 0, manualUntil: -1, prev: null, prevSince: 0, switchAt: 0 };
  const off = V3(), offB = V3(), p = V3(), pa = V3(), pb = V3(), up = V3(), fw = V3(), rt = V3(), m = new THREE.Matrix4();
  let clock = 0;
  function posAt(t, out) {
    PATTERNS[st.id].f(Math.max(0, t - st.since), out);
    if (st.prev && t - st.switchAt < 0.7) {
      PATTERNS[st.prev].f(t - st.prevSince, offB);
      out.lerp(offB.clone(), 0).set(
        offB.x + (out.x - offB.x) * smooth((t - st.switchAt) / 0.7),
        offB.y + (out.y - offB.y) * smooth((t - st.switchAt) / 0.7),
        offB.z + (out.z - offB.z) * smooth((t - st.switchAt) / 0.7));
    }
    return out;
  }
  function select(id, t, manual) {
    if (id === st.id) return;
    st.prev = st.id;
    st.prevSince = st.since;
    st.id = id;
    st.since = t;
    st.switchAt = t;
    if (manual) st.manualUntil = t + 14;
    if (onChange) onChange(id);
  }
  animate(canvas, S, t => {
    clock = t;
    if (t > st.manualUntil && t - st.since > 5.2) select(PATTERN_ORDER[(PATTERN_ORDER.indexOf(st.id) + 1) % PATTERN_ORDER.length], t, false);
    const a = 0.62 + Math.sin(t * 0.12) * 0.25;
    const r = 1.68 / Math.min(1, S.aspect * 0.8);
    camera.position.set(Math.sin(a) * r, 0.54, Math.cos(a) * r);
    camera.lookAt(0, 0.08, 0.05);
    posAt(t, p);
    w.root.position.copy(p);
    posAt(t - 0.06, pa);
    posAt(t + 0.06, pb);
    up.copy(pa).add(pb).addScaledVector(p, -2).divideScalar(0.0036);
    up.y += 9.81;
    up.normalize();
    fw.copy(p).negate();
    fw.y = 0;
    fw.normalize().projectOnPlane(up).normalize();
    rt.crossVectors(up, fw);
    m.makeBasis(rt, up, fw);
    w.root.quaternion.setFromRotationMatrix(m);
    w.root.updateMatrixWorld(true);
    w.setRotor(t * 150, 1);
    const lv = 0.55 + 0.15 * Math.sin(t * TAU * 0.9);
    w.setLight(lv, LED);
    w.setHalo(0.7, BLUE);
    w.setNav(t % 1 < 0.5 ? 1 : 0);
    w.lightOrigin.getWorldPosition(pa);
    beam.position.copy(pa);
    beam.lookAt(eye);
    const L = pa.distanceTo(eye) * 1.45;
    beam.scale.set(L * 0.3, L * 0.3, L);
    spot.position.copy(pa);
    spot.target.position.copy(eye);
    spot.intensity = 0.8 * lv;
    for (let i = 0; i < TN; i++) {
      posAt(t - i * 0.03, pb);
      tp.set([pb.x, pb.y, pb.z], i * 3);
      const f = Math.pow(1 - i / TN, 1.7) * 0.75;
      tc.set([0.62 * f, 0.84 * f, f], i * 3);
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;
  });
  if (onChange) onChange(st.id);
  return {
    select(id) { select(id, clock, true); S.dirty = true; },
  };
}

/* ---------------- a turntable of the drone (flight section) ---------------- */
export function mountTurntable(canvas) {
  const S = stage(canvas, { bloom: 0.5, exposure: 1.05, fov: 24 });
  if (!S) return null;
  const { scene, camera } = S;
  studioLights(scene, 1.05);
  floorGlow(scene, 0.3, -0.07);
  const w = createWisp({ shadows: false });
  scene.add(w.root);
  w.setHalo(0.85, BLUE);
  w.setLight(0.2, LED);
  animate(canvas, S, t => {
    const r = Math.max(0.34, 0.3 / Math.min(S.aspect, 1.3) * 1.2);
    camera.position.set(Math.sin(t * 0.25) * r, 0.2, Math.cos(t * 0.25) * r);
    camera.lookAt(0, -0.004, 0);
    w.setRotor(t * 150, 1);
    w.setNav(t % 1 < 0.5 ? 1 : 0.1);
  });
  return S;
}
