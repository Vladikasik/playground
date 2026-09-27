/* Wisp site behavior: nav, menu, reveals, the 360 spin, the scroll-driven exploded view and the pattern plots */
import { PATTERNS } from './patterns.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pad2 = n => String(n).padStart(2, '0');
const pad3 = n => String(n).padStart(3, '0');

document.documentElement.classList.add('js');

/* ---------------- nav + menu ---------------- */
const nav = $('.nav');
const syncNav = () => nav && nav.classList.toggle('solid', window.scrollY > 24);
window.addEventListener('scroll', syncNav, { passive: true });
syncNav();

const menu = $('#menu'), menuOpen = $('#menuOpen'), menuClose = $('#menuClose');
function setMenu(open, refocus = true) {
  if (!menu) return;
  menu.hidden = !open;
  menuOpen.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) menuClose.focus();
  else if (refocus) menuOpen.focus();
}
menuOpen?.addEventListener('click', () => setMenu(true));
menuClose?.addEventListener('click', () => setMenu(false));
menu?.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false, false); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && menu && !menu.hidden) setMenu(false); });
window.matchMedia('(min-width: 901px)').addEventListener('change', e => { if (e.matches && menu && !menu.hidden) setMenu(false, false); });

$$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

/* ---------------- reveal on scroll ---------------- */
// blocks are visible without this; ones that arrive later get a short rise just before they enter the view
if (!reduceMotion && 'IntersectionObserver' in window) {
  let settled = false;
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      if (settled) e.target.classList.add('in');
    }
    settled = true;
  }, { rootMargin: '0px 0px 12% 0px' });
  $$('.reveal').forEach(el => io.observe(el));
}

/* ---------------- frame sequences ---------------- */
function loadFrames(base, n, ext) {
  const frames = new Array(n);
  let done = 0;
  const ready = new Promise(resolve => {
    for (let i = 0; i < n; i++) {
      const im = new Image();
      im.decoding = 'async';
      im.onload = im.onerror = () => { if (++done === n) resolve(frames); };
      im.src = `${base}${pad3(i)}.${ext}`;
      frames[i] = im;
    }
  });
  return { frames, ready };
}

function whenNear(el, fn, margin = '600px 0px') {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { io.disconnect(); fn(); }
  }, { rootMargin: margin });
  io.observe(el);
}

// draw an image into a canvas the way object-fit: contain would, scaled by `zoom`; returns the drawn rect
function drawContain(canvas, img, zoom = 1) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!img || !img.complete || !img.naturalWidth) return null;
  g.clearRect(0, 0, w, h);
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  const dx = (w - dw) / 2, dy = (h - dh) / 2;
  g.drawImage(img, dx, dy, dw, dh);
  return { dx, dy, dw, dh };
}

/* 360 spin: drag to turn, turns slowly by itself when left alone */
function spinViewer(box) {
  const canvas = $('canvas', box);
  const n = Number(box.dataset.frames);
  const { frames, ready } = loadFrames(box.dataset.spin, n, box.dataset.ext || 'webp');
  let idx = 0, drag = null, idleUntil = 0, last = 0, visible = false, raf = 0;
  const show = () => drawContain(canvas, frames[idx]);
  frames[0].addEventListener('load', show, { once: true });
  ready.then(() => { box.classList.add('is-live'); show(); });
  const step = d => { idx = (idx + d + n) % n; show(); };
  const tick = now => {
    raf = 0;
    if (!visible) return;
    if (!drag && !reduceMotion && now > idleUntil && now - last > 110) { last = now; step(1); }
    raf = requestAnimationFrame(tick);
  };
  new IntersectionObserver(es => {
    visible = es[0].isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(tick);
  }).observe(box);
  box.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, acc: 0 };
    box.setPointerCapture(e.pointerId);
    box.classList.add('dragging');
  });
  box.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.acc += e.clientX - drag.x;
    drag.x = e.clientX;
    const px = Math.max(6, box.clientWidth / n / 1.2);
    while (drag.acc > px) { step(-1); drag.acc -= px; }
    while (drag.acc < -px) { step(1); drag.acc += px; }
  });
  const end = () => { drag = null; idleUntil = performance.now() + 2500; box.classList.remove('dragging'); };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { step(-1); idleUntil = performance.now() + 4000; e.preventDefault(); }
    if (e.key === 'ArrowRight') { step(1); idleUntil = performance.now() + 4000; e.preventDefault(); }
  });
  new ResizeObserver(show).observe(canvas);
}
$$('[data-spin]').forEach(box => whenNear(box, () => spinViewer(box)));

