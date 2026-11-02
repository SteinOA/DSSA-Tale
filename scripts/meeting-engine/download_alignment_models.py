"""Download public, pinned alignment weights. No audio is sent anywhere."""
import argparse
import hashlib
import json
import os
from pathlib import Path


def download(destination, mode, languages):
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
    from huggingface_hub import snapshot_download
    registry = json.loads(Path(__file__).with_name("alignment-models.json").read_text(encoding="utf-8"))
    for language in languages:
        manifest = registry[("300m" if mode == "fast" else "1b") + "-" + language]
        folder = destination / language
        snapshot_download(manifest["repo"], revision=manifest["revision"], token=False,
                          local_dir=folder, allow_patterns=list(manifest["files"]))
        for name, expected in manifest["files"].items():
            with (folder / name).open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                    raise ValueError("Publisher model checksum mismatch")
        (folder / "dssa-alignment-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(json.dumps({"ready": True, "language": language, "mode": mode,
                          "revision": manifest["revision"]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", required=True, type=Path)
    parser.add_argument("--mode", choices=["fast", "precise"], required=True)
    parser.add_argument("--language", choices=["nb", "nn", "both"], default="both")
    args = parser.parse_args()
    download(args.destination.resolve(), args.mode, ["nb", "nn"] if args.language == "both" else [args.language])
