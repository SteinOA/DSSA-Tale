const test = require("node:test");
const assert = require("node:assert/strict");
test("countdown advances between progress events without claiming completion", async () => {
  const { importTiming, formatImportClock } = await import("../../src/utils/dssaImportTiming.ts");
  const progress = {
    chunksTotal: 10,
    chunksCompleted: 2,
    audioDurationSeconds: 285,
    audioProcessedSeconds: 60,
    processingElapsedSeconds: 10,
    receivedAt: 10000,
  };
  assert.equal(importTiming(progress, 10000).estimatedRemainingSeconds, 40);
  assert.equal(importTiming(progress, 15000).estimatedRemainingSeconds, 35);
  assert.equal(importTiming(progress, 51000).estimatedRemainingSeconds, null);
  assert.equal(importTiming(progress, 15000).audioRemainingSeconds, 225);
  assert.equal(formatImportClock(6942.752), "1:55:43");
});
test("resumed chunks do not create a fabricated speed or ETA for speaker processing", async () => {
  const { importTiming } = await import("../../src/utils/dssaImportTiming.ts");
  assert.equal(
    importTiming(
      { chunksTotal: 10, chunksCompleted: 8, resumedChunks: 8, processingElapsedSeconds: 1 },
      0
    ).estimatedRemainingSeconds,
    null
  );
  assert.equal(
    importTiming(
      {
        chunksTotal: 10,
        chunksCompleted: 9,
        resumedChunks: 7,
        processingElapsedSeconds: 12,
        receivedAt: 0,
      },
      0
    ).estimatedRemainingSeconds,
    6
  );
  assert.equal(
    importTiming({ chunksTotal: 10, chunksCompleted: 10, processingElapsedSeconds: 60 }, 0)
      .estimatedRemainingSeconds,
    null
  );
  assert.equal(importTiming(null, 0, NaN).totalSeconds, null);
});
