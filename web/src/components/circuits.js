// Faint, *living* network in the page periphery. Nodes drift along a smooth
// swirling flow field (a cheap curl-noise) and link to nearby neighbours with
// curved filaments — an organic, reaction-diffusion / mycelial feel rather than
// rigid right-angle PCB traces. The centre reading area is left clear.
// Respects prefers-reduced-motion and pauses when a book/modal is open.

export function initCircuits(canvas) {
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0;
  let nodes = [];
  let bands = [];
  let last = 0, t = 0, paused = false;
  const mouse = { x: -9999, y: -9999, active: false };

  // look / motion tuning
  const LINK = 134;          // max distance two nodes will link across
  const SPEED = 0.5;         // drift speed (px per ~16ms)
  const RGB = "78,230,200";  // teal accent (--accent)
  const MOUSE_R = 160;       // cursor influence radius

  function resize() {
    // CSS (position:fixed; inset:0) sizes the element to the viewport; we only
    // set the backing store here (clientWidth/Height are read-only).
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  // Scatter nodes through two peripheral bands (left/right), leaving the centre
  // reading column clear.
  function build() {
    const margin = Math.min(w * 0.2, 240);
    bands = [{ x0: 0, x1: margin }, { x0: w - margin, x1: w }];
    nodes = [];
    const per = Math.max(10, Math.round(h / 40));
    bands.forEach((b, bi) => {
      for (let i = 0; i < per; i++) {
        nodes.push({
          band: bi,
          x: b.x0 + Math.random() * (b.x1 - b.x0),
          y: Math.random() * h,
          ph: Math.random() * Math.PI * 2, // independent pulse phase
        });
      }
    });
  }

  // Smooth swirling field (summed sinusoids ≈ curl noise) → organic, vein-like
  // motion without a heavyweight noise library.
  function flow(x, y) {
    return (
      Math.sin(x * 0.0090 + t * 0.00020) +
      Math.cos(y * 0.0125 - t * 0.00016) +
      Math.sin((x + y) * 0.0065 + t * 0.00024)
    ) * 1.7;
  }

  function step(dt) {
    const fr = dt / 16;
    for (const n of nodes) {
      const a = flow(n.x, n.y);
      n.x += Math.cos(a) * SPEED * fr;
      n.y += Math.sin(a) * SPEED * fr;

      // gentle pull back toward the band centre so nodes stay in the periphery
      const b = bands[n.band];
      n.x += ((b.x0 + b.x1) / 2 - n.x) * 0.0009 * fr;
      if (n.x < b.x0) n.x = b.x0;
      if (n.x > b.x1) n.x = b.x1;
      // wrap vertically so the field keeps flowing
      if (n.y < -30) n.y += h + 60;
      if (n.y > h + 30) n.y -= h + 60;
    }

    // cursor gently parts the web (organic repulsion), driven by position
    if (mouse.active) {
      for (const n of nodes) {
        const dx = n.x - mouse.x, dy = n.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < MOUSE_R && d > 0.01) {
          const f = (1 - d / MOUSE_R) * 1.8 * fr;
          n.x += (dx / d) * f;
          n.y += (dy / d) * f;
        }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // filaments between nearby nodes in the same band, bowed into organic curves
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (a.band !== b.band) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > LINK) continue;

        let alpha = (1 - d / LINK) * 0.16;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (mouse.active) {
          const md = Math.hypot(mouse.x - mx, mouse.y - my);
          if (md < MOUSE_R) alpha += (1 - md / MOUSE_R) * 0.28;
        }
        const len = d || 1;
        const bow = Math.sin((a.x + b.y) * 0.03 + t * 0.0006) * Math.min(22, len * 0.3);
        const cx = mx + (-dy / len) * bow, cy = my + (dx / len) * bow;

        ctx.strokeStyle = `rgba(${RGB},${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cx, cy, b.x, b.y);
        ctx.stroke();
      }
    }

    // nodes: soft pulsing cells
    for (const n of nodes) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.002 + n.ph);
      ctx.fillStyle = `rgba(${RGB},${(0.16 + pulse * 0.22).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 1.1 + pulse * 0.9, 0, Math.PI * 2);
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
