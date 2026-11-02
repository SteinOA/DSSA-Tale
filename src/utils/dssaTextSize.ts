export const DSSA_TEXT_SIZE_KEY = "dssa-text-size";
export const UI_TEXT_SIZES = [90, 100, 110, 120, 130] as const;
export const CONTENT_TEXT_SIZES = [0, 14, 16, 18, 20, 24] as const;
export type DssaTextSize = { ui: number; content: number };

export function readDssaTextSize(): DssaTextSize {
  try {
    const saved = JSON.parse(localStorage.getItem(DSSA_TEXT_SIZE_KEY) || "{}");
    return {
      ui: UI_TEXT_SIZES.includes(saved?.ui) ? saved.ui : 100,
      content: CONTENT_TEXT_SIZES.includes(saved?.content) ? saved.content : 0,
    };
  } catch {
    return { ui: 100, content: 0 };
  }
}

export function applyDssaTextSize() {
  const value = readDssaTextSize();
  const root = document.documentElement;
  root.style.setProperty("--dssa-ui-text-scale", String(value.ui / 100));
  root.style.setProperty("--dssa-content-text-size", `${value.content}px`);
  root.toggleAttribute("data-dssa-content-size", value.content > 0);
}

export function saveDssaTextSize(value: DssaTextSize) {
  localStorage.setItem(DSSA_TEXT_SIZE_KEY, JSON.stringify(value));
  applyDssaTextSize();
  window.dispatchEvent(new Event("dssa-text-size-changed"));
}

export function initializeDssaTextSize() {
  applyDssaTextSize();
  window.addEventListener("storage", (event) => {
    if (event.key === DSSA_TEXT_SIZE_KEY || event.key === null) applyDssaTextSize();
  });
}
