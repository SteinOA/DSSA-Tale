const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  planAlignment,
  validateAlignmentResult,
  baseLanguage,
  readAlignmentConfig,
  runAlignment,
  recoverAlignmentPrefix,
  executionInfo,
} = require("../../src/helpers/dssaAlignment");
test("only known execution devices and GPU fallback reasons reach the renderer", () => {
  assert.deepEqual(executionInfo({ device: "cuda" }), { device: "cuda" });
  assert.deepEqual(executionInfo({ device: "cpu", gpuFallbackReason: "insufficient-vram" }), {
    device: "cpu",
    gpuFallbackReason: "insufficient-vram",
  });
  assert.deepEqual(
    executionInfo({ device: "untrusted", gpuFallbackReason: "private exception text" }),
    {}
  );
});
const source = [
  { start: 1, end: 2, text: "Eg er" },
  { start: 2, end: 3, text: "samd." },
];
const aligned = (groups) => ({
  success: true,
  segments: groups.map((g) => ({
    start: g.start,
    end: g.end,
    text: g.text,
    alignmentStatus: "ctc-aligned",
    words: g.text.split(/\s+/).map((text, i) => ({
      text,
      start: g.start + i * 0.2,
      end: g.start + i * 0.2 + 0.1,
      alignmentScore: 0.9,
    })),
  })),
});

test("plans bounded real windows without sorting words when native chunk clocks overlap", () => {
  const original = [
    ...source,
    { start: 2.9, end: 4, text: "Prøv igjen." },
    { start: 40, end: 41, text: "Seinare." },
  ];
  const copy = structuredClone(original);
  const groups = planAlignment(original, 41);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].text, "Eg er samd. Prøv igjen.");
  assert.deepEqual(groups[0].indices, [0, 1, 2]);
  assert.equal(groups[1].end, 41);
  assert.deepEqual(original, copy);
});

test("source point timestamps can gain acoustic context but never invented word clocks", () => {
  const groups = planAlignment([{ text: "Eg", start: 1, end: 1 }], 2);
  assert.equal(groups[0].start, 0.85);
  assert.equal(groups[0].end, 1.15);
  assert.equal(groups[0].words, undefined);
});

test("a crashed worker's validated prefix can be kept while all remaining source text is restored", () => {
  const original = [...source, { text: "Seinare.", start: 40, end: 42 }];
  const groups = planAlignment(original, 50),
    partial = aligned(groups);
  partial.segments = partial.segments.slice(0, 1);
  const result = validateAlignmentResult(
    recoverAlignmentPrefix(partial, groups),
    groups,
    original,
    50
  );
  assert.equal(result.applied, 1);
  assert.equal(result.fallback, 1);
  assert.equal(result.segments.at(-1).text, "Seinare.");
  partial.segments[0].text = "Translated text";
  assert.throws(() =>
    validateAlignmentResult(recoverAlignmentPrefix(partial, groups), groups, original, 50)
  );
});

test("invalid or excessive source windows fail before launching a model", () => {
  for (const s of [
    { start: -1, end: 2, text: "Eg" },
    { start: 0, end: 50, text: "Eg" },
    { start: 4, end: 3, text: "Eg" },
    { start: 1, end: 2, text: "" },
  ]) {
    assert.throws(() => planAlignment([s], 50));
  }
});

test("validated acoustic word times preserve Nynorsk and source words exactly", () => {
  const groups = planAlignment(source, 5),
    result = validateAlignmentResult(aligned(groups), groups, source, 5);
  assert.equal(result.applied, 1);
  assert.equal(result.segments[0].text, "Eg er samd.");
  assert.equal(result.segments[0].start, 0.85);
});

test("a failed group restores its complete original segments and existing word clocks", () => {
  const original = [{ ...source[0], words: [{ text: "Eg", start: 1, end: 1.2 }] }];
  const groups = planAlignment(original, 5),
    output = {
      success: true,
      segments: groups.map((g) => ({ ...g, alignmentStatus: "original-preserved" })),
    };
  const result = validateAlignmentResult(output, groups, original, 5);
  assert.deepEqual(result.segments, original);
  assert.equal(result.fallback, 1);
});

test("rewriting, word loss, false scores or out-of-file clocks reject the whole result", () => {
  const groups = planAlignment(source, 5);
  for (const alter of [
    (r) => {
      r.segments[0].text = "Jeg er enig.";
    },
    (r) => r.segments[0].words.pop(),
    (r) => {
      r.segments[0].words[0].end = 20;
    },
    (r) => {
      r.segments[0].words[0].alignmentScore = true;
    },
    (r) => {
      r.segments[0].start = 0;
    },
  ]) {
    const result = aligned(groups);
    alter(result);
    assert.throws(() => validateAlignmentResult(result, groups, source, 5));
  }
});

test("language choice never silently maps English or auto detection to Bokmal", () => {
  assert.equal(baseLanguage("no"), "nb");
  assert.equal(baseLanguage("nn"), "nn");
  assert.equal(baseLanguage("en"), null);
  assert.equal(baseLanguage(""), null);
});

test("optional model configuration rejects shell command strings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-align-config-"));
  try {
    assert.equal(readAlignmentConfig(dir), null);
    fs.writeFileSync(
      path.join(dir, "dssa-alignment-engine.json"),
      JSON.stringify({ enabled: true, pythonPath: "python; injected", nltkPath: dir })
    );
    assert.equal(readAlignmentConfig(dir), null);
  } finally {
    if (path.dirname(dir) === fs.realpathSync(os.tmpdir()))
      fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("already cancelled work never writes a private request or launches Python", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runAlignment({}, "unused", source, { signal: controller.signal }), {
    name: "AbortError",
  });
});

