// A faint, *living* network across the whole background. Nodes drift along a
// smooth swirling flow field (a cheap curl-noise) and link to nearby neighbours
// with curved, fading filaments — an organic, reaction-diffusion / mycelial feel.
// A soft centre fade keeps the reading column calm. Nodes have a gentle life
// cycle: they fade in near the living web, drift, then fade out and are reborn —
// so the network continually renews instead of decaying into lonely dots.
// Respects prefers-reduced-motion and pauses when a book/modal is open.

const TAU = Math.PI * 2;

export function initCircuits(canvas) {
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0, cx = 0, cy = 0, maxR = 1;
  let nodes = [];
  let last = 0, t = 0, paused = false;
  const mouse = { x: -9999, y: -9999, active: false };

  // look / motion tuning
  const LINK = 140;          // max distance two nodes will link across
  const SPEED = 0.5;         // drift speed (px per ~16ms)
  const RGB = "78,230,200";  // teal accent (--accent)
  const MOUSE_R = 160;       // cursor influence radius
  const FADE = 1600;         // birth / death fade duration (ms)
  const MARGIN = 70;         // off-screen slack before a node is recycled

  function resize() {
    // CSS (position:fixed; inset:0) sizes the element; we only set the backing
    // store here (clientWidth/Height are read-only).
    w = window.innerWidth;
    h = window.innerHeight;
    cx = w / 2; cy = h / 2; maxR = Math.hypot(cx, cy) || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function build() {
    nodes = [];
    const count = clamp(Math.round((w * h) / 26000), 28, 120);
    for (let i = 0; i < count; i++) {
      const n = {
        x: Math.random() * w,
        y: Math.random() * h,
        ph: Math.random() * TAU,    // pulse phase
        life: lifeSpan(),
        age: 0,
      };
      n.age = Math.random() * n.life; // stagger so they don't all turn over together
      nodes.push(n);
    }
  }

  const lifeSpan = () => 18000 + Math.random() * 22000; // 18–40s

  // Reborn near a living neighbour 3/4 of the time, so new nodes join the web and
  // "find each other" rather than blinking in alone in empty space.
  function spawnPos() {
    if (nodes.length && Math.random() < 0.75) {
      const o = nodes[(Math.random() * nodes.length) | 0];
      const a = Math.random() * TAU, r = LINK * (0.3 + Math.random() * 0.4);
      return { x: clamp(o.x + Math.cos(a) * r, 0, w), y: clamp(o.y + Math.sin(a) * r, 0, h) };
    }
    return { x: Math.random() * w, y: Math.random() * h };
  }

  function reborn(n) {
    const p = spawnPos();
    n.x = p.x; n.y = p.y;
    n.age = 0;
    n.life = lifeSpan();
    n.ph = Math.random() * TAU;
  }

  // Smooth swirling field (summed sinusoids ≈ curl noise) → organic motion.
  function flow(x, y) {
    return (
      Math.sin(x * 0.0090 + t * 0.00020) +
      Math.cos(y * 0.0125 - t * 0.00016) +
      Math.sin((x + y) * 0.0065 + t * 0.00024)
    ) * 1.7;
  }

  // 0 in the centre → 1 toward the edges, so the middle stays faint.
  function centreFade(x, y) {
    return smoothstep(0.16, 0.72, Math.hypot(x - cx, y - cy) / maxR);
  }

  // Birth/death envelope: fades in, holds, fades out.
  const envelope = (n) => clamp(Math.min(n.age, n.life - n.age) / FADE, 0, 1);

  function step(dt) {
    const fr = dt / 16;
    for (const n of nodes) {
      n.age += dt;
      if (n.age >= n.life) { reborn(n); continue; }

      const a = flow(n.x, n.y);
      n.x += Math.cos(a) * SPEED * fr;
      n.y += Math.sin(a) * SPEED * fr;

      // cursor gently parts the web (organic repulsion)
      if (mouse.active) {
        const dx = n.x - mouse.x, dy = n.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < MOUSE_R && d > 0.01) {
          const f = (1 - d / MOUSE_R) * 1.9 * fr;
          n.x += (dx / d) * f; n.y += (dy / d) * f;
        }
      }

      // recycle anything that wanders off-screen (e.g. parted to the edge), so
      // density is preserved and it rejoins the web
      if (n.x < -MARGIN || n.x > w + MARGIN || n.y < -MARGIN || n.y > h + MARGIN) reborn(n);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // filaments between nearby nodes, bowed into organic curves
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const ea = envelope(a);
      if (ea <= 0) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > LINK) continue;
        const eb = envelope(b);
        if (eb <= 0) continue;

        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        let alpha = (1 - d / LINK) * 0.17 * centreFade(mx, my) * Math.min(ea, eb);
        if (mouse.active) {
          const md = Math.hypot(mouse.x - mx, mouse.y - my);
          if (md < MOUSE_R) alpha += (1 - md / MOUSE_R) * 0.26 * Math.min(ea, eb);
        }
        if (alpha < 0.004) continue;

        const len = d || 1;
        const bow = Math.sin((a.x + b.y) * 0.03 + t * 0.0006) * Math.min(22, len * 0.3);
        ctx.strokeStyle = `rgba(${RGB},${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx + (-dy / len) * bow, my + (dx / len) * bow, b.x, b.y);
        ctx.stroke();
      }
    }

    // nodes: soft pulsing cells
    for (const n of nodes) {
      const env = envelope(n);
      if (env <= 0) continue;
      const fade = centreFade(n.x, n.y) * env;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.002 + n.ph);
      const alpha = (0.14 + pulse * 0.22) * fade;
      if (alpha < 0.004) continue;
      ctx.fillStyle = `rgba(${RGB},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 1.1 + pulse * 0.9, 0, TAU);
      ctx.fill();
    }
  }

  function frame(ts) {
    if (paused) { last = ts; requestAnimationFrame(frame); return; }
    const dt = Math.min(50, ts - last || 16);
    last = ts;
    t = ts;
    step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize, { passive: true });
  if (!reduced) {
    window.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }, { passive: true });
    window.addEventListener("mouseout", (e) => { if (!e.relatedTarget) mouse.active = false; }, { passive: true });
  }
  resize();
  if (reduced) { draw(); } else { requestAnimationFrame(frame); }

  return {
    pause: () => (paused = true),
    resume: () => (paused = false),
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
