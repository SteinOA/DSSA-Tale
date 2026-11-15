const fs = require("fs");
const path = require("path");
class DssaMeetingSpool {
  constructor(root, noteId) {
    this.noteId = noteId;
    this.root = path.resolve(root);
    fs.mkdirSync(root, { recursive: true });
    this.directory = fs.mkdtempSync(path.join(root, "meeting-"));
    this.queue = [];
    this.sequence = 0;
    this.pending = null;
    fs.writeFileSync(
      path.join(this.directory, "meeting.json"),
      JSON.stringify({
        noteId,
        sampleRate: 24000,
        channels: 1,
        encoding: "s16le",
        created: new Date().toISOString(),
      })
    );
  }
  enqueue(source, buffer, timestamp) {
    if (
      !["mic", "system"].includes(source) ||
      !Buffer.isBuffer(buffer) ||
      !Number.isFinite(timestamp)
    )
      throw Error("Ugyldig møtelyd.");
    if (!buffer.length) return;
    const file = path.join(this.directory, `${this.sequence++}-${source}.pcm`);
    fs.writeFileSync(file, buffer, { flag: "wx" });
    const item = { file, source, timestamp, bytes: buffer.length };
    fs.appendFileSync(
      path.join(this.directory, "chunks.jsonl"),
      JSON.stringify({ ...item, file: path.basename(file), bytes: buffer.length }) + "\n"
    );
    this.queue.push(item);
  }
  drain(consume, onProgress = () => {}) {
    if (this.pending) return this.pending;
    let processedBytes = 0, completedChunks = 0;
    const startedAt = Date.now();
    const report = () => {
      const remainingBytes = this.queue.reduce((sum, item) => sum + item.bytes, 0);
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      onProgress({
        noteId: this.noteId,
        processedSeconds: processedBytes / 48000,
        totalSeconds: (processedBytes + remainingBytes) / 48000,
        completedChunks,
        totalChunks: completedChunks + this.queue.length,
        elapsedSeconds,
        remainingSeconds: completedChunks >= 2 && processedBytes > 0 && remainingBytes > 0
          ? Math.max(1, Math.ceil(elapsedSeconds * remainingBytes / processedBytes)) : null,
      });
    };
    this.pending = (async () => {
      report();
      while (this.queue.length) {
        const item = this.queue[0];
        await consume({ ...item, buffer: fs.readFileSync(item.file) });
        fs.unlinkSync(item.file);
        this.queue.shift();
        processedBytes += item.bytes;
        completedChunks++;
        report();
      }
    })().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  clearIfComplete() {
    if (this.pending || this.queue.length) return false;
    if (
      path.dirname(path.resolve(this.directory)) !== this.root ||
      !path.basename(this.directory).startsWith("meeting-")
    )
      throw Error("Ugyldig gjenopprettingsmappe.");
    // Delete only the exact directory created and owned by this instance.
    fs.rmSync(this.directory, { recursive: true, force: true });
    return true;
  }
}
module.exports = DssaMeetingSpool;
