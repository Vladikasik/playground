/* Wisp site behavior: nav, menu, reveals, the live 3D views and the pattern cards */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = u => u * u * (3 - 2 * u);
const pad2 = n => String(n).padStart(2, '0');

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
const reveals = $$('.reveal');
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
  reveals.forEach(el => io.observe(el));
}

/* ---------------- live 3D views, mounted as they come near ---------------- */
let lib = null;
const loadLib = () => lib || (lib = import('./site3d.js'));

function fallback(canvas) {
  const src = canvas.dataset.poster;
  canvas.hidden = true;
  if (!src) return;
  const img = new Image();
  img.src = src;
  img.alt = '';
  img.className = canvas.className;
  canvas.after(img);
}

const inside = $('.inside');
const insideState = { view: null, k: 0, idx: 0 };

async function mountView(canvas) {
  let m;
  try { m = await loadLib(); } catch (err) { fallback(canvas); return; }
  const kind = canvas.getAttribute('data-3d');
  let view = null;
  if (kind === 'hero') view = m.mountHero(canvas);
  else if (kind === 'harness') view = m.mountHarness(canvas, { view: canvas.dataset.view || 'back' });
  else if (kind === 'turntable') view = m.mountTurntable(canvas);
  else if (kind === 'explode') {
    view = m.mountExplode(canvas, $('.labels', canvas.parentElement));
    if (view) { insideState.view = view; view.set(insideState.k, insideState.idx); }
  } else if (kind === 'patterns') {
    const box = canvas.closest('[data-patterns]') || canvas.parentElement;
    const tabs = $$('[data-pattern]', box);
    const name = $('[data-readout-name]', box), note = $('[data-readout-note]', box);
    view = m.mountPatterns(canvas, {
      onChange(id) {
        tabs.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pattern === id)));
        if (name) name.textContent = m.PATTERNS[id].name;
        if (note) note.textContent = m.PATTERNS[id].note;
      },
    });
    if (view) tabs.forEach(b => b.addEventListener('click', () => view.select(b.dataset.pattern)));
  }
  if (!view) fallback(canvas);
  else canvas.closest('[data-live]')?.classList.add('is-live');
}

const views = $$('[data-3d]');
if (views.length) {
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); mountView(e.target); }
    }, { rootMargin: '700px 0px' });
    views.forEach(v => io.observe(v));
  } else views.forEach(mountView);
}

