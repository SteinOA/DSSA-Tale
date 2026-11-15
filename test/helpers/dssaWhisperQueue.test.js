const test = require("node:test"),
  assert = require("node:assert/strict");
const { WhisperQueue } = require("../../src/helpers/dssaWhisperQueue");
const tick = () => new Promise((r) => setImmediate(r));
test("interactive dictation runs between background chunks, never during another decode", async () => {
  const events = [];
  let release;
  const q = new WhisperQueue();
  const first = q.run(
    () => {
      events.push("chunk1");
      return new Promise((r) => (release = r));
    },
    { priority: "background" }
  );
  await tick();
  const background = q.run(() => events.push("chunk2"), { priority: "background" });
  const live = q.run(() => events.push("dictation"));
  assert.deepEqual(events, ["chunk1"]);
  release();
  await Promise.all([first, background, live]);
  assert.deepEqual(events, ["chunk1", "dictation", "chunk2"]);
});
test("cancelled queued uploads never start and a failed operation does not block the queue", async () => {
  let release;
  const q = new WhisperQueue();
  const first = q.run(() => new Promise((r) => (release = r)));
  await tick();
  const controller = new AbortController();
  let started = false;
  const cancelled = q.run(
    () => {
      started = true;
    },
    { signal: controller.signal }
  );
  const rejection = assert.rejects(cancelled, { name: "AbortError" });
  controller.abort();
  await rejection;
  release();
  await first;
  assert.equal(started, false);
  await assert.rejects(
    q.run(() => {
      throw Error("failed");
    }),
    /failed/
  );
  assert.equal(await q.run(() => 42), 42);
});
