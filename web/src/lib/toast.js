let timer;
export function toast(message, ms = 2600) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.dataset.show = "true";
  clearTimeout(timer);
  timer = setTimeout(() => (el.dataset.show = "false"), ms);
}
