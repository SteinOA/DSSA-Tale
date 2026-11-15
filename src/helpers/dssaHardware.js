const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  crypto = require("crypto");
const { execFile } = require("child_process");
const GiB = 1024 ** 3;

function cpuVendor(name) {
  return /AMD|Ryzen|EPYC/i.test(name)
    ? "AMD"
    : /Intel/i.test(name)
      ? "Intel"
      : /ARM|Snapdragon/i.test(name)
        ? "ARM"
        : "Other";
}
function memoryPolicy(
  totalBytes = os.totalmem(),
  availableBytes = os.freemem(),
  logicalCpus = os.availableParallelism?.() || os.cpus().length
) {
  const total = Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : 4 * GiB;
  const available = Math.max(
    0,
    Math.min(total, Number.isFinite(availableBytes) ? availableBytes : total / 4)
  );
  const reserveBytes = Math.max(GiB, Math.min(4 * GiB, total * 0.15));
  const budgetBytes = Math.max(0, available - reserveBytes);
  const tier =
    total < 12 * GiB || budgetBytes < 4 * GiB
      ? "compact"
      : total < 24 * GiB || budgetBytes < 8 * GiB
        ? "balanced"
        : "powerful";
  const logical = Math.max(1, Number.isSafeInteger(logicalCpus) ? logicalCpus : 1);
  return {
    totalBytes: total,
    availableBytes: available,
    reserveBytes,
    budgetBytes,
    tier,
    cpuThreads: Math.max(
      1,
      Math.min(tier === "compact" ? 2 : tier === "balanced" ? 4 : 8, Math.floor(logical / 2) || 1)
    ),
    alignmentWindowSeconds: tier === "compact" ? 10 : tier === "balanced" ? 20 : 30,
  };
}
function modelRecommendations(snapshot, registry) {
  const usable = snapshot.adapters.filter((g) => !g.software);
  const gpu = [...usable].sort((a, b) => b.dedicatedBytes - a.dedicatedBytes)[0];
  const vram = gpu?.dedicatedBytes || 0,
    budget = snapshot.policy.budgetBytes;
  const quantized = registry.whisperModels["nb-large"],
    full = registry.whisperModels["nb-large-full"];
  const fullFits = budget >= full.expectedSizeBytes * 2 + GiB && vram >= 6 * GiB;
  const speech = {
    recommended: fullFits ? "nb-large-full" : "nb-large",
    quantizedBytes: quantized.expectedSizeBytes,
    fullBytes: full.expectedSizeBytes,
    fullFits,
    quantizedFits: budget >= quantized.expectedSizeBytes * 2 + GiB,
  };
  const wanted = ["qwen3.5-2b-q4_k_m", "qwen3.5-4b-q4_k_m", "qwen3.5-9b-q4_k_m"];
  const models = registry.localProviders.flatMap((p) => p.models);
  const languageModels = wanted
    .map((id) => models.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => ({
      id: m.id,
      name: m.name,
      sizeBytes: m.sizeBytes,
      estimatedRamBytes: Math.ceil(m.sizeBytes * 1.5 + GiB),
      fitsRam: m.sizeBytes * 1.5 + GiB <= budget,
      fitsGpu: m.sizeBytes + GiB <= vram * 0.8,
      cleanupCheck: require("../config/dssaCleanupChecks.json").models[m.id] || null,
    }));
  const suitable = languageModels.filter((m) => m.fitsRam);
  const preferred = [...suitable].reverse().find((m) => m.fitsGpu) || suitable[0];
  return {
    speech,
    languageModels,
    recommendedLanguageModel: preferred?.id || null,
    alignmentMode: budget >= 9 * GiB && vram >= 10 * GiB ? "precise" : "fast",
    suggestedBackend: usable.some((g) => g.vendor === "NVIDIA")
      ? "cuda"
      : usable.some((g) => g.vendor === "AMD" || g.vendor === "Intel")
        ? "vulkan"
        : "cpu",
  };
}
async function detectAdapters() {
  if (process.platform !== "win32") return [];
  const probe = [
    process.resourcesPath && path.join(process.resourcesPath, "bin/dssa-resource-probe.exe"),
    path.join(__dirname, "../../resources/bin/dssa-resource-probe.exe"),
  ]
    .filter(Boolean)
    .find((p) => fs.existsSync(p));
  if (!probe) return [];
  return new Promise((resolve) =>
    execFile(
      probe,
      ["--hardware"],
      { windowsHide: true, timeout: 4000, encoding: "utf8", maxBuffer: 65536 },
      (error, stdout) => {
        try {
          if (error) return resolve([]);
          const rows = JSON.parse(stdout).adapters;
          if (!Array.isArray(rows)) return resolve([]);
          resolve(
            rows
              .filter(
                (g) =>
                  typeof g.name === "string" &&
                  g.name.length <= 256 &&
                  ["NVIDIA", "AMD", "Intel", "Other"].includes(g.vendor) &&
                  Number.isFinite(g.dedicatedBytes) &&
                  g.dedicatedBytes >= 0 &&
                  Number.isFinite(g.sharedBytes) &&
                  g.sharedBytes >= 0 &&
                  typeof g.software === "boolean"
              )
              .slice(0, 32)
          );
        } catch {
          resolve([]);
        }
      }
    )
  );
}
class HardwareAdvisor {
  constructor(
    profile,
    {
      detect = detectAdapters,
      memory = memoryPolicy,
      cpu = () => ({
        model: os.cpus()[0]?.model || "Unknown",
        logicalCpus: os.availableParallelism?.() || os.cpus().length,
      }),
      registry = require("../models/modelRegistryData.json"),
    } = {}
  ) {
    Object.assign(this, { profile, detect, memory, cpu, registry });
    this.adapters = null;
    this.pending = null;
  }
  async snapshot(refresh = false) {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      if (this.adapters === null || refresh) this.adapters = await this.detect();
      const cpu = this.cpu(),
        policy = this.memory();
      const result = {
        version: 1,
        checkedAt: Date.now(),
        cpu: { ...cpu, vendor: cpuVendor(cpu.model) },
        adapters: this.adapters,
        policy,
      };
      result.fingerprint = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            cpu: result.cpu,
            totalBytes: policy.totalBytes,
            adapters: this.adapters,
          })
        )
        .digest("hex");
      result.recommendations = modelRecommendations(result, this.registry);
      try {
        const file = path.join(this.profile, "dssa-hardware-profile.json");
        const temp = file + ".tmp";
        fs.mkdirSync(this.profile, { recursive: true });
        fs.writeFileSync(temp, JSON.stringify(result, null, 2));
        fs.renameSync(temp, file);
        result.persisted = true;
      } catch {
        result.persisted = false;
      }
      return result;
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }
}
module.exports = {
  GiB,
  cpuVendor,
  memoryPolicy,
  modelRecommendations,
  detectAdapters,
  HardwareAdvisor,
};
