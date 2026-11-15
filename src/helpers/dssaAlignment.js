const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { killProcess } = require("../utils/process");
const { createAbortError } = require("./abortError");

const baseLanguage = (language) =>
  language === "nn" ? "nn" : ["nb", "no"].includes(language) ? "nb" : null;
const GPU_FALLBACK_REASONS = new Set([
  "cuda-unavailable",
  "insufficient-vram",
  "gpu-initialization-failed",
  "gpu-memory-error",
  "gpu-execution-error",
]);
function executionInfo(value) {
  return {
    ...(Number.isSafeInteger(value?.cpuThreads) && value.cpuThreads >= 1 && value.cpuThreads <= 64
      ? { cpuThreads: value.cpuThreads }
      : {}),
    ...(value?.resourceWarning === "memory-pressure" ? { resourceWarning: "memory-pressure" } : {}),
    ...(["cpu", "cuda"].includes(value?.device) ? { device: value.device } : {}),
    ...(GPU_FALLBACK_REASONS.has(value?.gpuFallbackReason)
      ? { gpuFallbackReason: value.gpuFallbackReason }
      : {}),
  };
}
function readAlignmentConfig(profile) {
  try {
    const file = path.join(profile, "dssa-alignment-engine.json");
    if (fs.statSync(file).size > 16384) return null;
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      config.enabled !== true ||
      !path.isAbsolute(config.pythonPath) ||
      !/^python(?:\.exe)?$/i.test(path.basename(config.pythonPath)) ||
      !fs.statSync(config.pythonPath).isFile() ||
      !path.isAbsolute(config.nltkPath) ||
      !fs.statSync(config.nltkPath).isDirectory()
    )
      return null;
    const models = {};
    for (const mode of ["fast", "precise"]) {
      models[mode] = {};
      for (const language of ["nb", "nn"]) {
        const folder = config.models?.[mode]?.[language];
        if (
          typeof folder === "string" &&
          path.isAbsolute(folder) &&
          fs.statSync(path.join(folder, "dssa-alignment-manifest.json")).isFile()
        )
          models[mode][language] = folder;
      }
    }
    const device = config.device || "auto";
    if (!["auto", "cuda", "cpu"].includes(device)) return null;
    return { pythonPath: config.pythonPath, nltkPath: config.nltkPath, models, device };
  } catch {
    return null;
  }
}

function planAlignment(segments, duration, windowSeconds = 30) {
  if (![10, 20, 30].includes(windowSeconds)) throw Error("Invalid alignment window size");
  if (!Array.isArray(segments) || !segments.length || segments.length > 10000)
    throw Error("Invalid alignment input");
  const groups = [];
  let characters = 0;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (
      !segment ||
      typeof segment.text !== "string" ||
      !segment.text.trim() ||
      !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.end) ||
      segment.start < 0 ||
      segment.end < segment.start ||
      segment.end > duration + 0.001 ||
      segment.end - segment.start > 44
    )
      throw Error("Invalid alignment source clock");
    characters += segment.text.length;
    if (characters > 2000000) throw Error("Alignment transcript exceeds size limit");
    const prior = groups.at(-1);
    // Real source windows, bounded context and no artificial word clocks.
    if (
      prior &&
      Math.max(segment.end, prior.end) - Math.min(segment.start, prior.start) <= windowSeconds &&
      segment.start - prior.end <= 1.5
    ) {
      prior.start = Math.min(prior.start, segment.start);
      prior.end = Math.max(prior.end, segment.end);
      prior.text += " " + segment.text;
      prior.indices.push(index);
    } else
      groups.push({ start: segment.start, end: segment.end, text: segment.text, indices: [index] });
  }
  return groups.map((group) => ({
    ...group,
    start: Math.max(0, group.start - 0.15),
    end: Math.min(duration, group.end + 0.15),
  }));
}

