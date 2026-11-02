import importlib.util
from pathlib import Path
import unittest
import os
import tempfile
import json
from types import SimpleNamespace

source = Path(__file__).resolve().parents[2] / "scripts/meeting-engine/whisperx_alignment_trial.py"
spec = importlib.util.spec_from_file_location("alignment_trial", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AlignmentSafety(unittest.TestCase):
    def test_resume_accepts_only_exact_source_words_and_window(self):
        with tempfile.TemporaryDirectory(prefix='dssa-prefix-test-') as folder:
            file=Path(folder)/'checkpoint.json'
            source={'start':0,'end':2,'text':'Eg er samd.'}
            item={**source,'alignmentStatus':'ctc-aligned','words':[{'text':word,'start':i*.4,'end':i*.4+.3,'alignmentScore':.9} for i,word in enumerate(source['text'].split())]}
            file.write_text(json.dumps({'checkpointKey':'key','segments':[item]}))
            self.assertEqual(module.recover_prefix(file,[source],'key'),[item])
            self.assertEqual(module.recover_prefix(file,[source],'different-key'),[])
            item['words'][1]['text']='ikkje'
            file.write_text(json.dumps({'checkpointKey':'key','segments':[item]}))
            self.assertEqual(module.recover_prefix(file,[source],'key'),[])

    def test_resume_does_not_treat_fallback_or_corrupt_clock_as_completed(self):
        with tempfile.TemporaryDirectory(prefix='dssa-prefix-test-') as folder:
            file=Path(folder)/'checkpoint.json'
            source={'start':0,'end':2,'text':'Eg'}
            for item in [{**source,'alignmentStatus':'original-preserved'},
                         {**source,'alignmentStatus':'ctc-aligned','words':[{'text':'Eg','start':0,'end':10,'alignmentScore':.9}]}]:
                file.write_text(json.dumps({'checkpointKey':'key','segments':[item]}))
                self.assertEqual(module.recover_prefix(file,[source],'key'),[])

    def setUp(self):
        self.source = {"start": 0, "end": 2, "text": "  Eg  er samd. "}
        self.words = [{"word": "Eg", "start": .1, "end": .4, "score": .9},
                      {"word": "er", "start": .5, "end": .7, "score": .8},
                      {"word": "samd.", "start": .8, "end": 1.8, "score": .7}]

    def test_original_nynorsk_and_whitespace_survive(self):
        result = module.preserve_aligned_words(self.source, self.words, 2)
        self.assertEqual(result["text"], self.source["text"])
        self.assertEqual(result["alignmentStatus"], "ctc-aligned")
        self.assertEqual(len(result["words"]), 3)

    def test_a_failed_window_preserves_text_and_allows_the_next_window(self):
        def fail():
            raise RuntimeError("simulated per-window model failure")
        first = module.align_preserving_source(self.source, fail, 2)
        second = module.align_preserving_source(self.source, lambda: {"word_segments": self.words}, 2)
        self.assertEqual(first["alignmentStatus"], "original-preserved")
        self.assertEqual(first["text"], self.source["text"])
        self.assertEqual(second["alignmentStatus"], "ctc-aligned")

    def test_temporary_windows_progress_lock_is_retried(self):
        attempts = []
        def writer(_path, _value):
            attempts.append(1)
            if len(attempts) < 2:
                raise PermissionError("simulated file lock")
        self.assertTrue(module.write_state(None, {}, writer=writer))
        self.assertEqual(len(attempts), 2)

    def test_persistent_progress_write_failure_does_not_stop_alignment(self):
        def writer(_path, _value):
            raise OSError("simulated unavailable progress storage")
        self.assertFalse(module.write_state(None, {}, writer=writer))

    @unittest.skipUnless(os.name == "nt", "Windows file sharing semantics")
    def test_real_windows_read_lock_does_not_abort_processing(self):
        worker_spec = importlib.util.spec_from_file_location("worker_atomic", source.with_name("worker.py"))
        worker = importlib.util.module_from_spec(worker_spec)
        worker_spec.loader.exec_module(worker)
        with tempfile.TemporaryDirectory(prefix="dssa-alignment-lock-test-") as folder:
            self.assertEqual(Path(folder).resolve().parent, Path(tempfile.gettempdir()).resolve())
            destination = Path(folder) / "progress.json"
            destination.write_text("{}", encoding="utf-8")
            with destination.open("r", encoding="utf-8"):
                self.assertFalse(module.write_state(destination, {"completed": 1}, writer=worker.atomic_json))
            self.assertTrue(module.write_state(destination, {"completed": 2}, writer=worker.atomic_json))

    def test_translation_or_missing_words_falls_back_to_original(self):
        for words in [self.words[:-1], [{**w, "word": "Jeg"} if i == 0 else w for i, w in enumerate(self.words)]]:
            result = module.preserve_aligned_words(self.source, words, 2)
            self.assertEqual(result["text"], self.source["text"])
            self.assertNotIn("words", result)

    def test_interpolated_unscored_clocks_are_not_accepted(self):
        words = [dict(w) for w in self.words]
        del words[1]["score"]
        self.assertNotIn("words", module.preserve_aligned_words(self.source, words, 2))

    def test_invalid_clocks_and_scores_preserve_original(self):
        for patch in [{"start": float("nan")}, {"end": 0}, {"end": 3},
                      {"start": -.1}, {"score": -1}, {"score": True}]:
            words = [dict(w) for w in self.words]
            words[0].update(patch)
            self.assertNotIn("words", module.preserve_aligned_words(self.source, words, 2))

    def test_reordered_clocks_do_not_create_false_alignment(self):
        words = [dict(w) for w in self.words]
        words[1]["start"] = 0
        self.assertNotIn("words", module.preserve_aligned_words(self.source, words, 2))


class AlignmentDevices(unittest.TestCase):
    def torch(self, available=True, free=8 * 1024 ** 3):
        return SimpleNamespace(OutOfMemoryError=MemoryError, cuda=SimpleNamespace(
            is_available=lambda: available, mem_get_info=lambda: (free, free), empty_cache=lambda: None))

    def test_gpu_is_preferred_when_the_model_and_workspace_fit(self):
        self.assertEqual(module.choose_device(self.torch(), "auto", 1024 ** 3), ("cuda", None))

    def test_cpu_only_and_low_memory_machines_keep_a_working_cpu_route(self):
        self.assertEqual(module.choose_device(self.torch(False), "auto", 1), ("cpu", "cuda-unavailable"))
        self.assertEqual(module.choose_device(self.torch(free=1024 ** 3), "auto", 1024 ** 3),
                         ("cpu", "insufficient-vram"))
        self.assertEqual(module.choose_device(self.torch(), "cpu", 1), ("cpu", None))
        with self.assertRaises(ValueError):
            module.choose_device(self.torch(), "invalid", 1)

    def test_gpu_initialization_failure_reloads_once_on_cpu(self):
        loads = []
        def load(device):
            loads.append(device)
            if device == "cuda":
                raise RuntimeError("CUDA initialization failed")
            return object(), {}
        engine = module.DeviceAligner(self.torch(), load, None, "auto", 1)
        self.assertEqual(loads, ["cuda", "cpu"])
        self.assertEqual(engine.device, "cpu")
        self.assertEqual(engine.fallback_reason, "gpu-initialization-failed")

    def test_gpu_oom_retries_same_source_on_cpu_then_stays_on_cpu(self):
        calls, loads, changes = [], [], []
        def load(device):
            loads.append(device)
            return object(), {}
        def align(source, _model, _metadata, _samples, device):
            calls.append((source["text"], device))
            if device == "cuda":
                raise MemoryError("CUDA out of memory")
            return {"word_segments": [{"word": source["text"], "start": .1, "end": .5, "score": .9}]}
        engine = module.DeviceAligner(self.torch(), load, align, "auto", 1,
                                     lambda device, reason: changes.append((device, reason)))
        for text in ("Eg", "samd"):
            source_word = {"text": text, "start": 0, "end": 1}
            result = module.align_preserving_source(source_word, lambda: engine.align(source_word, None), 1)
            self.assertEqual(result["alignmentStatus"], "ctc-aligned")
            self.assertEqual(result["text"], text)
        self.assertEqual(loads, ["cuda", "cpu"])
        self.assertEqual(calls, [("Eg", "cuda"), ("Eg", "cpu"), ("samd", "cpu")])
        self.assertEqual(changes[-1], ("cpu", "gpu-memory-error"))

    def test_cuda_execution_error_falls_back_but_bad_source_does_not_reinitialize_models(self):
        for message, device in [("CUDA device-side assert triggered", "cpu"), ("bad source", "cuda")]:
            loads = []
            def load(target):
                loads.append(target)
                return object(), {}
            def fail(*_args):
                raise RuntimeError(message)
            engine = module.DeviceAligner(self.torch(), load, fail, "auto", 1)
            source_word = {"text": "Eg", "start": 0, "end": 1}
            result = module.align_preserving_source(source_word, lambda: engine.align(source_word, None), 1)
            self.assertEqual(result["alignmentStatus"], "original-preserved")
            self.assertEqual(engine.device, device)
            self.assertEqual(len(loads), 2 if device == "cpu" else 1)


if __name__ == "__main__":
    unittest.main()
