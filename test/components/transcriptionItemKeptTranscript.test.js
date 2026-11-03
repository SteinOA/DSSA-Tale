const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createRoot } = require("react-dom/client");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");
const { installInteractiveDom, findElement } = require("../lib/interactiveDom");

// A failed history row keeps the transcript when only a step after
// transcription failed (#2676): it shows and copies the text, and its header
// and settings hint name the failed edit rather than transcription.
const TRANSCRIPT = "Nova, this is a long note about the quarterly plan.";

const row = (overrides = {}) => ({
  id: 1,
  timestamp: "2026-10-19T09:00:00.000Z",
  created_at: "2026-10-19T09:00:00.000Z",
  has_audio: 1,
  audio_duration_ms: 5000,
  provider: null,
  model: null,
  route_kind: null,
  client_transcription_id: "client-1",
  cloud_id: null,
  sync_status: "pending",
  deleted_at: null,
  status: "failed",
  text: "",
  raw_text: null,
  error_message: "Selection edit could not safely verify the selected text",
  error_code: "SELECTION_EDIT_CAPTURE_FAILED",
  ...overrides,
});

async function loadTranscriptionItem(t) {
  installBrowserGlobals(t);
  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-transcription-item-test-",
    noExternal: ["react-i18next"],
    mockModules: {
      "react-i18next": `
        const t = (key) => key;
        export function useTranslation() { return { t, i18n: { language: "en" } }; }
        export const initReactI18next = { type: "3rdParty", init() {} };
      `,
    },
  });
  const { default: TranscriptionItem } = await vite.ssrLoadModule(
    "/components/ui/TranscriptionItem.tsx"
  );
  return TranscriptionItem;
}

const render = (TranscriptionItem, item) =>
  renderToStaticMarkup(
    React.createElement(TranscriptionItem, { item, onCopy() {}, onDelete() {} })
  );

test("a failed row renders its kept transcript and names the failed edit", async (t) => {
  const TranscriptionItem = await loadTranscriptionItem(t);

  const kept = render(TranscriptionItem, row({ text: TRANSCRIPT, raw_text: TRANSCRIPT }));
  assert.match(kept, new RegExp(`<p dir="auto"[^>]*>${TRANSCRIPT}</p>`));
  assert.match(kept, /controlPanel\.history\.editFailedTranscriptKept/);
  assert.doesNotMatch(kept, /controlPanel\.history\.transcriptionFailed/);
  assert.match(kept, /aria-label="controlPanel\.history\.copyText"/);

  for (const text of ["", "  \n "]) {
    const empty = render(TranscriptionItem, row({ text }));
    assert.match(empty, /controlPanel\.history\.transcriptionFailed/);
    assert.doesNotMatch(empty, /dir="auto"/);
    assert.doesNotMatch(empty, /controlPanel\.history\.copyText/);
  }
});

test("a kept-transcript row's key error points at the Voice Assistant settings", async (t) => {
  const TranscriptionItem = await loadTranscriptionItem(t);

  const kept = render(
    TranscriptionItem,
    row({ text: TRANSCRIPT, raw_text: TRANSCRIPT, error_code: "PROVIDER_AUTH_FAILED" })
  );
  assert.match(kept, /controlPanel\.history\.failedCtaAiSettings/);
  assert.doesNotMatch(kept, /controlPanel\.history\.failedCtaSettings"/);
  assert.doesNotMatch(kept, /failedCtaAndRetry/);
  // The hints stay above the transcript, which can run to thousands of words.
  assert.ok(kept.indexOf("failedCtaAiSettings") < kept.indexOf(TRANSCRIPT));

  const empty = render(TranscriptionItem, row({ error_code: "PROVIDER_AUTH_FAILED" }));
  assert.match(empty, /controlPanel\.history\.failedCtaSettings/);
  assert.doesNotMatch(empty, /failedCtaAiSettings/);
});

test("copy and the settings hint act on the kept transcript row", async (t) => {
  const TranscriptionItem = await loadTranscriptionItem(t);
  const container = installInteractiveDom(t);
  const root = createRoot(container);
  const copied = [];
  const opened = [];

  await React.act(async () =>
    root.render(
      React.createElement(TranscriptionItem, {
        item: row({ text: TRANSCRIPT, raw_text: TRANSCRIPT, error_code: "INVALID_KEY" }),
        onCopy: (text) => copied.push(text),
        onDelete() {},
        onOpenSettings: (section) => opened.push(section),
      })
    )
  );

  const click = (element) =>
    React.act(async () =>
      element.dispatchEvent({ type: "click", bubbles: true, button: 0, preventDefault() {} })
    );
  const button = (predicate) =>
    findElement(container, (element) => element.tagName === "BUTTON" && predicate(element));

  await click(button((el) => el.getAttribute("aria-label") === "controlPanel.history.copyText"));
  assert.deepEqual(copied, [TRANSCRIPT]);

  await click(button((el) => el.textContent === "controlPanel.history.failedCtaAiSettings"));
  assert.deepEqual(opened, ["dictationAgent"]);

  await React.act(async () => root.unmount());
});

test("completed history exposes commands directly and keeps retry busy state", async (t) => {
  const TranscriptionItem = await loadTranscriptionItem(t);
  const item = row({
    status: "completed",
    text: "Kari Ås: 42 deltakarar.",
    raw_text: "Eg møter Kari Ås.",
  });
  const html = render(TranscriptionItem, item);
  for (const key of ["copyText", "retryTranscription", "viewRawTranscript", "deleteItem"]) {
    assert.match(html, new RegExp(`controlPanel\\.history\\.${key}`));
  }
  assert.doesNotMatch(html, /aria-haspopup="menu"|group-hover\/row:opacity-100/);
  const container = installInteractiveDom(t);
  const root = createRoot(container);
  const actions = [];
  let finish;
  await React.act(async () =>
    root.render(
      React.createElement(TranscriptionItem, {
        item,
        onCopy: (text) => actions.push(["copy", text]),
        onDelete: (id) => actions.push(["delete", id]),
        onShowAudioInFolder: (id) => actions.push(["folder", id]),
        onRetryTranscription: (id) => {
          actions.push(["retry", id]);
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
      })
    )
  );
  const button = (suffix) =>
    findElement(container, (el) => el.tagName === "BUTTON" && el.textContent.includes(suffix));
  const click = (element) =>
    React.act(async () =>
      element.dispatchEvent({ type: "click", bubbles: true, button: 0, preventDefault() {} })
    );
  await click(button("history.copyText"));
  await click(button("history.deleteItem"));
  await click(button("history.showInFolder"));
  await click(button("history.viewRawTranscript"));
  assert.equal(button("history.viewRawTranscript").getAttribute("aria-expanded"), "true");
  await click(button("history.retryTranscription"));
  assert.equal(button("history.retryTranscription").getAttribute("disabled"), "");
  assert.deepEqual(actions, [
    ["copy", item.text],
    ["delete", item.id],
    ["folder", item.id],
    ["retry", item.id],
  ]);
  await React.act(async () => finish());
  await React.act(async () => root.unmount());
});
