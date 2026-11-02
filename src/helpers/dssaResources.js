const os = require("os");
const {
  windowsProcessSnapshot,
  appProcessUsage,
  windowsAppGpuSnapshot,
} = require("./dssaAppResources");
const { execFile } = require("child_process");

function cpuTimes(cpus) {
  return cpus.reduce(
    (sum, cpu) => ({
      idle: sum.idle + cpu.times.idle,
      total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
    }),
    { idle: 0, total: 0 }
  );
}
function cpuPercent(previous, current) {
  if (!previous || current.total <= previous.total) return null;
  return Math.max(
    0,
    Math.min(100, 100 * (1 - (current.idle - previous.idle) / (current.total - previous.total)))
  );
}
function parseGpu(csv) {
  const row = String(csv)
    .trim()
    .split(/\r?\n/)[0]
    ?.split(",")
    .map((s) => s.trim());
  if (!row || row.length < 4) return null;
  const [percent, used, total] = row.slice(0, 3).map(Number);
  if (
    ![percent, used, total].every(Number.isFinite) ||
    total <= 0 ||
    used < 0 ||
    percent < 0 ||
    percent > 100
  )
    return null;
  return {
    name: row.slice(3).join(", "),
    percent,
    usedBytes: used * 1048576,
    totalBytes: total * 1048576,
  };
}
async function gpuSample() {
  const resolved = await require("../utils/gpuDetection").resolveNvidiaSmiPath();
  if (!resolved) return null;
  return new Promise((resolve) =>
    execFile(
      resolved.smiPath,
      [
        "--query-gpu=utilization.gpu,memory.used,memory.total,name",
        "--format=csv,noheader,nounits",
      ],
      { windowsHide: true, timeout: 2500, encoding: "utf8" },
      (error, stdout) => resolve(error ? null : parseGpu(stdout))
    )
  );
}
class ResourceMonitor {
  constructor({
    cpus = os.cpus,
    freemem = os.freemem,
    totalmem = os.totalmem,
    gpu = gpuSample,
    appGpu = windowsAppGpuSnapshot,
    now = Date.now,
    processes = windowsProcessSnapshot,
    rootPid = process.pid,
  } = {}) {
    Object.assign(this, { cpus, freemem, totalmem, gpu, appGpu, now, processes, rootPid });
    this.previousApp = null;
    this.previous = null;
    this.cached = null;
    this.pending = null;
  }
  async sample() {
    if (this.cached && this.now() - this.cached.sampledAt < 2000) return this.cached;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const cpuList = this.cpus();
      const times = cpuTimes(cpuList),
        percent = cpuPercent(this.previous, times);
      this.previous = times;
      const total = this.totalmem(),
        free = this.freemem();
      let appUsage = null;
      try {
        appUsage = appProcessUsage(
          await this.processes(this.rootPid),
          this.rootPid,
          this.previousApp,
          this.now(),
          cpuList.length
        );
      } catch {}
      this.previousApp = appUsage;
      let gpu = null;
      let appGpu = null;
      try {
        const samples = await Promise.allSettled([
          this.gpu(),
          appUsage ? this.appGpu(appUsage.processes.map((row) => row.pid)) : null,
        ]);
        gpu = samples[0].status === "fulfilled" ? samples[0].value : null;
        appGpu = samples[1].status === "fulfilled" ? samples[1].value : null;
      } catch {}
      const result = {
        cpuPercent: percent,
        app: appUsage
          ? {
              cpuPercent: appUsage.cpuPercent,
              ramUsedBytes: appUsage.ramUsedBytes,
              processCount: appUsage.processCount,
              gpu: appGpu,
            }
          : null,
        ramUsedBytes: Math.max(0, total - free),
        ramTotalBytes: total,
        gpu,
        sampledAt: this.now(),
      };
      this.cached = result;
      return result;
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }
}
module.exports = { ResourceMonitor, cpuTimes, cpuPercent, parseGpu };
