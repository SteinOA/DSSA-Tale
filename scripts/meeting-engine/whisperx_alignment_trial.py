"""Offline file alignment, separate from DSSA's dictation pipeline.

Run with a separately provisioned WhisperX environment and pinned local models.
The request contains audioPath, modelPath, language (nb/nn), nltkPath and segments
[{start, end, text}]. Results never replace the supplied transcript wording.
"""
import argparse
import gc
import hashlib
import json
import math
import os
from pathlib import Path
import time
import wave


def choose_device(torch_api, preference, weight_bytes):
    """Prefer CUDA only when both the runtime and conservative VRAM budget fit."""
    if preference not in {"auto", "cuda", "cpu"}:
        raise ValueError("Unsupported alignment device")
    if preference == "cpu":
        return "cpu", None
    try:
        if not torch_api.cuda.is_available():
            return "cpu", "cuda-unavailable"
        free, _total = torch_api.cuda.mem_get_info()
        # FP32 weights plus workspace for a bounded, single audio window.
        # This is a guard, not a guarantee: other apps can allocate after it.
        if free < weight_bytes + 1536 * 1024 ** 2:
            return "cpu", "insufficient-vram"
    except Exception:
        return "cpu", "gpu-initialization-failed"
    return "cuda", None


def gpu_failure(error, torch_api):
    oom_type = getattr(torch_api, "OutOfMemoryError", ())
    if isinstance(error, oom_type) or "out of memory" in str(error).lower():
        return "gpu-memory-error"
    if any(term in str(error).lower() for term in ("cuda", "cudnn", "cublas", "device-side assert")):
        return "gpu-execution-error"
    return None


def window_audio(stream, source, np):
    """Read only this real source window; never buffer a whole meeting in RAM."""
    rate = stream.getframerate()
    first, last = int(source["start"] * rate), int(source["end"] * rate)
    stream.setpos(first)
    samples = np.frombuffer(stream.readframes(last - first), dtype="<i2").astype(np.float32) / 32768
    return samples, {"start": 0, "end": source["end"] - source["start"], "text": source["text"]}


def rebase_words(result, offset):
    words = result.get("word_segments", [])
    return [{**word, **{key: round(word[key] + offset, 3) for key in ("start", "end") if finite(word.get(key))}} for word in words]


class DeviceAligner:
    """One GPU attempt, then CPU for the remainder; retry the current window."""
    def __init__(self, torch_api, loader, aligner, preference, weight_bytes, changed=None):
        self.torch = torch_api
        self.loader, self.aligner = loader, aligner
        self.changed = changed or (lambda _device, _reason: None)
        self.device, self.fallback_reason = choose_device(torch_api, preference, weight_bytes)
        self.used_cuda = False
        self.model = self.metadata = None
        try:
            self.model, self.metadata = self.loader(self.device)
            self.used_cuda = self.device == "cuda"
        except Exception:
            if self.device != "cuda":
                raise
            self._cpu("gpu-initialization-failed")
        self.changed(self.device, self.fallback_reason)

    def _cpu(self, reason):
        self.model = self.metadata = None
        gc.collect()
        try:
            self.torch.cuda.empty_cache()
        except Exception:
            pass
        self.device, self.fallback_reason = "cpu", reason
        self.model, self.metadata = self.loader("cpu")
        self.changed(self.device, reason)

    def align(self, source, samples):
        try:
            return self.aligner(source, self.model, self.metadata, samples, self.device)
        except Exception as error:
            reason = gpu_failure(error, self.torch) if self.device == "cuda" else None
            if not reason:
                raise
        # Leave the GPU exception scope before collecting its temporary tensors.
        self._cpu(reason)
        return self.aligner(source, self.model, self.metadata, samples, "cpu")


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def preserve_aligned_words(source, words, audio_seconds):
    """Reject incomplete or interpolated-only words instead of guessing clocks."""
    fallback = {**source, "alignmentStatus": "original-preserved"}
    if not isinstance(words, list) or not all(isinstance(w, dict) for w in words) or source["text"].split() != [w.get("word") for w in words]:
        return fallback
    last = -1
    checked = []
    for word in words:
        start, end, score = word.get("start"), word.get("end"), word.get("score")
        if (not all(finite(value) for value in (start, end, score))
                or not 0 <= score <= 1 or start < 0 or end <= start
                or start < last or end > audio_seconds + .001
                or start < source["start"] - .25 or end > source["end"] + .25):
            return fallback
        last = start
        checked.append({"text": word["word"], "start": start, "end": end,
                        "alignmentScore": score})
    return {**source, "words": checked, "alignmentStatus": "ctc-aligned"}


