// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initCircuits } from "../src/components/circuits.js";

// A no-op 2D context: every property access returns a callable no-op, and
// assignments (fillStyle, shadowBlur, …) are accepted. jsdom canvases have no
// real 2D context, so we stub getContext while keeping the element's REAL
// read-only clientWidth/clientHeight getters — which is what the bug touched.
function stubContext() {
  return new Proxy({}, { get: () => () => {}, set: () => true });
}

function realCanvasWithStubCtx() {
  const canvas = document.createElement("canvas");
  canvas.getContext = () => stubContext();
  return canvas;
}

describe("initCircuits (DOM)", () => {
  beforeEach(() => {
    // jsdom doesn't implement these; provide minimal stand-ins.
    window.matchMedia = () => ({ matches: false });
    vi.stubGlobal("requestAnimationFrame", () => 0); // don't actually loop
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  });

  it("initializes without assigning to read-only canvas props (regression)", () => {
    const canvas = realCanvasWithStubCtx();
    // Before the fix this threw: "Cannot set property clientWidth ... only a getter".
    expect(() => initCircuits(canvas)).not.toThrow();
  });

  it("sizes the canvas backing store from the viewport", () => {
    const canvas = realCanvasWithStubCtx();
    initCircuits(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    expect(canvas.width).toBe(1200 * dpr);
    expect(canvas.height).toBe(800 * dpr);
  });

  it("returns pause/resume controls", () => {
    const ctrl = initCircuits(realCanvasWithStubCtx());
    expect(typeof ctrl.pause).toBe("function");
    expect(typeof ctrl.resume).toBe("function");
  });
});
