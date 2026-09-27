/*
 * Wisp product models, shared by the website and the scenario.
 *   createWisp()        the drone, with optional internals for the exploded view
 *   createSilk()        the spider harness that carries it on the upper back
 *   createMannequin()   a display bust for product shots
 *   createHeadBust()    a neutral head for the pattern visualizer
 *   PATTERNS            the flight patterns Orbit autonomy flies around a head
 * Units are meters. The drone faces +Z with +Y up; its origin is the middle of the airframe plate.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = u => u * u * (3 - 2 * u);
const clamp01 = u => (u < 0 ? 0 : u > 1 ? 1 : u);
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Canvas textures                                                     */
/* ------------------------------------------------------------------ */
function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// The Wisp mark: a head with the drone's orbit around it
export function drawMark(g, cx, cy, s, color) {
  const tilt = -0.38;
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = s * 0.075;
  g.beginPath();
  g.ellipse(0, 0, s * 0.46, s * 0.19, tilt, 0, TAU);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, s * 0.15, 0, TAU);
  g.fill();
  const a = -0.95, ex = s * 0.46 * Math.cos(a), ey = s * 0.19 * Math.sin(a);
  g.beginPath();
  g.arc(ex * Math.cos(tilt) - ey * Math.sin(tilt), ex * Math.sin(tilt) + ey * Math.cos(tilt), s * 0.07, 0, TAU);
  g.fill();
  g.restore();
}

