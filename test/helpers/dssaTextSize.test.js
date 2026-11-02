const test = require("node:test");
const assert = require("node:assert/strict");

test("text sizes persist independently, reject corrupt preferences and update other windows", async () => {
  const preferences = await import("../../src/utils/dssaTextSize.ts");
  const saved = {
    localStorage: global.localStorage,
    document: global.document,
    window: global.window,
  };
  const values = new Map(),
    styles = new Map(),
    attributes = new Map(),
    listeners = new Map();
  global.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  global.document = {
    documentElement: {
      style: { setProperty: (key, value) => styles.set(key, value) },
      toggleAttribute: (key, value) => attributes.set(key, value),
    },
  };
  global.window = {
    addEventListener: (key, callback) => listeners.set(key, callback),
    dispatchEvent() {},
  };
  try {
    preferences.initializeDssaTextSize();
    assert.deepEqual(preferences.readDssaTextSize(), { ui: 100, content: 0 });
    preferences.saveDssaTextSize({ ui: 120, content: 20 });
    assert.equal(styles.get("--dssa-ui-text-scale"), "1.2");
    assert.equal(styles.get("--dssa-content-text-size"), "20px");
    assert.equal(attributes.get("data-dssa-content-size"), true);
    assert.deepEqual(preferences.readDssaTextSize(), { ui: 120, content: 20 });
    values.set(preferences.DSSA_TEXT_SIZE_KEY, JSON.stringify({ ui: 999, content: -5 }));
    listeners.get("storage")({ key: preferences.DSSA_TEXT_SIZE_KEY });
    assert.equal(styles.get("--dssa-ui-text-scale"), "1");
    assert.equal(attributes.get("data-dssa-content-size"), false);
    values.set(preferences.DSSA_TEXT_SIZE_KEY, "broken");
    assert.deepEqual(preferences.readDssaTextSize(), { ui: 100, content: 0 });
    values.set(preferences.DSSA_TEXT_SIZE_KEY, "null");
    assert.deepEqual(preferences.readDssaTextSize(), { ui: 100, content: 0 });
  } finally {
    Object.assign(global, saved);
  }
});
