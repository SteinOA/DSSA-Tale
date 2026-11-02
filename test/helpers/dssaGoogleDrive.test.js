const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { DssaGoogleDrive, folderId, SCOPES } = require("../../src/helpers/dssaGoogleDrive");
function fixture(t, fetch) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "dssa-google-test-"));
  t.after(() => {
    if (path.dirname(root) === fs.realpathSync(os.tmpdir()))
      fs.rmSync(root, { recursive: true, force: true });
  });
  const api = new DssaGoogleDrive(
    {
      app: { getPath: () => root },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s) => Buffer.from("encrypted-test:" + s),
        decryptString: (b) => b.toString().slice(15),
      },
      net: { fetch },
      dialog: {},
    },
    {
      client: () => ({ clientId: "public-client", clientSecret: "test-secret" }),
      tempRoot: () => root,
    }
  );
  api.write({
    refresh_token: "test-refresh",
    access_token: "test-access",
    email: "test@example.invalid",
    expires_at: Date.now() + 3600000,
  });
  return { root, api };
}
test("folder links accept only Google Drive folders; bearer credentials stay on fixed Google API origin", async (t) => {
  assert.equal(folderId("https://drive.google.com/drive/u/0/folders/folder_1"), "folder_1");
  for (const value of [
    "https://evil.invalid/drive/folders/a",
    "https://drive.google.com.evil.invalid/drive/folders/a",
    "../secret",
  ])
    assert.throws(() => folderId(value));
  const { api } = fixture(t, async (url, options) => {
    assert.ok(url.startsWith("https://www.googleapis.com/drive/v3/"));
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer test-access");
    return Response.json({ files: [] });
  });
  await api.list();
  await assert.rejects(api.request("//evil.invalid"), /Ugyldig/);
  assert.ok(!("access_token" in api.status()));
});
test("refresh is serialized and disconnect prevents a late refresh from restoring credentials", async (t) => {
  let finish,
    calls = 0;
  const { api } = fixture(t, () => {
    calls++;
    return new Promise((resolve) => {
      finish = () => resolve(Response.json({ access_token: "new-token", expires_in: 3600 }));
    });
  });
  api.write({ ...api.read(), expires_at: 0 });
  const first = api.accessToken(),
    second = api.accessToken();
  assert.equal(calls, 1);
  api.disconnect();
  finish();
  await assert.rejects(first, /avbrutt/);
  await assert.rejects(second, /avbrutt/);
  assert.equal(api.status().connected, false);
});
test("streamed audio import checks metadata, size and extension and never returns a partial file", async (t) => {
  let media = Buffer.from("public audio");
  const { api, root } = fixture(t, async (url) =>
    url.includes("alt=media")
      ? new Response(media)
      : Response.json({ id: "audio_1", name: "prøve.mp3", size: "12", mimeType: "audio/mpeg" })
  );
  const result = await api.download({ itemId: "audio_1" });
  assert.equal(fs.readFileSync(result.filePath).toString(), "public audio");
  media = Buffer.from("short");
  await assert.rejects(api.download({ itemId: "audio_1" }), /ufullstendig/);
  assert.equal(fs.readdirSync(root).filter((n) => n.endsWith(".part")).length, 0);
});
test("resumable document upload never sends credentials to a provider-supplied foreign URL", async (t) => {
  let calls = 0;
  const { api, root } = fixture(t, async (url) => {
    calls++;
    if (url.includes("/files/root?"))
      return Response.json({
        id: "root",
        name: "Test folder",
        mimeType: "application/vnd.google-apps.folder",
        capabilities: { canAddChildren: true },
      });
    return new Response("", {
      status: 200,
      headers: { location: "https://evil.invalid/upload/drive/v3/files" },
    });
  });
  const file = path.join(root, "public.txt");
  fs.writeFileSync(file, "public test");
  api.dialog = {
    showOpenDialog: async () => ({ canceled: false, filePaths: [file] }),
    showMessageBox: async () => ({ response: 1 }),
  };
  await assert.rejects(api.upload({ folder: "root" }), /trygg opplasting/);
  assert.equal(calls, 2);
});
test("Drive scopes allow reading recordings and creating app files without full-drive write permission", () => {
  assert.ok(SCOPES.includes("https://www.googleapis.com/auth/drive.readonly"));
  assert.ok(SCOPES.includes("https://www.googleapis.com/auth/drive.file"));
  assert.ok(!SCOPES.includes("https://www.googleapis.com/auth/drive"));
});
