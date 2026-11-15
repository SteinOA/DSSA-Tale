const os = require("os");

// Keep CPU capacity for the UI, audio capture and ASR. Four inference threads
// were measured against one on the local 16-thread PC with identical segments.
function resolveDiarizationThreads(requested, logicalCpus = os.availableParallelism()) {
  const available = Number.isSafeInteger(logicalCpus) && logicalCpus > 0 ? logicalCpus : 1;
  const limit = Math.max(1, Math.min(4, Math.floor(available / 2)));
  return Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, limit) : limit;
}

module.exports = { resolveDiarizationThreads };
