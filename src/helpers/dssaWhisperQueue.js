const { createAbortError } = require("./abortError");
class WhisperQueue {
  constructor(onBusy = () => {}) {
    this.onBusy = onBusy;
    this.active = false;
    this.items = [];
  }
  run(task, { signal, priority = "interactive" } = {}) {
    if (signal?.aborted) return Promise.reject(createAbortError("Transkripsjonen er avbrutt"));
    return new Promise((resolve, reject) => {
      const item = { task, signal, priority, resolve, reject };
      item.abort = () => {
        const index = this.items.indexOf(item);
        if (index >= 0) {
          this.items.splice(index, 1);
          reject(createAbortError("Transkripsjonen er avbrutt"));
          this.onBusy(this.active || this.items.length > 0);
        }
      };
      signal?.addEventListener("abort", item.abort, { once: true });
      this.items.push(item);
      this.onBusy(true);
      this.next();
    });
  }
  next() {
    if (this.active) return;
    const index = this.items.findIndex((item) => item.priority !== "background");
    const item = this.items.splice(index < 0 ? 0 : index, 1)[0];
    if (!item) {
      this.onBusy(false);
      return;
    }
    item.signal?.removeEventListener("abort", item.abort);
    this.active = true;
    Promise.resolve()
      .then(() => {
        if (item.signal?.aborted) throw createAbortError("Transkripsjonen er avbrutt");
        return item.task();
      })
      .then(item.resolve, item.reject)
      .finally(() => {
        this.active = false;
        this.onBusy(this.items.length > 0);
        this.next();
      });
  }
}
module.exports = { WhisperQueue };
