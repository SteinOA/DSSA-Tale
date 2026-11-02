const test = require("node:test");
const assert = require("node:assert/strict");
const { DssaMicrosoft, graphPath, downloadUrl } = require("../../src/helpers/dssaMicrosoft");

function clientFixture(t, clientId) {
  const fs = require("node:fs"),
    path = require("node:path");
  const root = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "dssa-ms-client-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ dssaMicrosoftDesktopClientId: clientId })
  );
  const service = new DssaMicrosoft({ app: { getPath: () => root, getAppPath: () => root } });
  return { root, service };
}

test("a fresh profile uses the publisher Microsoft app without a user-entered client ID", (t) => {
  const id = "11111111-2222-4333-8444-555555555555";
  const { root, service } = clientFixture(t, id);
  assert.deepEqual(service.config(), { clientId: id });
  assert.equal(service.status().configured, true);
  assert.equal(service.status().connected, false);
  assert.ok(!require("node:fs").existsSync(require("node:path").join(root, "dssa-microsoft.json")));
});

test("existing Microsoft client selection remains bound to token refresh over publisher defaults", async (t) => {
  const { root, service } = clientFixture(t, "11111111-2222-4333-8444-555555555555");
  const selected = "66666666-7777-4888-8999-000000000000";
  require("node:fs").writeFileSync(
    require("node:path").join(root, "dssa-microsoft.json"),
    JSON.stringify({ clientId: selected })
  );
  service.read = () => ({ refresh_token: "fixture", expires_at: 0 });
  service.write = () => {};
  service.tokenRequest = async (body) => {
    assert.equal(body.client_id, selected);
    return { access_token: "refreshed", expires_at: Date.now() + 100000 };
  };
  assert.equal(await service.accessToken(), "refreshed");
});

test("missing Microsoft app stays unconfigured; invalid publisher IDs cannot start sign-in", async (t) => {
  const { root, service } = clientFixture(t);
  assert.equal(service.status().configured, false);
  await assert.rejects(service.connect(), /appregistrering/);
  require("node:fs").writeFileSync(
    require("node:path").join(root, "package.json"),
    JSON.stringify({ dssaMicrosoftDesktopClientId: "not-a-guid" })
  );
  assert.throws(() => service.config(), /appregistrering/);
});

test("Windows build embeds only a valid public Microsoft client ID and retains Google configuration", () => {
  const { execFileSync, spawnSync } = require("node:child_process");
  const env = {
    ...process.env,
    DSSA_MICROSOFT_DESKTOP_CLIENT_ID: "11111111-2222-4333-8444-555555555555",
    DSSA_GOOGLE_DESKTOP_CLIENT_ID: "publisher.apps.googleusercontent.com",
    DSSA_GOOGLE_DESKTOP_CLIENT_SECRET: "public-desktop-value",
  };
  const script =
    'process.stdout.write(JSON.stringify(require("./electron-builder.dssa-win.cjs").extraMetadata))';
  const options = { cwd: require("node:path").resolve(__dirname, "../.."), env, windowsHide: true };
  const metadata = JSON.parse(execFileSync(process.execPath, ["-e", script], options));
  assert.equal(metadata.dssaMicrosoftDesktopClientId, env.DSSA_MICROSOFT_DESKTOP_CLIENT_ID);
  assert.equal(metadata.dssaGoogleDesktopClient.clientId, env.DSSA_GOOGLE_DESKTOP_CLIENT_ID);
  env.DSSA_MICROSOFT_DESKTOP_CLIENT_ID = "invalid";
  assert.notEqual(spawnSync(process.execPath, ["-e", script], options).status, 0);
});

