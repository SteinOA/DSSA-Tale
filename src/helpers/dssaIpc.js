const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");
const writer = require("./dssaDocument");
const { DssaMicrosoft } = require("./dssaMicrosoft");
const { translateNative: ui } = require("./dssaNativeLabels");

function registerDssaHandlers(owner, audioPaths = {}) {
  const electron = require("electron");
  const { ipcMain, app, dialog, shell } = electron;
  const microsoft = new DssaMicrosoft(electron);
  const googleDrive = new (require("./dssaGoogleDrive").DssaGoogleDrive)(electron);
  const bundledSetup = path.join(process.resourcesPath || "", "community-engine");
  const meetingSetup = new (require("./dssaMeetingSetup").MeetingSetup)(electron, {
    scripts: fs.existsSync(path.join(bundledSetup, "verify_setup.py")) ? bundledSetup : undefined,
  });
  app.on("before-quit", () => meetingSetup.cancel());
  const resources = new (require("./dssaResources").ResourceMonitor)();
  const hardware = new (require("./dssaHardware").HardwareAdvisor)(app.getPath("userData"));
  hardware.snapshot().catch(() => {});
  const imports = new (require("./dssaImportJobs").ImportJobs)(app.getPath("userData"), {
    database: owner.databaseManager,
    resolveAudio: audioPaths.resolveAllowedAudioPath,
    approveAudio: audioPaths.approveAudioPath,
    canPersist: () =>
      owner._retentionSettingsSynced === true &&
      owner._retentionSettings.dataRetentionEnabled === true,
  });
  owner.dssaImportJobs = imports;
  function trusted(event) {
    const url = new URL(event.senderFrame?.url || event.sender.getURL());
    const built = path.resolve(__dirname, "../dist") + path.sep;
    if (url.protocol === "file:" && path.resolve(fileURLToPath(url)).startsWith(built)) return;
    if (!app.isPackaged && url.hostname === "localhost" && url.protocol === "http:") return;
    throw Error("Handlingen må startes fra DSSA Tale.");
  }
  function handle(channel, action) {
    ipcMain.handle(channel, async (event, args) => {
      try {
        trusted(event);
        return await action(args || {});
      } catch (error) {
        return { success: false, error: ui(error.message || "Handlingen kunne ikke fullføres.") };
      }
    });
  }
  handle("dssa-export-document", async (options) => {
    if (
      !Number.isSafeInteger(options.noteId) ||
      !["docx", "pdf", "txt"].includes(options.format) ||
      !["notes", "summary", "transcript"].includes(options.source)
    )
      throw Error("Ugyldig dokumentvalg.");
    const note = owner.databaseManager.getNote(options.noteId);
    if (!note) throw Error("Møtet finnes ikke lenger.");
    const mappings = owner._buildSpeakerMappings(options.noteId);
    const document = writer.buildDocument(note, options, mappings);
    const extension = options.format;
    const safeName =
      document.title
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
        .replace(/[. ]+$/, "")
        .slice(0, 100) || "Møtedokument";
    const result = await dialog.showSaveDialog({
      defaultPath: `${safeName}.${extension}`,
      filters: [
        {
          name:
            extension === "docx"
              ? ui("Word-dokument")
              : extension === "pdf"
                ? ui("PDF-dokument")
                : ui("Ren tekst"),
          extensions: [extension],
        },
      ],
    });
    if (result.canceled) return { canceled: true };
    // Let the chosen format determine the extension, even after manual edits.
    const target = result.filePath.toLowerCase().endsWith("." + extension)
      ? result.filePath
      : result.filePath + "." + extension;
    if (target !== result.filePath && fs.existsSync(target))
      throw Error(
        "Det finnes allerede en fil med riktig filtype på dette navnet. Velg et nytt navn."
      );
    const bytes =
      extension === "docx"
        ? await writer.createDocx(document)
        : extension === "pdf"
          ? await writer.createPdf(document)
          : Buffer.from(writer.plainText(document), "utf8");
    const temporary = target + ".dssa-" + require("crypto").randomUUID() + ".part";
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx" });
      fs.renameSync(temporary, target);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    return { success: true, filePath: target };
  });
  const connections = require("./dssaConnections");
  handle("dssa-connections", () => ({ connections: connections.listConnections(app) }));
  handle("dssa-connection-choose", ({ source }) =>
    connections.chooseConnectionFolder({ app, dialog }, source)
  );
  handle("dssa-connection-use-detected", ({ source, path: folder }) =>
    connections.useDetectedConnectionFolder(app, source, folder)
  );
  handle("dssa-connection-remove", ({ source }) => connections.removeConnectionFolder(app, source));
  handle("dssa-connection-open", ({ source }) =>
    connections.openConnectionFolder({ app, shell }, source)
  );
  handle("dssa-connection-login", ({ source }) =>
    connections.openConnectionLogin({ shell }, source)
  );
  handle("dssa-microsoft-status", () => microsoft.status());
  handle("dssa-meeting-setup-status", () => meetingSetup.status());
  handle("dssa-meeting-setup-start", (args) => meetingSetup.start(args));
  handle("dssa-meeting-setup-cancel", () => meetingSetup.cancel());
  handle("dssa-meeting-setup-credential", (args) => meetingSetup.credential(args.token));
  handle("dssa-meeting-setup-forget", () => meetingSetup.forgetCredential());
  handle("dssa-google-drive-status", () => googleDrive.status());
  handle("dssa-google-drive-client", () => require("./dssaGoogleCalendarClient").importClient());
  handle("dssa-google-drive-connect", () => googleDrive.connect());
  handle("dssa-google-drive-disconnect", () => googleDrive.disconnect());
  handle("dssa-google-drive-list", (args) => googleDrive.list(args));
  handle("dssa-google-drive-pin", (args) => googleDrive.pin(args.folder));
  handle("dssa-google-drive-upload", (args) => googleDrive.upload(args));
  handle("dssa-google-drive-download", async (args) => {
    const result = await googleDrive.download(args);
    if (result.filePath) audioPaths.approveAudioPath?.(result.filePath);
    return result;
  });
  handle("dssa-import-begin", ({ filePath, configuration, resumeId }) =>
    imports.begin(filePath, configuration, resumeId)
  );
  handle("dssa-import-jobs", () => imports.list());
  handle("dssa-import-resume", ({ id }) => imports.resume(id));
  handle("dssa-import-locate", async ({ id }) => {
    const job = imports.read(id);
    const result = await dialog.showOpenDialog({
      title: ui("Velg samme originalopptak"),
      defaultPath: job.source.path,
      properties: ["openFile"],
      filters: [
        {
          name: ui("Lyd og video"),
          extensions: require("../constants/uploadAudioFormats.json").UPLOAD_AUDIO_EXTENSIONS,
        },
      ],
    });
    return result.canceled ? { canceled: true } : imports.relink(id, result.filePaths[0]);
  });
  handle("dssa-import-stage", ({ id, stage, result }) => imports.stage(id, stage, result));
  handle("dssa-import-pause", ({ id }) => imports.pause(id));
  handle("dssa-import-dismiss", ({ id }) => imports.dismiss(id));
  handle("dssa-import-commit", ({ id, ...args }) => {
    const result = imports.commit(id, args);
    require("./windowBroadcast").broadcastToWindows("note-added", result.note);
    owner.notifyVectorChanges();
    owner._asyncMirrorWrite(result.note);
    return result;
  });
  const speakerPreview = new (require("./dssaSpeakerPreview").SpeakerPreview)({
    profile: app.getPath("userData"),
    database: owner.databaseManager,
    imports,
    dialog,
    approveAudio: audioPaths.approveAudioPath,
    ffmpeg: () => require("./ffmpegUtils").getFFmpegPath(),
  });
  handle("dssa-speaker-samples", ({ noteId, speaker }) => speakerPreview.windows(noteId, speaker));
  handle("dssa-speaker-attach", ({ noteId }) => speakerPreview.attach(noteId));
  handle("dssa-speaker-clip", ({ noteId, speaker, index }) =>
    speakerPreview.clip(noteId, speaker, index)
  );
  handle("dssa-resources", () => resources.sample());
  handle("dssa-hardware-profile", ({ refresh }) => hardware.snapshot(refresh === true));
  const libraries = require("./dssaRecordingLibraries");
  handle("dssa-recording-libraries", () => libraries.listLibraries(app));
  handle("dssa-add-recording-library", (args) => libraries.addLibrary({ app, dialog }, args));
  handle("dssa-remove-recording-library", (args) => libraries.removeLibrary(app, args.id));
  handle("dssa-microsoft-connect", (args) => microsoft.connect(args.clientId));
  handle("dssa-microsoft-disconnect", () => microsoft.disconnect());
  handle("dssa-microsoft-list", (args) => microsoft.list(args.kind, args));
  handle("dssa-microsoft-download", (args) => microsoft.download(args));
  handle("dssa-microsoft-upload", (args) => microsoft.upload(args));
  handle("dssa-open-microsoft-link", async ({ url }) => {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      ![
        "teams.microsoft.com",
        "teams.live.com",
        "outlook.office.com",
        "outlook.office365.com",
        "outlook.live.com",
      ].includes(parsed.hostname)
    )
      throw Error("Dette er ikke en støttet Teams- eller Outlook-lenke.");
    await shell.openExternal(parsed.href);
    return { success: true };
  });
  handle("dssa-local-folders", () => {
    const home = app.getPath("home");
    const candidates = [
      process.env.OneDriveCommercial,
      process.env.OneDriveConsumer,
      process.env.OneDrive,
      path.join(home, "iCloudDrive"),
      path.join(home, "Google Drive"),
      path.join(home, "My Drive"),
    ].filter(Boolean);
    return [...new Set(candidates)]
      .filter((p) => fs.existsSync(p))
      .map((p) => ({ name: path.basename(p), path: p }));
  });
  handle("dssa-open-local-folder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled) return { canceled: true };
    const error = await shell.openPath(result.filePaths[0]);
    if (error) throw Error(error);
    return { success: true };
  });
}
module.exports = { registerDssaHandlers };
