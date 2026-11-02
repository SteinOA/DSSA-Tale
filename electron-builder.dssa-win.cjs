// Merge explicitly: electron-builder concatenates extraResources in an extends
// chain, which would copy/sign the same native executables concurrently.
const upstream = require("./electron-builder.json");
const dssa = require("./electron-builder.dssa-win.json");
const config = {
  ...upstream,
  ...dssa,
  win: { ...upstream.win, ...dssa.win, extraResources: [] },
  nsis: { ...upstream.nsis, ...dssa.nsis },
};
delete config.extends;
// The Windows release carries its own auditable LGPL audio executable.
config.files = [
  ...upstream.files,
  "!**/node_modules/ffmpeg-static/**",
  "!**/node_modules/tinfoil/**",
  "!**/node_modules/@tinfoilsh/**",
];
config.extraMetadata = { ...config.extraMetadata, dssaPublicWindowsBuild: true };
if (process.env.DSSA_SOURCE_SNAPSHOT_SHA256) {
  if (!/^[a-f0-9]{64}$/.test(process.env.DSSA_SOURCE_SNAPSHOT_SHA256)) {
    throw new Error("Invalid public source snapshot SHA-256");
  }
  config.extraMetadata = {
    ...config.extraMetadata,
    dssaSourceSnapshotSha256: process.env.DSSA_SOURCE_SNAPSHOT_SHA256,
  };
}
// Desktop clients are public app identifiers, not user credentials. Supply the
// publisher's registered client when building; never include account tokens.
const googleClientId = process.env.DSSA_GOOGLE_DESKTOP_CLIENT_ID;
const googleClientSecret = process.env.DSSA_GOOGLE_DESKTOP_CLIENT_SECRET;
if (googleClientId || googleClientSecret) {
  const client = require("./src/helpers/dssaGoogleCalendarClient").validateDesktopClient({
    installed: { client_id: googleClientId, client_secret: googleClientSecret },
  });
  config.extraMetadata = { ...config.extraMetadata, dssaGoogleDesktopClient: client };
}
const microsoftClientId = process.env.DSSA_MICROSOFT_DESKTOP_CLIENT_ID;
if (microsoftClientId) {
  config.extraMetadata = {
    ...config.extraMetadata,
    dssaMicrosoftDesktopClientId: require("./src/helpers/dssaMicrosoft").validateClientId(
      microsoftClientId
    ),
  };
}
module.exports = config;