test("older local configs default to GPU preference and an explicit CPU choice is preserved", () => {
  const root = fs.realpathSync(os.tmpdir()),
    dir = fs.mkdtempSync(path.join(root, "dssa-align-device-config-"));
  try {
    const pythonPath = path.join(dir, "python.exe");
    fs.writeFileSync(pythonPath, "test only; never executed");
    fs.writeFileSync(path.join(dir, "dssa-alignment-manifest.json"), "{}");
    const config = { enabled: true, pythonPath, nltkPath: dir, models: { fast: { nb: dir } } };
    const file = path.join(dir, "dssa-alignment-engine.json");
    for (const device of [undefined, "cpu", "untrusted"]) {
      fs.writeFileSync(file, JSON.stringify({ ...config, device }));
      const result = readAlignmentConfig(dir);
      if (device === "untrusted") assert.equal(result, null);
      else assert.equal(result.device, device || "auto");
    }
  } finally {
    if (path.dirname(dir) === root) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("GPU-to-CPU fallback is reported even before another window finishes", async () => {
  const root = fs.realpathSync(os.tmpdir()),
    dir = fs.mkdtempSync(path.join(root, "dssa-align-device-progress-"));
  const script = path.join(dir, "progress.cjs"),
    devices = [];
  fs.writeFileSync(
    script,
    `const fs=require('fs'),a=process.argv,r=JSON.parse(fs.readFileSync(a[a.indexOf('--request')+1]));
    if(r.device!=='auto')process.exit(9);
    fs.writeFileSync(r.progressPath,JSON.stringify({completed:0,total:r.segments.length,device:'cuda'}));
    setTimeout(()=>fs.writeFileSync(r.progressPath,JSON.stringify({completed:0,total:r.segments.length,device:'cpu',gpuFallbackReason:'gpu-memory-error'})),1300);
    setTimeout(()=>fs.writeFileSync(a[a.indexOf('--result')+1],JSON.stringify({success:true,device:'cpu',gpuFallbackReason:'gpu-memory-error',segments:r.segments.map(s=>({...s,alignmentStatus:'original-preserved'}))})),2700);`
  );
  try {
    const result = await runAlignment(
      { pythonPath: process.execPath, nltkPath: dir, models: { fast: { nb: dir } } },
      "unused",
      source,
      {
        language: "nb",
        mode: "fast",
        duration: 5,
        scriptPath: script,
        onProgress: (p) => {
          if (p.device) devices.push(p.device);
        },
      }
    );
    assert.deepEqual(devices, ["cuda", "cpu"]);
    assert.equal(result.device, "cpu");
    assert.equal(result.gpuFallbackReason, "gpu-memory-error");
    assert.deepEqual(result.segments, source);
  } finally {
    if (path.dirname(dir) === root) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("worker failures retain source inputs and release process bookkeeping", async () => {
  let spawned = 0,
    closed = 0;
  const config = {
    pythonPath: process.execPath,
    nltkPath: os.tmpdir(),
    models: { fast: { nb: os.tmpdir() } },
  };
  const copy = structuredClone(source);
  await assert.rejects(
    runAlignment(config, "unused", source, {
      language: "nb",
      mode: "fast",
      duration: 5,
      scriptPath: path.join(os.tmpdir(), "no-such-dssa-alignment-script.cjs"),
      onSpawn: () => spawned++,
      onClose: () => closed++,
    })
  );
  assert.equal(spawned, 1);
  assert.equal(closed, 1);
  assert.deepEqual(source, copy);
});

test("a real worker process crash preserves a validated checkpoint plus all unprocessed words", async () => {
  const root = fs.realpathSync(os.tmpdir()),
    dir = fs.mkdtempSync(path.join(root, "dssa-align-crash-test-"));
  const script = path.join(dir, "crash.cjs");
  fs.writeFileSync(
    script,
    `const fs=require('fs'); const a=process.argv;const r=JSON.parse(fs.readFileSync(a[a.indexOf('--request')+1]));const g=r.segments[0];fs.writeFileSync(r.checkpointPath,JSON.stringify({success:true,segments:[{...g,alignmentStatus:'ctc-aligned',words:g.text.split(/\\s+/).map((text,i)=>({text,start:g.start+i*.2,end:g.start+i*.2+.1,alignmentScore:.9}))}]}));process.exit(42);`
  );
  try {
    const original = [...source, { text: "Seinare.", start: 40, end: 42 }];
    const result = await runAlignment(
      { pythonPath: process.execPath, nltkPath: dir, models: { fast: { nb: dir } } },
      "unused",
      original,
      { language: "nb", mode: "fast", duration: 50, scriptPath: script }
    );
    assert.equal(result.recovered, true);
    assert.equal(result.applied, 1);
    assert.equal(result.fallback, 1);
    assert.equal(result.segments.at(-1).text, "Seinare.");
    assert.equal(
      result.segments.map((s) => s.text).join(" "),
      original.map((s) => s.text).join(" ")
    );
  } finally {
    if (path.dirname(dir) === root) fs.rmSync(dir, { recursive: true, force: true });
  }
});
