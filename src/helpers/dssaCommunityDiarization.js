const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createAbortError } = require("./abortError");
const { killProcess } = require("../utils/process");
const { MAX_SPEAKER_COUNT } = require("../constants/speakerDetection.json");

function readCommunityConfig(profile) {
  const file = path.join(profile, "dssa-community-engine.json");
  try {
    if (fs.statSync(file).size > 16384) return null;
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    if (config.enabled !== true || !["auto", "cuda", "cpu"].includes(config.device ?? "auto"))
      return null;
    if (
      typeof config.pythonPath !== "string" ||
      !path.isAbsolute(config.pythonPath) ||
      !/^python(?:\.exe)?$/i.test(path.basename(config.pythonPath)) ||
      !fs.statSync(config.pythonPath).isFile()
    )
      return null;
    if (
      typeof config.modelPath !== "string" ||
      !path.isAbsolute(config.modelPath) ||
      !fs.statSync(path.join(config.modelPath, "dssa-community-manifest.json")).isFile()
    )
      return null;
    return {
      pythonPath: config.pythonPath,
      modelPath: config.modelPath,
      device: config.device ?? "auto",
    };
  } catch {
    return null;
  }
}

function validateCommunityResult(result, maxSpeakers) {
  if (
    result?.success !== true ||
    result.engine !== "pyannote-community-1" ||
    !Number.isFinite(result.durationSeconds) ||
    result.durationSeconds <= 0 ||
    !Array.isArray(result.segments) ||
    !result.segments.length
  )
    throw Error("Community-1 ga ikke gyldig talerfordeling.");
  const labels = new Set();
  for (const segment of result.segments) {
    if (
      !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.end) ||
      segment.start < 0 ||
      segment.end <= segment.start ||
      segment.end > result.durationSeconds + 0.25 ||
      !/^speaker_\d+$/.test(segment.speaker)
    )
      throw Error("Community-1 ga ugyldige tidsstempler.");
    labels.add(segment.speaker);
  }
  if (labels.size > maxSpeakers) throw Error("Community-1 overskred talergrensen.");
  return result;
}

// A maximum is not a known count. Keep old saved caps working while allowing
// the caller to guide Community-1 with an explicit range or exact count.
function speakerConstraints({ maxSpeakers = MAX_SPEAKER_COUNT, minSpeakers, exactSpeakers } = {}) {
  for (const count of [maxSpeakers, minSpeakers, exactSpeakers]) {
    if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > MAX_SPEAKER_COUNT))
      throw Error("Ugyldig talerantall (1–15)");
  }
  if (minSpeakers !== undefined && minSpeakers > maxSpeakers)
    throw Error("Minste talerantall overstiger øvre grense");
  if (
    exactSpeakers !== undefined &&
    (exactSpeakers > maxSpeakers || (minSpeakers !== undefined && exactSpeakers < minSpeakers))
  )
    throw Error("Kjent talerantall er utenfor intervallet");
  return {
    maxSpeakers,
    ...(minSpeakers !== undefined ? { minSpeakers } : {}),
    ...(exactSpeakers !== undefined ? { exactSpeakers } : {}),
  };
}

async function runCommunityDiarization(
  config,
  audioPath,
  {
    signal,
    maxSpeakers = MAX_SPEAKER_COUNT,
    minSpeakers,
    exactSpeakers,
    scriptPath,
    onSpawn = () => {},
    onClose = () => {},
    workspace,
  } = {}
) {
  if (signal?.aborted) throw createAbortError("Talerfordelingen er avbrutt");
  const constraints = speakerConstraints({ maxSpeakers, minSpeakers, exactSpeakers });
  if (!scriptPath || !fs.existsSync(scriptPath)) throw Error("Community-1-programmet mangler");
  const root = fs.realpathSync(os.tmpdir());
  const folder = fs.mkdtempSync(path.join(root, "dssa-community-"));
  const request = path.join(folder, "request.json"),
    output = path.join(folder, "result.json");
  fs.writeFileSync(
    request,
    JSON.stringify({
      audioPath,
      modelPath: config.modelPath,
      ...constraints,
      device: config.device,
      ...(workspace ? { checkpointFolder: workspace.folder, checkpointKey: workspace.key } : {}),
    }),
    { mode: 0o600 }
  );
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        config.pythonPath,
        [scriptPath, "--request", request, "--result", output],
        {
          windowsHide: true,
          stdio: ["ignore", "ignore", "ignore"],
          env: {
            ...process.env,
            HF_HUB_OFFLINE: "1",
            HF_HUB_DISABLE_TELEMETRY: "1",
            PYANNOTE_METRICS_ENABLED: "0",
          },
        }
      );
      let failure = null;
      const abort = () => {
        failure = createAbortError("Talerfordelingen er avbrutt");
        killProcess(child, "SIGKILL");
      };
      const timer = setTimeout(() => {
        failure = Error("Community-1 brukte for lang tid");
        killProcess(child, "SIGKILL");
      }, 3600000);
      child.once("error", (error) => {
        failure = error;
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        onClose(child);
        if (failure) reject(failure);
        else if (code !== 0)
          reject(Error(`Community-1 stoppet med feilkode ${code}. Teksten beholdes.`));
        else resolve();
      });
      onSpawn(child);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
    if (signal?.aborted) throw createAbortError("Talerfordelingen er avbrutt");
    if (fs.statSync(output).size > 32 * 1024 * 1024)
      throw Error("Community-1-resultatet er for stort");
    return validateCommunityResult(JSON.parse(fs.readFileSync(output, "utf8")), maxSpeakers);
  } finally {
    // Remove only the uniquely created folder directly inside the checked temp root.
    if (path.dirname(folder) === root && fs.realpathSync(folder) === folder)
      fs.rmSync(folder, { recursive: true, force: true });
  }
}
module.exports = {
  readCommunityConfig,
  validateCommunityResult,
  runCommunityDiarization,
  speakerConstraints,
};
