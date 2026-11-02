"""Validate downloaded optional tools before promoting their app configuration."""
import argparse
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--community', type=Path)
parser.add_argument('--alignment', type=Path)
parser.add_argument('--language', choices=['nb', 'nn'])
parser.add_argument('--punkt', type=Path)
parser.add_argument('--destination', type=Path)
args = parser.parse_args()
if args.community:
    import json
    from community_worker import REPO, REVISION, EXPECTED_HASHES, checksum
    folder = args.community.resolve(strict=True)
    manifest = json.loads((folder / 'dssa-community-manifest.json').read_text())
    assert manifest == {'repo': REPO, 'revision': REVISION, 'files': EXPECTED_HASHES}
    assert all(checksum(folder / name) == digest for name, digest in EXPECTED_HASHES.items())
    from pyannote.audio import Pipeline
    Pipeline.from_pretrained(str(folder))
if args.alignment:
    from whisperx_alignment_trial import verify_model
    verify_model(args.alignment.resolve(strict=True), args.language)
if args.punkt:
    root = (args.destination / 'tokenizers').resolve()
    root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.punkt) as archive:
        for item in archive.infolist():
            target = (root / item.filename).resolve()
            if root not in target.parents or item.file_size > 32 * 1024 ** 2:
                raise ValueError('Unsafe Punkt archive')
        archive.extractall(root)
    assert (root / 'punkt_tab/norwegian/collocations.tab').is_file()
    assert (root / 'punkt_tab/english/collocations.tab').is_file()
print('Validated')
