const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { createRoot } = require("react-dom/client");
const {
  createRendererServer,
  installBrowserGlobals,
  installHookDom,
} = require("../lib/rendererTestHarness");
function find(node, pred) {
  if (Array.isArray(node)) {
    for (const c of node) {
      const m = find(c, pred);
      if (m) return m;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  return pred(node) ? node : find(node.props?.children, pred);
}
function text(n) {
  return Array.isArray(n)
    ? n.map(text).join("")
    : n && typeof n === "object"
      ? text(n.props?.children)
      : n == null
        ? ""
        : String(n);
}
test("fresh setup blocks missing models and untested microphone, rechecks disk, and configures all local speech contexts", async (t) => {
  let unmount = async () => {};
  t.after(() => unmount());
  let inventory = [],
    failMic = false,
    tick,
    stopped = 0,
    completed = 0;
  const modes = [];
  installBrowserGlobals(t, {
    initialStorage: { uiLanguage: "nb" },
    window: {
      electronAPI: {
        listWhisperModels: async () => ({
          success: true,
          models: inventory.map((model) => ({ model, downloaded: true })),
        }),
        setOnboardingWindowMode: async (mode) => {
          modes.push(mode);
        },
      },
    },
  });
  const container = installHookDom(t);
  const oldNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldAudio = globalThis.AudioContext,
    oldSet = globalThis.setInterval,
    oldClear = globalThis.clearInterval;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => {
          if (failMic) throw Error("Microphone access denied");
          return {
            getTracks: () => [
              {
                stop: () => {
                  stopped++;
                },
              },
            ],
          };
        },
      },
    },
  });
  globalThis.AudioContext = class {
    async resume() {}
    createAnalyser() {
      return { fftSize: 32, getByteTimeDomainData: (a) => a.fill(155) };
    }
    createMediaStreamSource() {
      return { connect() {} };
    }
    async close() {}
  };
  globalThis.setInterval = (fn) => {
    tick = fn;
    return 42;
  };
  globalThis.clearInterval = () => {};
  t.after(() => {
    if (oldNav) Object.defineProperty(globalThis, "navigator", oldNav);
    else delete globalThis.navigator;
    globalThis.AudioContext = oldAudio;
    globalThis.setInterval = oldSet;
    globalThis.clearInterval = oldClear;
  });
  const vite = await createRendererServer(t, {
    resolveAlias: { "@": require("node:path").resolve(__dirname, "../../src") },
    cachePrefix: "dssa-guided-setup-",
    mockModules: {
      "/hooks/useModelDownload": `export function useModelDownload(){ return {isDownloading:false,downloadError:null,downloadModel:async()=>{},cancelDownload:async()=>{},downloadProgress:{percentage:0}}; }`,
    },
  });
  const { default: i18n } = await vite.ssrLoadModule("/i18n.ts");
  await i18n.changeLanguage("nb");
  const { default: Setup } = await vite.ssrLoadModule("/components/dssa/DssaOnboarding.tsx");
  const { useSettingsStore } = await vite.ssrLoadModule("/stores/settingsStore.ts");
  let tree;
  function Harness() {
    tree = Setup({ onComplete: () => completed++ });
    return null;
  }
  const root = createRoot(container);
  unmount = async () => {
    await React.act(async () => root.unmount());
  };
  await React.act(async () => root.render(React.createElement(Harness)));
  const button = (label) =>
    find(tree, (n) => typeof n.props?.onClick === "function" && text(n) === label);
  const click = async (label) => {
    const b = button(label);
    assert.ok(b, label);
    assert.ok(!b.props.disabled, `${label} enabled`);
    await React.act(async () => b.props.onClick());
  };
  assert.deepEqual(modes, ["expanded"]);
  assert.equal(localStorage.getItem("onboardingCompleted"), null);
  await click("Neste");
  assert.equal(button("Neste").props.disabled, true);
  inventory = ["nb-large-full"];
  await click("Kontroller på nytt");
  await click("Neste");
  assert.equal(button("Neste").props.disabled, true);
  failMic = true;
  await click("Test mikrofon");
  assert.match(text(tree), /Microphone access denied/);
  assert.equal(button("Neste").props.disabled, true);
  failMic = false;
  await click("Test mikrofon");
  await React.act(async () => tick());
  await click("Stopp testen");
  assert.equal(stopped, 1);
  await click("Neste");
  inventory = [];
  await click("Åpne DSSA Tale");
  assert.equal(completed, 0);
  assert.equal(localStorage.getItem("skipAuth"), null);
  assert.equal(button("Neste").props.disabled, true);
  inventory = ["nb-large-full"];
  await click("Kontroller på nytt");
  await click("Neste");
  await click("Neste");
  await click("Åpne DSSA Tale");
  assert.equal(completed, 1);
  assert.equal(modes.at(-1), "restore");
  const s = useSettingsStore.getState();
  for (const prefix of ["", "meeting", "upload"]) {
    const key = (k) => (prefix ? prefix + k[0].toUpperCase() + k.slice(1) : k);
    assert.equal(s[key("useLocalWhisper")], true);
    assert.equal(s[key("localTranscriptionProvider")], "whisper");
    assert.equal(s[key("whisperModel")], "nb-large-full");
    assert.equal(s[key("transcriptionMode")], "local");
  }
  assert.equal(s.useCleanupModel, false);
  assert.equal(localStorage.getItem("skipAuth"), "true");
});
