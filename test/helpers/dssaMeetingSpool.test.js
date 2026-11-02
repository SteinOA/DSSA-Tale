const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"),
  os = require("os"),
  path = require("path");
const Spool = require("../../src/helpers/dssaMeetingSpool");
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
