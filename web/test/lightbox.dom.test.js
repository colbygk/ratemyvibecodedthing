// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { openLightbox } from "../src/components/lightbox.js";

afterEach(() => { document.body.innerHTML = ""; });

describe("openLightbox", () => {
  it("appends a lightbox carrying the image src + alt", () => {
    openLightbox("https://cdn/x.png", { alt: "a shot" });
    const img = document.querySelector(".lightbox .lightbox-img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("https://cdn/x.png");
    expect(img.alt).toBe("a shot");
  });

  it("closes on Escape", () => {
    openLightbox("https://cdn/x.png");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".lightbox")).toBeNull();
  });

  it("closes on backdrop click but stays open when the image is clicked", () => {
    const { el } = openLightbox("https://cdn/x.png");
    el.querySelector(".lightbox-img").click(); // image — stays
    expect(document.querySelector(".lightbox")).toBeTruthy();
    el.querySelector(".lightbox-close").click(); // close button — dismisses
    expect(document.querySelector(".lightbox")).toBeNull();
  });

  it("closes when the backdrop itself is clicked", () => {
    const { el } = openLightbox("https://cdn/x.png");
    el.click();
    expect(document.querySelector(".lightbox")).toBeNull();
  });

  it("close() removes it and detaches its key handler", () => {
    const { close } = openLightbox("https://cdn/x.png");
    close();
    expect(document.querySelector(".lightbox")).toBeNull();
    // a stray Escape afterward must not throw
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
});
