const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-notepad-test-"));
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === "electron")
    return { app: { getPath: () => root, getAppPath: () => process.cwd(), isReady: () => false } };
  return load.call(this, name, ...args);
};
process.env.NODE_ENV = "test";
const DatabaseManager = require("../../src/helpers/database");
const {
  AutomaticNotepad,
  notepadStorageAllowed,
  accessNotepad,
} = require("../../src/helpers/automaticNotepad");
let manager;
test.after(() => {
  manager?.cleanup();
  fs.rmSync(root, { recursive: true, force: true });
});

test("disabled history, unresolved policy and missing consent cannot create storage", () => {
  const enabled = { dataRetentionEnabled: true, localHistoryPolicyResolved: false };
  assert.equal(notepadStorageAllowed(false, enabled, false), false);
  assert.equal(notepadStorageAllowed(true, enabled, true), false);
  assert.equal(
    notepadStorageAllowed(true, { ...enabled, dataRetentionEnabled: false }, false),
    false
  );
  assert.equal(
    notepadStorageAllowed(
      true,
      { dataRetentionEnabled: false, localHistoryPolicyResolved: true },
      true
    ),
    false
  );
  assert.equal(notepadStorageAllowed(true, enabled, false), true);
  assert.equal(
    notepadStorageAllowed(true, { ...enabled, localHistoryPolicyResolved: true }, true),
    true
  );
  const inaccessible = new Proxy(
    {},
    {
      get() {
        throw new Error("Storage must not be touched");
      },
    }
  );
  for (const action of ["read", "append", "clear", "undo"]) {
    assert.deepEqual(accessNotepad(inaccessible, false, action), {
      success: true,
      enabled: false,
      note: null,
      canUndo: false,
    });
  }
});

test("notepad uses final text, survives restart and preserves edits, undo and history", async () => {
  manager = new DatabaseManager();
  const pad = new AutomaticNotepad(manager);
  manager.saveTranscription("Gammel historikk skal ikke med.");
  assert.equal(pad.read().note, null);
  const first = manager.saveTranscription("Kari Ås har 12 møter i Halden.", "råtekst", {
    clientTranscriptionId: "first",
  }).transcription;
  let state = pad.append(first);
  assert.equal(state.note.content, first.text);
  assert.equal(state.note.note_type, "personal");
  assert.equal(state.note.dssa_local_only, 1);
  assert.equal(pad.append(first).note.content, first.text, "delivery retry is idempotent");
  const second = manager.saveTranscription(
    "Eg møter Øystein klokka 14.30, måndag 2. november.",
    null,
    { clientTranscriptionId: "second" }
  ).transcription;
  state = pad.append(second);
  assert.equal(state.note.content, `${first.text}\n\n${second.text}`);
  const id = state.note.id;
  assert.equal(
    manager.getPendingNotes().some((note) => note.id === id),
    false
  );
  assert.equal(
    manager.getPendingNotes("private").some((note) => note.id === id),
    false
  );
  assert.equal(manager.getNoteForVectorIndex(id), null, "no embedding model runs for notepad");
  assert.equal(manager.updateNoteShareState(id, { is_shared: 1 }), null);
  assert.equal(manager.updateNote(id, { space_id: manager.getPrivateSpaceId() }).success, false);
  const edited = "Kari Ås og Øystein: 42 deltakarar.";
  assert.equal(
    manager.updateNote(id, { content: edited, automatic_notepad_base: state.note.content }).success,
    true
  );
  state = pad.append({
    ...second,
    client_transcription_id: "third",
    text: "Neste avsnitt – 3,5 km.",
  });
  assert.equal(state.note.content, `${edited}\n\nNeste avsnitt – 3,5 km.`);
  // A debounced editor save arrives after a dictation. Merge only the append
  // suffix, preserving both the edit and the newly dictated paragraph.
  const base = state.note.content;
  pad.append({
    ...second,
    client_transcription_id: "fourth",
    text: "Ny tekst medan eg redigerer.",
  });
  const saved = manager.updateNote(id, {
    content: "Manuelt retta tekst.",
    automatic_notepad_base: base,
  });
  assert.equal(saved.note.content, "Manuelt retta tekst.\n\nNy tekst medan eg redigerer.");
  const beforeClear = saved.note.content;
  assert.equal(pad.clear().note.content, "");
  pad.append({ ...second, client_transcription_id: "after-clear", text: "Etter tømming: 17." });
  assert.equal(pad.undo().note.content, `${beforeClear}\n\nEtter tømming: 17.`);
  assert.equal(pad.read().canUndo, false);
  assert.equal(pad.undo().note.content, `${beforeClear}\n\nEtter tømming: 17.`, "undo only once");
  // A clear conflicts with an obsolete editor. Never silently overwrite it.
  pad.clear();
  assert.equal(
    manager.updateNote(id, { content: "Stale", automatic_notepad_base: beforeClear }).success,
    false
  );
  const expected = pad.undo().note.content;
  manager.db.close();
  manager = new DatabaseManager();
  const restarted = new AutomaticNotepad(manager);
  assert.equal(restarted.read().note.content, expected);
  assert.equal(restarted.append(first).note.content, expected, "deduplication survives restart");
  const other = manager.saveNote("Annet notat", "Urørt").note;
  const count = manager.db.prepare("SELECT COUNT(*) AS count FROM transcriptions").get().count;
  restarted.clear();
  restarted.append({
    ...second,
    client_transcription_id: "while-empty-editor",
    text: "Ny diktering.",
  });
  assert.equal(
    manager.updateNote(id, { content: "Manuell tekst.", automatic_notepad_base: "" }).note.content,
    "Manuell tekst.\n\nNy diktering."
  );
  restarted.clear();
  assert.equal(manager.getNote(other.id).content, "Urørt");
  assert.equal(
    manager.db.prepare("SELECT COUNT(*) AS count FROM transcriptions").get().count,
    count
  );
  const samples = Array.from({ length: 20 }, (_, i) => ({
    ...second,
    client_transcription_id: `rapid-${i}`,
    text: `Avsnitt ${i}`,
  }));
  await Promise.all(samples.map(async (sample) => restarted.append(sample)));
  assert.equal(restarted.read().note.content, samples.map((sample) => sample.text).join("\n\n"));
  const original = manager.saveTranscription("Originalen bevares ved feil.", null, {
    clientTranscriptionId: "failure",
  }).transcription;
  manager.db.exec(
    "CREATE TRIGGER fail_notepad BEFORE UPDATE OF content ON notes WHEN NEW.dssa_local_only = 1 BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END"
  );
  assert.throws(() => restarted.append(original), /simulated storage failure/);
  assert.equal(
    manager.db.prepare("SELECT text FROM transcriptions WHERE id = ?").get(original.id).text,
    original.text
  );
  manager.db.exec("DROP TRIGGER fail_notepad");
  assert.ok(
    restarted.append(original).note.content.endsWith(original.text),
    "failed delivery can retry without losing text"
  );
});