/* exploded view: scroll position through .inside picks the frame; labels follow the parts */
const inside = $('.inside');
if (inside) {
  const canvas = $('canvas[data-seq]', inside);
  const labelsEl = $('.labels', inside);
  const items = $$('.parts li', inside);
  const prog = $('.inside-progress', inside);
  const bar = $('.inside-bar i', inside);
  const n = Number(canvas.dataset.frames);
  let seq = null, labels = null, labelEls = [], idx = -1, part = -1, rect = null;
  const draw = force => {
    const r = inside.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
    // take the drone apart over the first 70% of the scroll, then hold while the list finishes
    const k = clamp(p / 0.7, 0, 1);
    const f = Math.round(k * (n - 1));
    const active = Math.min(items.length - 1, Math.floor(clamp((p - 0.06) / 0.88, 0, 0.9999) * items.length));
    if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
    if (seq && (f !== idx || force)) {
      const img = seq.frames[f].complete && seq.frames[f].naturalWidth ? seq.frames[f] : seq.frames[Math.max(idx, 0)];
      rect = drawContain(canvas, img, window.innerWidth > 900 ? 1.06 : 1.0) || rect;
      idx = f;
    }
    if (labels && rect) {
      labelEls.forEach((el, i) => {
        const pts = labels.parts[i].pts;
        const q = pts[Math.min(f, pts.length - 1)];
        el.style.transform = `translate(${(rect.dx + q[0] * rect.dw).toFixed(1)}px, ${(rect.dy + q[1] * rect.dh).toFixed(1)}px) translate(-3px, -50%)`;
        el.classList.toggle('show', k > 0.35);
        el.classList.toggle('on', i === active && k > 0.35);
      });
    }
    if (active !== part) {
      part = active;
      items.forEach((li, i) => li.classList.toggle('on', i === active));
      if (prog) prog.textContent = `${pad2(active + 1)} / ${pad2(items.length)}`;
    }
  };
  whenNear(inside, () => {
    seq = loadFrames(canvas.dataset.seq, n, canvas.dataset.ext || 'webp');
    seq.frames[0].addEventListener('load', () => draw(true), { once: true });
    seq.ready.then(() => { inside.classList.add('is-live'); draw(true); });
    fetch(canvas.dataset.labels).then(r => r.json()).then(json => {
      labels = json;
      labelEls = json.parts.map((p, i) => {
        const el = document.createElement('div');
        el.className = 'plabel';
        el.textContent = `${pad2(i + 1)} ${p.name}`;
        labelsEl.appendChild(el);
        return el;
      });
      draw(true);
    }).catch(() => {});
  }, '1200px 0px');
  window.addEventListener('scroll', () => draw(false), { passive: true });
  window.addEventListener('resize', () => draw(true));
  new ResizeObserver(() => draw(true)).observe(canvas);
  draw(true);
}

/* ---------------- pattern plots: top-down views of each flight pattern ---------------- */
const pt = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };

