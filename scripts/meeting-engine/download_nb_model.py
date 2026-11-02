"""Download the publisher's pinned CTranslate2 model; never upload user audio."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.request

REVISION = "8c6249fdeeb4dcd05e5735a4c39640607eb6e4ac"
BASE = f"https://huggingface.co/NbAiLab/nb-whisper-large/resolve/{REVISION}/"
MODEL_BYTES = 6174511117
MODEL_SHA256 = "91a2575f6e703d0bf6d8ce228a490c40e2404e6275932c20ff137382f35f726d"
FILES = {"model.bin": "ct2/model.bin", "config.json": "ct2/config.json",
         "vocabulary.json": "ct2/vocabulary.json", "tokenizer.json": "tokenizer.json",
         "preprocessor_config.json": "preprocessor_config.json"}
EXPECTED = {
    "model.bin": (MODEL_BYTES, MODEL_SHA256),
    "config.json": (2394, "a9306624f5ec14270a014b647e5c316b6e03a662c369758d1b90697a7b0655b9"),
    "vocabulary.json": (1068114, "c69260f2ab26d659b7c398f9a2b2b48ed0df16c3b47d7326782fd9cba71690c1"),
    "tokenizer.json": (2481355, "5ceb4ad41152dcbf89d26884faaa71c04e2f0a12b2d2c88a12894eee1e55c189"),
    "preprocessor_config.json": (340, "7ccc62c6f2765af1f3b46c00c9b5894426835a05021c8b9c01eecb6dfb542711"),
}


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(target):
    target.mkdir(parents=True, exist_ok=True)
    for name, remote in FILES.items():
        dest = target / name
        expected_bytes, expected_sha = EXPECTED[name]
        if dest.exists() and dest.stat().st_size == expected_bytes and digest(dest) == expected_sha:
            continue
        part = target / (name + ".part")
        offset = part.stat().st_size if part.exists() else 0
        request = urllib.request.Request(BASE + remote, headers={"Range": f"bytes={offset}-"} if offset else {})
        with urllib.request.urlopen(request, timeout=120) as response:
            resumed = offset and response.status == 206
            if resumed and not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-"):
                raise RuntimeError("Server returned an invalid resume range")
            written = offset if resumed else 0
            last = time.monotonic()
            with part.open("ab" if resumed else "wb") as output:
                while block := response.read(4 * 1024 * 1024):
                    output.write(block)
                    written += len(block)
                    if time.monotonic() - last > 5:
                        print(json.dumps({"file": name, "downloadedBytes": written}), flush=True)
                        last = time.monotonic()
                output.flush()
                os.fsync(output.fileno())
        if part.stat().st_size != expected_bytes or digest(part) != expected_sha:
            raise RuntimeError("Publisher model size/SHA-256 verification failed")
        os.replace(part, dest)
    manifest = {"publisher": "NbAiLab/nb-whisper-large", "revision": REVISION,
                "files": {name: {"bytes": (target / name).stat().st_size,
                                  "sha256": digest(target / name)} for name in FILES}}
    (target / "dssa-model-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"ready": True, "revision": REVISION}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    download(parser.parse_args().output.resolve())
