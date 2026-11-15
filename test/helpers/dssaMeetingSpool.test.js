const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"),
  os = require("os"),
  path = require("path");
const Spool = require("../../src/helpers/dssaMeetingSpool");
test("progress counts only completed audio, includes both tracks and preserves failed work", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-spool-progress-"));
  try {
    const spool = new Spool(root, 42),
      progress = [];
    spool.enqueue("mic", Buffer.alloc(48000), 1000);
    spool.enqueue("system", Buffer.alloc(96000), 2000);
    spool.enqueue("mic", Buffer.alloc(48000), 3000);
    let count = 0;
    await assert.rejects(
      spool.drain(
        async () => {
          if (++count === 3) throw Error("failed chunk");
        },
        (event) => progress.push(event)
      ),
      /failed chunk/
    );
    assert.deepEqual(
      progress.map((p) => p.processedSeconds),
      [0, 1, 3]
    );
    assert.ok(progress.every((p) => p.totalSeconds === 4 && p.noteId === 42));
    assert.equal(progress[0].remainingSeconds, null);
    assert.ok(progress[2].remainingSeconds >= 1);
    assert.equal(spool.queue.length, 1);
    const retried = [];
    await spool.drain(
      async () => {},
      (event) => retried.push(event)
    );
    assert.equal(retried.at(-1).processedSeconds, 1);
    assert.equal(retried.at(-1).totalSeconds, 1);
    assert.equal(spool.clearIfComplete(), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("deferred meeting keeps failed chunks and timestamps and removes only completed audio", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-spool-test-"));
  try {
    const spool = new Spool(root, 42);
    spool.enqueue("mic", Buffer.from([1, 2]), 1000);
    spool.enqueue("system", Buffer.from([3, 4]), 2000);
    assert.equal(spool.clearIfComplete(), false);
    await assert.rejects(
      spool.drain(async () => {
        throw Error("decode failed");
      })
    );
    assert.equal(spool.queue.length, 2);
    assert.equal(fs.readFileSync(spool.queue[0].file).length, 2);
    const seen = [];
    await spool.drain(async (chunk) => {
      seen.push([chunk.source, chunk.timestamp, chunk.buffer[0]]);
    });
    assert.deepEqual(seen, [
      ["mic", 1000, 1],
      ["system", 2000, 3],
    ]);
    assert.equal(spool.clearIfComplete(), true);
    assert.equal(fs.existsSync(spool.directory), false);
    assert.throws(() => spool.enqueue("unknown", Buffer.alloc(2), 0));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