function validateAlignmentResult(result, groups, original, duration) {
  if (
    result?.success !== true ||
    !Array.isArray(result.segments) ||
    result.segments.length !== groups.length
  )
    throw Error("Incomplete alignment result");
  let applied = 0;
  const segments = groups.flatMap((group, index) => {
    const item = result.segments[index];
    if (!item || item.text !== group.text || item.start !== group.start || item.end !== group.end)
      throw Error("Alignment changed source text or windows");
    if (item.alignmentStatus !== "ctc-aligned") return group.indices.map((i) => original[i]);
    const words = item.words;
    if (
      !Array.isArray(words) ||
      words.length !== group.text.trim().split(/\s+/).length ||
      words.map((w) => w?.text).join(" ") !== group.text.trim().split(/\s+/).join(" ")
    )
      throw Error("Alignment changed words");
    let last = -1;
    for (const word of words) {
      if (
        !word ||
        !Number.isFinite(word.start) ||
        !Number.isFinite(word.end) ||
        word.start < last ||
        word.start < group.start - 0.001 ||
        word.end > group.end + 0.001 ||
        word.end <= word.start ||
        word.end > duration + 0.001 ||
        !Number.isFinite(word.alignmentScore) ||
        word.alignmentScore < 0 ||
        word.alignmentScore > 1
      )
        throw Error("Invalid aligned word clock");
      last = word.start;
    }
    applied++;
    return [
      { text: group.text, start: words[0].start, end: Math.max(...words.map((w) => w.end)), words },
    ];
  });
  if (
    segments
      .map((s) => s.text)
      .join(" ")
      .trim()
      .split(/\s+/)
      .join(" ") !==
    original
      .map((s) => s.text)
      .join(" ")
      .trim()
      .split(/\s+/)
      .join(" ")
  )
    throw Error("Alignment lost transcript words");
  return { segments, applied, fallback: groups.length - applied, groups: groups.length };
}

function recoverAlignmentPrefix(partial, groups) {
  if (
    partial?.success !== true ||
    !Array.isArray(partial.segments) ||
    !partial.segments.length ||
    partial.segments.length > groups.length
  )
    throw Error("No recoverable alignment checkpoint");
  return {
    success: true,
    segments: [
      ...partial.segments,
      ...groups.slice(partial.segments.length).map(({ text, start, end }) => ({
        text,
        start,
        end,
        alignmentStatus: "original-preserved",
      })),
    ],
  };
}

