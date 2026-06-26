// Full-size media viewer. Click a thumbnail and the image shows as large as the
// viewport allows. Appended to <body> so it floats above the open book overlay.
// Built with DOM nodes (no innerHTML) so the src/alt need no escaping, and kept
// small + side-effect-light so it unit-tests in jsdom.

export function openLightbox(src, { alt = "", root = document.body } = {}) {
  const el = document.createElement("div");
  el.className = "lightbox";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");

  const closeBtn = document.createElement("button");
  closeBtn.className = "lightbox-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "✕";

  const img = document.createElement("img");
  img.className = "lightbox-img";
  img.src = src;
  img.alt = alt;

  el.append(closeBtn, img);

  const close = () => {
    el.remove();
    document.removeEventListener("keydown", onKey, true);
  };

  // Capture phase: Escape closes the lightbox first and stops there, so it does
  // NOT also close the book overlay behind it (whose Escape listener is bubble-phase).
  // If the node was torn down externally, self-detach without swallowing the key,
  // so a newer lightbox still receives it.
  const onKey = (e) => {
    if (!el.isConnected) { document.removeEventListener("keydown", onKey, true); return; }
    if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); }
  };
  document.addEventListener("keydown", onKey, true);

  // Backdrop or close button dismisses; clicking the image itself does not.
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest(".lightbox-close")) close();
  });

  root.appendChild(el);
  return { el, close };
}
