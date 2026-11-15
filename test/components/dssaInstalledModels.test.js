const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { createRoot } = require("react-dom/client");
const { renderToStaticMarkup } = require("react-dom/server");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");
const { installInteractiveDom, findElement } = require("../lib/interactiveDom");

test("System reads installed inventory without model/language selectors or implicit downloads", async (t) => {
  let root;
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
  });
  let downloads = 0;
  const status = {
    runtime: true,
    runtimeDevice: "cuda",
    community: false,
    credential: false,
    alignment: {},
    sileroInstalled: true,
    busy: false,
    phase: "idle",
  };
  installBrowserGlobals(t, {
    window: {
      electronAPI: {
        getPlatform: () => "win32",
        listWhisperModels: async () => ({
          success: true,
          models: [
            { model: "nb-large-full", downloaded: true },
            { model: "tiny", downloaded: false },
          ],
        }),
        listParakeetModels: async () => ({ success: true, models: [] }),
        modelGetAll: async () => [],
        getDiarizationModelStatus: async () => ({ sherpaReady: true }),
        modelDownload: () => {
          downloads++;
        },
      },
      dssaAPI: {
        meetingSetupStatus: async () => status,
        meetingSetupStart: async () => {
          downloads++;
          return {};
        },
      },
    },
  });
  const container = installInteractiveDom(t);
  const vite = await createRendererServer(t, {
    cachePrefix: "dssa-system-inventory-",
    noExternal: ["react-i18next"],
    mockModules: {
      "react-i18next": `const t = (key) => key; export function useTranslation() { return { t, i18n: { language: "nb" } }; } export const initReactI18next = { type: "3rdParty", init() {} };`,
      "/stores/settingsStore": `export const useSettingsStore = (select) => select({ useLocalWhisper:true, localTranscriptionProvider:"whisper", whisperModel:"nb-large-full", useCleanupModel:false, dictationSileroEnabled:false, noteRecordingSileroEnabled:true, meetingSileroEnabled:true, preferredLanguage:"nn" }); export const selectResolvedLLMConfig=()=>({model:null});`,
    },
  });
  const Setup = (await vite.ssrLoadModule("/components/dssa/DssaMeetingSetup.tsx")).default;
  root = createRoot(container);
  await React.act(async () => {
    root.render(React.createElement(Setup));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  const text = container.textContent;
  assert.match(text, /NB-Whisper Large.*full presisjon/);
  assert.match(text, /Valgt for diktering/);
  assert.match(text, /Silero VAD/);
  assert.match(text, /sherpa-onnx/);
  assert.match(text, /Nynorsk/);
  assert.match(text, /NVIDIA CUDA/);
  assert.match(text, /egen Hugging Face-konto/);
  assert.doesNotMatch(text, /Last ned rask WhisperX|Last ned presis WhisperX|wav2vec2 300M|Tiny/);
  assert.equal(
    findElement(container, (el) => el.tagName === "SELECT"),
    null
  );
  assert.equal(downloads, 0);
  const refresh = findElement(
    container,
    (el) => el.tagName === "BUTTON" && el.textContent === "Oppdater oversikten"
  );
  await React.act(async () =>
    refresh.dispatchEvent({ type: "click", bubbles: true, button: 0, preventDefault() {} })
  );
  assert.equal(downloads, 0);
});

test("local release notes describe the installed version and never label a newer package installed", async (t) => {
  installBrowserGlobals(t);
  const vite = await createRendererServer(t, { cachePrefix: "dssa-version-notes-" });
  const View = (await vite.ssrLoadModule("/components/dssa/DssaVersionChanges.tsx")).default;
  const old = renderToStaticMarkup(
    React.createElement(View, { installedVersion: "1.10.4-dssa.36" })
  );
  assert.match(old, /Endringer i installert versjon 1\.10\.4-dssa\.36/);
  assert.doesNotMatch(old, /dssa\.38|System viser installerte/);
  const current = renderToStaticMarkup(
    React.createElement(View, { installedVersion: "1.10.4-dssa.38" })
  );
  assert.match(current, /System viser installerte/);
  assert.match(current, /Tidligere versjonsendringer/);
});

test("word timing downloads use the import language and require an explicit click", async (t) => {
  let root;
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
  });
  const started = [];
  const status = {
    runtime: true,
    community: true,
    credential: true,
    alignment: {},
    busy: false,
    phase: "idle",
  };
  installBrowserGlobals(t, {
    window: {
      dssaAPI: {
        meetingSetupStatus: async () => status,
        meetingSetupStart: async (args) => {
          started.push(args);
          return {};
        },
      },
    },
  });
  const container = installInteractiveDom(t);
  const vite = await createRendererServer(t, { cachePrefix: "dssa-import-alignment-" });
  const View = (await vite.ssrLoadModule("/components/dssa/DssaAlignmentSetup.tsx")).default;
  let models = {};
  const onModelsChange = (update) => {
    models = typeof update === "function" ? update(models) : update;
  };
  root = createRoot(container);
  await React.act(async () => {
    root.render(React.createElement(View, { language: "nn", onModelsChange }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.equal(started.length, 0);
  assert.match(container.textContent, /Nynorsk/);
  const button = () =>
    findElement(container, (el) => el.tagName === "BUTTON" && el.textContent.includes("300M"));
  await React.act(async () =>
    button().dispatchEvent({ type: "click", bubbles: true, button: 0, preventDefault() {} })
  );
  assert.deepEqual(started, [{ kind: "alignment-fast", language: "nn", device: "auto" }]);
  await React.act(async () =>
    root.render(React.createElement(View, { language: "", onModelsChange }))
  );
  assert.equal(button().getAttribute("disabled"), "");
  assert.equal(started.length, 1);
});