/* ---------------- inside: scroll drives the exploded view ---------------- */
if (inside) {
  const items = $$('.parts li', inside);
  const prog = $('.inside-progress', inside);
  const bar = $('.inside-bar i', inside);
  const N = items.length;
  let last = -1;
  const update = () => {
    const r = inside.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
    // pull apart over the first stretch, walk the parts, close up again at the end
    const k = smooth(clamp(p / 0.14, 0, 1)) * (1 - smooth(clamp((p - 0.9) / 0.1, 0, 1)));
    const idx = Math.min(N - 1, Math.floor(clamp((p - 0.08) / 0.82, 0, 0.9999) * N));
    insideState.k = k;
    insideState.idx = idx;
    insideState.view?.set(k, idx);
    if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
    if (idx === last) return;
    last = idx;
    items.forEach((li, i) => li.classList.toggle('on', i === idx));
    if (prog) prog.textContent = `${pad2(idx + 1)} / ${pad2(N)}`;
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/* ---------------- pattern cards: top-down plots of each flight pattern ---------------- */
const cards = $$('canvas[data-card]');
if (cards.length) {
  import('./wisp-model.js').then(({ PATTERNS }) => {
    const pt = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
    const items = cards.map(c => ({ c, g: c.getContext('2d'), f: PATTERNS[c.dataset.card].f, vis: false, w: 0, h: 0 }));
    const size = it => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      it.w = it.c.clientWidth; it.h = it.c.clientHeight;
      it.c.width = Math.round(it.w * dpr); it.c.height = Math.round(it.h * dpr);
      it.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (it, t) => {
      const { g, w, h, f } = it;
      const cx = w * 0.46, cy = h * 0.5, s = Math.min(w * 0.84, h) * 0.5 / 0.88;
      g.clearRect(0, 0, w, h);
      // line of sight: the wedge the attacker looks along (their forward is screen-down)
      const los = g.createLinearGradient(0, cy, 0, h);
      los.addColorStop(0, 'rgba(241,164,68,0.14)');
      los.addColorStop(1, 'rgba(241,164,68,0)');
      g.fillStyle = los;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - h * 0.36, h); g.lineTo(cx + h * 0.36, h); g.closePath(); g.fill();
      // range rings
      g.lineWidth = 1;
      g.font = '500 9.5px "IBM Plex Mono", ui-monospace, monospace';
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
      // shoulders and head seen from above
      g.fillStyle = '#12161b';
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.beginPath(); g.ellipse(cx, cy - 0.02 * s, 0.21 * s, 0.1 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#1b2027';
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.ellipse(cx, cy, 0.075 * s, 0.09 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx - 0.02 * s, cy + 0.085 * s); g.lineTo(cx, cy + 0.115 * s); g.lineTo(cx + 0.02 * s, cy + 0.085 * s); g.stroke();
      // the last few seconds of flight, fading with age
      const span = 3.6, n = 150;
      let px = 0, py = 0;
      for (let i = 0; i <= n; i++) {
        const tt = t - span + (span * i) / n;
        f(Math.max(0, tt), pt);
        const x = cx + pt.x * s, y = cy + pt.z * s;
        if (i) {
          const a = Math.pow(i / n, 1.6);
          g.strokeStyle = `rgba(166,219,255,${(0.08 + a * 0.8).toFixed(3)})`;
          g.lineWidth = 0.8 + a * 1.4;
          g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
        }
        px = x; py = y;
      }
      f(t, pt);
      const dx = cx + pt.x * s, dy = cy + pt.z * s;
      // light toward the eyes
      const beam = g.createLinearGradient(dx, dy, cx, cy);
      beam.addColorStop(0, 'rgba(234,247,255,0.5)');
      beam.addColorStop(1, 'rgba(234,247,255,0.02)');
      g.strokeStyle = beam;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(dx, dy); g.lineTo(cx, cy); g.stroke();
      const glow = g.createRadialGradient(dx, dy, 0, dx, dy, 16);
      glow.addColorStop(0, 'rgba(234,247,255,0.95)');
      glow.addColorStop(0.25, 'rgba(166,219,255,0.5)');
      glow.addColorStop(1, 'rgba(166,219,255,0)');
      g.fillStyle = glow;
      g.beginPath(); g.arc(dx, dy, 16, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(dx, dy, 2.4, 0, Math.PI * 2); g.fill();
      // height gauge: where the drone sits relative to eye level
      const gx = w - 22, top = h * 0.16, bot = h * 0.84, lo = -0.1, hi = 0.46;
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
    };
    const start = performance.now();
    let raf = 0;
    const frame = now => {
      raf = 0;
      const t = 3 + (now - start) / 1000;
      let any = false;
      for (const it of items) if (it.vis) { draw(it, t); any = true; }
      if (any) raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const it = items.find(i => i.c === e.target);
        it.vis = e.isIntersecting;
        if (it.vis && reduceMotion) draw(it, 3);
      }
      if (!reduceMotion && !raf && items.some(i => i.vis)) raf = requestAnimationFrame(frame);
    }, { rootMargin: '100px 0px' });
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const it = items.find(i => i.c === e.target);
        size(it);
        draw(it, reduceMotion ? 3 : 3 + (performance.now() - start) / 1000);
      }
    });
    items.forEach(it => { size(it); draw(it, 3); io.observe(it.c); ro.observe(it.c); });
  }).catch(() => cards.forEach(c => { c.hidden = true; }));
}
