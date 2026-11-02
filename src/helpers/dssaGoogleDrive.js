const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const { pipeline } = require("stream/promises");
const { Readable, Transform } = require("stream");
const API = "https://www.googleapis.com/drive/v3";
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
];
const FOLDER = "application/vnd.google-apps.folder";
function fileId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,256}$/.test(value))
    throw Error("Ugyldig Google-fil eller mappe.");
  return value;
}
function folderId(value) {
  if (typeof value === "string" && value.startsWith("https://")) {
    const u = new URL(value);
    if (u.hostname !== "drive.google.com" || u.username || u.password)
      throw Error("Bruk en Google Disk-mappelenke.");
    const match = u.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)\/?$/);
    if (!match) throw Error("Bruk en Google Disk-mappelenke.");
    return fileId(match[1]);
  }
  return fileId(value);
}
class DssaGoogleDrive {
  constructor(
    { app, safeStorage, net, dialog },
    {
      client = () => require("./dssaGoogleCalendarClient").readClient(),
      oauth = (o) => require("./oauthLoopbackFlow").runOAuthLoopbackFlow(o),
      tempRoot = () => require("./safeTempDir").getSafeTempDir(),
    } = {}
  ) {
    Object.assign(this, { app, safeStorage, net, dialog, client, oauth, tempRoot });
    this.file = path.join(app.getPath("userData"), "dssa-google-drive.dpapi");
    this.generation = 0;
  }
  read() {
    if (!fs.existsSync(this.file)) return null;
    if (!this.safeStorage.isEncryptionAvailable()) throw Error("Sikker lagring er utilgjengelig.");
    if (fs.statSync(this.file).size > 65536) throw Error("Ugyldig lagret Google-tilkobling.");
    return JSON.parse(this.safeStorage.decryptString(fs.readFileSync(this.file)));
  }
  write(value) {
    if (!this.safeStorage.isEncryptionAvailable()) throw Error("Sikker lagring er utilgjengelig.");
    const temporary = this.file + "." + crypto.randomUUID() + ".part";
    try {
      fs.writeFileSync(temporary, this.safeStorage.encryptString(JSON.stringify(value)), {
        flag: "wx",
        mode: 0o600,
      });
      fs.renameSync(temporary, this.file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  status() {
    const value = this.read();
    return {
      success: true,
      configured: !!this.client(),
      connected: !!value?.refresh_token,
      user: value?.email || "",
      folder: value?.folder || { id: "root", name: "Google Disk" },
    };
  }
  async tokenRequest(body) {
    const c = this.client();
    if (!c) throw Error("Importer Google OAuth-JSON for skrivebordsapp under Tilkoblinger først.");
    const r = await this.net.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        ...body,
        client_id: c.clientId,
        client_secret: c.clientSecret,
      }).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirect: "error",
      useSessionCookies: false,
      signal: AbortSignal.timeout(30000),
    });
    const value = await r.json();
    if (!r.ok || !value.access_token)
      throw Error(
        "Google-innloggingen må godkjennes på nytt. Kontroller appoppsett og kontotilgang."
      );
    return { ...value, expires_at: Date.now() + (Number(value.expires_in) || 3600) * 1000 };
  }
  async connect() {
    const c = this.client();
    if (!c) throw Error("Importer Google OAuth-JSON for skrivebordsapp først.");
    const generation = ++this.generation;
    const tokens = await this.oauth({
      errorParam: "dssa_google_error",
      renderResultPage: ({ ok }) =>
        `<html lang="nb"><meta charset="utf-8"><title>DSSA Tale</title><h1>${ok ? "Google Disk er koblet til" : "Tilkoblingen mislyktes"}</h1><p>Du kan lukke dette vinduet og gå tilbake til DSSA Tale.</p></html>`,
      buildAuthUrl: (redirectUri, state, challenge) =>
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: c.clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: SCOPES.join(" "),
          access_type: "offline",
          prompt: "consent",
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
      handleCallback: (code, redirectUri, verifier) =>
        this.tokenRequest({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        }),
    });
    if (generation !== this.generation) throw Error("Tilkoblingen ble avbrutt.");
    const scopes = new Set(String(tokens.scope || "").split(" "));
    if (!tokens.refresh_token || !SCOPES.slice(2).every((s) => scopes.has(s)))
      throw Error(
        "Google ga ikke den nødvendige filtilgangen. Godkjenn lesing og lagring av appens filer."
      );
    const response = await this.net.fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: "Bearer " + tokens.access_token },
      redirect: "error",
      useSessionCookies: false,
      signal: AbortSignal.timeout(15000),
    });
    const user = await response.json();
    if (!response.ok || typeof user.email !== "string" || generation !== this.generation)
      throw Error("Google-kontoen kunne ikke bekreftes.");
    this.write({ ...tokens, email: user.email, folder: { id: "root", name: "Google Disk" } });
    return this.status();
  }
  disconnect() {
    this.generation++;
    if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
    return this.status();
  }
  async accessToken() {
    const current = this.read();
    if (!current?.refresh_token) throw Error("Koble til Google Disk først.");
    if (current.expires_at > Date.now() + 60000) return current.access_token;
    if (!this.refreshPromise) {
      const generation = this.generation;
      this.refreshPromise = this.tokenRequest({
        grant_type: "refresh_token",
        refresh_token: current.refresh_token,
      })
        .then((value) => {
          if (generation !== this.generation) throw Error("Tilkoblingen ble avbrutt.");
          this.write({
            ...current,
            ...value,
            refresh_token: value.refresh_token || current.refresh_token,
          });
          return value.access_token;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }
  async request(route, options = {}) {
    if (
      typeof route !== "string" ||
      !route.startsWith("/") ||
      route.startsWith("//") ||
      /[\r\n\\#]/.test(route)
    )
      throw Error("Ugyldig Google-forespørsel.");
    const response = await this.net.fetch(API + route, {
      ...options,
      headers: { ...options.headers, Authorization: "Bearer " + (await this.accessToken()) },
      redirect: "error",
      useSessionCookies: false,
      signal: AbortSignal.timeout(15 * 60000),
    });
    if (!response.ok)
      throw Error(
        `Google-filen kunne ikke åpnes (${response.status}). Kontroller konto og tilgang.`
      );
    return response;
  }
  async metadata(id) {
    return (
      await this.request(
        "/files/" +
          fileId(id) +
          "?supportsAllDrives=true&fields=id,name,mimeType,size,capabilities,trashed"
      )
    ).json();
  }
  async pin(value) {
    const id = folderId(value),
      meta = await this.metadata(id);
    if (meta.mimeType !== FOLDER || meta.trashed) throw Error("Velg en tilgjengelig Google-mappe.");
    const tokens = this.read();
    tokens.folder = { id: meta.id, name: meta.name };
    this.write(tokens);
    return this.status();
  }
  async list({ folder = "root", pageToken, query } = {}) {
    let q = "trashed = false";
    if (query) {
      if (typeof query !== "string" || query.length > 200) throw Error("Søket er for langt.");
      q += " and name contains '" + query.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
    } else q += " and '" + fileId(folder) + "' in parents";
    if (pageToken && (typeof pageToken !== "string" || pageToken.length > 4096))
      throw Error("Ugyldig sidevalg.");
    const params = new URLSearchParams({
      q,
      pageSize: "100",
      fields: "nextPageToken,files(id,name,mimeType,size)",
      orderBy: "folder,name",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      ...(pageToken ? { pageToken } : {}),
    });
    const result = await (await this.request("/files?" + params)).json();
    return {
      success: true,
      items: (result.files || []).map((i) => ({ ...i, folder: i.mimeType === FOLDER })),
      next: result.nextPageToken || null,
    };
  }
  async download({ itemId }) {
    const item = await this.metadata(itemId),
      name = String(item.name || "");
    const extension = path.extname(name).slice(1).toLowerCase();
    if (
      item.trashed ||
      !require("../constants/uploadAudioFormats.json").UPLOAD_AUDIO_EXTENSIONS.includes(
        extension
      ) ||
      item.mimeType?.startsWith("application/vnd.google-apps.")
    )
      throw Error("Velg en støttet lyd- eller videofil.");
    const size = Number(item.size),
      limit = 2 * 1024 ** 3;
    if (!Number.isSafeInteger(size) || size <= 0 || size > limit)
      throw Error("Filen er tom eller større enn grensen på 2 GB.");
    const response = await this.request(
      "/files/" + fileId(itemId) + "?alt=media&supportsAllDrives=true"
    );
    if (!response.body) throw Error("Google returnerte ikke lydfilen.");
    const target = path.join(
        this.tempRoot(),
        ".ow-url-google-" + crypto.randomUUID() + "." + extension
      ),
      temp = target + ".part";
    let received = 0;
    try {
      await pipeline(
        Readable.fromWeb(response.body),
        new Transform({
          transform(chunk, _encoding, callback) {
            received += chunk.length;
            callback(
              received > size || received > limit
                ? Error("Nedlastingen er større enn varslet.")
                : null,
              chunk
            );
          },
        }),
        fs.createWriteStream(temp, { flags: "wx", mode: 0o600 })
      );
      if (received !== size) throw Error("Nedlastingen er ufullstendig.");
      fs.renameSync(temp, target);
      return { success: true, filePath: target, name, size };
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
  async upload({ folder = "root" }) {
    const meta = await this.metadata(folder);
    if (meta.mimeType !== FOLDER || !meta.capabilities?.canAddChildren)
      throw Error("Du mangler skrivetilgang til denne mappen.");
    const pick = await this.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Word, PDF og tekst", extensions: ["docx", "pdf", "txt", "md"] }],
    });
    if (pick.canceled) return { canceled: true };
    const file = pick.filePaths[0],
      size = fs.statSync(file).size;
    if (
      ![".docx", ".pdf", ".txt", ".md"].includes(path.extname(file).toLowerCase()) ||
      !size ||
      size > 50 * 1024 ** 2
    )
      throw Error("Velg et dokument på opptil 50 MB.");
    const confirmation = await this.dialog.showMessageBox({
      type: "question",
      buttons: ["Avbryt", "Last opp"],
      defaultId: 0,
      cancelId: 0,
      message: `Last opp ${path.basename(file)} til ${meta.name}?`,
      detail:
        "Dokumentet sendes til Google Disk som en ny fil. Eksisterende filer overskrives ikke.",
    });
    if (confirmation.response !== 1) return { canceled: true };
    const token = await this.accessToken();
    const init = await this.net.fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify({ name: path.basename(file), parents: [meta.id] }),
        redirect: "error",
        useSessionCookies: false,
        signal: AbortSignal.timeout(30000),
      }
    );
    const session = new URL(init.headers.get("location") || "https://invalid.invalid");
    if (
      !init.ok ||
      session.origin !== "https://www.googleapis.com" ||
      !session.pathname.startsWith("/upload/drive/")
    )
      throw Error("Google bekreftet ikke en trygg opplasting.");
    const bytes = fs.readFileSync(file);
    if (bytes.length !== size) throw Error("Dokumentet er endret. Velg det på nytt.");
    const response = await this.net.fetch(session.href, {
      method: "PUT",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/octet-stream" },
      body: bytes,
      redirect: "error",
      useSessionCookies: false,
      signal: AbortSignal.timeout(5 * 60000),
    });
    if (!response.ok)
      throw Error("Opplastingen er ikke bekreftet. Kontroller mappen før du prøver igjen.");
    const item = await response.json();
    if (!item.id) throw Error("Google bekreftet ikke den nye filen.");
    return { success: true, name: item.name };
  }
}
module.exports = { DssaGoogleDrive, fileId, folderId, SCOPES };
