const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

test("recording help shows measured progress for its own note and distinguishes the completed text phase", async (t) => {
  installBrowserGlobals(t, { initialStorage: { uiLanguage: "nb" } });
  const vite = await createRendererServer(t, {
    cachePrefix: "dssa-recording-progress-",
    mockModules: {
      "/stores/meetingRecordingStore": `export function useMeetingRecordingStore(select) { return select({ processingProgress: globalThis.__meetingProgress }); }`,
    },
  });
  const { default: i18n } = await vite.ssrLoadModule("/i18n.ts");
  await i18n.changeLanguage("nb");
  t.after(() => {
    delete globalThis.__meetingProgress;
  });
  const View = (await vite.ssrLoadModule("/components/dssa/DssaRecordingHelp.tsx")).default;
  const render = (props = {}) =>
    renderToStaticMarkup(
      React.createElement(View, {
        noteId: 11,
        isRecording: false,
        isProcessing: true,
        isDiarizing: false,
        ...props,
      })
    );
  globalThis.__meetingProgress = {
    noteId: 11,
    processedSeconds: 60,
    totalSeconds: 120,
    remainingSeconds: 18,
  };
  const html = render();
  assert.match(html, /<progress[^>]*max="120"[^>]*value="60"/);
  assert.match(html, /50 %/);
  assert.match(html, /Lyd igjen å behandle/);
  assert.match(html, /Anslått tid igjen/);
  assert.doesNotMatch(render({ noteId: 12 }), /<progress/);
  assert.doesNotMatch(render({ isProcessing: false }), /<progress/);
  globalThis.__meetingProgress = {
    noteId: 11,
    processedSeconds: 120,
    totalSeconds: 120,
    remainingSeconds: null,
  };
  assert.match(render(), /Lydkøen er transkribert/);
  assert.doesNotMatch(render(), /Anslått tid igjen/);
});
