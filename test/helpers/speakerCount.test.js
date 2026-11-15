const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeStoredSpeakerCount } = require("../../src/helpers/speakerCount");
const {
  MAX_SPEAKER_COUNT,
  DEFAULT_EXPECTED_SPEAKER_COUNT,
} = require("../../src/constants/speakerDetection.json");

test("keeps a usable stored count", () => {
  assert.equal(normalizeStoredSpeakerCount(1), 1);
  assert.equal(normalizeStoredSpeakerCount(3), 3);
  assert.equal(normalizeStoredSpeakerCount(MAX_SPEAKER_COUNT), MAX_SPEAKER_COUNT);
});

test("a twelve-person meeting remains twelve rather than being silently clamped to eight", () => {
  assert.equal(DEFAULT_EXPECTED_SPEAKER_COUNT, 2, "two-person default is unchanged");
  assert.ok(MAX_SPEAKER_COUNT >= 12);
  assert.equal(normalizeStoredSpeakerCount(12), 12);
  assert.equal(normalizeStoredSpeakerCount("12"), 12);
});

test("clamps above the supported maximum", () => {
  assert.equal(normalizeStoredSpeakerCount(MAX_SPEAKER_COUNT + 5), MAX_SPEAKER_COUNT);
});
test("a fourteen-person meeting is not reduced to the old twelve-person limit", () => {
  assert.ok(MAX_SPEAKER_COUNT >= 14);
  assert.equal(normalizeStoredSpeakerCount(14), 14);
  assert.equal(normalizeStoredSpeakerCount("14"), 14);
});
test("the configured upper bound is fifteen", () => {
  assert.equal(MAX_SPEAKER_COUNT, 15);
  assert.equal(normalizeStoredSpeakerCount(15), 15);
  assert.equal(normalizeStoredSpeakerCount(16), 15);
});

test("rejects values the cloud can persist but the app cannot use", () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, -Infinity, null, undefined, "", {}]) {
    assert.equal(
      normalizeStoredSpeakerCount(value),
      null,
      `expected ${JSON.stringify(value)} to normalize to null`
    );
  }
});
