# Community-1 as an optional installed-app add-on

Product direction: ship Community-1 support and setup instructions in DSSA Tale,
then let users install the runtime/libraries and model later through the existing
Settings > System meeting-tools setup. Installing this supported add-on must not
require a new app version merely to unlock the engine. Runtime and model are not
included in the main installer by this change.

The existing dssaMeetingSetup backend already provides runtime, credentials and
Community model operations. No backend/provisioning behavior is changed here.
The setup card now explains the ordered steps and shows the installed CPU/CUDA
edition. The guide covers disk/network/model access, CPU load, memory, NVIDIA
driver compatibility, shared WhisperX ownership and the existing restriction on
switching CPU/CUDA environments. It does not promise an automatic GPU fallback
for every failure or automatic upgrades of separately installed tools.

The isolated CPU-bundle investigation was stopped when the product direction
changed to optional in-app installation. Python 3.12.16 was downloaded and its
existing pinned checksum verified in .dssa-build/community-cpu-spike. Dependency
resolution was cancelled. No working CPU package or inference benchmark resulted.
Nothing was installed into the user's app profile by that investigation.

Validation: TypeScript, ESLint and the six existing setup/Community unit tests.
These tests do not prove a fresh-machine installation, model authorization or
full inference. Package server changes can still require maintenance releases;
the no-new-upgrade promise concerns the normal supported add-on installation,
not indefinite compatibility with every future external dependency change.

## Windows v38 presentation

System now shows a read-only installed-model inventory and the saved language. Only optional Community-1 provisioning stays there: Prepare Community-1 selects the compatible CPU/CUDA edition automatically on first installation, followed by the user-owned model credential and model download. Model selection and language changes remain under Speech to text / Audio upload. Optional wav2vec2 word-timing model installation is available only beside the corresponding Community-1 import controls, using the import language; it does not change the dictation model or enable alignment by itself.
