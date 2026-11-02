const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  GiB,
  cpuVendor,
  memoryPolicy,
  modelRecommendations,
  HardwareAdvisor,
} = require("../../src/helpers/dssaHardware");
const registry = require("../../src/models/modelRegistryData.json");
test("memory policy leaves OS reserve, limits helper threads, and adapts windows", () => {
  for (const [total, free, cpus, tier, threads, seconds] of [
    [4, 3, 2, "compact", 1, 10],
    [8, 6, 8, "compact", 2, 10],
    [16, 12, 8, "balanced", 4, 20],
    [32, 24, 16, "powerful", 8, 30],
    [64, 3, 32, "compact", 2, 10],
  ]) {
    const p = memoryPolicy(total * GiB, free * GiB, cpus);
    assert.equal(p.tier, tier);
    assert.equal(p.cpuThreads, threads);
    assert.equal(p.alignmentWindowSeconds, seconds);
    assert.ok(p.budgetBytes <= free * GiB - GiB);
  }
  assert.equal(memoryPolicy(8 * GiB, -1, 1).budgetBytes, 0);
  assert.equal(memoryPolicy(NaN, NaN, NaN).cpuThreads, 1);
});
test("CPU vendors and multiple laptop GPUs are recognised without treating shared memory as VRAM", () => {
  for (const [name, vendor] of [
    ["AMD Ryzen 7", "AMD"],
    ["Intel Core", "Intel"],
    ["Snapdragon X", "ARM"],
    ["Unknown", "Other"],
  ])
    assert.equal(cpuVendor(name), vendor);
  const integrated = {
    name: "Intel Graphics",
    vendor: "Intel",
    dedicatedBytes: 128 * 1024 ** 2,
    sharedBytes: 32 * GiB,
    software: false,
  };
  const p = { adapters: [integrated], policy: memoryPolicy(32 * GiB, 24 * GiB, 16) };
  assert.equal(modelRecommendations(p, registry).speech.recommended, "nb-large");
  assert.ok(modelRecommendations(p, registry).languageModels.every((m) => !m.fitsGpu));
  p.adapters.push({
    name: "RTX",
    vendor: "NVIDIA",
    dedicatedBytes: 8 * GiB,
    sharedBytes: 16 * GiB,
    software: false,
  });
  const r = modelRecommendations(p, registry);
  assert.equal(r.suggestedBackend, "cuda");
  assert.equal(r.recommendedLanguageModel, "qwen3.5-4b-q4_k_m");
  assert.equal(r.speech.recommended, "nb-large-full");
  for (const vendor of ["AMD", "Intel"])
    assert.equal(
      modelRecommendations({ ...p, adapters: [{ ...integrated, vendor }] }, registry)
        .suggestedBackend,
      "vulkan"
    );
  assert.equal(modelRecommendations({ ...p, adapters: [] }, registry).suggestedBackend, "cpu");
  assert.equal(
    modelRecommendations(
      { ...p, adapters: [{ ...integrated, vendor: "NVIDIA", software: true }] },
      registry
    ).suggestedBackend,
    "cpu"
  );
});
test("a new app instance probes the current machine rather than trusting a transferred profile", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-hardware-test-"));
  try {
    fs.writeFileSync(
      path.join(dir, "dssa-hardware-profile.json"),
      JSON.stringify({ cpu: { model: "old" } })
    );
    fs.writeFileSync(path.join(dir, "selected-model.txt"), "keep-my-model");
    let calls = 0;
    const args = {
      detect: async () => {
        calls++;
        return [];
      },
      memory: () => memoryPolicy(16 * GiB, 12 * GiB, 8),
      cpu: () => ({ model: "AMD Ryzen", logicalCpus: 8 }),
    };
    const advisor = new HardwareAdvisor(dir, args),
      first = await advisor.snapshot();
    await advisor.snapshot();
    assert.equal(calls, 1);
    await advisor.snapshot(true);
    assert.equal(calls, 2);
    const next = await new HardwareAdvisor(dir, {
      ...args,
      cpu: () => ({ model: "Intel Core", logicalCpus: 4 }),
    }).snapshot();
    assert.notEqual(first.fingerprint, next.fingerprint);
    assert.equal(next.cpu.vendor, "Intel");
    assert.equal(fs.readFileSync(path.join(dir, "selected-model.txt"), "utf8"), "keep-my-model");
    assert.equal(/token|hostname|serial|password/i.test(JSON.stringify(next)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
