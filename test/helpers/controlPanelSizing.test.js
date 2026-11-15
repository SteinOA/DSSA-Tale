const test = require("node:test");
const assert = require("node:assert/strict");
const { fitControlPanelToWorkArea } = require("../../src/helpers/windowConfig");

test("normal start size fits logical work areas across resolutions, scaling and monitors", () => {
  for (const [width, height] of [
    [1280, 680],
    [1536, 820],
    [1920, 1040],
    [2560, 1400],
    [3440, 1400],
    [3840, 2120],
    [1080, 1880],
    [640, 440],
  ]) {
    const work = { x: -width, y: 40, width, height };
    const fitted = fitControlPanelToWorkArea(work);
    assert.ok(fitted.width <= 1000 && fitted.width <= width * 0.8);
    assert.ok(fitted.height <= 800 && fitted.height <= height * 0.9);
    assert.ok(fitted.x >= work.x && fitted.x + fitted.width <= work.x + width);
    assert.ok(fitted.y >= work.y && fitted.y + fitted.height <= work.y + height);
  }
  assert.equal(fitControlPanelToWorkArea({ x: 0, y: 0, width: 1920, height: 1040 }).width, 1000);
  // A 4K display scaled to 200% has the same logical area as 1080p at 100%.
  assert.deepEqual(fitControlPanelToWorkArea({ x: 0, y: 0, width: 1920, height: 1040 }), {
    x: 460,
    y: 120,
    width: 1000,
    height: 800,
  });
});
