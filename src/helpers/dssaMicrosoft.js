const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");
const { runOAuthLoopbackFlow } = require("./oauthLoopbackFlow");
const { translateNative: ui } = require("./dssaNativeLabels");
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES =
  "openid profile offline_access User.Read Calendars.Read Files.ReadWrite.All Sites.Read.All";
const encode = (value) => encodeURIComponent(String(value));
function validateClientId(clientId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId || ""))
    throw Error(
      "Oppgi Application (client) ID fra en Microsoft Entra-appregistrering. Dette er en offentlig ID, ikke et passord."
    );
  return clientId;
}
function graphPath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\r\n\\]/.test(value)
  )
    throw Error("Ugyldig Microsoft-forespørsel.");
  return GRAPH + value;
}
function downloadUrl(value) {
  const url = new URL(value);
  const suffixes = [
    "sharepoint.com",
    "sharepoint-df.com",
    "microsoft.com",
    "1drv.com",
    "1drvusercontent.com",
    "storage.live.com",
    "onedrive.com",
  ];
  if (
    url.protocol !== "https:" ||
    !suffixes.some((s) => url.hostname === s || url.hostname.endsWith("." + s))
  )
    throw Error(
      "Microsoft returnerte en ukjent filadresse. Åpne filen i nettleseren og last den ned derfra."
    );
  return url.href;
}
class DssaMicrosoft {
  constructor({ app, safeStorage, net, dialog }) {
    Object.assign(this, { app, safeStorage, net, dialog });
    this.file = path.join(app.getPath("userData"), "dssa-microsoft.dpapi");
    this.settings = path.join(app.getPath("userData"), "dssa-microsoft.json");
    this.refreshPromise = null;
    this.generation = 0;
  }
  config() {
    let local;
    try {
      local = JSON.parse(fs.readFileSync(this.settings, "utf8"));
    } catch {
      // No per-profile override; use the publisher's public desktop app ID.
    }
    if (local?.clientId) return { clientId: validateClientId(local.clientId) };
    if (!this.app.getAppPath) return {};
    const metadata = JSON.parse(
      fs.readFileSync(path.join(this.app.getAppPath(), "package.json"), "utf8")
    );
    const clientId = metadata.dssaMicrosoftDesktopClientId;
    return clientId ? { clientId: validateClientId(clientId) } : {};
  }
  read() {
    if (!fs.existsSync(this.file)) return null;
    if (!this.safeStorage.isEncryptionAvailable())
      throw Error("Windows kan ikke åpne den krypterte Microsoft-tilkoblingen.");
    return JSON.parse(this.safeStorage.decryptString(fs.readFileSync(this.file)));
  }
  write(tokens) {
    if (!this.safeStorage.isEncryptionAvailable())
      throw Error("Sikker lagring er ikke tilgjengelig. Tilkoblingen ble ikke lagret.");
    fs.writeFileSync(this.file, this.safeStorage.encryptString(JSON.stringify(tokens)));
  }
  status() {
    const t = this.read();
    const config = this.config();
    return {
      configured: !!config.clientId,
      connected: !!t?.refresh_token,
      user: t?.displayName || "",
      clientId: config.clientId || "",
    };
  }
  async tokenRequest(body) {
    const response = await this.net.fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        body: new URLSearchParams(body).toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(45000),
      }
    );
    const data = await response.json();
    if (!response.ok || !data.access_token)
      throw Error(
        "Microsoft-innloggingen kunne ikke fullføres. Kontroller appregistreringen og logg inn på nytt."
      );
    return { ...data, expires_at: Date.now() + data.expires_in * 1000 };
  }
  async connect(clientId = this.config().clientId) {
    validateClientId(clientId);
    const generation = ++this.generation;
    const tokens = await runOAuthLoopbackFlow({
      errorParam: "dssa_error",
      redirectHost: "localhost",
      renderResultPage: ({ ok }) =>
        `<html lang="${require("./i18nMain").i18nMain.language}"><meta charset="utf-8"><title>DSSA Tale</title><h1>${ui(ok ? "Microsoft er koblet til" : "Tilkoblingen mislyktes")}</h1><p>${ui("Du kan lukke dette vinduet og gå tilbake til DSSA Tale.")}</p></html>`,
      buildAuthUrl: (redirectUri, state, challenge) =>
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" +
        new URLSearchParams({
          client_id: clientId,
          response_type: "code",
          redirect_uri: redirectUri,
          scope: SCOPES,
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          prompt: "select_account",
        }),
      handleCallback: (code, redirectUri, verifier) =>
        this.tokenRequest({
          client_id: clientId,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
          scope: SCOPES,
        }),
    });
    if (generation !== this.generation) throw Error("Tilkoblingen ble avbrutt.");
    const me = await this.net.fetch(GRAPH + "/me?$select=displayName", {
      headers: { Authorization: "Bearer " + tokens.access_token },
      signal: AbortSignal.timeout(30000),
    });
    if (!me.ok) throw Error("Microsoft-kontoen kunne ikke bekreftes. Prøv å koble til igjen.");
    tokens.displayName = (await me.json()).displayName;
    if (generation !== this.generation) throw Error("Tilkoblingen ble avbrutt.");
    this.write(tokens);
    fs.writeFileSync(this.settings, JSON.stringify({ clientId }));
    return this.status();
  }
  disconnect() {
    ++this.generation;
    if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
    return this.status();
  }
  async accessToken() {
    const tokens = this.read();
    if (!tokens?.refresh_token) throw Error("Koble til Microsoft først.");
    if (tokens.expires_at > Date.now() + 60000) return tokens.access_token;
    if (!this.refreshPromise) {
      const generation = this.generation;
      this.refreshPromise = this.tokenRequest({
        client_id: this.config().clientId,
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        scope: SCOPES,
      })
        .then((fresh) => {
          if (generation !== this.generation) throw Error("Microsoft er koblet fra.");
          this.write({
            ...tokens,
            ...fresh,
            refresh_token: fresh.refresh_token || tokens.refresh_token,
          });
          return fresh.access_token;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }
  async request(route, options = {}) {
    const response = await this.net.fetch(graphPath(route), {
      ...options,
      headers: { Authorization: "Bearer " + (await this.accessToken()), ...options.headers },
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) {
      if (response.status === 401)
        throw Error("Microsoft-innloggingen er utløpt. Koble til på nytt.");
      if (response.status === 403)
        throw Error(
          "Kontoen mangler tilgang. Kontroller Microsoft-tillatelsene eller kontakt administratoren."
        );
      if (response.status === 429) throw Error("Microsoft ber om en pause. Prøv igjen om litt.");
      throw Error(`Microsoft kunne ikke utføre handlingen (${response.status}).`);
    }
    return response;
  }
  async list(kind, args = {}) {
    let route;
    if (kind === "events") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 14 * 86400000);
      route =
        "/me/calendarView?" +
        new URLSearchParams({
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
          $orderby: "start/dateTime",
          $top: "100",
          $select: "id,subject,start,end,onlineMeeting,webLink,attendees",
        });
    } else if (kind === "sites") {
      const query = String(args.query || "").trim();
      if (/^https?:/i.test(query)) {
        const url = new URL(query);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.port ||
          !/^[a-z0-9][a-z0-9-]*\.sharepoint\.com$/i.test(url.hostname)
        )
          throw Error("Bruk en HTTPS-lenke til SharePoint-området ditt.");
        // A library/folder link still identifies its containing site. Requests
        // always go to Graph; never send bearer credentials to the pasted URL.
        const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        const managed = ["sites", "teams"].includes(parts[0]?.toLowerCase());
        if (managed && (!parts[1] || /[\\/\x00-\x1f]/.test(parts[1])))
          throw Error("SharePoint-lenken mangler et gyldig områdenavn.");
        const sitePath = managed ? parts.slice(0, 2).map(encode).join("/") : "";
        const site = await (await this.request(`/sites/${url.hostname}:/${sitePath}`)).json();
        return { items: [site], next: null };
      }
      route = "/sites?search=" + encode(query.slice(0, 120));
    } else if (kind === "drives")
      route = args.siteId ? `/sites/${encode(args.siteId)}/drives` : "/me/drives";
    else if (kind === "files")
      route = `/drives/${encode(args.driveId)}/${args.itemId ? "items/" + encode(args.itemId) : "root"}/children?$top=100`;
    else throw Error("Ukjent Microsoft-visning.");
    // Follow server pagination only on the same Graph origin and version.
    if (args.next) {
      const u = new URL(args.next);
      if (u.origin !== "https://graph.microsoft.com" || !u.pathname.startsWith("/v1.0/"))
        throw Error("Ugyldig sideadresse.");
      route = u.pathname.slice(5) + u.search;
    }
    const result = await (await this.request(route)).json();
    return { items: result.value || [], next: result["@odata.nextLink"] || null };
  }
  async download({ driveId, itemId, forImport = false }) {
    const item = await (
      await this.request(`/drives/${encode(driveId)}/items/${encode(itemId)}?$select=id,name,size`)
    ).json();
    if (item.size > 2 * 1024 ** 3)
      throw Error(
        "Filen er over 2 GB. Bruk en synkronisert OneDrive/SharePoint-mappe for store opptak."
      );
    const extension = path
      .extname(item.name || "")
      .slice(1)
      .toLowerCase();
    if (
      forImport &&
      !require("../constants/uploadAudioFormats.json").UPLOAD_AUDIO_EXTENSIONS.includes(extension)
    )
      throw Error("Velg en støttet lyd- eller videofil.");
    const pick = forImport
      ? {
          canceled: false,
          filePath: path.join(
            require("./safeTempDir").getSafeTempDir(),
            "ow-url-ms-" + require("crypto").randomUUID() + "." + extension
          ),
        }
      : await this.dialog.showSaveDialog({ defaultPath: path.basename(item.name || "opptak.wav") });
    if (pick.canceled) return { canceled: true };
    const response = await this.net.fetch(
      graphPath(`/drives/${encode(driveId)}/items/${encode(itemId)}/content`),
      {
        redirect: "manual",
        headers: { Authorization: "Bearer " + (await this.accessToken()) },
        signal: AbortSignal.timeout(60000),
      }
    );
    const content =
      response.status >= 300 && response.status < 400
        ? await this.net.fetch(downloadUrl(response.headers.get("location")), {
            signal: AbortSignal.timeout(15 * 60000),
          })
        : response;
    if (!content.ok || !content.body) throw Error("Microsoft-filen kunne ikke lastes ned.");
    const temp = pick.filePath + ".dssa-" + require("crypto").randomUUID() + ".part";
    try {
      await pipeline(Readable.fromWeb(content.body), fs.createWriteStream(temp, { flags: "wx" }));
      if (Number.isFinite(item.size) && fs.statSync(temp).size !== item.size)
        throw Error("Nedlastingen var ufullstendig. Prøv igjen.");
      fs.renameSync(temp, pick.filePath);
      return {
        success: true,
        filePath: pick.filePath,
        name: item.name,
        size: fs.statSync(pick.filePath).size,
      };
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
  async upload({ driveId, itemId }) {
    const pick = await this.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: ui("Dokumenter og opptak"),
          extensions: ["docx", "pdf", "txt", "wav", "mp3", "m4a", "webm"],
        },
      ],
    });
    if (pick.canceled) return { canceled: true };
    const file = pick.filePaths[0];
    if (fs.statSync(file).size > 250 * 1024 ** 2)
      throw Error("Bruk en synkronisert mappe for opplasting over 250 MB.");
    const confirmed = await this.dialog.showMessageBox({
      type: "question",
      buttons: [ui("Avbryt"), ui("Last opp")],
      defaultId: 0,
      cancelId: 0,
      message: ui("Last opp {{file}} til valgt Microsoft-mappe?", { file: path.basename(file) }),
      detail: ui(
        "Dette sender filen til OneDrive eller SharePoint. En eksisterende fil skal ikke overskrives; du får et nytt filnavn."
      ),
    });
    if (confirmed.response !== 1) return { canceled: true };
    const name = path.basename(file);
    const parent = itemId ? `items/${encode(itemId)}` : "root";
    // The documented upload-session conflict policy preserves existing files.
    const session = await (
      await this.request(
        `/drives/${encode(driveId)}/${parent}:/${encode(name)}:/createUploadSession`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename", name } }),
        }
      )
    ).json();
    const target = downloadUrl(session.uploadUrl);
    const bytes = fs.readFileSync(file);
    if (!bytes.length || bytes.length > 250 * 1024 ** 2)
      throw Error("Filen er tom eller har endret størrelse. Velg filen på nytt.");
    let result;
    const chunkSize = 10 * 1024 ** 2; // 32 multiples of Graph's 320 KiB unit.
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
      // The session URL is preauthenticated. Never forward the bearer token.
      const response = await this.net.fetch(target, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range": `bytes ${offset}-${offset + chunk.length - 1}/${bytes.length}`,
        },
        body: chunk,
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok)
        throw Error(
          `Opplastingen ble ikke bekreftet (${response.status}). Kontroller mappen før du prøver på nytt.`
        );
      result = await response.json();
    }
    if (!result.id)
      throw Error("Microsoft bekreftet ikke filen. Kontroller mappen før du prøver på nytt.");
    return { success: true, name: result.name, webUrl: result.webUrl };
  }
}
module.exports = { DssaMicrosoft, graphPath, downloadUrl, validateClientId };