def align_preserving_source(source, align_call, audio_seconds):
    try:
        result = align_call()
        return preserve_aligned_words(source, result["word_segments"], audio_seconds)
    except Exception:
        # A bad window must not discard an hour of successfully processed audio.
        # Cancellation is handled by terminating the process, not by exceptions.
        return {**source, "alignmentStatus": "original-preserved"}


def write_state(destination, value, required=False, writer=None):
    if writer is None:
        from worker import atomic_json
        writer = atomic_json
    for attempt in range(4):
        try:
            writer(destination, value)
            return True
        except OSError:
            if attempt < 3:
                time.sleep(.05 * (attempt + 1))
            elif required:
                raise
    # Progress/checkpoints are best effort; temporary Windows file locks must
    # never terminate acoustic processing or discard the in-memory transcript.
    return False


def verify_model(folder, language):
    known = json.loads(Path(__file__).with_name("alignment-models.json").read_text(encoding="utf-8"))
    manifest = json.loads((folder / "dssa-alignment-manifest.json").read_text(encoding="utf-8"))
    allowed = [value for key, value in known.items() if key.endswith("-" + language)]
    if manifest not in allowed:
        raise ValueError("Model does not match the requested language and pinned revision")
    for name, expected in manifest["files"].items():
        with (folder / name).open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                raise ValueError("Alignment model checksum mismatch")
    return manifest


def recover_prefix(checkpoint, segments, key):
    """Accept only an exact, bounded prefix; no inferred clocks or pickle data."""
    if not key or not checkpoint or not checkpoint.is_file() or checkpoint.stat().st_size > 64 * 1024 ** 2:
        return []
    try:
        stored = json.loads(checkpoint.read_text(encoding="utf-8"))
        output = stored.get("segments")
        if stored.get("checkpointKey") != key or not isinstance(output, list) or len(output) > len(segments):
            return []
        for index, (source, item) in enumerate(zip(segments, output)):
            if any(item.get(k) != source[k] for k in ("text", "start", "end")):
                return []
            if item.get("alignmentStatus") == "original-preserved":
                # A fallback does not become a completed acoustic result on retry.
                return output[:index]
            if item.get("alignmentStatus") != "ctc-aligned":
                return []
            words = item.get("words")
            if not isinstance(words, list) or [w.get("text") for w in words] != source["text"].split():
                return []
            previous = source["start"] - .001
            for word in words:
                if (not all(finite(word.get(k)) for k in ("start", "end", "alignmentScore"))
                        or word["start"] < previous or word["start"] < source["start"] - .001
                        or word["end"] <= word["start"] or word["end"] > source["end"] + .001
                        or not 0 <= word["alignmentScore"] <= 1):
                    return []
                previous = word["start"]
        return output
    except (ValueError, OSError, TypeError, KeyError, AttributeError):
        return []