let TEX = null;
function textures() {
  if (TEX) return TEX;
  TEX = {
    carbon: canvasTexture(256, 256, (g, w) => {
      const n = 16, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const warp = (i + j) % 4 < 2, x = i * s, y = j * s;
        const gr = warp ? g.createLinearGradient(x, y, x + s, y) : g.createLinearGradient(x, y, x, y + s);
        gr.addColorStop(0, '#141619');
        gr.addColorStop(0.5, '#353a42');
        gr.addColorStop(1, '#141619');
        g.fillStyle = gr;
        g.fillRect(x, y, s, s);
      }
    }),
    pcb: canvasTexture(512, 512, (g, w, h) => {
      const r = rng(5);
      g.fillStyle = '#0d0f12';
      g.fillRect(0, 0, w, h);
      g.lineCap = 'round';
      for (let i = 0; i < 90; i++) {
        let x = r() * w, y = r() * h;
        g.strokeStyle = `rgba(${60 + r() * 20 | 0},${68 + r() * 20 | 0},${74 + r() * 20 | 0},0.9)`;
        g.lineWidth = 2 + r() * 3;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          if (r() < 0.5) x += (r() - 0.5) * 180; else y += (r() - 0.5) * 180;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.fillStyle = '#c9a44c';
      for (let i = 0; i < 180; i++) {
        const s = 4 + r() * 9;
        g.fillRect(r() * w, r() * h, s, s * (0.4 + r()));
      }
      for (let i = 0; i < 140; i++) {
        g.beginPath();
        g.arc(r() * w, r() * h, 2.5 + r() * 2, 0, TAU);
        g.fillStyle = '#b8964a';
        g.fill();
      }
      g.strokeStyle = 'rgba(230,230,224,0.85)';
      g.lineWidth = 2;
      g.strokeRect(150, 150, 212, 212);
      g.strokeRect(60, 70, 60, 40);
      g.strokeRect(390, 380, 70, 50);
      g.fillStyle = 'rgba(230,230,224,0.9)';
      g.font = '600 24px monospace';
      g.fillText('WISP FC-2  REV C', 22, h - 24);
      g.font = '500 18px monospace';
      g.fillText('U1', 158, 142);
      g.fillText('IMU', 60, 62);
    }),
    esc: canvasTexture(512, 512, (g, w, h) => {
      const r = rng(9);
      g.fillStyle = '#0c0e10';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#c9a44c';
      for (let q = 0; q < 4; q++) {
        const ox = (q % 2) * 256, oy = (q >> 1) * 256;
        for (let i = 0; i < 26; i++) g.fillRect(ox + 30 + r() * 190, oy + 30 + r() * 190, 6 + r() * 10, 4 + r() * 8);
      }
      g.strokeStyle = 'rgba(70,78,84,0.95)';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(256, 0); g.lineTo(256, h); g.moveTo(0, 256); g.lineTo(w, 256);
      g.stroke();
      g.fillStyle = 'rgba(230,230,224,0.9)';
      g.font = '600 22px monospace';
      g.fillText('ESC-4 · 20A', 22, h - 22);
    }),
    battery: canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = '#1d2631';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8dde3';
      g.fillRect(0, 0, w, 62);
      g.fillStyle = '#0f141a';
      g.font = '800 40px Arial, Helvetica, sans-serif';
      g.fillText('WISP CELL', 24, 45);
      g.fillStyle = '#c7cfd9';
      g.font = '600 31px Arial, Helvetica, sans-serif';
      g.fillText('2S   7.4 V   450 mAh   3.3 Wh', 24, 114);
      g.font = '500 20px Arial, Helvetica, sans-serif';
      g.fillStyle = '#8d99a8';
      g.fillText('LiPo · Charge in harness only · Do not puncture', 24, 150);
      g.fillStyle = '#c7cfd9';
      for (let x = 24, i = 0; x < 270; i++) {
        const wd = 2 + ((i * 7) % 5);
        g.fillRect(x, 182, wd, 48);
        x += wd + 3;
      }
      g.strokeStyle = '#c7cfd9';
      g.lineWidth = 3;
      g.strokeRect(400, 176, 70, 56);
    }),
    disc: canvasTexture(256, 256, (g, w, h) => {
      const img = g.createImageData(w, h), cx = w / 2, R = w / 2;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const r = Math.hypot((x - cx) / R, (y - cx) / R);
        let a = 0;
        if (r > 0.17 && r < 0.98) {
          a = 0.12 + 0.36 * Math.pow((r - 0.17) / 0.81, 0.75);
          a *= 1 - Math.pow(Math.max(0, (r - 0.9) / 0.08), 2);
          a *= 0.86 + 0.14 * Math.sin(r * 64);
        }
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = clamp01(a) * 255;
      }
      g.putImageData(img, 0, 0);
    }),
    mark: canvasTexture(256, 256, g => drawMark(g, 128, 128, 210, '#ffffff')),
    word: canvasTexture(512, 128, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.font = '800 92px "Archivo", "Arial Black", Arial, sans-serif';
      g.textBaseline = 'middle';
      const letters = 'WISP'.split('');
      let x = 18;
      for (const ch of letters) {
        g.fillText(ch, x, h / 2 + 4);
        x += g.measureText(ch).width + 30;
      }
    }),
  };
  TEX.carbon.wrapS = TEX.carbon.wrapT = THREE.RepeatWrapping;
  TEX.carbon.repeat.set(2, 2);
  return TEX;
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */
let MAT = null;
function materials() {
  if (MAT) return MAT;
  const T = textures();
  MAT = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0x262b32, roughness: 0.34, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    shellMatte: new THREE.MeshPhysicalMaterial({ color: 0x1a1d22, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.6 }),
    duct: new THREE.MeshPhysicalMaterial({ color: 0x1c1f24, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0e1012, roughness: 0.9 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x020304, roughness: 0.06, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.03 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x0a1226, roughness: 0.03, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [220, 560] }),
    metal: new THREE.MeshStandardMaterial({ color: 0xaab1ba, metalness: 1, roughness: 0.28 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x40454d, metalness: 1, roughness: 0.34 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc8804a, metalness: 1, roughness: 0.34 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd9b25c, metalness: 1, roughness: 0.22 }),
    carbon: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: T.carbon, roughness: 0.32, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
    pcb: new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.pcb, roughness: 0.45, metalness: 0.25 }),
    esc: new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.esc, roughness: 0.45, metalness: 0.25 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.35, metalness: 0.2 }),
    battery: new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.battery, roughness: 0.5, metalness: 0.25 }),
    flex: new THREE.MeshStandardMaterial({ color: 0xc27218, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8e5dd, roughness: 0.6 }),
    wireRed: new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5 }),
    wireBlack: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 }),
    decal: new THREE.MeshStandardMaterial({ color: 0xb4bec9, map: T.mark, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    word: new THREE.MeshStandardMaterial({ color: 0x8e98a4, map: T.word, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    strip: new THREE.MeshPhysicalMaterial({ color: 0x1e2127, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.45, side: THREE.DoubleSide }),
    nest: new THREE.MeshPhysicalMaterial({ color: 0x23272e, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18 }),
  };
  return MAT;
}

/* ------------------------------------------------------------------ */
/* The drone                                                           */
/* ------------------------------------------------------------------ */
// Plate outline: four duct rings joined by concave fillets (a unibody "X")
function frameOutline(d, R, f) {
  const C = [[d, d], [-d, d], [-d, -d], [d, -d]];
  const h = Math.sqrt((R + f) ** 2 - d * d);
  const P = [[0, d + h], [-(d + h), 0], [0, -(d + h)], [d + h, 0]];
  const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const s = new THREE.Shape();
  for (let i = 0; i < 4; i++) {
    const c = C[i], pPrev = P[(i + 3) % 4], pNext = P[i], cNext = C[(i + 1) % 4];
    const a0 = ang(c, pPrev), a1 = ang(c, pNext);
    if (i === 0) s.moveTo(c[0] + R * Math.cos(a0), c[1] + R * Math.sin(a0));
    s.absarc(c[0], c[1], R, a0, a1, false);
    s.absarc(pNext[0], pNext[1], f, ang(pNext, c), ang(pNext, cNext), true);
  }
  return s;
}
function bladeGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0.0028, -0.0016);
  s.bezierCurveTo(0.009, -0.0038, 0.017, -0.0036, 0.0212, -0.0012);
  s.bezierCurveTo(0.0222, -0.0006, 0.0222, 0.0012, 0.0211, 0.0016);
  s.bezierCurveTo(0.016, 0.0034, 0.009, 0.0032, 0.0028, 0.0018);
  s.lineTo(0.0028, -0.0016);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0006, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -0.0003);
  g.rotateX(Math.PI / 2);
  g.rotateX(0.32);
  return g;
}
function finGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.013, 0);
  s.quadraticCurveTo(0.0105, 0.004, 0.0042, 0.0092);
  s.quadraticCurveTo(0.0018, 0.0098, 0.0008, 0.007);
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0008, bevelEnabled: true, bevelThickness: 0.0002, bevelSize: 0.0002, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.0004);
  return g;
}

const CAN = {
  X: 0.0255, Z: 0.043,
  // canopy profile, bottom to top: [normalized radius, height]
  prof: [[0.97, 0.0036], [0.994, 0.005], [1.0, 0.0072], [0.993, 0.0098], [0.965, 0.0122], [0.905, 0.0143], [0.8, 0.0159], [0.62, 0.01695], [0.35, 0.01748], [0.0, 0.0176]],
};
function canR(y) {
  const p = CAN.prof;
  if (y <= p[0][1]) return p[0][0];
  for (let i = 0; i < p.length - 1; i++) {
    if (y <= p[i + 1][1]) return p[i][0] + (p[i + 1][0] - p[i][0]) * (y - p[i][1]) / (p[i + 1][1] - p[i][1]);
  }
  return 0;
}
// point on the canopy surface at angle phi (0 = nose) and height y, pushed out by off
function canPoint(phi, y, off = 0) {
  const r = canR(y);
  const n = V3(Math.sin(phi) / CAN.X, 0, Math.cos(phi) / CAN.Z).normalize();
  return { p: V3(CAN.X * r * Math.sin(phi), y, CAN.Z * r * Math.cos(phi)).addScaledVector(n, off), n };
}

