const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fitLiveTranscriptWindowToWorkArea,
  fitAssistantWindowToWorkArea,
} = require("../../src/helpers/windowConfig");

test("live transcript is wide and compact for both short and arbitrarily long text", () => {
  const area = { width: 1440, height: 860 };
  assert.deepEqual(fitLiveTranscriptWindowToWorkArea(20, area), { width: 624, height: 100 });
  assert.deepEqual(fitLiveTranscriptWindowToWorkArea(10000, area), { width: 624, height: 120 });
  assert.deepEqual(fitAssistantWindowToWorkArea({ width: 466, height: 562 }, area), {
    width: 466,
    height: 562,
  });
});

test("compact transcript stays within small work areas", () => {
  for (const area of [
    { width: 360, height: 90 },
    { width: 20, height: 20 },
  ]) {
    const size = fitLiveTranscriptWindowToWorkArea(10000, area);
    assert.ok(size.width > 0 && size.width <= area.width);
    assert.ok(size.height > 0 && size.height <= area.height);
  }
});

test("invalid content heights fall back to the compact minimum", () => {
  assert.deepEqual(fitLiveTranscriptWindowToWorkArea(NaN, { width: 1440, height: 860 }), {
    width: 624,
    height: 100,
  });
});
