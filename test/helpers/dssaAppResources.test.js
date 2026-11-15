const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  appProcessUsage,
  windowsProcessSnapshot,
  appGpuUsage,
} = require("../../src/helpers/dssaAppResources");
const row = (pid, parentPid, cpuMs, ramBytes, startedAt = 1) => ({
  pid,
  parentPid,
  cpuMs,
  ramBytes,
  startedAt,
});
test("app counters include renderer and nested native workers but exclude other applications", () => {
  const initial = appProcessUsage(
    [row(1, 0, 100, 100), row(2, 1, 200, 200), row(3, 2, 500, 300), row(4, 0, 90000, 99999)],
    1,
    null,
    1000,
    4
  );
  assert.equal(initial.ramUsedBytes, 600);
  assert.equal(initial.processCount, 3);
  assert.equal(initial.cpuPercent, null);
  const next = appProcessUsage(
    [row(1, 0, 200, 110), row(2, 1, 300, 210), row(3, 2, 1300, 310), row(4, 0, 99000, 99999)],
    1,
    initial,
    2000,
    4
  );
  assert.equal(next.cpuPercent, 25);
  assert.equal(next.ramUsedBytes, 630);
});
test("new children contribute CPU since birth; exited workers and reused PIDs never create negative or phantom load", () => {
  const initial = appProcessUsage([row(1, 0, 100, 100), row(2, 1, 10000, 200)], 1, null, 1000, 4);
  const next = appProcessUsage(
    [row(1, 0, 200, 100), row(2, 1, 300, 200, 1200)],
    1,
    initial,
    2000,
    4
  );
  assert.equal(next.cpuPercent, 10);
  const exited = appProcessUsage([row(1, 0, 300, 100)], 1, next, 3000, 4);
  assert.equal(exited.cpuPercent, 2.5);
  assert.equal(
    appProcessUsage([row(1, 0, 300, 100), row(3, 1, 99999, 99999, 0)], 1, exited, 4000, 4)
      .processCount,
    1
  );
});
test("unavailable process data stay unknown instead of masquerading as system memory or zero CPU", () => {
  assert.equal(appProcessUsage([], 1, null, 1000, 4), null);
  assert.equal(appProcessUsage([row(1, 0, NaN, 100)], 1, null, 1000, 4), null);
  assert.equal(appProcessUsage([row(1, 0, 100, 100)], 1, null, 1000, 4).cpuPercent, null);
  assert.equal(appProcessUsage("invalid", 1, null, 1000, 4), null);
});
test("sampler rejects untrusted root process values before spawning a helper", async () => {
  await assert.rejects(windowsProcessSnapshot("1; echo injected"), /Invalid process/);
});
test("app GPU excludes other applications, deduplicates rows and takes the busiest engine", () => {
  const a = { pid: 1, engine: "gpu0_engine0", percent: 40 };
  const result = appGpuUsage(
    {
      engines: [
        a,
        a,
        { pid: 2, engine: "gpu0_engine0", percent: 10 },
        { pid: 1, engine: "gpu0_copy", percent: 20 },
        { pid: 9, engine: "gpu0_engine0", percent: 100 },
      ],
      memory: [
        { pid: 1, adapter: "gpu0", dedicatedBytes: 100, sharedBytes: 10 },
        { pid: 2, adapter: "gpu0", dedicatedBytes: 200, sharedBytes: 20 },
        { pid: 9, adapter: "gpu0", dedicatedBytes: 99999, sharedBytes: 99999 },
      ],
    },
    [1, 2]
  );
  assert.deepEqual(result, { percent: 50, dedicatedBytes: 300, sharedBytes: 30 });
  assert.equal(appGpuUsage({ engines: [], memory: [] }, [1]), null);
  assert.deepEqual(appGpuUsage({ engines: [a], memory: [] }, [1]), {
    percent: 40,
    dedicatedBytes: null,
    sharedBytes: null,
  });
});