function drawPattern(g, w, h, f, t, big = false) {
  const cx = w * (big ? 0.5 : 0.46), cy = h * 0.5, s = Math.min(w * (big ? 0.9 : 0.84), h) * 0.5 / 0.88;
  g.clearRect(0, 0, w, h);
  const los = g.createLinearGradient(0, cy, 0, h);
  los.addColorStop(0, 'rgba(241,164,68,0.14)');
  los.addColorStop(1, 'rgba(241,164,68,0)');
  g.fillStyle = los;
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - h * 0.36, h); g.lineTo(cx + h * 0.36, h); g.closePath(); g.fill();
  g.lineWidth = 1;
  g.font = `500 ${big ? 11 : 9.5}px "IBM Plex Mono", ui-monospace, monospace`;
  g.fillStyle = 'rgba(255,255,255,0.34)';
  for (const r of [0.25, 0.5, 0.75]) {
    g.strokeStyle = r === 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)';
    g.setLineDash(r === 0.5 ? [] : [2, 4]);
    g.beginPath(); g.arc(cx, cy, r * s, 0, Math.PI * 2); g.stroke();
    g.fillText(`${r} m`, cx + r * s * 0.72 + 4, cy - r * s * 0.72 - 4);
  }
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.beginPath(); g.moveTo(cx - 0.86 * s, cy); g.lineTo(cx + 0.86 * s, cy); g.moveTo(cx, cy - 0.86 * s); g.lineTo(cx, cy + 0.86 * s); g.stroke();
  g.fillStyle = '#12161b';
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.beginPath(); g.ellipse(cx, cy - 0.02 * s, 0.21 * s, 0.1 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#1b2027';
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.ellipse(cx, cy, 0.075 * s, 0.09 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(cx - 0.02 * s, cy + 0.085 * s); g.lineTo(cx, cy + 0.115 * s); g.lineTo(cx + 0.02 * s, cy + 0.085 * s); g.stroke();
  const span = 3.6, n = 150;
  let px = 0, py = 0;
  for (let i = 0; i <= n; i++) {
    f(Math.max(0, t - span + (span * i) / n), pt);
    const x = cx + pt.x * s, y = cy + pt.z * s;
    if (i) {
      const a = Math.pow(i / n, 1.6);
      g.strokeStyle = `rgba(166,219,255,${(0.08 + a * 0.8).toFixed(3)})`;
      g.lineWidth = (0.8 + a * 1.4) * (big ? 1.4 : 1);
      g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
    }
    px = x; py = y;
  }
  f(t, pt);
  const dx = cx + pt.x * s, dy = cy + pt.z * s;
  const beam = g.createLinearGradient(dx, dy, cx, cy);
  beam.addColorStop(0, 'rgba(234,247,255,0.5)');
  beam.addColorStop(1, 'rgba(234,247,255,0.02)');
  g.strokeStyle = beam;
  g.lineWidth = big ? 1.5 : 1;
  g.beginPath(); g.moveTo(dx, dy); g.lineTo(cx, cy); g.stroke();
  const R = big ? 22 : 16;
  const glow = g.createRadialGradient(dx, dy, 0, dx, dy, R);
  glow.addColorStop(0, 'rgba(234,247,255,0.95)');
  glow.addColorStop(0.25, 'rgba(166,219,255,0.5)');
  glow.addColorStop(1, 'rgba(166,219,255,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(dx, dy, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(dx, dy, big ? 3 : 2.4, 0, Math.PI * 2); g.fill();
  const gx = w - (big ? 30 : 22), top = h * 0.16, bot = h * 0.84, lo = -0.1, hi = 0.46;
  const Y = v => bot - ((v - lo) / (hi - lo)) * (bot - top);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.beginPath(); g.moveTo(gx, top); g.lineTo(gx, bot); g.stroke();
  g.strokeStyle = 'rgba(241,164,68,0.7)';
  g.beginPath(); g.moveTo(gx - 6, Y(0.02)); g.lineTo(gx + 6, Y(0.02)); g.stroke();
  g.fillStyle = 'rgba(241,164,68,0.8)';
  g.textAlign = 'right';
  g.fillText('EYE', gx - 9, Y(0.02) + 3.5);
  g.textAlign = 'left';
  g.fillStyle = '#eaf7ff';
  g.fillRect(gx - 4, Y(pt.y) - 1, 8, 2);
}

const plots = [];
const t0 = performance.now();
const clock = () => (reduceMotion ? 3 : 3 + (performance.now() - t0) / 1000);
let plotRaf = 0;
const plotFrame = () => {
  plotRaf = 0;
  const vis = plots.filter(p => p.vis);
  if (!vis.length) return;
  const t = clock();
  vis.forEach(p => p.draw(t));
  plotRaf = requestAnimationFrame(plotFrame);
};
const plotIO = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) {
    const it = plots.find(p => p.c === e.target);
    if (it) it.vis = e.isIntersecting;
  }
  if (!reduceMotion && !plotRaf && plots.some(p => p.vis)) plotRaf = requestAnimationFrame(plotFrame);
}, { rootMargin: '100px 0px' }) : null;

function addPlot(canvas, getF, big) {
  const it = { c: canvas, g: canvas.getContext('2d'), getF, big, vis: false, w: 0, h: 0 };
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    it.w = canvas.clientWidth; it.h = canvas.clientHeight;
    canvas.width = Math.round(it.w * dpr); canvas.height = Math.round(it.h * dpr);
    it.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  it.draw = t => drawPattern(it.g, it.w, it.h, it.getF(), t, it.big);
  size();
  it.draw(3);
  new ResizeObserver(() => { size(); it.draw(clock()); }).observe(canvas);
  plotIO?.observe(canvas);
  plots.push(it);
  return it;
}

$$('canvas[data-card]').forEach(c => addPlot(c, () => PATTERNS[c.dataset.card].f, false));

// a large plot with pattern tabs; it cycles through the patterns until someone picks one
$$('[data-plot]').forEach(box => {
  const canvas = $('canvas', box);
  const tabs = $$('[data-pattern]', box);
  const name = $('[data-readout-name]', box), note = $('[data-readout-note]', box);
  const order = tabs.map(b => b.dataset.pattern);
  let id = order[0], since = performance.now(), manual = false;
  const select = (next, byHand) => {
    id = next;
    since = performance.now();
    manual = manual || byHand;
    tabs.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pattern === id)));
    if (name) name.textContent = PATTERNS[id].name;
    if (note) note.textContent = PATTERNS[id].note;
  };
  tabs.forEach(b => b.addEventListener('click', () => select(b.dataset.pattern, true)));
  addPlot(canvas, () => {
    if (!manual && !reduceMotion && performance.now() - since > 5200) select(order[(order.indexOf(id) + 1) % order.length], false);
    return PATTERNS[id].f;
  }, true);
  select(id, false);
});