export const WISP_SPEC = { span: 0.118, height: 0.035, ductOffset: 0.038 };

export function createWisp({ internals = false, shadows = true } = {}) {
  const M = materials();
  const dyn = {
    led: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    bar: new THREE.MeshBasicMaterial({ color: 0xa8dcff }),
    halo: new THREE.MeshBasicMaterial({ color: 0x9fd8ff }),
    navR: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    navG: new THREE.MeshBasicMaterial({ color: 0x19ff7a }),
    tof: new THREE.MeshBasicMaterial({ color: 0x3a0806 }),
    blade: new THREE.MeshPhysicalMaterial({ color: 0x191b1e, roughness: 0.4, clearcoat: 0.5, transparent: true, side: THREE.DoubleSide }),
    disc: new THREE.MeshBasicMaterial({ map: textures().disc, color: 0x8e99a8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  };
  const root = new THREE.Group();
  root.name = 'Wisp';
  const parts = {};
  function part(name, label, dy, anchor, dz = 0) {
    const g = new THREE.Group();
    g.name = name;
    g.userData = { label, dy, dz, anchor };
    root.add(g);
    parts[name] = g;
    return g;
  }
  function add(parent, geo, mat, p, r, s, cast = shadows, order) {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.set(p[0], p[1], p[2]);
    if (order) m.rotation.order = order;
    if (r) m.rotation.set(r[0], r[1], r[2]);
    if (s) m.scale.set(s[0], s[1], s[2]);
    m.castShadow = cast;
    m.receiveShadow = shadows;
    parent.add(m);
    return m;
  }

  const d = 0.038, Ro = 0.0285, Ri = 0.0242, BS = 0.0016;
  const ducts = [[d, d], [-d, d], [-d, -d], [d, -d]];

  /* airframe: unibody plate, duct cowls, stator vanes, motor stators */
  const air = part('airframe', 'Airframe', 0, V3(0.064, 0.0, -0.02));
  const shape = frameOutline(d, Ro - BS, 0.019 + BS);
  ducts.forEach(([x, z]) => {
    const hole = new THREE.Path();
    hole.absarc(x, z, Ri + BS, 0, TAU, true);
    shape.holes.push(hole);
  });
  const plate = new THREE.ExtrudeGeometry(shape, { depth: 0.0044, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: BS, bevelSegments: 4, curveSegments: 64 });
  plate.rotateX(-Math.PI / 2);
  plate.translate(0, -0.0022, 0);
  add(air, plate, M.shell);
  const ductProf = [
    [Ri, -0.0028], [Ri - 0.0001, -0.0085], [Ri + 0.0003, -0.0135], [Ri + 0.0012, -0.0162], [Ri + 0.0026, -0.0169],
    [Ri + 0.0038, -0.0163], [Ri + 0.0046, -0.012], [Ro - 0.0016, -0.006], [Ro - 0.0008, -0.003], [Ri + 0.001, -0.0026], [Ri, -0.0028],
  ];
  const ductGeo = new THREE.LatheGeometry(ductProf.map(([r, y]) => new THREE.Vector2(r, y)), 56);
  const vaneGeo = new THREE.BoxGeometry(Ri - 0.0072, 0.0038, 0.0013);
  const mountGeo = new THREE.CylinderGeometry(0.0078, 0.0072, 0.0045, 24);
  const statorGeo = new THREE.CylinderGeometry(0.0056, 0.0056, 0.0042, 18);
  const lipGeo = new THREE.TorusGeometry(Ri + 0.0021, 0.0011, 8, 64);
  ducts.forEach(([x, z], i) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    air.add(g);
    add(g, ductGeo, M.duct);
    add(g, lipGeo, M.rubber, [0, -0.0166, 0], [Math.PI / 2, 0, 0]);
    add(g, mountGeo, M.shellMatte, [0, -0.0115, 0]);
    for (let k = 0; k < 3; k++) {
      const a = k * TAU / 3 + i * 0.5 + 0.3, r = (Ri + 0.0072) / 2;
      add(g, vaneGeo, M.shellMatte, [Math.cos(a) * r, -0.0115, Math.sin(a) * r], [0.2, -a, 0], null, shadows, 'YXZ');
    }
    add(g, statorGeo, M.copper, [0, -0.0072, 0]);
  });
  // screws, side wordmark, navigation lights
  const screwGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 0.0006, 12);
  const slotGeo = new THREE.BoxGeometry(0.0014, 0.0003, 0.0003);
  for (const [x, z] of [[0.036, 0.008], [0.036, -0.008], [-0.036, 0.008], [-0.036, -0.008]]) {
    add(air, screwGeo, M.metal, [x, 0.0041, z], null, null, false);
    add(air, slotGeo, M.chip, [x, 0.00445, z], null, null, false);
  }
  add(air, new THREE.PlaneGeometry(0.019, 0.0048), M.word, [-0.0372, 0.00405, 0], [-Math.PI / 2, 0, -Math.PI / 2], null, false);
  const navGeo = new THREE.SphereGeometry(0.0017, 10, 8);
  const nav = [];
  for (const [x, mat] of [[1, dyn.navR], [-1, dyn.navG]]) {
    const q = (Ro - 0.0004) * Math.SQRT1_2;
    nav.push(add(air, navGeo, mat, [x * (d + q), 0.0005, -(d + q)], null, null, false));
  }

  /* rotors: bell, hub, three blades, blur disc */
  const rot = part('rotors', 'Rotors', 0.02, V3(d + 0.022, -0.002, d));
  const bellGeo = new THREE.CylinderGeometry(0.0068, 0.0068, 0.0058, 28);
  const capGeo = new THREE.CylinderGeometry(0.005, 0.0068, 0.0009, 28);
  const hubGeo = new THREE.CylinderGeometry(0.0034, 0.0036, 0.0024, 20);
  const spinnerGeo = new THREE.SphereGeometry(0.0031, 16, 8, 0, TAU, 0, Math.PI / 2);
  const bladeGeo = bladeGeometry();
  const discGeo = new THREE.CircleGeometry(Ri - 0.0012, 48);
  const rotors = [];
  ducts.forEach(([x, z], i) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    rot.add(g);
    add(g, bellGeo, M.metal, [0, -0.0068, 0]);
    add(g, capGeo, M.metalDark, [0, -0.0034, 0]);
    const spin = new THREE.Group();
    spin.position.y = -0.0021;
    g.add(spin);
    add(spin, hubGeo, M.shellMatte);
    add(spin, spinnerGeo, M.metal, [0, 0.0012, 0]);
    const dir = i % 2 === 0 ? 1 : -1;
    for (let k = 0; k < 3; k++) add(spin, bladeGeo, dyn.blade, null, [0, k * TAU / 3, 0], [1, 1, dir]);
    add(spin, discGeo, dyn.disc, [0, 0.0005, 0], [-Math.PI / 2, 0, 0], null, false);
    rotors.push({ spin, dir });
  });

  /* canopy: shell, visor, emitters, camera, light bar, halo, vents, antennas */
  const can = part('canopy', 'Canopy', 0.06, V3(CAN.X, 0.012, 0.004));
  const canGeo = new THREE.LatheGeometry(CAN.prof.map(([r, y]) => new THREE.Vector2(r, y)), 72);
  canGeo.scale(CAN.X, 1, CAN.Z);
  add(can, canGeo, M.shell);
  const seam = add(can, new THREE.TorusGeometry(1, 0.035, 6, 72), M.chip, [0, 0.0046, 0], [Math.PI / 2, 0, 0], [CAN.X * 0.998, CAN.Z * 0.998, 0.025], false);
  seam.scale.set(CAN.X * 0.998, CAN.Z * 0.998, 0.03);
  const visYs = [0.0056, 0.0068, 0.008, 0.0092, 0.0104, 0.0116, 0.0128];
  const visGeo = new THREE.LatheGeometry(visYs.map(y => new THREE.Vector2(canR(y) * 1.016, y)), 48, -1.02, 2.04);
  visGeo.scale(CAN.X, 1, CAN.Z);
  add(can, visGeo, M.visor);
  const barPts = [];
  for (let i = 0; i <= 24; i++) barPts.push(canPoint(-0.86 + (1.72 * i) / 24, 0.0062, 0.0006).p);
  add(can, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barPts), 48, 0.00052, 6), dyn.bar, null, null, null, false);
  const emitters = [];
  const cupGeo = new THREE.LatheGeometry([[0.0011, -0.0016], [0.0019, -0.0011], [0.0025, -0.0004], [0.0028, 0.0002]].map(([r, y]) => new THREE.Vector2(r, y)), 24);
  cupGeo.rotateX(Math.PI / 2);
  const coreGeo = new THREE.CircleGeometry(0.00125, 20);
  const ringGeo = new THREE.TorusGeometry(0.0029, 0.00038, 6, 28);
  for (const phi of [-0.46, 0.46]) {
    const { p, n } = canPoint(phi, 0.0099, 0.0008);
    const e = new THREE.Group();
    e.position.copy(p);
    e.lookAt(p.clone().add(n));
    can.add(e);
    add(e, cupGeo, M.metal, null, null, null, false);
    add(e, coreGeo, dyn.led, [0, 0, -0.0012], null, null, false);
    add(e, ringGeo, M.metalDark, [0, 0, 0.0002], null, null, false);
    emitters.push(e);
  }
  {
    const { p, n } = canPoint(0, 0.0104, 0.0008);
    const cam = new THREE.Group();
    cam.position.copy(p);
    cam.lookAt(p.clone().add(n));
    can.add(cam);
    add(cam, new THREE.CylinderGeometry(0.0031, 0.0033, 0.0022, 24), M.chip, [0, 0, -0.0006], [Math.PI / 2, 0, 0], null, false);
    add(cam, new THREE.SphereGeometry(0.0024, 20, 12, 0, TAU, 0, Math.PI / 2), M.lens, [0, 0, 0.0004], [Math.PI / 2, 0, 0], [1, 0.55, 1], false);
    const t = canPoint(0.2, 0.0078, 0.0009);
    const tof = add(can, new THREE.BoxGeometry(0.0034, 0.0015, 0.0006), M.visor, t.p.toArray(), null, null, false);
    tof.lookAt(t.p.clone().add(t.n));
    add(tof, new THREE.CircleGeometry(0.00045, 10), dyn.tof, [0.0008, 0, 0.00031], null, null, false);
  }
  const halo = add(can, new THREE.TorusGeometry(0.0088, 0.00075, 8, 56), dyn.halo, [0, 0.01765, -0.004], [Math.PI / 2, 0, 0], null, false);
  add(can, new THREE.PlaneGeometry(0.0105, 0.0105), M.decal, [0, 0.01772, -0.004], [-Math.PI / 2, 0, 0], null, false);
  const ventGeo = new RoundedBoxGeometry(0.012, 0.0011, 0.0012, 1, 0.0004);
  [[-0.0285, 0.0167], [-0.0315, 0.0163], [-0.0345, 0.0157]].forEach(([z, y], i) => add(can, ventGeo, M.chip, [0, y - 0.0002, z], [-0.1 - i * 0.05, 0, 0], [1 - i * 0.12, 1, 1], false));
  const finGeo = finGeometry();
  for (const s of [-1, 1]) add(can, finGeo, M.shellMatte, [s * 0.0068, 0.0148, -0.0335], [s * 0.24, Math.PI / 2, 0], null, true, 'YXZ');
  const lightOrigin = new THREE.Object3D();
  lightOrigin.position.set(0, 0.0099, CAN.Z + 0.006);
  can.add(lightOrigin);

  /* belly: battery housing, sensors, port */
  const belly = part('belly', 'Belly shell', -0.036, V3(-0.017, -0.0102, 0.02));
  add(belly, new RoundedBoxGeometry(0.034, 0.011, 0.062, 3, 0.0045), M.shell, [0, -0.0102, -0.002]);
  add(belly, new RoundedBoxGeometry(0.0062, 0.0024, 0.0012, 1, 0.0008), M.chip, [0, -0.0102, -0.0331], null, null, false);
  for (const x of [-0.008, 0.008]) add(belly, new THREE.CircleGeometry(0.0021, 18), M.visor, [x, -0.01575, 0.02], [Math.PI / 2, 0, 0], null, false);

  /* dock: magnetic latch plate with pogo pads */
  const dock = part('dock', 'Dock latch', -0.05, V3(0.0115, -0.0168, 0));
  add(dock, new THREE.CylinderGeometry(0.0115, 0.0118, 0.0014, 40), M.metalDark, [0, -0.0165, 0]);
  add(dock, new THREE.TorusGeometry(0.0096, 0.0006, 6, 40), M.metal, [0, -0.0173, 0], [Math.PI / 2, 0, 0], null, false);
  for (let k = 0; k < 4; k++) {
    const a = k * TAU / 4 + Math.PI / 4;
    add(dock, new THREE.CylinderGeometry(0.0012, 0.0012, 0.0007, 12), M.gold, [Math.cos(a) * 0.0058, -0.0174, Math.sin(a) * 0.0058], null, null, false);
  }

  /* internals, shown in the exploded view */
  if (internals) {
    const pcb = part('pcb', 'Compute', 0.038, V3(0.016, 0.0092, 0.018));
    add(pcb, new RoundedBoxGeometry(0.032, 0.0014, 0.05, 1, 0.0006), M.pcb, [0, 0.0092, 0]);
    add(pcb, new RoundedBoxGeometry(0.03, 0.0012, 0.046, 1, 0.0005), M.esc, [0, 0.0062, 0]);
    add(pcb, new THREE.BoxGeometry(0.011, 0.0012, 0.011), M.chip, [0, 0.0105, 0.003]);
    add(pcb, new THREE.BoxGeometry(0.0088, 0.0004, 0.0088), M.metal, [0, 0.0113, 0.003]);
    for (const [x, z, w, dd] of [[0.0105, 0.012, 0.006, 0.0042], [0.0105, -0.004, 0.006, 0.0042], [-0.011, -0.012, 0.0032, 0.0032], [-0.01, 0.014, 0.004, 0.0026]]) {
      add(pcb, new THREE.BoxGeometry(w, 0.0009, dd), M.chip, [x, 0.0103, z]);
    }
    for (const [x, z] of [[0.012, -0.02], [-0.012, -0.02]]) add(pcb, new THREE.BoxGeometry(0.0062, 0.0017, 0.0025), M.white, [x, 0.0106, z]);
    for (let k = 0; k < 10; k++) add(pcb, new THREE.CylinderGeometry(0.0006, 0.0006, 0.0012, 8), M.metal, [-0.012 + (k % 5) * 0.0024, 0.0104, -0.009 + Math.floor(k / 5) * 0.0026]);
    for (const [x, z] of [[0.0135, 0.021], [-0.0135, 0.021], [0.0135, -0.021], [-0.0135, -0.021]]) {
      add(pcb, new THREE.CylinderGeometry(0.0009, 0.0009, 0.0028, 10), M.metal, [x, 0.0077, z]);
    }
    for (let k = 0; k < 4; k++) add(pcb, new THREE.BoxGeometry(0.0042, 0.0009, 0.0036), M.chip, [(k % 2 ? 1 : -1) * 0.008, 0.0072, (k < 2 ? 1 : -1) * 0.012]);

    const opt = part('optics', 'Optics', 0.026, V3(0.0, 0.012, 0.036), 0.02);
    for (let k = 0; k < 6; k++) add(opt, new THREE.BoxGeometry(0.019, 0.0062, 0.0005), M.metalDark, [0, 0.0095, 0.0262 + k * 0.0012]);
    add(opt, new THREE.BoxGeometry(0.021, 0.0068, 0.0012), M.esc, [0, 0.0095, 0.0335]);
    add(opt, new THREE.BoxGeometry(0.0062, 0.0062, 0.0015), M.pcb, [0, 0.0104, 0.0365]);
    const flexCurve = new THREE.CatmullRomCurve3([V3(0, 0.0072, 0.033), V3(0, 0.0062, 0.029), V3(0, 0.0068, 0.022), V3(0, 0.0086, 0.017)]);
    const flexPts = flexCurve.getSpacedPoints(24);
    add(opt, ribbonGeometry(flexPts, flexPts.map(() => V3(0, 1, 0)), 0.0068, 0.0003, 0, 0), M.flex);

    const batt = part('battery', 'Power', -0.024, V3(0.015, -0.0105, 0.012));
    add(batt, new RoundedBoxGeometry(0.03, 0.0085, 0.052, 2, 0.0014), M.battery, [0, -0.0105, -0.003]);
    add(batt, new THREE.BoxGeometry(0.008, 0.003, 0.004), M.white, [0, -0.0105, 0.0255]);
    for (const [x, mat] of [[-0.0022, M.wireRed], [0.0022, M.wireBlack]]) {
      const w = [V3(x, -0.0105, 0.023), V3(x * 1.4, -0.0098, 0.028), V3(x, -0.0085, 0.031)];
      add(batt, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(w), 10, 0.0006, 6), mat);
    }
  }

  const api = {
    root, parts, rotors, emitters, lightOrigin, materials: dyn,
    setRotor(angle, spin) {
      for (const r of rotors) r.spin.rotation.y = angle * r.dir;
      dyn.blade.opacity = 1 - 0.85 * spin;
      dyn.blade.depthWrite = spin < 0.5;
      dyn.disc.opacity = 0.55 * spin;
    },
    setLight(level, color) {
      dyn.led.color.copy(color).multiplyScalar(0.55 + 40 * level);
      dyn.bar.color.copy(color).multiplyScalar(0.35 + 7 * level);
    },
    setHalo(level, color) { dyn.halo.color.copy(color).multiplyScalar(0.25 + 3.5 * level); },
    setNav(level) {
      dyn.navR.color.setRGB(1, 0.12, 0.08).multiplyScalar(0.12 + 3 * level);
      dyn.navG.color.setRGB(0.1, 1, 0.35).multiplyScalar(0.12 + 3 * level);
      dyn.tof.color.setRGB(0.6, 0.05, 0.04).multiplyScalar(0.3 + level);
    },
    setExplode(k) {
      for (const p of Object.values(parts)) p.position.set(0, p.userData.dy * k, p.userData.dz * k);
    },
  };
  api.setLight(0, new THREE.Color(0xeaf6ff));
  api.setHalo(0.3, new THREE.Color(0x9fd8ff));
  api.setNav(0);
  api.setRotor(0, 0);
  return api;
}