async function runAlignment(
  config,
  audioPath,
  original,
  {
    language,
    mode,
    duration,
    scriptPath,
    signal,
    onProgress = () => {},
    onSpawn = () => {},
    onClose = () => {},
    workspace,
  } = {}
) {
  if (signal?.aborted) throw createAbortError("Tidsjusteringen er avbrutt");
  const lang = baseLanguage(language);
  const modelPath = config?.models?.[mode]?.[lang];
  if (!lang || !modelPath || !["fast", "precise"].includes(mode))
    throw Error("Alignment model unavailable");
  const groups = planAlignment(
    original,
    duration,
    require("./dssaHardware").memoryPolicy().alignmentWindowSeconds
  );
  const root = workspace ? fs.realpathSync(workspace.folder) : fs.realpathSync(os.tmpdir());
  // Workspace is created by ImportJobs in the main process, never supplied as a
  // renderer path. The manifest and source windows invalidate stale checkpoints.
  const checkpointKey = require("./dssaFileCheckpoint").configurationHash({
    source: workspace?.key || null,
    language: lang,
    mode,
    groups,
    manifest: workspace
      ? JSON.parse(fs.readFileSync(path.join(modelPath, "dssa-alignment-manifest.json"), "utf8"))
      : null,
    implementation: 2,
  });
  const folder = workspace
    ? path.join(root, checkpointKey)
    : fs.mkdtempSync(path.join(root, "dssa-alignment-"));
  if (workspace) {
    if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink())
      throw Error("Unsafe alignment workspace");
    fs.mkdirSync(folder, { recursive: true });
  }
  const request = path.join(folder, "request.json"),
    output = path.join(folder, "result.json"),
    progress = path.join(folder, "progress.json"),
    checkpoint = path.join(folder, "checkpoint.json");
  fs.writeFileSync(
    request,
    JSON.stringify({
      language: lang,
      modelPath,
      audioPath,
      nltkPath: config.nltkPath,
      device: config.device || "auto",
      segments: groups.map(({ start, end, text }) => ({ start, end, text })),
      progressPath: progress,
      checkpointPath: checkpoint,
      checkpointKey,
    }),
    { mode: 0o600 }
  );
  // A result from an earlier process must never mask a failed new invocation.
  for (const file of [output, progress]) if (fs.existsSync(file)) fs.unlinkSync(file);
  try {
    const started = Date.now();
    let failedWorker = false;
    await new Promise((resolve, reject) => {
      const child = spawn(
        config.pythonPath,
        [scriptPath, "--request", request, "--result", output],
        {
          windowsHide: true,
          stdio: "ignore",
          env: {
            ...process.env,
            HF_HUB_OFFLINE: "1",
            HF_HUB_DISABLE_TELEMETRY: "1",
            HF_HUB_DISABLE_IMPLICIT_TOKEN: "1",
          },
        }
      );
      let failure;
      const abort = () => {
        failure = createAbortError("Tidsjusteringen er avbrutt");
        killProcess(child, "SIGKILL");
      };
      const timer = setTimeout(
        () => {
          failure = Error("Alignment deadline exceeded");
          killProcess(child, "SIGKILL");
        },
        90 * 60 * 1000
      );
      let completed = -1;
      let executionSignature = "";
      const poll = setInterval(() => {
        try {
          if (fs.statSync(progress).size > 4096) return;
          const value = JSON.parse(fs.readFileSync(progress, "utf8"));
          if (
            Number.isInteger(value.completed) &&
            value.completed >= 0 &&
            value.completed >= completed &&
            value.completed <= groups.length &&
            value.total === groups.length &&
            (value.completed > completed ||
              JSON.stringify(executionInfo(value)) !== executionSignature)
          ) {
            completed = value.completed;
            executionSignature = JSON.stringify(executionInfo(value));
            onProgress({
              ...executionInfo(value),
              stage: "alignment",
              chunksTotal: groups.length,
              chunksCompleted: completed,
              ...(Number.isSafeInteger(value.resumedSegments) &&
              value.resumedSegments >= 0 &&
              value.resumedSegments <= completed
                ? { resumedChunks: value.resumedSegments }
                : {}),
              processingElapsedSeconds: (Date.now() - started) / 1000,
              audioDurationSeconds: duration,
              audioProcessedSeconds: completed ? groups[completed - 1].end : 0,
            });
          }
        } catch {
          /* An atomic progress file may not exist yet. */
        }
      }, 1000);
      child.once("error", (error) => {
        failure = error;
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        clearInterval(poll);
        signal?.removeEventListener("abort", abort);
        onClose(child);
        if (failure) reject(failure);
        else if (code !== 0) {
          failedWorker = true;
          resolve();
        } else resolve();
      });
      onSpawn(child);
      signal?.addEventListener("abort", abort, { once: true });
      onProgress({
        stage: "alignment",
        chunksTotal: groups.length,
        chunksCompleted: 0,
        audioDurationSeconds: duration,
        audioProcessedSeconds: 0,
      });
      if (signal?.aborted) abort();
    });
    if (signal?.aborted) throw createAbortError("Tidsjusteringen er avbrutt");
    const resultPath = failedWorker ? checkpoint : output;
    if (fs.statSync(resultPath).size > 64 * 1024 * 1024) throw Error("Alignment result too large");
    const raw = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    if (raw?.success === false && raw.code === "INSUFFICIENT_RAM") {
      const error = Error("Not enough available RAM for optional alignment");
      error.code = "INSUFFICIENT_RAM";
      throw error;
    }
    return {
      ...validateAlignmentResult(
        failedWorker ? recoverAlignmentPrefix(raw, groups) : raw,
        groups,
        original,
        duration
      ),
      recovered: failedWorker,
      ...executionInfo(raw),
    };
  } finally {
    if (!workspace && path.dirname(folder) === root && fs.realpathSync(folder) === folder)
      fs.rmSync(folder, { recursive: true, force: true });
  }
}

module.exports = {
  baseLanguage,
  readAlignmentConfig,
  planAlignment,
  validateAlignmentResult,
  recoverAlignmentPrefix,
  runAlignment,
  executionInfo,
};
