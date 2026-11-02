const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

// Only counters and process ancestry are collected; no command lines or credentials.
function windowsProcessSnapshot(rootPid) {
  if (!Number.isSafeInteger(rootPid) || rootPid < 1)
    return Promise.reject(Error("Invalid process ID"));
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, "bin", "dssa-resource-probe.exe"),
    path.join(__dirname, "..", "..", "resources", "bin", "dssa-resource-probe.exe"),
  ].filter(Boolean);
  const native = candidates.find((file) => fs.existsSync(file));
  if (native)
    return new Promise((resolve, reject) =>
      execFile(
        native,
        [String(rootPid)],
        { windowsHide: true, timeout: 2500, maxBuffer: 1024 * 1024, encoding: "utf8" },
        (error, stdout) => {
          if (error) return reject(error);
          try {
            resolve(JSON.parse(stdout));
          } catch (error) {
            reject(error);
          }
        }
      )
    );
  const script = `$ErrorActionPreference='Stop'
$rows=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate)
$selected=@{}; $root=$rows | Where-Object { $_.ProcessId -eq ${rootPid} } | Select-Object -First 1
if (!$root) { throw 'App process unavailable' }
$selected[[int]$root.ProcessId]=$root
$added=$true
while($added) {
 $added=$false
 foreach($row in $rows) {
  $parent=$selected[[int]$row.ParentProcessId]
  if (!$selected.ContainsKey([int]$row.ProcessId) -and $parent -and $row.CreationDate -ge $parent.CreationDate) {
   $selected[[int]$row.ProcessId]=$row; $added=$true
  }
 }
}
$result=@(foreach($row in $selected.Values) {
 try {
  $p=Get-Process -Id $row.ProcessId -ErrorAction Stop
  [pscustomobject]@{pid=[int]$row.ProcessId; parentPid=[int]$row.ParentProcessId; startedAt=([DateTimeOffset]$row.CreationDate).ToUnixTimeMilliseconds(); cpuMs=$p.TotalProcessorTime.TotalMilliseconds; ramBytes=$p.WorkingSet64}
 } catch {}
})
ConvertTo-Json -InputObject $result -Compress`;
  const executable = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
  return new Promise((resolve, reject) =>
    execFile(
      executable,
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      { windowsHide: true, timeout: 4500, maxBuffer: 1024 * 1024, encoding: "utf8" },
      (error, stdout) => {
        if (error) return reject(error);
        try {
          const rows = JSON.parse(stdout.replace(/^\uFEFF/u, ""));
          resolve(Array.isArray(rows) ? rows : [rows]);
        } catch (error) {
          reject(error);
        }
      }
    )
  );
}

function appProcessUsage(rows, rootPid, previous, sampledAt, logicalCpus) {
  if (!Array.isArray(rows)) return null;
  const valid = rows.filter(
    (row) =>
      Number.isSafeInteger(row.pid) &&
      row.pid > 0 &&
      Number.isFinite(row.startedAt) &&
      Number.isFinite(row.cpuMs) &&
      row.cpuMs >= 0 &&
      Number.isFinite(row.ramBytes) &&
      row.ramBytes >= 0
  );
  const root = valid.find((row) => row.pid === rootPid);
  if (!root) return null;
  const selected = new Map([[root.pid, root]]);
  let added = true;
  while (added) {
    added = false;
    for (const row of valid) {
      const parent = selected.get(row.parentPid);
      if (!selected.has(row.pid) && parent && row.startedAt >= parent.startedAt) {
        selected.set(row.pid, row);
        added = true;
      }
    }
  }
  const processes = [...selected.values()];
  let cpuPercent = null;
  if (
    previous &&
    sampledAt > previous.sampledAt &&
    Number.isFinite(logicalCpus) &&
    logicalCpus > 0
  ) {
    let elapsedCpu = 0;
    const old = new Map(previous.processes.map((row) => [`${row.pid}:${row.startedAt}`, row]));
    for (const row of processes) {
      const before = old.get(`${row.pid}:${row.startedAt}`);
      if (before) elapsedCpu += Math.max(0, row.cpuMs - before.cpuMs);
      else if (row.startedAt >= previous.sampledAt) elapsedCpu += row.cpuMs;
    }
    cpuPercent = Math.max(
      0,
      Math.min(100, (elapsedCpu / (sampledAt - previous.sampledAt) / logicalCpus) * 100)
    );
  }
  return {
    cpuPercent,
    ramUsedBytes: processes.reduce((sum, row) => sum + row.ramBytes, 0),
    processCount: processes.length,
    sampledAt,
    processes,
  };
}
function appGpuUsage(snapshot, processIds) {
  if (!Array.isArray(snapshot?.engines) || !Array.isArray(snapshot?.memory)) return null;
  const allowed = new Set(processIds),
    engines = new Map(),
    memories = new Map(),
    seen = new Set();
  let validEngines = 0;
  for (const row of snapshot.engines) {
    if (
      !allowed.has(row.pid) ||
      typeof row.engine !== "string" ||
      !Number.isFinite(row.percent) ||
      row.percent < 0 ||
      row.percent > 100
    )
      continue;
    const key = `${row.pid}:${row.engine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    validEngines++;
    engines.set(row.engine, (engines.get(row.engine) || 0) + row.percent);
  }
  for (const row of snapshot.memory) {
    if (
      !allowed.has(row.pid) ||
      typeof row.adapter !== "string" ||
      !Number.isFinite(row.dedicatedBytes) ||
      row.dedicatedBytes < 0 ||
      !Number.isFinite(row.sharedBytes) ||
      row.sharedBytes < 0
    )
      continue;
    memories.set(`${row.pid}:${row.adapter}`, row);
  }
  if (!validEngines && !memories.size) return null;
  return {
    percent: validEngines ? Math.min(100, Math.max(...engines.values())) : null,
    dedicatedBytes: memories.size
      ? [...memories.values()].reduce((sum, row) => sum + row.dedicatedBytes, 0)
      : null,
    sharedBytes: memories.size
      ? [...memories.values()].reduce((sum, row) => sum + row.sharedBytes, 0)
      : null,
  };
}

let appGpuCache = null;
function windowsAppGpuSnapshot(processIds) {
  if (
    !Array.isArray(processIds) ||
    processIds.length > 512 ||
    processIds.some((id) => !Number.isSafeInteger(id) || id < 1)
  )
    return Promise.resolve(null);
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, "bin/dssa-resource-probe.exe"),
    path.join(__dirname, "../../resources/bin/dssa-resource-probe.exe"),
  ].filter(Boolean);
  const native = candidates.find((file) => fs.existsSync(file));
  if (!native || !processIds.length) return Promise.resolve(null);
  const key = [...processIds].sort((a, b) => a - b).join(",");
  if (appGpuCache?.key === key && Date.now() - appGpuCache.sampledAt < 15000)
    return appGpuCache.promise;
  const promise = new Promise((resolve) =>
    execFile(
      native,
      ["--gpu", key],
      { windowsHide: true, timeout: 4000, maxBuffer: 1024 * 1024, encoding: "utf8" },
      (error, stdout) => {
        if (error) return resolve(null);
        try {
          resolve(appGpuUsage(JSON.parse(stdout), processIds));
        } catch {
          resolve(null);
        }
      }
    )
  );
  appGpuCache = { key, sampledAt: Date.now(), promise };
  return promise;
}
module.exports = { windowsProcessSnapshot, appProcessUsage, appGpuUsage, windowsAppGpuSnapshot };
