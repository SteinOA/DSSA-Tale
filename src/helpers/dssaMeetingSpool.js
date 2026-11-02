const fs = require("fs");
const path = require("path");
class DssaMeetingSpool {
  constructor(root, noteId) {
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
    const item = { file, source, timestamp };
    fs.appendFileSync(
      path.join(this.directory, "chunks.jsonl"),
      JSON.stringify({ ...item, file: path.basename(file), bytes: buffer.length }) + "\n"
    );
    this.queue.push(item);
  }
  drain(consume) {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      while (this.queue.length) {
        const item = this.queue[0];
        await consume({ ...item, buffer: fs.readFileSync(item.file) });
        fs.unlinkSync(item.file);
        this.queue.shift();
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
