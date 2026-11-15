const { spawnSync } = require("node:child_process");
const path = require("node:path");
const vite = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");
const result = spawnSync(process.execPath, [vite, "build"], {
  cwd: path.resolve(__dirname, "../src"),
  env: { ...process.env, DSSA_PUBLIC_WINDOWS: "1" },
  windowsHide: true,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
