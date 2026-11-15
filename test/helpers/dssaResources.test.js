const test = require("node:test");
const assert = require("node:assert/strict");
const { cpuPercent, parseGpu, ResourceMonitor } = require("../../src/helpers/dssaResources");
test("CPU percentages use elapsed counters and unknown samples remain unknown", () => {
  assert.equal(cpuPercent(null, { idle: 10, total: 20 }), null);
  assert.equal(cpuPercent({ idle: 100, total: 200 }, { idle: 150, total: 400 }), 75);
  assert.equal(cpuPercent({ idle: 100, total: 200 }, { idle: 100, total: 200 }), null);
});
test("GPU measurements distinguish utilization and VRAM and reject unavailable values", () => {
  assert.deepEqual(parseGpu("34, 2048, 8192, NVIDIA GeForce RTX 2070\n"), {
    percent: 34,
    usedBytes: 2147483648,
    totalBytes: 8589934592,
    name: "NVIDIA GeForce RTX 2070",
  });
  assert.equal(parseGpu("N/A, N/A, N/A, NVIDIA"), null);
  assert.equal(parseGpu(""), null);
});
test("concurrent and frequent requests share a sample; GPU failure keeps CPU and RAM available", async () => {
  let now = 10000,
    calls = 0,
    finish;
  const monitor = new ResourceMonitor({
    now: () => now,
    processes: async () => [],
    cpus: () => [{ times: { idle: 100, total: 100 } }],
    totalmem: () => 16000,
    freemem: () => 4000,
    gpu: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const first = monitor.sample(),
    second = monitor.sample();
  await Promise.resolve();
  await Promise.resolve();
  finish(null);
  const result = await first;
  assert.equal(await second, result);
  assert.equal(calls, 1);
  assert.equal(result.ramUsedBytes, 12000);
  assert.equal(result.gpu, null);
  assert.equal(await monitor.sample(), result);
  assert.equal(calls, 1);
  now += 3000;
  monitor.gpu = async () => {
    throw Error("GPU unavailable");
  };
  const next = await monitor.sample();
  assert.equal(next.gpu, null);
  assert.equal(next.ramTotalBytes, 16000);
});
test("app GPU remains available when PC GPU discovery fails", async () => {
  const monitor = new ResourceMonitor({
    rootPid: 1,
    processes: async () => [{ pid: 1, parentPid: 0, startedAt: 1, cpuMs: 0, ramBytes: 100 }],
    gpu: async () => {
      throw Error("No NVIDIA utility");
    },
    appGpu: async () => ({ percent: 35, dedicatedBytes: 200, sharedBytes: 10 }),
  });
  const result = await monitor.sample();
  assert.equal(result.gpu, null);
  assert.equal(result.app.gpu.percent, 35);
});
