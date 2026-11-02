"""Experimental Community-1 comparison, isolated from production dictation."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time
import wave

os.environ["PYANNOTE_METRICS_ENABLED"] = "0"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
REPO = "pyannote/speaker-diarization-community-1"
REVISION = "3533c8cf8e369892e6b79ff1bf80f7b0286a54ee"
FILES = ("config.yaml", "embedding/pytorch_model.bin", "segmentation/pytorch_model.bin",
         "plda/plda.npz", "plda/xvec_transform.npz")
EXPECTED_HASHES = {
    "config.yaml": "5ce2bfa9a938dc132cec1172592d65173cbb8f444ea1e4133f10f9391de155be",
    "embedding/pytorch_model.bin": "6f10ff60898a1d185fa22e1d11e0bfa8a92efec811f11bca48cb8cafebefd929",
    "segmentation/pytorch_model.bin": "7ad24338d844fb95985486eb1a464e32d229f6d7a03c9abe60f978bacf3f816e",
    "plda/plda.npz": "9b77bcd840692710dd3496f62ecfeed8d8e5f002fd991b785079b244eab7d255",
    "plda/xvec_transform.npz": "325f1ce8e48f7e55e9c8aa47e05d2766b7c48c4b25b8de8dd751e7a4cc5fbe8f",
}


def checksum(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(destination, credential):
    from local_credential import read_token
    from huggingface_hub import HfApi, snapshot_download
    token = read_token(credential)
    # Access/terms are checked by Hugging Face. Never auto-accept terms.
    info = HfApi().model_info(REPO, revision=REVISION, token=token, files_metadata=True)
    snapshot_download(REPO, revision=REVISION, token=token, local_dir=destination,
                      allow_patterns=list(FILES))
    hashes = {}
    for name in FILES:
        file = destination / name
        actual = checksum(file)
        entry = next(s for s in info.siblings if s.rfilename == name)
        if entry.lfs and actual != entry.lfs.sha256:
            raise ValueError("Publisher model checksum mismatch")
        hashes[name] = actual
    (destination / "dssa-community-manifest.json").write_text(
        json.dumps({"repo": REPO, "revision": REVISION, "files": hashes}, indent=2), encoding="utf-8")


def speaker_constraints(request):
    maximum = request.get("maxSpeakers", 15)
    minimum = request.get("minSpeakers")
    exact = request.get("exactSpeakers")
    for count in (maximum, minimum, exact):
        if count is not None and (isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 15):
            raise ValueError("Speaker count must be between one and fifteen")
    if maximum is None or (minimum is not None and minimum > maximum):
        raise ValueError("Invalid speaker range")
    if exact is not None:
        if exact > maximum or (minimum is not None and exact < minimum):
            raise ValueError("Known count is outside the speaker range")
        return {"num_speakers": exact}
    return {"max_speakers": maximum, **({"min_speakers": minimum} if minimum is not None else {})}


def choose_device(torch_api, requested):
    if requested not in {"auto", "cpu", "cuda"}:
        raise ValueError("Unsupported device")
    if requested != "auto":
        return requested
    try:
        if torch_api.cuda.is_available() and torch_api.cuda.mem_get_info()[0] >= 2 * 1024 ** 3:
            return "cuda"
    except Exception:
        pass
    return "cpu"


def diarize(request):
    os.environ["HF_HUB_OFFLINE"] = "1"
    started = time.perf_counter()
    model = Path(request["modelPath"]).resolve(strict=True)
    manifest = json.loads((model / "dssa-community-manifest.json").read_text(encoding="utf-8"))
    if manifest.get("repo") != REPO or manifest.get("revision") != REVISION or manifest.get("files") != EXPECTED_HASHES:
        raise ValueError("Unrecognized Community-1 model provenance")
    for name in FILES:
        if checksum(model / name) != manifest["files"][name]:
            raise ValueError("Community-1 model checksum mismatch")
    constraints = speaker_constraints(request)
    requested_device = request.get("device", "auto")
    import numpy as np
    import torch
    from pyannote.audio import Pipeline
    from resource_policy import snapshot, diarization_batch
    device = choose_device(torch, requested_device)
    resources = snapshot()
    torch.set_num_threads(min(4, resources["cpuThreads"]) if device == "cuda" else resources["cpuThreads"])
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; no silent device fallback")
    # Use the already converted PCM audio directly; no online media or codecs.
    with wave.open(str(Path(request["audioPath"]).resolve(strict=True)), "rb") as stream:
        if (stream.getnchannels(), stream.getsampwidth(), stream.getframerate()) != (1, 2, 16000):
            raise ValueError("Expected mono 16 kHz PCM16 WAV")
        samples = np.frombuffer(stream.readframes(stream.getnframes()), dtype="<i2").astype(np.float32) / 32768
    pipeline = Pipeline.from_pretrained(str(model))
    # Bound transient VRAM while the user's Whisper model remains loaded.
    free_vram = torch.cuda.mem_get_info()[0] if device == "cuda" else None
    batch = diarization_batch(resources["tier"], free_vram)
    pipeline.segmentation_batch_size = batch
    pipeline.embedding_batch_size = batch
    pipeline.to(torch.device(device))
    cache = None
    if request.get('checkpointFolder') and request.get('checkpointKey'):
        from community_checkpoints import attach_checkpoints
        identity = hashlib.sha256(json.dumps({"key": request["checkpointKey"], "revision": REVISION,
                                              "device": device, "batch": batch, "version": 1}, sort_keys=True).encode()).hexdigest()
        cache = attach_checkpoints(pipeline, request['checkpointFolder'], identity)
    loaded = time.perf_counter()
    output = pipeline({"waveform": torch.from_numpy(samples).unsqueeze(0), "sample_rate": 16000},
                      **constraints)
    labels = {}
    segments = []
    for turn, _, speaker in output.exclusive_speaker_diarization.itertracks(yield_label=True):
        labels.setdefault(speaker, f"speaker_{len(labels)}")
        segments.append({"start": turn.start, "end": turn.end, "speaker": labels[speaker]})
    return {"success": True, "engine": "pyannote-community-1", "device": device,
            "segments": segments, "detectedSpeakerGroups": len(labels),
            "speakerConstraints": constraints,
            "batchSize": batch,
            "checkpointHits": cache.hits if cache else 0,
            "durationSeconds": len(samples) / 16000,
            "timings": {"loadSeconds": loaded - started,
                        "inferenceSeconds": time.perf_counter() - loaded,
                        "totalSeconds": time.perf_counter() - started}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", type=Path)
    parser.add_argument("--credential-file", type=Path)
    parser.add_argument("--request", type=Path)
    parser.add_argument("--result", type=Path)
    args = parser.parse_args()
    if args.download:
        if not args.credential_file:
            parser.error("--credential-file is required for download")
        download(args.download.resolve(), args.credential_file)
        print(json.dumps({"ready": True, "revision": REVISION}))
    else:
        if not args.request or not args.result:
            parser.error("--request and --result are required for local inference")
        from worker import atomic_json
        atomic_json(args.result, diarize(json.loads(args.request.read_text(encoding="utf-8-sig"))))
