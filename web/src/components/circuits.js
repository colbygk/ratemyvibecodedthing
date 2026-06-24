// Faint PCB circuit traces around the periphery with travelling light pulses.
// Minimal, low-cost: traces are drawn once; only the moving pulses re-render.
// Respects prefers-reduced-motion and pauses when a book/modal is open.

export function initCircuits(canvas) {
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0;
  let traces = [];   // each: {pts:[{x,y}], pads:[...]}
  let pulses = [];   // each: {trace, t, speed, len}
  let paused = false;

  const ACCENT = "rgba(78,230,200,";
  const TRACE = "rgba(120,140,150,0.10)";

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
      for (let i = 0; i < density; i++) {
        traces.push(makeTrace(band, i, density));
      }
    }
    // seed pulses
    pulses = [];
    const count = reduced ? 0 : Math.min(18, Math.round(traces.length * 0.5));
    for (let i = 0; i < count; i++) spawnPulse(i);
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
    return { pts, length: segLength(pts) };
  }

  function segLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L;
  }

  function spawnPulse(i) {
    const trace = traces[(Math.floor(i * 2.3 + i * i) % traces.length + traces.length) % traces.length];
    pulses.push({ trace, t: (i * 0.13) % 1, speed: 0.0006 + (i % 5) * 0.00018, len: 0.08 + (i % 3) * 0.03 });
  }

  // map a 0..1 position along a polyline to {x,y}
  function pointAt(trace, t) {
    const target = t * trace.length;
    let acc = 0;
    const pts = trace.pts;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc + d >= target) {
        const f = (target - acc) / (d || 1);
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
      }
      acc += d;
    }
    return pts[pts.length - 1];
  }

  function drawStatic() {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = TRACE;
    for (const tr of traces) {
      ctx.beginPath();
      tr.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      // solder pads (nodes)
      ctx.fillStyle = "rgba(120,140,150,0.14)";
      for (const p of tr.pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function frame() {
    if (paused) { requestAnimationFrame(frame); return; }
    drawStatic();
    for (const pu of pulses) {
      pu.t += pu.speed * 16;
      if (pu.t > 1 + pu.len) pu.t = -pu.len;
      // draw a short bright segment (the travelling light) with a glow tail
      const samples = 10;
      for (let s = 0; s < samples; s++) {
        const tt = pu.t - (pu.len * s) / samples;
        if (tt < 0 || tt > 1) continue;
        const { x, y } = pointAt(pu.trace, tt);
        const alpha = (1 - s / samples) * 0.8;
        ctx.fillStyle = ACCENT + alpha + ")";
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // bright head
      if (pu.t >= 0 && pu.t <= 1) {
        const { x, y } = pointAt(pu.trace, pu.t);
        ctx.save();
        ctx.shadowBlur = 8; ctx.shadowColor = ACCENT + "0.9)";
        ctx.fillStyle = ACCENT + "1)";
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();
  if (reduced) { drawStatic(); } else { requestAnimationFrame(frame); }

  return {
    pause: () => (paused = true),
    resume: () => (paused = false),
  };
}