test("audio import fetches a Microsoft file directly without a manual save step", async () => {
  const fs = require("fs");
  let saveCalls = 0;
  const service = new DssaMicrosoft({
    app: { getPath: () => require("os").tmpdir() },
    dialog: {
      showSaveDialog: async () => {
        saveCalls++;
        throw Error("unexpected save dialog");
      },
    },
    net: { fetch: async () => new Response(Buffer.from("abc"), { status: 200 }) },
  });
  service.request = async () => ({ json: async () => ({ name: "møte.mp3", size: 3 }) });
  service.accessToken = async () => "token";
  const result = await service.download({ driveId: "drive", itemId: "file", forImport: true });
  try {
    assert.equal(saveCalls, 0);
    assert.equal(result.success, true);
    assert.equal(result.name, "møte.mp3");
    assert.match(require("path").basename(result.filePath), /^ow-url-ms-.*\.mp3$/);
    assert.equal(fs.readFileSync(result.filePath, "utf8"), "abc");
  } finally {
    fs.unlinkSync(result.filePath);
  }
  service.request = async () => ({ json: async () => ({ name: "program.exe", size: 3 }) });
  await assert.rejects(
    service.download({ driveId: "drive", itemId: "file", forImport: true }),
    /lyd/
  );
});
test("Graph routes and download redirects cannot expose credentials to other origins", () => {
  assert.equal(graphPath("/me/drives"), "https://graph.microsoft.com/v1.0/me/drives");
  assert.throws(() => graphPath("//evil.test"));
  assert.throws(() => graphPath("https://evil.test"));
  assert.throws(() => downloadUrl("https://tenant.sharepoint.com.evil.test/file"));
  assert.throws(() => downloadUrl("http://tenant.sharepoint.com/file"));
  assert.equal(
    downloadUrl("https://tenant.sharepoint.com/file"),
    "https://tenant.sharepoint.com/file"
  );
});
test("calendar and SharePoint browsing use live responses, pagination stays on Graph", async () => {
  const service = new DssaMicrosoft({ app: { getPath: () => require("os").tmpdir() } });
  const routes = [];
  service.request = async (route) => {
    routes.push(route);
    return {
      json: async () => ({
        value: [{ id: "event-1" }],
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/drives?$skiptoken=abc",
      }),
    };
  };
  assert.equal((await service.list("events")).items[0].id, "event-1");
  assert.match(routes[0], /^\/me\/calendarView\?/);
  await service.list("drives", { siteId: "site-1" });
  assert.equal(routes[1], "/sites/site-1/drives");
  await service.list("files", { driveId: "drive/1", itemId: "folder-2" });
  assert.match(routes[2], /drive%2F1\/items\/folder-2\/children/);
  await assert.rejects(
    service.list("files", { next: "https://evil.test/v1.0/me/drives" }),
    /sideadresse/
  );
});
test("SharePoint area and library URLs resolve through Graph without fetching the pasted origin", async () => {
  const service = new DssaMicrosoft({ app: { getPath: () => require("os").tmpdir() } });
  const routes = [];
  service.request = async (route) => {
    routes.push(route);
    return { json: async () => ({ id: "site-one", name: "Østfold" }) };
  };
  const result = await service.list("sites", {
    query:
      "https://example.sharepoint.com/sites/%C3%98stfold/Shared%20Documents/Forms/AllItems.aspx?id=secret",
  });
  assert.equal(result.items[0].id, "site-one");
  assert.equal(routes[0], "/sites/example.sharepoint.com:/sites/%C3%98stfold");
  await service.list("sites", { query: "https://example.sharepoint.com/teams/Project" });
  assert.equal(routes[1], "/sites/example.sharepoint.com:/teams/Project");
  for (const url of [
    "https://example.sharepoint.com.evil.test/sites/a",
    "http://example.sharepoint.com/sites/a",
    "https://user:password@example.sharepoint.com/sites/a",
    "https://example.sharepoint.com/sites/a%2Fb",
  ])
    await assert.rejects(service.list("sites", { query: url }));
  assert.equal(routes.length, 2);
});

test("a stale token refresh cannot reconnect a user who disconnected", async () => {
  const service = new DssaMicrosoft({ app: { getPath: () => require("os").tmpdir() } });
  let finish,
    writes = 0;
  service.read = () => ({ refresh_token: "private", expires_at: 0 });
  service.config = () => ({ clientId: "id" });
  service.write = () => {
    writes++;
  };
  service.tokenRequest = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = service.accessToken();
  service.generation++;
  finish({ access_token: "new", expires_at: Date.now() + 100000 });
  await assert.rejects(pending, /koblet fra/);
  assert.equal(writes, 0);
});

test("upload is explicitly confirmed, requests rename semantics and keeps bearer tokens off upload URLs", async () => {
  const fs = require("fs"),
    path = require("path"),
    os = require("os");
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-upload-test-"));
  const file = path.join(folder, "referat.txt");
  fs.writeFileSync(file, "Testreferat");
  const seen = [];
  const service = new DssaMicrosoft({
    app: { getPath: () => folder },
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [file] }),
      showMessageBox: async () => ({ response: 1 }),
    },
    net: {
      fetch: async (url, options) => {
        seen.push({ url, options });
        return { ok: true, json: async () => ({ id: "new-id", name: "referat (1).txt" }) };
      },
    },
  });
  service.request = async (route, options) => {
    assert.match(route, /createUploadSession$/);
    assert.equal(JSON.parse(options.body).item["@microsoft.graph.conflictBehavior"], "rename");
    return { json: async () => ({ uploadUrl: "https://test.up.1drv.com/upload-session" }) };
  };
  try {
    const result = await service.upload({ driveId: "drive", itemId: "folder" });
    assert.equal(result.success, true);
    assert.equal(result.name, "referat (1).txt");
    assert.equal(seen[0].options.headers.Authorization, undefined);
    assert.equal(seen[0].options.headers["Content-Range"], "bytes 0-10/11");
    assert.equal(seen[0].options.body.toString(), "Testreferat");
    service.dialog.showMessageBox = async () => ({ response: 0 });
    assert.deepEqual(await service.upload({ driveId: "drive" }), { canceled: true });
    assert.equal(seen.length, 1);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
