// Faint PCB circuit traces around the periphery. Each segment between two solder
// pads behaves like a plucked string: a random segment "twangs" (a standing wave
// with nodes fixed at its pads), the energy diffuses along the trace to neighbouring
// segments and fades out, then another random segment twangs. Subtle and low-cost.
// Respects prefers-reduced-motion and pauses when a book/modal is open.

export function initCircuits(canvas) {
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0;
  let traces = [];      // each: {pts:[{x,y}]}
  let segments = [];    // each: a string between two pads (see buildSegments)
  let diff = [];        // reused per-frame energy-transfer buffer
  let twangTimer = 0;   // ms until the next pluck
  let last = 0;         // last frame timestamp
  let paused = false;

  // physics / look tuning
  const DAMP = 0.992;       // per-16ms amplitude decay (longer-ringing twang)
  const COUPLING = 0.09;    // energy that flows to a calmer neighbour each step
  const BASE_OMEGA = 0.28;  // oscillation speed at REF_LEN (radians / 16ms)
  const REF_LEN = 120;
  const PAD = "rgba(120,140,150,0.14)";

  function resize() {
    // clientWidth/clientHeight are read-only; CSS (position:fixed; inset:0) sizes
    // the element to the viewport, so we only set the backing store here.
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildTraces();
  }

  // Build orthogonal "circuit" traces hugging the periphery (left/right margins),
  // leaving the center reading area clear.
  function buildTraces() {
    traces = [];
    const margin = Math.min(w * 0.18, 220);
    const bands = [
      { x0: 0, x1: margin },            // left band
      { x0: w - margin, x1: w },        // right band
    ];
    const density = Math.max(6, Math.round(h / 90));
    for (const band of bands) {
      for (let i = 0; i < density; i++) traces.push(makeTrace(band, i, density));
    }
    buildSegments();
    twangTimer = 300; // first pluck shortly after load
  }

  function makeTrace(band, i, density) {
    const startY = (h / density) * i + (i * 7) % 40;
    const pts = [];
    let x = band.x0 + 8 + ((i * 37) % (band.x1 - band.x0 - 16));
    let y = startY;
    pts.push({ x, y });
    const steps = 3 + (i % 4);
    for (let s = 0; s < steps; s++) {
      // alternate horizontal / vertical orthogonal segments
      if (s % 2 === 0) {
        x = band.x0 + 8 + (((i + s) * 53) % (band.x1 - band.x0 - 16));
      } else {
        y += (h / steps) * (0.6 + ((i + s) % 3) * 0.2);
      }
      pts.push({ x, y });
    }
    return { pts };
  }

  // One "string" per polyline segment, with nodes fixed at the pads (sin() is 0
  // at both ends). Neighbours are the previous/next segment in the same trace, so
  // a twang travels down the chain.
  function buildSegments() {
    segments = [];
    for (const tr of traces) {
      const start = segments.length;
      const pts = tr.pts;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1].x, ay = pts[i - 1].y, bx = pts[i].x, by = pts[i].y;
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        segments.push({
          ax, ay, bx, by, len,
          nx: -dy / len, ny: dx / len,                       // unit perpendicular
          amp: 0, phase: 0, mode: 1,
          omega: clamp(BASE_OMEGA * (REF_LEN / len), 0.08, 0.6),
          neighbors: [],
        });
      }
      for (let i = start; i < segments.length; i++) {
        if (i > start) segments[i].neighbors.push(i - 1);
        if (i < segments.length - 1) segments[i].neighbors.push(i + 1);
      }
    }
    diff = new Array(segments.length).fill(0);
  }

  function maxAmpFor(s) { return Math.min(10, s.len * 0.16); }

  // Pluck a segment: jump its amplitude and restart its phase so it begins fully
  // displaced (a released string), mostly the fundamental, occasionally 2 bellies.
  function twang(idx, energy) {
    const s = segments[idx];
    if (!s) return;
    s.amp = Math.max(s.amp, energy * maxAmpFor(s));
    s.phase = 0;
    s.mode = Math.random() < 0.2 ? 2 : 1;
  }

  function step(dt) {
    if (!segments.length) return;
    const fr = dt / 16;

    // scheduler: every ~1–3s, twang a random segment
    twangTimer -= dt;
    if (twangTimer <= 0) {
      twang(Math.floor(Math.random() * segments.length), 1);
      twangTimer = 350 + Math.random() * 1050;
    }

    // advance each oscillator and damp it
    const decay = Math.pow(DAMP, fr);
    for (const s of segments) {
      s.phase += s.omega * fr;
      s.amp *= decay;
      if (s.amp < 0.02) s.amp = 0;
    }

    // diffuse energy toward calmer neighbours so the vibration passes along
    diff.fill(0);
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      for (const j of s.neighbors) {
        const flow = (s.amp - segments[j].amp) * COUPLING * fr;
        if (flow > 0) { diff[i] -= flow; diff[j] += flow; }
      }
    }
    for (let i = 0; i < segments.length; i++) segments[i].amp += diff[i];
  }

  function colorFor(e) {
    const r = Math.round(120 + (78 - 120) * e);
    const g = Math.round(140 + (230 - 140) * e);
    const b = Math.round(150 + (200 - 150) * e);
    return `rgba(${r},${g},${b},${(0.10 + 0.42 * e).toFixed(3)})`;
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const s of segments) {
      const e = Math.min(1, s.amp / 8);
      ctx.strokeStyle = colorFor(e);
      ctx.lineWidth = 1 + e * 0.8;
      ctx.beginPath();
      if (s.amp < 0.3) {
        ctx.moveTo(s.ax, s.ay);
        ctx.lineTo(s.bx, s.by);
      } else {
        const N = 12;
        for (let k = 0; k <= N; k++) {
          const u = k / N;
          const disp = s.amp * Math.sin(s.mode * Math.PI * u) * Math.cos(s.phase);
          const x = s.ax + (s.bx - s.ax) * u + s.nx * disp;
          const y = s.ay + (s.by - s.ay) * u + s.ny * disp;
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
    }
    // solder pads (nodes)
    ctx.fillStyle = PAD;
    for (const tr of traces) {
      for (const p of tr.pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function frame(ts) {
    if (paused) { last = ts; requestAnimationFrame(frame); return; }
    const dt = Math.min(50, ts - last || 16);
    last = ts;
    step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();
  if (reduced) { draw(); } else { requestAnimationFrame(frame); }

  return {
    pause: () => (paused = true),
    resume: () => (paused = false),
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