/* ------------------------------------------------------------------ */
/* Torso surface (shared with the scenario's people)                   */
/* ------------------------------------------------------------------ */
export const TORSO = {
  pelvis: [[0, -0.13], [0.1, -0.125], [0.158, -0.08], [0.166, 0], [0.156, 0.1], [0, 0.1]],
  belly: [[0, -0.08], [0.148, -0.08], [0.152, 0.02], [0.15, 0.1], [0.158, 0.19], [0, 0.19]],
  chest: [[0, -0.07], [0.145, -0.07], [0.155, 0], [0.163, 0.08], [0.168, 0.15], [0.166, 0.19], [0.152, 0.232], [0.118, 0.262], [0.06, 0.282], [0, 0.288]],
  zs: { pelvis: 0.7, belly: 0.64, chest: 0.62 },
  // chest space: the chest pivot sits 0.17 above the spine pivot
  bellyOffset: 0.17,
};
export function profileRadius(prof, y) {
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    if (y1 === y0) continue;
    if (y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return 0;
}
function torsoRZ(y) {
  const rc = profileRadius(TORSO.chest, y), rb = profileRadius(TORSO.belly, y + TORSO.bellyOffset);
  return rc >= rb ? [rc, TORSO.zs.chest] : [rb, TORSO.zs.belly];
}
function torsoField(x, y, z) {
  const [r, zs] = torsoRZ(y);
  return Math.hypot(x, z / zs) - r;
}
// Project a chest-space point onto the torso surface and push it out along the normal
export function onTorso(p, off = 0.003) {
  const q = p.clone(), n = V3(), e = 0.0006;
  for (let i = 0; i < 16; i++) {
    const f = torsoField(q.x, q.y, q.z);
    n.set(
      torsoField(q.x + e, q.y, q.z) - torsoField(q.x - e, q.y, q.z),
      torsoField(q.x, q.y + e, q.z) - torsoField(q.x, q.y - e, q.z),
      torsoField(q.x, q.y, q.z + e) - torsoField(q.x, q.y, q.z - e)).divideScalar(2 * e);
    const g2 = n.lengthSq();
    if (g2 < 1e-10) break;
    q.addScaledVector(n, -f / g2);
    if (Math.abs(f) < 2e-6) break;
  }
  n.normalize();
  return { p: q.addScaledVector(n, off), n };
}
export function torsoSurfZ(x, y) {
  const [r, zs] = torsoRZ(y);
  return r > x ? zs * Math.sqrt(r * r - x * x) : 0;
}

/* ------------------------------------------------------------------ */
/* Silk harness                                                        */
/* ------------------------------------------------------------------ */
// A flat strap with rectangular section following sampled points and surface normals
function ribbonGeometry(pts, nrm, width, thick, taperStart = 0, taperEnd = 0.15) {
  const N = pts.length, rings = [];
  const T = V3(), B = V3(), Nn = V3();
  for (let i = 0; i < N; i++) {
    T.copy(pts[Math.min(i + 1, N - 1)]).sub(pts[Math.max(i - 1, 0)]).normalize();
    Nn.copy(nrm[i]).addScaledVector(T, -nrm[i].dot(T)).normalize();
    B.crossVectors(T, Nn).normalize();
    const u = i / (N - 1);
    let w = 1;
    if (taperStart > 0 && u < taperStart) w = Math.pow(Math.max(0, Math.sin(clamp01(u / taperStart) * Math.PI / 2)), 0.5);
    if (taperEnd > 0 && u > 1 - taperEnd) w = Math.min(w, Math.pow(Math.max(0, Math.cos(clamp01((u - (1 - taperEnd)) / taperEnd) * Math.PI / 2)), 0.6));
    rings.push({ p: pts[i], n: Nn.clone(), b: B.clone(), hw: Math.max(width * 0.5 * w, 0.0003), ht: thick * 0.5 * (0.6 + 0.4 * w) });
  }
  const pos = [], nor = [], idx = [];
  const faces = [
    [[1, 1], [-1, 1], r => r.n, 1],
    [[-1, -1], [1, -1], r => r.n, -1],
    [[1, -1], [1, 1], r => r.b, 1],
    [[-1, 1], [-1, -1], r => r.b, -1],
  ];
  for (const [A, C, pick, sign] of faces) {
    const base = pos.length / 3;
    for (const r of rings) {
      for (const [sb, sn] of [A, C]) {
        const v = r.p.clone().addScaledVector(r.b, sb * r.hw).addScaledVector(r.n, sn * r.ht);
        pos.push(v.x, v.y, v.z);
        const nn = pick(r);
        nor.push(nn.x * sign, nn.y * sign, nn.z * sign);
      }
    }
    for (let i = 0; i < N - 1; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, dd = a + 3;
      idx.push(a, c, b, b, c, dd);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
// Two padded shoulder straps that return under the arms like a backpack, a sternum strap with the
// trigger clasp, and a contoured back plate. Rough chest-space points (x = left, y = up, z = forward);
// they get projected onto the torso. Left side, mirrored for the right.
const STRAP = [[0.04, 0.236, -0.106], [0.074, 0.262, -0.062], [0.09, 0.276, -0.012], [0.093, 0.268, 0.036], [0.09, 0.235, 0.086], [0.079, 0.18, 0.106], [0.072, 0.12, 0.11], [0.08, 0.06, 0.108], [0.1, 0.03, 0.096]];
const LOWER = [[0.102, 0.028, 0.094], [0.14, 0.02, 0.062], [0.16, 0.032, -0.008], [0.15, 0.052, -0.068], [0.102, 0.08, -0.1], [0.052, 0.094, -0.108]];
const STERNUM = [[-0.078, 0.1, 0.11], [-0.04, 0.1, 0.118], [0, 0.1, 0.12], [0.04, 0.1, 0.118], [0.078, 0.1, 0.11]];
const PLATE = { cy: 0.168, hw: 0.064, hh: 0.08, r: 0.022, off: 0.0015, t: 0.007 };
function sampleOnTorso(rough, off, samples) {
  const ctrl = rough.map(p => onTorso(V3(...p), off).p);
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  const pts = [], nrm = [];
  for (let i = 0; i <= samples; i++) {
    const s = onTorso(curve.getPointAt(i / samples), off);
    pts.push(s.p);
    nrm.push(s.n);
  }
  return { pts, nrm };
}
// a plate that follows the back: a grid over a rounded rectangle, projected onto the torso, with thickness
function backPlateGeometry({ cy, hw, hh, r, off, t }, nu = 26, nv = 32) {
  const inner = [], outer = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      let x = (i / nu * 2 - 1) * hw, y = (j / nv * 2 - 1) * hh;
      const qx = Math.abs(x) - (hw - r), qy = Math.abs(y) - (hh - r);
      if (qx > 0 && qy > 0) {
        const d = Math.hypot(qx, qy);
        if (d > r) { x = Math.sign(x) * (hw - r + qx * r / d); y = Math.sign(y) * (hh - r + qy * r / d); }
      }
      const zb = -torsoSurfZ(x, y + cy);
      inner.push(V3(x, y + cy, zb - off));
      outer.push(V3(x, y + cy, zb - off - t));
    }
  }
  const pos = [], idx = [];
  const push = v => { pos.push(v.x, v.y, v.z); return pos.length / 3 - 1; };
  const W = nu + 1;
  const io = inner.map(push), oo = outer.map(push);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      idx.push(oo[a], oo[c], oo[b], oo[b], oo[c], oo[d]);
      idx.push(io[a], io[b], io[c], io[b], io[d], io[c]);
    }
  }
  const ring = [];
  for (let i = 0; i <= nu; i++) ring.push(i);
  for (let j = 1; j <= nv; j++) ring.push(j * W + nu);
  for (let i = nu - 1; i >= 0; i--) ring.push(nv * W + i);
  for (let j = nv - 1; j >= 1; j--) ring.push(j * W);
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length];
    idx.push(io[a], oo[a], io[b], io[b], oo[a], oo[b]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// chest: a Group in chest space (the scenario's person chest, or the mannequin's)
export function createSilk(chest, { shadows = true } = {}) {
  const M = materials();
  const led = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
  const nestLed = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
  const buttonLed = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
  const plateMat = M.nest.clone();
  plateMat.side = THREE.DoubleSide;
  const group = new THREE.Group();
  group.name = 'Silk';
  chest.add(group);
  const add = (parent, geo, mat, p, cast = shadows) => {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.copy(p);
    m.castShadow = cast;
    m.receiveShadow = shadows;
    parent.add(m);
    return m;
  };
  // straps
  for (const side of [1, -1]) {
    const mirror = pts => pts.map(([x, y, z]) => [x * side, y, z]);
    const a = sampleOnTorso(mirror(STRAP), 0.0022, 90);
    add(group, ribbonGeometry(a.pts, a.nrm, 0.038, 0.0034, 0, 0), M.strip);
    const b = sampleOnTorso(mirror(LOWER), 0.0018, 70);
    add(group, ribbonGeometry(b.pts, b.nrm, 0.025, 0.002, 0, 0), M.strip);
    // ladder lock where the lower strap feeds into the shoulder strap
    const k = a.pts.length - 6, q = a.pts[k], n = a.nrm[k];
    const lock = add(group, new RoundedBoxGeometry(0.046, 0.018, 0.003, 2, 0.0012), M.metalDark, q.clone().addScaledVector(n, 0.0045));
    lock.lookAt(q.clone().add(n));
  }
  const st = sampleOnTorso(STERNUM, 0.0052, 50);
  add(group, ribbonGeometry(st.pts, st.nrm, 0.02, 0.0018, 0, 0), M.strip);
  // the back plate, with a lit ring around the dock
  add(group, backPlateGeometry(PLATE), plateMat);
  const backZ = -torsoSurfZ(0, PLATE.cy) - PLATE.off - PLATE.t;
  const nest = new THREE.Group();
  nest.position.set(0, PLATE.cy, backZ);
  group.add(nest);
  add(nest, new THREE.TorusGeometry(0.03, 0.0009, 8, 64), led, V3(0, 0, -0.0004), false);
  add(nest, new THREE.SphereGeometry(0.0016, 10, 8), nestLed, V3(0, PLATE.hh - 0.012, -0.0006), false);
  for (let k = 0; k < 3; k++) {
    const pin = add(nest, new THREE.CylinderGeometry(0.0012, 0.0012, 0.0012, 12), M.gold, V3((k - 1) * 0.0034, 0, -0.0005), false);
    pin.rotation.x = Math.PI / 2;
  }
  // where the drone clips on: its belly on the plate, top facing out, nose up
  const dock = new THREE.Object3D();
  dock.position.set(0, PLATE.cy, backZ - 0.0181);
  dock.rotation.x = -Math.PI / 2;
  group.add(dock);
  // the trigger clasp on the sternum strap
  const cs = onTorso(V3(0, 0.1, 0.12), 0.0062);
  const clasp = new THREE.Group();
  clasp.position.copy(cs.p);
  clasp.lookAt(cs.p.clone().add(cs.n));
  group.add(clasp);
  add(clasp, new RoundedBoxGeometry(0.046, 0.028, 0.0085, 3, 0.0036), M.metalDark);
  add(clasp, new THREE.CylinderGeometry(0.0078, 0.0082, 0.0028, 32), M.shellMatte, V3(0, 0, 0.0052)).rotation.x = Math.PI / 2;
  add(clasp, new THREE.TorusGeometry(0.0056, 0.0006, 8, 32), buttonLed, V3(0, 0, 0.0067), false);
  const button = new THREE.Object3D();
  button.position.set(0, 0, 0.0068);
  clasp.add(button);
  return { group, nest, dock, clasp, button, led, nestLed, buttonLed };
}

/* ------------------------------------------------------------------ */
/* Display pieces for the website                                      */
/* ------------------------------------------------------------------ */
function lathe(profile, zScale, radial = 48) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), radial);
  g.scale(1, 1, zScale);
  return g;
}
// A tailor's bust on a stand. Returns its chest group so the harness can be fitted.
export function createMannequin({ color = 0xc7cad0 } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.58, clearcoat: 0.2, clearcoatRoughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 1, roughness: 0.35 });
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 1.0;
  root.add(hips);
  const add = (p, geo, m = mat, pos, rot, scl) => {
    const mesh = new THREE.Mesh(geo, m);
    if (pos) mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    if (scl) mesh.scale.set(...scl);
    mesh.castShadow = mesh.receiveShadow = true;
    p.add(mesh);
    return mesh;
  };
  add(hips, lathe([[0.0, -0.06], [0.13, -0.06], [0.158, -0.03], [0.166, 0], [0.156, 0.1], [0, 0.1]], TORSO.zs.pelvis), mat);
  const spine = new THREE.Group();
  spine.position.y = 0.08;
  hips.add(spine);
  add(spine, lathe(TORSO.belly, TORSO.zs.belly), mat);
  const chest = new THREE.Group();
  chest.position.y = 0.17;
  spine.add(chest);
  add(chest, lathe(TORSO.chest, TORSO.zs.chest), mat);
  for (const s of [-1, 1]) add(chest, new THREE.SphereGeometry(0.06, 32, 20), mat, [s * 0.172, 0.206, 0], null, [0.9, 0.78, 1.0]);
  add(chest, new THREE.CylinderGeometry(0.046, 0.055, 0.1, 32), mat, [0, 0.31, 0]);
  add(chest, new THREE.CylinderGeometry(0.04, 0.046, 0.012, 32), metal, [0, 0.366, 0]);
  add(chest, new THREE.SphereGeometry(0.012, 16, 10), metal, [0, 0.376, 0]);
  add(root, new THREE.CylinderGeometry(0.012, 0.012, 0.86, 16), metal, [0, 0.45, 0]);
  add(root, new THREE.CylinderGeometry(0.16, 0.18, 0.03, 48), metal, [0, 0.015, 0]);
  return { root, chest };
}
// A calm, featureless head and shoulders for the pattern visualizer (head center at the origin)
export function createHeadBust({ color = 0x9aa0a8 } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  const root = new THREE.Group();
  const add = (geo, pos, scl, rot) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (scl) m.scale.set(...scl);
    if (rot) m.rotation.set(...rot);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    return m;
  };
  add(new THREE.SphereGeometry(0.1, 48, 32), [0, 0, 0], [0.92, 1.12, 1.0]);
  add(new THREE.SphereGeometry(0.068, 32, 24), [0, -0.055, 0.026], [0.96, 0.82, 0.96]);
  add(new THREE.SphereGeometry(0.016, 20, 14), [0, -0.01, 0.097], [0.6, 1.25, 0.75]);
  add(new THREE.CylinderGeometry(0.047, 0.056, 0.14, 32), [0, -0.145, 0]);
  // upper chest and shoulders from the shared torso profile, cut below the collarbones
  const chestY = -0.448;
  add(lathe(TORSO.chest.filter(([, y]) => y >= 0.12), TORSO.zs.chest, 64), [0, chestY, 0]);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.06, 32, 20), [s * 0.172, chestY + 0.206, 0], [0.9, 0.78, 1.0]);
  return { root };
}

/* ------------------------------------------------------------------ */
/* Orbit autonomy flight patterns                                      */
/* ------------------------------------------------------------------ */
// Offsets in the head frame: x = the person's left, y = up, z = where the face points. t in seconds.
export { PATTERNS } from './patterns.js';
