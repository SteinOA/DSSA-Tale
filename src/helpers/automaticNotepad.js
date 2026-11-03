// Main-process only. Each mutation reads the current note inside one SQLite
// transaction; no renderer copy, clipboard, history backfill or model is used.
function joinParagraphs(before, after) {
  return before ? `${before}\n\n${after}` : after;
}

function notepadStorageAllowed(synced, settings, hasAccount) {
  return (
    synced === true &&
    settings.dataRetentionEnabled === true &&
    (settings.localHistoryPolicyResolved === true || !hasAccount)
  );
}

function accessNotepad(manager, allowed, action, transcription) {
  if (!allowed) return { success: true, enabled: false, note: null, canUndo: false };
  const pad = new AutomaticNotepad(manager);
  return { ...pad[action](transcription), enabled: true };
}

function initialize(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dssa_notepad (
      scope TEXT PRIMARY KEY, note_id INTEGER NOT NULL,
      cleared_content TEXT
    );
    CREATE TABLE IF NOT EXISTS dssa_notepad_deliveries (
      scope TEXT NOT NULL, delivery_id TEXT NOT NULL,
      PRIMARY KEY(scope, delivery_id)
    );
  `);
}

class AutomaticNotepad {
  constructor(manager) {
    this.manager = manager;
    initialize(manager.db);
  }

  get scope() {
    return this.manager.activeAccountId || "local";
  }

  read() {
    const state = this.manager.db
      .prepare("SELECT * FROM dssa_notepad WHERE scope = ?")
      .get(this.scope);
    const note = state && this.manager.getNote(state.note_id);
    return {
      success: true,
      note: note && !note.deleted_at ? note : null,
      canUndo: Boolean(note && !note.deleted_at && state.cleared_content != null),
    };
  }

  append(transcription) {
    if (transcription.status !== "completed" || !transcription.text?.trim()) return this.read();
    // Failed captures, retries without final text and history reads never append.
    const deliveryId = transcription.client_transcription_id || `row:${transcription.id}`;
    return this.manager.db.transaction(() => {
      const inserted = this.manager.db
        .prepare("INSERT OR IGNORE INTO dssa_notepad_deliveries(scope, delivery_id) VALUES (?, ?)")
        .run(this.scope, deliveryId);
      if (!inserted.changes) return this.read();
      let { note } = this.read();
      const created = !note;
      if (!note) {
        const saved = this.manager.saveNote("Automatisk notatblokk", "", "personal");
        if (!saved?.success || !saved.note) throw new Error("Notepad creation failed");
        note = saved.note;
        this.manager.db.prepare("UPDATE notes SET dssa_local_only = 1 WHERE id = ?").run(note.id);
        this.manager.db
          .prepare(
            "INSERT INTO dssa_notepad(scope, note_id, cleared_content) VALUES (?, ?, NULL) ON CONFLICT(scope) DO UPDATE SET note_id = excluded.note_id, cleared_content = NULL"
          )
          .run(this.scope, note.id);
      }
      // Direct SQL is deliberate: automatic mutations don't merge an editor
      // snapshot and never enqueue an upload or a markdown mirror write.
      this.write(note.id, joinParagraphs(note.content, transcription.text));
      return { ...this.read(), created };
    })();
  }

  write(id, content) {
    const result = this.manager.db
      .prepare(
        "UPDATE notes SET content = ?, content_edit_generation = content_edit_generation + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND dssa_local_only = 1 AND deleted_at IS NULL"
      )
      .run(content, id);
    if (result.changes !== 1) throw new Error("Notepad write failed");
  }

  clear() {
    return this.manager.db.transaction(() => {
      const { note } = this.read();
      if (!note || !note.content) return this.read();
      this.manager.db
        .prepare("UPDATE dssa_notepad SET cleared_content = ? WHERE scope = ?")
        .run(note.content, this.scope);
      this.write(note.id, "");
      return this.read();
    })();
  }

  undo() {
    return this.manager.db.transaction(() => {
      const { note, canUndo } = this.read();
      if (!note || !canUndo) return this.read();
      const state = this.manager.db
        .prepare("SELECT cleared_content FROM dssa_notepad WHERE scope = ?")
        .get(this.scope);
      this.write(note.id, joinParagraphs(state.cleared_content, note.content));
      this.manager.db
        .prepare("UPDATE dssa_notepad SET cleared_content = NULL WHERE scope = ?")
        .run(this.scope);
      return this.read();
    })();
  }
}

module.exports = { AutomaticNotepad, joinParagraphs, notepadStorageAllowed, accessNotepad };
