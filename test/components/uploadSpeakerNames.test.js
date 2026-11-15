const test = require("node:test");
const assert = require("node:assert/strict");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

test("renaming an imported cluster preserves timing, wording and unknown passages across reload", async (t) => {
  installBrowserGlobals(t);
  const vite = await createRendererServer(t, {
    cachePrefix: "dssa-upload-names-",
    noExternal: ["react-i18next"],
    mockModules: {
      "react-i18next": `export const useTranslation = () => ({ t: (key, opts) => key.endsWith('.label') ? 'Taler ' + opts.n : key.endsWith('.unknownLabel') ? 'Ukjent taler' : key });`,
    },
  });
  const { parseTranscriptSegments } = await vite.ssrLoadModule("/utils/parseTranscriptSegments.ts");
  const { lockTranscriptSpeaker, serializeTranscriptSegments } = await vite.ssrLoadModule(
    "/utils/transcriptSpeakerState.ts"
  );
  const { UploadTranscriptText } = await vite.ssrLoadModule(
    "/components/notes/UploadSpeakerNames.tsx"
  );
  const original = [
    {
      text: "Eg meiner",
      speaker: "speaker_2",
      timestamp: 1700000001000,
      endTimestamp: 1700000002000,
      audioStartTimestamp: 1700000000000,
    },
    {
      text: "vi skal prøve.",
      speaker: "speaker_2",
      timestamp: 1700000002000,
      endTimestamp: 1700000003000,
      audioStartTimestamp: 1700000000000,
    },
    {
      text: "Uvisst kven.",
      timestamp: 1700000003000,
      endTimestamp: 1700000004000,
      audioStartTimestamp: 1700000000000,
    },
    {
      text: "Annen deltaker.",
      speaker: "speaker_1",
      timestamp: 1700000004000,
      endTimestamp: 1700000005000,
      audioStartTimestamp: 1700000000000,
    },
  ];
  const segments = parseTranscriptSegments(JSON.stringify(original));
  const renamed = segments.map((s) =>
    s.speaker === "speaker_2"
      ? lockTranscriptSpeaker(s, { speakerName: "Åse", speakerIsPlaceholder: false })
      : s
  );
  const reloaded = parseTranscriptSegments(serializeTranscriptSegments(renamed));
  for (let i = 0; i < original.length; i++) {
    for (const field of ["text", "speaker", "timestamp", "endTimestamp", "audioStartTimestamp"])
      assert.equal(reloaded[i][field], original[i][field]);
  }
  assert.equal(reloaded[0].speakerName, "Åse");
  assert.equal(reloaded[1].speakerName, "Åse");
  assert.equal(reloaded[2].speakerName, undefined);
  assert.equal(reloaded[3].speakerName, undefined);
  const markup = renderToStaticMarkup(
    createElement(UploadTranscriptText, { segments: reloaded, mappings: { speaker_2: "Åse" } })
  );
  assert.match(markup, /Åse/);
  assert.match(markup, /Eg meiner vi skal prøve\./);
  assert.match(markup, /Ukjent taler/);
  assert.match(markup, /Taler 2/);
  assert.equal((markup.match(/<p /g) || []).length, 3);
});
