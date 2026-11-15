"""Private, validated numeric checkpoints for the pinned Community-1 pipeline.

No training mode, pickle, audio or speaker names are stored. Embeddings remain
local voice data and are removed with the import's retention policy.
"""
import hashlib
import json
import os
from pathlib import Path
import uuid
import zipfile


class NumericCache:
    def __init__(self, folder, key):
        if not isinstance(key, str) or len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
            raise ValueError("Invalid checkpoint key")
        self.folder = Path(folder).resolve() / key
        self.folder.mkdir(parents=True, exist_ok=True)
        self.hits = 0

    def read(self, name):
        import numpy as np
        file = self.folder / (name + ".npz")
        meta = file.with_suffix(".json")
        try:
            if file.is_symlink() or meta.is_symlink() or file.stat().st_size > 512 * 1024 ** 2 or meta.stat().st_size > 4096:
                return None
            with file.open("rb") as stream:
                actual = hashlib.file_digest(stream, "sha256").hexdigest()
            if json.loads(meta.read_text())["sha256"] != actual:
                return None
            with zipfile.ZipFile(file) as archive:
                if sum(i.file_size for i in archive.infolist()) > 512 * 1024 ** 2:
                    return None
            with np.load(file, allow_pickle=False) as loaded:
                arrays = {k: loaded[k] for k in loaded.files}
            if any(a.dtype.kind not in "fiu" or a.size > 100_000_000 for a in arrays.values()):
                return None
            self.hits += 1
            return arrays
        except (OSError, ValueError, KeyError, zipfile.BadZipFile):
            return None

    def write(self, name, **arrays):
        import numpy as np
        file = self.folder / (name + ".npz")
        temporary = file.with_suffix("." + uuid.uuid4().hex + ".part")
        from worker import atomic_json
        try:
            with temporary.open("xb") as stream:
                np.savez(stream, **arrays)
                stream.flush()
                os.fsync(stream.fileno())
            with temporary.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            os.replace(temporary, file)
            atomic_json(file.with_suffix(".json"), {"sha256": digest})
        except OSError:
            # Cache storage must not abort an otherwise usable acoustic result.
            pass
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


def attach_checkpoints(pipeline, folder, key):
    """Wrap only inference I/O; leave clustering, training and model state intact."""
    import numpy as np
    from pyannote.core import SlidingWindow, SlidingWindowFeature
    cache = NumericCache(folder, key)
    segmentation = pipeline.get_segmentations

    def get_segmentations(file, hook=None):
        stored = cache.read("segmentation")
        if stored is not None:
            data, window = stored.get("data"), stored.get("window")
            if (data is not None and data.ndim == 3 and window is not None and window.shape == (3,)
                    and np.isfinite(window).all() and window[1] > 0 and window[2] > 0):
                return SlidingWindowFeature(data, SlidingWindow(start=float(window[0]), duration=float(window[1]), step=float(window[2])))
        result = segmentation(file, hook=hook)
        window = result.sliding_window
        cache.write("segmentation", data=result.data, window=np.array([window.start, window.duration, window.step]))
        return result

    embedding = pipeline._embedding

    class CachedEmbedding:
        def __getattr__(self, name):
            return getattr(embedding, name)

        def __call__(self, waveforms, masks=None):
            digest = hashlib.sha256()
            for tensor in (waveforms, masks):
                if tensor is None:
                    digest.update(b"None")
                else:
                    array = tensor.detach().cpu().contiguous().numpy()
                    digest.update(str((array.shape, array.dtype)).encode())
                    digest.update(array.tobytes())
            name = "embedding-" + digest.hexdigest()
            stored = cache.read(name)
            if stored is not None and "data" in stored:
                data = stored["data"]
                if data.ndim == 2 and data.shape[0] == waveforms.shape[0] and data.shape[1] == embedding.dimension:
                    return data
            result = embedding(waveforms, masks=masks)
            cache.write(name, data=result)
            return result

    pipeline.get_segmentations = get_segmentations
    pipeline._embedding = CachedEmbedding()
    return cache
