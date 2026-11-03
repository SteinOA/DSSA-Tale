const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const { spawn } = require("child_process");
const { atomicJson, readJson } = require("./dssaImportJobs");
const { killProcess } = require("../utils/process");
const PYTHON = {
  url: "https://github.com/astral-sh/python-build-standalone/releases/download/20261026/cpython-3.12.16%2B20261026-x86_64-pc-windows-msvc-install_only_stripped.tar.gz",
  sha256: "1f2ab53880fc67ea323398c6388e05af28addc99a8e389209f08a51fdff4b149",
  bytes: 22014416,
};
const PUNKT = {
  url: "https://raw.githubusercontent.com/nltk/nltk_data/4f15a3d89eefe9748ec1c05be495d91289197155/packages/tokenizers/punkt_tab.zip",
  sha256: "e57f64187974277726a3417ca6f181ec5403676c717672eef6a748a7b20e0106",
  bytes: 4319076,
};
function bundledSileroAvailable(
  resourcesPath = process.resourcesPath,
  projectRoot = path.resolve(__dirname, "../..")
) {
  const name = "ggml-silero-v5.1.2.bin";
  return [
    resourcesPath && path.join(resourcesPath, "bin", "whisper-vad", name),
    path.join(projectRoot, "resources", "bin", "whisper-vad", name),
  ]
    .filter(Boolean)
    .some((file) => {
      try {
        const info = fs.statSync(file);
        return info.isFile() && info.size > 0;
      } catch {
        return false;
      }
    });
}
class MeetingSetup {
  constructor({ app, net, safeStorage }, { scripts } = {}) {
    Object.assign(this, { app, net, safeStorage });
    this.profile = app.getPath("userData");
    this.root = path.join(this.profile, "optional-meeting-engines");
    this.scripts = scripts || path.join(__dirname, "../../scripts/meeting-engine");
    this.state = { busy: false, phase: "idle" };
  }
  status() {
    return {
      ...this.state,
      runtime: !!this.runtime(),
      runtimeDevice: this.runtime()?.device,
      community: !!require("./dssaCommunityDiarization").readCommunityConfig(this.profile),
      alignment: require("./dssaAlignment").readAlignmentConfig(this.profile)?.models || {},
      credential: fs.existsSync(path.join(this.root, "huggingface.dpapi")),
      sileroInstalled: bundledSileroAvailable(),
    };
  }
  async credential(token) {
    if (this.state.busy) throw Error("Vent til installasjonen er ferdig.");
    this.controller = new AbortController();
    if (typeof token !== "string" || !/^hf_[a-zA-Z0-9]{10,250}$/.test(token))
      throw Error("Ugyldig Hugging Face-nøkkel. Lim den inn i nøkkelfeltet i appen.");
    const runtime = this.runtime();
    if (!runtime) throw Error("Installer møteverktøyene før nøkkelen lagres.");
    await this.command(
      runtime.pythonPath,
      [
        path.join(this.scripts, "local_credential.py"),
        "--stdin",
        "--output",
        path.join(this.root, "huggingface.dpapi"),
      ],
      { input: token + "\n" }
    );
    return { success: true };
  }
  forgetCredential() {
    if (this.state.busy) throw Error("Vent til installasjonen er ferdig.");
    const file = path.join(this.root, "huggingface.dpapi");
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return { success: true };
  }
  runtime() {
    try {
      const value = readJson(path.join(this.root, "runtime.json"));
      if (value.version !== 1 || !fs.statSync(value.pythonPath).isFile()) return null;
      return value;
    } catch {
      return null;
    }
  }
  start(options = {}) {
    if (this.state.busy) throw Error("En installasjon arbeider allerede.");
    if (process.platform !== "win32" || process.arch !== "x64")
      throw Error("Dette oppsettet gjelder Windows x64.");
    if (
      !["runtime", "community", "alignment-fast", "alignment-precise"].includes(options.kind) ||
      !["auto", "cpu", "cuda"].includes(options.device || "auto") ||
      !["nb", "nn", "both"].includes(options.language || "both")
    )
      throw Error("Ugyldig installasjonsvalg.");
    this.controller = new AbortController();
    this.state = { busy: true, phase: "preparing", kind: options.kind };
    this.pending = this.install(options)
      .then(() => {
        this.state = { ...this.state, busy: false, phase: "done" };
      })
      .catch((error) => {
        this.state = {
          ...this.state,
          busy: false,
          phase: this.controller.signal.aborted ? "cancelled" : "failed",
          error: this.controller.signal.aborted
            ? undefined
            : error.code === "HF_ACCESS"
              ? "Hugging Face avviser modelltilgangen. Godta modellvilkårene og kontroller at nøkkelen tilhører samme konto."
              : error.message,
        };
      })
      .finally(() => {
        const folder = this.newFolder;
        this.newFolder = null;
        if (folder && this.runtime()?.pythonPath !== path.join(folder, "python", "python.exe")) {
          const root = fs.realpathSync(this.root);
          if (path.dirname(folder) === root && fs.realpathSync(folder) === folder)
            fs.rmSync(folder, { recursive: true, force: true });
        }
      });
    return { success: true };
  }
  cancel() {
    this.controller?.abort();
    if (this.child) killProcess(this.child, "SIGKILL");
    return { success: true };
  }
  async command(executable, args, { input } = {}) {
    if (this.controller?.signal.aborted) throw Error("Avbrutt.");
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PIP_CONFIG_FILE: "NUL",
          PIP_INDEX_URL: "https://pypi.org/simple",
          PIP_EXTRA_INDEX_URL: "",
          PIP_DISABLE_PIP_VERSION_CHECK: "1",
          PYTHONNOUSERSITE: "1",
          HF_HUB_DISABLE_TELEMETRY: "1",
          HF_HUB_DISABLE_IMPLICIT_TOKEN: "1",
          HF_HUB_OFFLINE: "0",
          PYANNOTE_METRICS_ENABLED: "0",
        },
      });
      this.child = child;
      let text = "",
        failure;
      const abort = () => {
        failure = Error("Avbrutt.");
        killProcess(child, "SIGKILL");
      };
      this.controller?.signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => {
        failure = Error("Installasjonstrinnet brukte for lang tid.");
        killProcess(child, "SIGKILL");
      }, 45 * 60000);
      const collect = (b) => {
        text = (text + b.toString()).slice(-65536);
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.stdin.on("error", () => {});
      child.stdin.end(input || "");
      child.once("error", (e) => {
        failure = e;
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        this.controller?.signal.removeEventListener("abort", abort);
        this.child = null;
        if (failure) reject(failure);
        else if (code !== 0) {
          const e = Error(
            "Installasjonstrinnet mislyktes. Kontroller nett, ledig plass og modelltilgang, og prøv igjen."
          );
          if (/403|401|gated|Unauthorized/i.test(text)) e.code = "HF_ACCESS";
          reject(e);
        } else resolve(text);
      });
      if (this.controller?.signal.aborted) abort();
    });
  }
  async download(artifact, target) {
    const signal = this.controller.signal;
    const response = await this.net.fetch(artifact.url, { signal, useSessionCookies: false });
    if (!response.ok || !response.body) throw Error("Nedlastingen mislyktes. Prøv igjen.");
    const hash = crypto.createHash("sha256"),
      temporary = target + ".part";
    let size = 0;
    const fd = fs.openSync(temporary, "wx", 0o600);
    let closed = false;
    try {
      for await (const bytes of response.body) {
        size += bytes.length;
        if (size > artifact.bytes) throw Error("Nedlastingen er større enn forventet.");
        hash.update(bytes);
        if (fs.writeSync(fd, bytes) !== bytes.length)
          throw Error("Nedlastingen kunne ikke lagres fullstendig.");
        this.state = { ...this.state, downloadedBytes: size, totalBytes: artifact.bytes };
      }
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      closed = true;
      if (size !== artifact.bytes || hash.digest("hex") !== artifact.sha256)
        throw Error("Nedlastingen bestod ikke kontrollsummen.");
      fs.renameSync(temporary, target);
    } finally {
      if (!closed) fs.closeSync(fd);
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  async install({ kind, device = "auto", language = "both" }) {
    fs.mkdirSync(this.root, { recursive: true });
    const stat = fs.statfsSync(this.root);
    if (stat.bavail * stat.bsize < 12 * 1024 ** 3)
      throw Error("Frigjør minst 12 GB diskplass før møteverktøyene installeres.");
    let runtime = this.runtime();
    let folder;
    if (!runtime) {
      folder = path.join(fs.realpathSync(this.root), crypto.randomUUID());
      fs.mkdirSync(folder);
      this.newFolder = folder;
      let selected = device;
      if (selected === "auto") {
        const hardware = await new (require("./dssaHardware").HardwareAdvisor)(
          this.profile
        ).snapshot();
        selected = hardware.adapters.some((a) => a.vendor === "NVIDIA" && !a.software)
          ? "cuda"
          : "cpu";
      }
      this.state = { ...this.state, phase: "python", device: selected };
      const archive = path.join(folder, "python.tar.gz");
      await this.download(PYTHON, archive);
      const tar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
      await this.command(tar, ["-xf", archive, "-C", folder]);
      fs.unlinkSync(archive);
      const pythonPath = path.join(folder, "python", "python.exe");
      await this.command(pythonPath, [
        "-c",
        "import sys; assert sys.version_info[:3] == (3,12,16)",
      ]);
      this.state = { ...this.state, phase: "torch" };
      await this.command(pythonPath, [
        "-m",
        "pip",
        "install",
        "--only-binary=:all:",
        "--no-warn-script-location",
        "torch==2.8.0",
        "torchaudio==2.8.0",
        "--index-url",
        selected === "cuda"
          ? "https://download.pytorch.org/whl/cu126"
          : "https://download.pytorch.org/whl/cpu",
      ]);
      this.state = { ...this.state, phase: "packages" };
      await this.command(pythonPath, [
        "-m",
        "pip",
        "install",
        "--only-binary=:all:",
        "--no-warn-script-location",
        "--constraint",
        path.join(this.scripts, "requirements-windows.txt"),
        "pyannote.audio==4.0.3",
        "whisperx==3.8.6",
        "transformers==4.57.6",
        "torchcodec==0.7.0",
      ]);
      await this.command(pythonPath, ["-m", "pip", "check"]);
      await this.command(pythonPath, [
        "-c",
        'import pyannote.audio, whisperx, torch; assert torch.__version__.split("+")[0] == "2.8.0"',
      ]);
      fs.writeFileSync(
        path.join(folder, "requirements-resolved.txt"),
        await this.command(pythonPath, ["-m", "pip", "freeze"])
      );
      runtime = { version: 1, pythonPath, device: selected };
      atomicJson(path.join(this.root, "runtime.json"), runtime);
    } else if (device !== "auto" && device !== runtime.device) {
      throw Error(
        "Installerte møteverktøy bruker en annen CPU/GPU-utgave. Behold automatisk valg; en separat ombygging er nødvendig for å bytte kjøremiljø."
      );
    }
    if (kind === "runtime") return;
    const python = runtime.pythonPath;
    if (kind === "community") {
      const credential = path.join(this.root, "huggingface.dpapi");
      if (!fs.existsSync(credential))
        throw Error(
          "Lagre Hugging Face-nøkkelen i appen og godta Community-1-vilkårene før modellen lastes ned."
        );
      this.state = { ...this.state, phase: "community" };
      const modelPath = path.join(this.root, "models", "community-1");
      fs.mkdirSync(modelPath, { recursive: true });
      await this.command(python, [
        path.join(this.scripts, "community_worker.py"),
        "--download",
        modelPath,
        "--credential-file",
        credential,
      ]);
      await this.command(python, [
        path.join(this.scripts, "verify_setup.py"),
        "--community",
        modelPath,
      ]);
      atomicJson(path.join(this.profile, "dssa-community-engine.json"), {
        enabled: true,
        pythonPath: python,
        modelPath,
        device: "auto",
      });
    } else {
      const mode = kind === "alignment-fast" ? "fast" : "precise",
        destination = path.join(this.root, "models", mode);
      this.state = { ...this.state, phase: "alignment" };
      await this.command(python, [
        path.join(this.scripts, "download_alignment_models.py"),
        "--destination",
        destination,
        "--mode",
        mode,
        "--language",
        language,
      ]);
      const nltkPath = path.join(this.root, "nltk");
      if (
        !fs.existsSync(
          path.join(nltkPath, "tokenizers", "punkt_tab", "norwegian", "collocations.tab")
        )
      ) {
        const zip = path.join(this.root, "punkt-tab.zip");
        this.state = { ...this.state, phase: "punkt" };
        await this.download(PUNKT, zip);
        await this.command(python, [
          path.join(this.scripts, "verify_setup.py"),
          "--punkt",
          zip,
          "--destination",
          nltkPath,
        ]);
        fs.unlinkSync(zip);
      }
      const current = require("./dssaAlignment").readAlignmentConfig(this.profile);
      const models = { ...(current?.models || {}) };
      models[mode] = { ...models[mode] };
      for (const lang of language === "both" ? ["nb", "nn"] : [language]) {
        await this.command(python, [
          path.join(this.scripts, "verify_setup.py"),
          "--alignment",
          path.join(destination, lang),
          "--language",
          lang,
        ]);
        models[mode][lang] = path.join(destination, lang);
      }
      atomicJson(path.join(this.profile, "dssa-alignment-engine.json"), {
        enabled: true,
        pythonPath: python,
        nltkPath,
        models,
        device: "auto",
      });
    }
  }
}
module.exports = { MeetingSetup, PYTHON, PUNKT, bundledSileroAvailable };
