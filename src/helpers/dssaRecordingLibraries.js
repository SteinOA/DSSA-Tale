const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { translateNative: ui } = require("./dssaNativeLabels");
const KINDS = {
  iphone: "Apple Taleopptak",
  android: "Android-opptak",
  rode: "RØDE-opptak",
  other: "Opptak",
};
const file = (app) => path.join(app.getPath("userData"), "dssa-recording-libraries.json");
function read(app) {
  try {
    const rows = JSON.parse(fs.readFileSync(file(app), "utf8"));
    return Array.isArray(rows)
      ? rows.filter(
          (r) =>
            typeof r.id === "string" && typeof r.path === "string" && typeof r.label === "string"
        )
      : [];
  } catch {
    return [];
  }
}
function available(folder) {
  try {
    return fs.statSync(folder).isDirectory();
  } catch {
    return false;
  }
}
function listLibraries(app) {
  return read(app).map(({ id, label, kind, path: folder }) => ({
    id,
    label,
    kind,
    available: available(folder),
  }));
}
function getLibrary(app, id) {
  const row = read(app).find((r) => r.id === id);
  if (!row || !available(row.path))
    throw Error(
      "Opptaksbiblioteket er ikke tilgjengelig. Koble til disken eller skymappen og prøv igjen."
    );
  return row;
}
async function addLibrary({ app, dialog }, { kind, label }) {
  if (!Object.hasOwn(KINDS, kind)) throw Error("Ukjent bibliotektype.");
  const result = await dialog.showOpenDialog({
    title: ui("Velg tilgjengelig opptaksmappe for {{source}}", { source: KINDS[kind] }),
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const folder = fs.realpathSync(result.filePaths[0]);
  if (!available(folder)) throw Error("Velg en mappe som er tilgjengelig på denne PC-en.");
  const rows = read(app);
  if (!rows.some((r) => r.path === folder)) {
    const name =
      typeof label === "string"
        ? label
            .replace(/[\x00-\x1f]/g, "")
            .trim()
            .slice(0, 80)
        : "";
    rows.push({
      id: randomUUID(),
      kind,
      label: name || `${KINDS[kind]} · ${path.basename(folder)}`,
      path: folder,
    });
    fs.writeFileSync(file(app), JSON.stringify(rows, null, 2));
  }
  return { success: true, libraries: listLibraries(app) };
}
function removeLibrary(app, id) {
  fs.writeFileSync(
    file(app),
    JSON.stringify(
      read(app).filter((row) => row.id !== id),
      null,
      2
    )
  );
  return { success: true, libraries: listLibraries(app) };
}
module.exports = { listLibraries, getLibrary, addLibrary, removeLibrary };
