// A faint, *living* network across the whole background. Nodes drift along a
// smooth swirling flow field (a cheap curl-noise) and link to nearby neighbours
// with curved, fading filaments — an organic, reaction-diffusion / mycelial feel.
// A soft centre fade keeps the reading column calm. Nodes have a gentle life
// cycle: they fade in near the living web, drift, then fade out and are reborn —
// so the network continually renews instead of decaying into lonely dots.
//
// Interaction: the cursor gently parts the web, and *sweeping through an edge*
// plucks it — a stylized multi-harmonic standing wave whose peaks glow warm
// (teal→amber, like a sound spectrum) and then decays back to calm.
// Respects prefers-reduced-motion and pauses when a book/modal is open.

const TAU = Math.PI * 2;

export function initCircuits(canvas) {
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0, cx = 0, cy = 0, maxR = 1;
  let nodes = [];
  let last = 0, t = 0, paused = false;
  const mouse = { x: -9999, y: -9999, px: -9999, py: -9999, active: false };
  const excited = new Map(); // pair-key -> { amp, phase, omega, m1, m2 } (plucked edges)

  // look / motion tuning
  const LINK = 140;          // max distance two nodes will link across
  const SPEED = 0.5;         // drift speed (px per ~16ms)
  const RGB = "78,230,200";  // teal accent (--accent)
  const MOUSE_R = 160;       // cursor influence radius
  const FADE = 1600;         // birth / death fade duration (ms)
  const MARGIN = 70;         // off-screen slack before a node is recycled
  const KEY = 4096;          // pair-key radix (must exceed max node count)
  const PLUCK_DECAY = 0.955; // excited-edge amplitude decay per ~16ms (~1.2s ring)

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
    excited.clear();
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

  const envelope = (n) => clamp(Math.min(n.age, n.life - n.age) / FADE, 0, 1);

  function step(dt) {
    const fr = dt / 16;
    for (const n of nodes) {
      n.age += dt;
      if (n.age >= n.life) { reborn(n); continue; }

      const a = flow(n.x, n.y);
      n.x += Math.cos(a) * SPEED * fr;
      n.y += Math.sin(a) * SPEED * fr;

      if (mouse.active) {
        const dx = n.x - mouse.x, dy = n.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < MOUSE_R && d > 0.01) {
          const f = (1 - d / MOUSE_R) * 1.9 * fr;
          n.x += (dx / d) * f; n.y += (dy / d) * f;
        }
      }

      if (n.x < -MARGIN || n.x > w + MARGIN || n.y < -MARGIN || n.y > h + MARGIN) reborn(n);
    }

    pluckCrossedEdges();

    // ring down excited edges
    for (const [k, ex] of excited) {
      ex.phase += ex.omega * fr;
      ex.amp *= Math.pow(PLUCK_DECAY, fr);
      if (ex.amp < 0.4) excited.delete(k);
    }

    // remember where the cursor was, to form next frame's motion segment
    mouse.px = mouse.x; mouse.py = mouse.y;
  }

  // Sweep detection: if the cursor's motion segment this frame crosses an edge,
  // pluck that edge into a standing wave (refreshing if already ringing).
  function pluckCrossedEdges() {
    if (!mouse.active) return;
    const ax = mouse.px, ay = mouse.py, bx = mouse.x, by = mouse.y;
    const moved = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
    if (moved < 4) return; // need a real movement (>2px) — "moved through"
    const speed = Math.sqrt(moved);

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (envelope(a) <= 0) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy > LINK * LINK) continue;
        if (envelope(b) <= 0) continue;
        if (!segHit(ax, ay, bx, by, a.x, a.y, b.x, b.y)) continue;

        const len = Math.hypot(dx, dy) || 1;
        const amp = Math.min(len * 0.42, 9 + speed * 0.22);
        const key = i * KEY + j;
        const cur = excited.get(key);
        if (cur) { cur.amp = Math.max(cur.amp, amp); cur.phase = 0; }
        else excited.set(key, {
          amp, phase: 0,
          omega: 0.28 + Math.random() * 0.14,
          m1: 1 + ((Math.random() * 3) | 0),   // fundamental..3rd
          m2: 2 + ((Math.random() * 3) | 0),   // an overtone, for a richer "spectrum"
        });
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

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

        const env = Math.min(ea, eb);
        const ex = excited.get(i * KEY + j);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;

        if (ex && ex.amp > 0.4) {
          // stay vivid even toward the centre during the interaction
          drawPluckedEdge(a, b, d || 1, ex, (0.45 + 0.55 * centreFade(mx, my)) * env);
          continue;
        }

        // calm bowed filament (unchanged look)
        let alpha = (1 - d / LINK) * 0.17 * centreFade(mx, my) * env;
        if (mouse.active) {
          const md = Math.hypot(mouse.x - mx, mouse.y - my);
          if (md < MOUSE_R) alpha += (1 - md / MOUSE_R) * 0.26 * env;
        }
        if (alpha < 0.004) continue;
        const bow = Math.sin((a.x + b.y) * 0.03 + t * 0.0006) * Math.min(22, d * 0.3);
        ctx.strokeStyle = `rgba(${RGB},${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx + (-dy / d) * bow, my + (dx / d) * bow, b.x, b.y);
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

  // A plucked edge: a standing wave (ends pinned) with a fundamental + overtone,
  // drawn as short coloured segments whose hue tracks displacement — calm teal in
  // the troughs, warm amber at the peaks, like an audio spectrum.
  function drawPluckedEdge(a, b, len, ex, fade) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const nx = -dy / len, ny = dx / len;
    const N = 22;
    let px = a.x, py = a.y;
    for (let k = 1; k <= N; k++) {
      const u = k / N;
      const win = Math.sin(Math.PI * u); // pinned at both pads
      const disp = ex.amp * win * (
        Math.sin(ex.m1 * Math.PI * u) * Math.cos(ex.phase) +
        0.45 * Math.sin(ex.m2 * Math.PI * u) * Math.cos(ex.phase * 1.6)
      );
      const x = a.x + dx * u + nx * disp;
      const y = a.y + dy * u + ny * disp;
      const mag = Math.min(1, Math.abs(disp) / (ex.amp + 0.001));
      const alpha = (0.32 + 0.5 * mag) * fade;
      ctx.strokeStyle = `rgba(${spectrum(mag)},${alpha.toFixed(3)})`;
      ctx.lineWidth = 1 + mag * 0.8;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
      px = x; py = y;
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
    window.addEventListener("mousemove", (e) => {
      if (!mouse.active) { mouse.px = e.clientX; mouse.py = e.clientY; }
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
    }, { passive: true });
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

// teal (78,230,200) → warm amber (232,183,95), by displacement magnitude
function spectrum(m) {
  return `${Math.round(78 + 154 * m)},${Math.round(230 - 47 * m)},${Math.round(200 - 105 * m)}`;
}

// do segments p1->p2 and p3->p4 intersect?
function segHit(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (d === 0) return false;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
