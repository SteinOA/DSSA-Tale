import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DEV_SERVER_PORT = 5183;

const parseDevServerPort = (rawPort) => {
  const normalizedPort = rawPort || String(DEFAULT_DEV_SERVER_PORT);
  const parsedPort = Number(normalizedPort);

  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    return DEFAULT_DEV_SERVER_PORT;
  }

  return parsedPort;
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, "..");
  const env = loadEnv(mode, envDir, "");
  const rawPort = env.VITE_DEV_SERVER_PORT || env.OPENWHISPR_DEV_SERVER_PORT;
  const devServerPort = parseDevServerPort(rawPort);
  const dssaWindows = process.env.DSSA_PUBLIC_WINDOWS === "1";
  const publicRegistry = path.resolve(envDir, ".dssa-build/renderer-public-models.json");
  if (dssaWindows) {
    const registry = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "models/modelRegistryData.json"), "utf8")
    );
    for (const key of ["transcriptionProviders", "cloudProviders"])
      registry[key] = registry[key].filter((provider) => provider.id !== "tinfoil");
    fs.mkdirSync(path.dirname(publicRegistry), { recursive: true });
    fs.writeFileSync(publicRegistry, JSON.stringify(registry));
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(dssaWindows
        ? [
            {
              name: "dssa-distribution-license-boundary",
              generateBundle() {
                const forbidden = [...this.getModuleIds()].filter((id) =>
                  /node_modules\/(tinfoil\/|@tinfoilsh\/)/.test(id.replaceAll("\\", "/"))
                );
                if (forbidden.length)
                  throw new Error("Excluded Tinfoil SDK entered the Windows renderer");
                this.emitFile({
                  type: "asset",
                  fileName: "dssa-license-boundary.json",
                  source: JSON.stringify({ tinfoilSdkBundled: false, iconSet: "Lucide/Feather" }),
                });
              },
            },
          ]
        : []),
      {
        name: "write-runtime-env",
        writeBundle() {
          const runtimeEnv = {
            VITE_OPENWHISPR_API_URL: env.VITE_OPENWHISPR_API_URL || "",
            VITE_AUTH_URL: env.VITE_AUTH_URL || "",
          };
          fs.writeFileSync(
            path.resolve(__dirname, "dist", "runtime-env.json"),
            JSON.stringify(runtimeEnv)
          );
        },
      },
    ],
    base: "./", // Use relative paths for file:// protocol in Electron
    envDir, // Load .env from project root
    resolve: {
      alias: [
        ...(dssaWindows
          ? [
              {
                find: /^tinfoil$/,
                replacement: path.resolve(__dirname, "services/ai/dssaTinfoilUnavailable.ts"),
              },
              { find: /^.*modelRegistryData\.json$/, replacement: publicRegistry },
            ]
          : []),
        { find: "@", replacement: path.resolve(__dirname, ".") },
      ],
    },
    server: {
      port: devServerPort,
      strictPort: true,
      host: "127.0.0.1",
    },
    build: {
      outDir: "dist",
      assetsDir: "assets",
      rolldownOptions: {
        external: [
          "electron",
          "fs",
          "path",
          "child_process",
          "https",
          "http",
          "crypto",
          "os",
          "stream",
          "util",
          "zlib",
          "tar",
          "unzipper",
          "@aws-sdk/client-s3",
        ],
        output: {
          manualChunks(id) {
            if (
              id.includes("@radix-ui/react-dialog") ||
              id.includes("@radix-ui/react-dropdown-menu") ||
              id.includes("@radix-ui/react-select") ||
              id.includes("@radix-ui/react-tabs")
            ) {
              return "vendor-radix";
            }
          },
        },
      },
    },
  };
});
