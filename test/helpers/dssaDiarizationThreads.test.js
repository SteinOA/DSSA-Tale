const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveDiarizationThreads } = require("../../src/helpers/dssaDiarizationThreads");

test("diarization leaves CPU capacity for dictation and caps inference parallelism", () => {
  assert.equal(resolveDiarizationThreads(undefined, 16), 4);
  assert.equal(resolveDiarizationThreads(undefined, 4), 2);
  assert.equal(resolveDiarizationThreads(undefined, 2), 1);
  assert.equal(resolveDiarizationThreads(1000, 16), 4);
  assert.equal(resolveDiarizationThreads(1, 16), 1);
  assert.equal(resolveDiarizationThreads(undefined, 0), 1);
});
