"""Opt-in local file engine. JSON request/result paths; no audio network requests."""
import argparse
from dataclasses import asdict
import hashlib
import json
import os
from pathlib import Path
import sys
import time

DLL_HANDLES = []
LANGUAGES = {"nb": "no", "no": "no", "nn": "nn", "en": "en"}


def prepare_cuda():
    if os.name != "nt":
        return
    nvidia = Path(sys.prefix) / "Lib/site-packages/nvidia"
    directories = [nvidia / library / "bin" for library in ("cublas", "cuda_nvrtc", "cudnn")]
    if not directories[0].is_dir() and os.environ.get("DSSA_CUDA_LIBRARY_DIR"):
        directories.append(Path(os.environ["DSSA_CUDA_LIBRARY_DIR"]))
    for directory in directories:
        if directory.is_dir():
            DLL_HANDLES.append(os.add_dll_directory(str(directory)))
            os.environ["PATH"] = str(directory) + os.pathsep + os.environ.get("PATH", "")


def validate_request(request):
    language = LANGUAGES.get(request.get("language"))
    if not language:
        raise ValueError("An explicit supported transcription language is required")
    if request.get("computeType", "float16") not in {"float16", "int8_float16", "int8", "float32"}:
        raise ValueError("Unsupported precision")
    if request.get("device", "cuda") not in {"cuda", "cpu"}:
        raise ValueError("Unsupported device")
    batch = request.get("batchSize", 2)
    if isinstance(batch, bool) or not isinstance(batch, int) or not 1 <= batch <= 8:
        raise ValueError("Batch size must be between one and eight")
    source = Path(request["audioPath"]).resolve(strict=True)
    model = Path(request["modelPath"]).resolve(strict=True)
    for name in ("model.bin", "config.json", "tokenizer.json", "preprocessor_config.json"):
        if not (model / name).is_file():
            raise ValueError("The local meeting model is incomplete")
    return source, model, language, batch


def verify_model(model):
    manifest = json.loads((model / "dssa-model-manifest.json").read_text(encoding="utf-8"))
    from download_nb_model import EXPECTED, REVISION
    if manifest.get("publisher") != "NbAiLab/nb-whisper-large" or manifest.get("revision") != REVISION:
        raise ValueError("Unrecognized meeting model provenance")
    if set(manifest.get("files", {})) != set(EXPECTED):
        raise ValueError("Incomplete model manifest")
    for name, expected in manifest["files"].items():
        if Path(name).name != name:
            raise ValueError("Invalid model manifest path")
        file = model / name
        if (expected.get("bytes"), expected.get("sha256")) != EXPECTED[name]:
            raise ValueError("Publisher model checksum mismatch")
        if file.stat().st_size != expected["bytes"]:
            raise ValueError("Meeting model size mismatch")
        with file.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != expected["sha256"]:
                raise ValueError("Meeting model checksum mismatch")


def transcribe(request, emit):
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    source, model_path, language, batch_size = validate_request(request)
    start = time.perf_counter()
    verify_model(model_path)
    prepare_cuda()
    from faster_whisper import WhisperModel, BatchedInferencePipeline
    emit({"phase": "loading"})
    model = WhisperModel(str(model_path), device=request.get("device", "cuda"),
                         compute_type=request.get("computeType", "float16"), local_files_only=True,
                         cpu_threads=request.get("cpuThreads", 4))
    if language not in model.supported_languages:
        raise ValueError("The loaded model does not support the selected language")
    pipeline = BatchedInferencePipeline(model=model)
    loaded = time.perf_counter()
    segments, info = pipeline.transcribe(str(source), language=language, task="transcribe",
                                         batch_size=batch_size, beam_size=5, word_timestamps=True,
                                         vad_filter=True, condition_on_previous_text=False)
    output = []
    for segment in segments:
        output.append(asdict(segment))
        emit({"phase": "transcribing", "audioSecondsCompleted": segment.end,
              "audioSecondsTotal": info.duration, "segmentsCompleted": len(output)})
    return {"success": True, "text": " ".join(s["text"].strip() for s in output).strip(),
            "segments": [{"text": s["text"].strip(), "start": s["start"], "end": s["end"],
                          "words": [{"text": w["word"], "start": w["start"], "end": w["end"]}
                                    for w in s["words"] or []]} for s in output],
            "durationSeconds": info.duration, "language": language,
            "engine": "faster-whisper", "batchSize": batch_size,
            "device": request.get("device", "cuda"), "computeType": request.get("computeType", "float16"),
            "timings": {"loadSeconds": loaded - start, "inferenceSeconds": time.perf_counter() - loaded,
                        "totalSeconds": time.perf_counter() - start}}


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--result", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = transcribe(json.loads(args.request.read_text(encoding="utf-8-sig")),
                            lambda progress: print(json.dumps(progress), flush=True))
        atomic_json(args.result, result)
    except Exception as error:
        atomic_json(args.result, {"success": False, "error": str(error), "errorType": type(error).__name__})
        print(json.dumps({"phase": "failed", "errorType": type(error).__name__}), flush=True)
        sys.exit(1)
