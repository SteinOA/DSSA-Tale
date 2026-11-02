import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import worker


class WorkerValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.model = Path(self.temp.name) / "model"
        self.model.mkdir()
        for name in ("model.bin", "config.json", "tokenizer.json", "preprocessor_config.json"):
            (self.model / name).write_text("test", encoding="utf-8")
        self.audio = Path(self.temp.name) / "source.wav"
        self.audio.write_bytes(b"audio")
        self.request = {"audioPath": str(self.audio), "modelPath": str(self.model), "language": "nn"}

    def test_nynorsk_is_preserved_and_bokmaal_maps_to_no(self):
        self.assertEqual(worker.validate_request(self.request)[2], "nn")
        self.assertEqual(worker.validate_request({**self.request, "language": "nb"})[2], "no")

    def test_missing_or_automatic_language_never_falls_back_to_english(self):
        for language in (None, "auto", "unsupported"):
            with self.assertRaises(ValueError):
                worker.validate_request({**self.request, "language": language})

    def test_gpu_options_are_bounded_without_silent_device_fallback(self):
        for invalid in ({"device": "automatic"}, {"batchSize": True}, {"batchSize": 9},
                        {"computeType": "unknown"}):
            with self.assertRaises(ValueError):
                worker.validate_request({**self.request, **invalid})

    def test_incomplete_local_model_is_not_automatically_downloaded(self):
        (self.model / "tokenizer.json").unlink()
        with self.assertRaises(ValueError):
            worker.validate_request(self.request)

    def test_manifest_cannot_remove_required_integrity_checks(self):
        from download_nb_model import REVISION
        (self.model / "dssa-model-manifest.json").write_text(json.dumps({
            "publisher": "NbAiLab/nb-whisper-large", "revision": REVISION, "files": {},
        }), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Incomplete model manifest"):
            worker.verify_model(self.model)


if __name__ == "__main__":
    unittest.main()
