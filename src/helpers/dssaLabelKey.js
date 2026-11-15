// Stable keys for product-specific labels, shared by build-time extraction and UI.
export function dssaLabelKey(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return "label_" + (hash >>> 0).toString(16);
}
