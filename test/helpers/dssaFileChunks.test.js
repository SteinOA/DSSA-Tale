const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("fs"),
  path = require("path"),
  os = require("os");
const {
  wavHeader,
  joinOverlap,
  transcribeFileChunks,
} = require("../../src/helpers/dssaFileChunks");
test("long audio is decoded in bounded PCM chunks with overlap and real completion counts", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-chunks-test-"));
  const source = path.join(root, "original.mp3");
  fs.writeFileSync(source, "keep");
  const chunks = [],
    progress = [],
    answers = [
      "Dette er et møte i Halden",
      "i Halden med flere deltakere",
      "flere deltakere og oppgaver",
    ];
  try {
    const result = await transcribeFileChunks(
      source,
      {},
      {
        temporaryRoot: root,
        convert: async (_input, output) => {
          const bytes = 65 * 32000;
          fs.writeFileSync(output, Buffer.concat([wavHeader(bytes), Buffer.alloc(bytes)]));
        },
        transcribe: async (buffer, options) => {
          chunks.push(buffer.length);
          assert.equal(options.priority, "background");
          return { success: true, text: answers.shift() };
        },
        onProgress: (p) => progress.push(p),
      }
    );
    assert.deepEqual(chunks, [44 + 30 * 32000, 44 + 30.5 * 32000, 44 + 5.5 * 32000]);
    assert.equal(result.durationSeconds, 65);
    assert.equal(result.text, "Dette er et møte i Halden med flere deltakere og oppgaver");
    assert.deepEqual(
      progress.map((p) => p.chunksCompleted),
      [0, 1, 2, 3]
    );
    assert.deepEqual(progress.map((p) => p.audioProcessedSeconds), [0, 30, 60, 65]);
    assert.ok(progress.every((p) => p.audioDurationSeconds === 65));
    assert.equal(fs.readFileSync(source, "utf8"), "keep");
    assert.deepEqual(fs.readdirSync(root), ["original.mp3"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("abort stops the next chunk and removes only its own temporary conversion", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-chunks-test-"));
  const controller = new AbortController();
  let calls = 0;
  try {
    await assert.rejects(
      transcribeFileChunks(
        "source",
        { signal: controller.signal },
        {
          temporaryRoot: root,
          convert: async (_input, output) =>
            fs.writeFileSync(
              output,
              Buffer.concat([wavHeader(64 * 32000), Buffer.alloc(64 * 32000)])
            ),
          transcribe: async () => {
            calls++;
            controller.abort();
            return { success: true, text: "Norsk" };
          },
        }
      ),
      { name: "AbortError" }
    );
    assert.equal(calls, 1);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(joinOverlap("Hei", ""), "Hei");
});

test("silence before and after speech does not discard a long recording", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-chunks-test-"));
  let call = 0;
  try {
    const result = await transcribeFileChunks(
      "source",
      {},
      {
        temporaryRoot: root,
        convert: async (_input, output) =>
          fs.writeFileSync(
            output,
            Buffer.concat([wavHeader(65 * 32000), Buffer.alloc(65 * 32000)])
          ),
        transcribe: async () =>
          ++call === 2
            ? { success: true, text: "Dette er norsk tale" }
            : { success: false, message: "No audio detected" },
      }
    );
    assert.equal(call, 3);
    assert.equal(result.success, true);
    assert.equal(result.text, "Dette er norsk tale");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("file timing keeps actual overlapping chunk offsets and drops duplicated boundary words only", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-timed-chunks-"));
  let index = 0;
  const answers = [
    { text: "Dette er eit møte", segments: [{ text: "Dette er eit møte", start: 25, end: 29 }] },
    {
      text: "møte med fleire talarar",
      segments: [{ text: "møte med fleire talarar", start: 0, end: 3 }],
    },
    {
      text: "talarar og neste sak",
      segments: [{ text: "talarar og neste sak", start: 0, end: 5 }],
    },
  ];
  try {
    const result = await transcribeFileChunks(
      "source",
      { timestamps: true },
      {
        temporaryRoot: root,
        convert: async (_input, output) =>
          fs.writeFileSync(
            output,
            Buffer.concat([wavHeader(65 * 32000), Buffer.alloc(65 * 32000)])
          ),
        transcribe: async (_bytes, options) => {
          assert.equal(options.timestamps, true);
          return { success: true, ...answers[index++] };
        },
      }
    );
    assert.equal(result.text, "Dette er eit møte med fleire talarar og neste sak");
    assert.deepEqual(
      result.segments.map((s) => s.start),
      [25, 29.5, 59.5]
    );
    assert.equal(result.segments.map((s) => s.text).join(" "), result.text);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing timestamps keep all transcribed words and explicitly disable guessed speaker timing", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-no-timing-"));
  try {
    const result = await transcribeFileChunks(
      "source",
      { timestamps: true },
      {
        temporaryRoot: root,
        convert: async (_input, output) =>
          fs.writeFileSync(output, Buffer.concat([wavHeader(32000), Buffer.alloc(32000)])),
        transcribe: async () => ({ success: true, text: "Bevar heile teksten." }),
      }
    );
    assert.equal(result.text, "Bevar heile teksten.");
    assert.equal(result.segments, undefined);
    assert.equal(result.timingUnavailable, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("retry resumes completed chunks after cancellation and reconstructs exactly the uninterrupted text and timing", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-resume-chunks-"));
  const source = path.join(root, "original.audio"),
    cache = path.join(root, "checkpoint-cache");
  fs.writeFileSync(source, "original input");
  const answers = [
    {
      success: true,
      text: "Dette er eit møte",
      segments: [{ text: "Dette er eit møte", start: 25, end: 29 }],
    },
    {
      success: true,
      text: "møte med fleire talarar",
      segments: [{ text: "møte med fleire talarar", start: 0, end: 3 }],
    },
    {
      success: true,
      text: "talarar og neste sak",
      segments: [{ text: "talarar og neste sak", start: 0, end: 5 }],
    },
  ];
  const convert = async (_input, output) =>
    fs.writeFileSync(output, Buffer.concat([wavHeader(65 * 32000), Buffer.alloc(65 * 32000)]));
  try {
    let index = 0;
    const uninterrupted = await transcribeFileChunks(
      source,
      { model: "nb-large", language: "nn", timestamps: true },
      {
        temporaryRoot: root,
        convert,
        transcribe: async () => structuredClone(answers[index++]),
      }
    );
    const controller = new AbortController();
    index = 0;
    await assert.rejects(
      transcribeFileChunks(
        source,
        {
          model: "nb-large",
          language: "nn",
          timestamps: true,
          signal: controller.signal,
          requestId: "first",
        },
        {
          temporaryRoot: root,
          checkpointDirectory: cache,
          convert,
          transcribe: async () => {
            const answer = structuredClone(answers[index++]);
            if (index === 2) controller.abort();
            return answer;
          },
        }
      ),
      { name: "AbortError" }
    );
    assert.equal(index, 2);
    const progress = [],
      resumedCalls = [];
    const resumed = await transcribeFileChunks(
      source,
      {
        model: "nb-large",
        language: "nn",
        timestamps: true,
        signal: new AbortController().signal,
        requestId: "retry",
      },
      {
        temporaryRoot: root,
        checkpointDirectory: cache,
        convert,
        transcribe: async () => {
          resumedCalls.push(index);
          return structuredClone(answers[index++]);
        },
        onProgress: (value) => progress.push(value),
      }
    );
    assert.deepEqual(resumedCalls, [2]);
    assert.deepEqual(resumed, uninterrupted);
    assert.deepEqual(
      progress.map((value) => value.chunksCompleted),
      [2, 3]
    );
    assert.equal(progress[0].resumedChunks, 2);
    assert.deepEqual(
      fs.readdirSync(cache),
      [],
      "successful completion removes temporary transcript checkpoints"
    );
    assert.equal(fs.readFileSync(source, "utf8"), "original input");
    assert.equal(
      fs.readdirSync(root).some((name) => name.startsWith("ow-file-")),
      false
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("revoking history permission while decoding purges checkpoints and prevents further writes without losing text", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-checkpoint-policy-"));
  const source = path.join(root, "source.audio"),
    cache = path.join(root, "cache");
  fs.writeFileSync(source, "input");
  let allowed = true,
    calls = 0;
  try {
    const result = await transcribeFileChunks(
      source,
      {},
      {
        temporaryRoot: root,
        checkpointDirectory: cache,
        canCheckpoint: () => allowed,
        convert: async (_input, output) =>
          fs.writeFileSync(
            output,
            Buffer.concat([wavHeader(65 * 32000), Buffer.alloc(65 * 32000)])
          ),
        transcribe: async () => {
          calls++;
          if (calls === 2) {
            assert.equal(fs.readdirSync(cache).length, 1, "first completed chunk was saved");
            allowed = false;
          }
          return { success: true, text: `Del ${calls}.` };
        },
      }
    );
    assert.equal(calls, 3);
    assert.equal(result.text, "Del 1. Del 2. Del 3.");
    assert.deepEqual(fs.readdirSync(cache), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkpoint storage failures warn without discarding usable text or changing the original file", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-checkpoint-warning-"));
  const source = path.join(root, "original.audio"),
    unusableCache = path.join(root, "not-a-directory");
  fs.writeFileSync(source, "original input");
  fs.writeFileSync(unusableCache, "keep");
  try {
    const result = await transcribeFileChunks(
      source,
      {},
      {
        temporaryRoot: root,
        checkpointDirectory: unusableCache,
        convert: async (_input, output) =>
          fs.writeFileSync(output, Buffer.concat([wavHeader(32000), Buffer.alloc(32000)])),
        transcribe: async () => ({ success: true, text: "Behald teksten." }),
      }
    );
    assert.equal(result.success, true);
    assert.equal(result.text, "Behald teksten.");
    assert.equal(result.checkpointWarning, true);
    assert.equal(fs.readFileSync(source, "utf8"), "original input");
    assert.equal(fs.readFileSync(unusableCache, "utf8"), "keep");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("disabled history purges an interrupted cache before reading it and decodes fresh speech", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-disabled-checkpoint-"));
  const source = path.join(root, "original.audio"),
    cache = path.join(root, "cache");
  fs.writeFileSync(source, "input");
  const convert = async (_input, output) =>
    fs.writeFileSync(output, Buffer.concat([wavHeader(65 * 32000), Buffer.alloc(65 * 32000)]));
  const controller = new AbortController();
  try {
    await assert.rejects(
      transcribeFileChunks(
        source,
        { signal: controller.signal },
        {
          temporaryRoot: root,
          checkpointDirectory: cache,
          convert,
          transcribe: async () => {
            controller.abort();
            return { success: true, text: "Gammal tekst." };
          },
        }
      ),
      { name: "AbortError" }
    );
    assert.equal(fs.readdirSync(cache).length, 1);
    let calls = 0;
    const result = await transcribeFileChunks(
      source,
      {},
      {
        temporaryRoot: root,
        checkpointDirectory: cache,
        canCheckpoint: () => false,
        convert,
        transcribe: async () => {
          calls++;
          return { success: true, text: `Ny del ${calls}.` };
        },
      }
    );
    assert.equal(calls, 3);
    assert.equal(result.text, "Ny del 1. Ny del 2. Ny del 3.");
    assert.doesNotMatch(result.text, /Gammal/);
    assert.deepEqual(fs.readdirSync(cache), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
