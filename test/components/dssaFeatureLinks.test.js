const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { createRoot } = require("react-dom/client");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");
const { installInteractiveDom, findElement } = require("../lib/interactiveDom");

test("feature shortcuts open the requested page without changing settings or starting work", async (t) => {
  let root;
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
  });
  const events = [],
    settings = [];
  installBrowserGlobals(t, { window: { dispatchEvent: (event) => events.push(event) } });
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class {
    constructor(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  };
  t.after(() => {
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  });
  const container = installInteractiveDom(t);
  const vite = await createRendererServer(t, { cachePrefix: "dssa-feature-links-" });
  const View = (await vite.ssrLoadModule("/components/dssa/DssaFeatureLinks.tsx")).default;
  root = createRoot(container);
  await React.act(async () =>
    root.render(React.createElement(View, { onSettings: (value) => settings.push(value) }))
  );
  assert.equal(events.length, 0);
  assert.equal(settings.length, 0);
  for (const label of [
    "Automatisk notatblokk",
    "Gjenoppta lydimport",
    "Google Disk og skymapper",
  ]) {
    const button = findElement(
      container,
      (el) => el.tagName === "BUTTON" && el.textContent === label
    );
    assert.ok(button, label);
    await React.act(async () =>
      button.dispatchEvent({ type: "click", bubbles: true, button: 0, preventDefault() {} })
    );
  }
  assert.deepEqual(
    events.map((event) => [event.type, event.detail]),
    [
      ["dssa-navigate", "home"],
      ["dssa-navigate", "upload"],
    ]
  );
  assert.deepEqual(settings, ["connections"]);
});
