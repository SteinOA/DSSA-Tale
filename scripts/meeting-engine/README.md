# Local meeting-engine comparison

These are experimental CLI adapters, **not the production dictation engine**.
Keep virtual environments, model weights, credentials, requests and results
outside the Git checkout. Neither adapter uploads recordings. Model downloads
are a separate, explicit setup step; inference uses local files.

## Faster-Whisper

Use Python 3.12 in a separate venv. `requirements-win-tested.txt` records the
complete tested Windows environment; `requirements.txt` lists direct runtime
dependencies. PyAV is pinned because version 19 changed an API used by
Faster-Whisper 1.2.1. Existing Electron/Whisper dependencies are not modified.

```powershell
python -m venv ..\meeting-engine-venv
..\meeting-engine-venv\Scripts\python.exe -m pip install -r scripts\meeting-engine\requirements-win-tested.txt
python scripts\meeting-engine\download_nb_model.py --output ..\meeting-engine-models\nb-whisper-large-ct2
..\meeting-engine-venv\Scripts\python.exe scripts\meeting-engine\worker.py --request ..\private-request.json --result ..\private-result.json
```

The download uses the publisher's `NbAiLab/nb-whisper-large` CT2 files at pinned
revision `8c6249fdeeb4dcd05e5735a4c39640607eb6e4ac`. Sizes and SHA-256 checksums
are verified before use. The model requires approximately 6.2 GB on disk.

Request JSON:

```json
{
  "audioPath": "C:\\private\\meeting.wav",
  "modelPath": "C:\\private\\nb-whisper-large-ct2",
  "language": "nn",
  "device": "cuda",
  "computeType": "float16",
  "batchSize": 2
}
```

Language is explicit: `nb`/`no`, `nn`, or `en`. The task is transcription,
not translation. There is no silent fallback to another language, device or
model. JSON progress contains counts and audio times, not transcript contents.
Results include actual segment and word times. CUDA and CPU modes must be
benchmarked separately; do not load this GPU model beside production's large
GPU model on an 8 GB card without a memory/concurrency plan.

Five-minute real-audio tests on RTX 2070, FP16, batch 2 succeeded on `no` and
`nn`. Inference took 19.80 s / 18.19 s; cold verification/loading took
28.97 s / 27.22 s. These are functional/speed tests, not word-error-rate proof.

## Community-1

Use a **different** venv with the official CUDA 12.6 PyTorch wheels:

```powershell
python -m venv ..\diarization-engine-venv
..\diarization-engine-venv\Scripts\python.exe -m pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu126
..\diarization-engine-venv\Scripts\python.exe -m pip install -r scripts\meeting-engine\requirements-community.txt
python scripts\meeting-engine\local_credential.py --output ..\meeting-engine-private\huggingface-token.dpapi
..\diarization-engine-venv\Scripts\python.exe scripts\meeting-engine\community_worker.py --download ..\meeting-engine-models\community-1 --credential-file ..\meeting-engine-private\huggingface-token.dpapi
..\diarization-engine-venv\Scripts\python.exe scripts\meeting-engine\community_worker.py --request ..\private-diarization-request.json --result ..\private-diarization-result.json
```

Credentials are entered with hidden input and encrypted using Windows
current-user DPAPI. They must never be passed in command arguments or added to
Git. Hugging Face account access and model terms must be handled by the user;
the downloader does not accept terms. The initial authenticated model request
returned GatedRepo/403, so **Community-1 has not been tested on audio here**.

Inference request uses `audioPath` (mono 16 kHz PCM16 WAV), `modelPath`, `device`
and optional `maxSpeakers` (1–12). Model checksums are checked, Hugging Face is
offline, and pyannote metrics are disabled for inference. Audio is loaded from
PCM in memory. TorchCodec's missing shared FFmpeg warning does not block the
tested Pipeline import; actual pipeline execution remains unverified until
model access is granted. Exclusive diarization output is available as timed
speaker groups; group count is not identity accuracy.

Sources: [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper),
[NB-Whisper](https://huggingface.co/NbAiLab/nb-whisper-large),
[Community-1](https://huggingface.co/pyannote/speaker-diarization-community-1).