def run(request):
    language = request.get("language")
    if language not in {"nb", "nn"}:
        raise ValueError("Choose bokmal or nynorsk explicitly")
    segments = request.get("segments")
    if not isinstance(segments, list) or not 1 <= len(segments) <= 10000:
        raise ValueError("Invalid segments")
    for segment in segments:
        if (not isinstance(segment.get("text"), str) or not segment["text"].strip()
                or not all(finite(segment.get(key)) for key in ("start", "end"))
                or not 0 <= segment["start"] < segment["end"]
                or segment["end"] - segment["start"] > 45):
            raise ValueError("Use real source windows no longer than 45 seconds")
    model_path = Path(request["modelPath"]).resolve(strict=True)
    started = time.perf_counter()
    manifest = verify_model(model_path, language)
    os.environ.update(HF_HUB_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1",
                      HF_HUB_DISABLE_IMPLICIT_TOKEN="1", NLTK_DATA=request["nltkPath"])
    import numpy as np
    import torch
    import nltk
    import whisperx
    nltk.data.path.insert(0, request["nltkPath"])
    # Refuse hidden downloads during processing; provision Punkt separately.
    nltk.data.find("tokenizers/punkt_tab/english/")
    nltk.data.find("tokenizers/punkt_tab/norwegian/")
    from resource_policy import snapshot, check_model_ram, memory_status
    resources = snapshot()
    torch.set_num_threads(resources["cpuThreads"])
    with wave.open(str(Path(request["audioPath"]).resolve(strict=True)), "rb") as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
            raise ValueError("Expected mono 16 kHz PCM16 WAV")
        duration = audio.getnframes() / 16000
        if max(s["end"] for s in segments) > duration + .001:
            raise ValueError("Source timing exceeds recording duration")
    resource_warning = None
    progress_path = request.get("progressPath")
    checkpoint_path = request.get("checkpointPath")
    checkpoint_key = request.get("checkpointKey")
    output = recover_prefix(Path(checkpoint_path) if checkpoint_path else None, segments, checkpoint_key)
    resumed = len(output)
    def progress(device, reason):
        torch.set_num_threads(min(4, resources["cpuThreads"]) if device == "cuda" else resources["cpuThreads"])
        if progress_path:
            write_state(Path(progress_path), {"completed": len(output), "total": len(segments),
                                             "resumedSegments": resumed,
                                             "device": device, "gpuFallbackReason": reason,
                                             "cpuThreads": min(4, resources["cpuThreads"]) if device == "cuda" else resources["cpuThreads"]})
    weights = sum((model_path / name).stat().st_size for name in manifest["files"]
                  if name.endswith((".safetensors", ".bin")))
    def load(device):
        check_model_ram(weights, device)
        return whisperx.load_align_model("no" if language == "nb" else "nn", device,
                                         model_name=str(model_path), model_cache_only=True)
    engine = DeviceAligner(
        torch,
        load,
        lambda source, model, metadata, audio, device: whisperx.align([source], model, metadata, audio, device),
        request.get("device", "auto"), weights, progress)
    loaded = time.perf_counter()
    # One source window per call retains its association and exact source text.
    with wave.open(str(Path(request["audioPath"]).resolve(strict=True)), "rb") as audio:
        for index in range(resumed, len(segments)):
            source = segments[index]
            current = snapshot()
            _total, available = memory_status()
            if available is not None and available < min(current["reserveBytes"], 512 * 1024 ** 2):
                resource_warning = "memory-pressure"
                output.extend({**item, "alignmentStatus": "original-preserved"} for item in segments[index:])
                break
            samples, local = window_audio(audio, source, np)
            output.append(align_preserving_source(source, lambda: {"word_segments": rebase_words(engine.align(local, samples), source["start"])}, duration))
            del samples
            if checkpoint_path:
                write_state(Path(checkpoint_path), {"success": True, "segments": output,
                                                    "checkpointKey": checkpoint_key,
                                                    "device": engine.device, "gpuFallbackReason": engine.fallback_reason})
            progress(engine.device, engine.fallback_reason)
    return {"success": True, "device": engine.device, "language": language,
            "gpuFallbackReason": engine.fallback_reason,
            "resourceWarning": resource_warning, "cpuThreads": min(4, resources["cpuThreads"]) if engine.device == "cuda" else resources["cpuThreads"],
            "repo": manifest["repo"], "revision": manifest["revision"], "segments": output,
            "alignedSegments": sum(s["alignmentStatus"] == "ctc-aligned" for s in output),
            "resumedSegments": resumed,
            "timings": {"loadSeconds": loaded - started, "alignmentSeconds": time.perf_counter() - loaded},
            "speakerIdentitiesVerified": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--result", required=True, type=Path)
    args = parser.parse_args()
    from worker import atomic_json
    try:
        result = run(json.loads(args.request.read_text(encoding="utf-8-sig")))
    except Exception as error:
        atomic_json(args.result, {"success": False, "errorKind": type(error).__name__,
                                 "code": "INSUFFICIENT_RAM" if type(error).__name__ == "MemoryBudgetError" else "ALIGNMENT_FAILED"})
        raise SystemExit(0 if type(error).__name__ == "MemoryBudgetError" else 1)
    write_state(args.result, result, required=True)
