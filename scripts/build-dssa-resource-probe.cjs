const fs = require("fs"),
  path = require("path"),
  { execFileSync } = require("child_process");
if (process.platform !== "win32")
  throw Error("DSSA Windows resource probe must be built on Windows.");
const root = path.resolve(__dirname, "..");
const compiler = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "Microsoft.NET/Framework64/v4.0.30319/csc.exe"
);
const output = path.join(root, "resources/bin/dssa-resource-probe.exe");
fs.mkdirSync(path.dirname(output), { recursive: true });
execFileSync(
  compiler,
  [
    "/nologo",
    "/optimize+",
    "/target:exe",
    "/platform:x64",
    "/reference:System.Management.dll",
    "/out:" + output,
    path.join(root, "resources/native/DssaResourceProbe.cs"),
  ],
  { windowsHide: true, stdio: "inherit" }
);
console.log("DSSA resource probe built.");
