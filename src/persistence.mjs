// Coordinate owned card snapshots and browser transaction completion.
// The writer never waits for a machine lifecycle turn.
export class Persistence {
  constructor({ write, changed = () => {}, protectedRecord = false }) {
    this.write = write;
    this.changed = changed;
    this.protectedRecord = protectedRecord;
    this.image = null;
    this.epoch = 0;
    this.revision = 0;
    this.completed = null;
    this.inFlight = null;
    this.failure = null;
    this.failures = 0;
    this.lifecycle = 0;
    this.tail = Promise.resolve();
    this.autosaveJob = null;
    this.autosaveIntent = false;
  }

  token() { return { epoch: this.epoch, revision: this.revision }; }
  matches(a, b = this.token()) { return !!a && a.epoch === b.epoch && a.revision === b.revision; }
  notify() {
    // Rendering is outside the storage commit protocol. A failed renderer
    // cannot prevent active publication after the transaction has committed.
    try { this.changed(this.status()); }
    catch (error) { this.notificationFailure = error; }
  }

  adopt(image, { stored = false } = {}) {
    this.image = image;
    this.epoch++;
    this.revision = 0;
    this.completed = stored ? this.token() : null;
    this.failure = null;
    this.failures = 0;
    this.notify();
  }

  dirty(image = this.image, epoch = this.epoch) {
    if (!this.image || image !== this.image || epoch !== this.epoch) return false;
    this.revision++;
    this.notify();
    return true;
  }

  beginLifecycle() { this.lifecycle++; this.notify(); }
  endLifecycle() { this.lifecycle--; this.notify(); }

  status() {
    const saved = !!this.image && this.matches(this.completed) && !this.lifecycle && !this.protectedRecord && !this.failure;
    return {
      saved,
      saving: !!this.inFlight,
      pending: !!this.image && !saved,
      protectedRecord: this.protectedRecord,
      failure: this.failure,
      failures: this.failures,
    };
  }

  exclusive(fn) {
    const run = this.tail.then(fn);
    this.tail = run.catch(() => {});
    return run;
  }

  async persist(token, owned) {
    const failureEpoch = this.epoch;
    this.inFlight = token;
    this.notify();
    try {
      await this.write(owned);
      this.completed = token;
      if (this.matches(token)) {
        this.failure = null;
        this.failures = 0;
      }
    } catch (error) {
      if (failureEpoch === this.epoch) {
        this.failure = error?.message ?? String(error);
        this.failures++;
      }
      throw error;
    } finally {
      this.inFlight = null;
      this.notify();
    }
  }

  autosave() {
    if (this.protectedRecord || !this.image) return Promise.resolve(false);
    this.autosaveIntent = true;
    if (this.autosaveJob) return this.autosaveJob;
    this.autosaveJob = (async () => {
      let saved = false;
      while (this.autosaveIntent) {
        this.autosaveIntent = false;
        try {
          saved = await this.exclusive(async () => {
            if (!this.image || this.protectedRecord || (this.matches(this.completed) && !this.failure)) return false;
            const token = this.token();
            const owned = new Uint8Array(this.image);
            await this.persist(token, owned);
            return true;
          });
        } catch {
          // Retry on a later intent; a failure must not start a tight loop.
          this.autosaveIntent = false;
          return false;
        }
      }
      return saved;
    })().finally(() => { this.autosaveJob = null; });
    return this.autosaveJob;
  }

  // The caller has staged and validated bytes while execution is suppressed.
  // Keep commit and synchronous active publication inside the writer barrier.
  commit(staged, { replace = false, publish = () => {} } = {}) {
    return this.exclusive(async () => {
      if (Object.prototype.toString.call(staged) !== "[object Uint8Array]" ||
          (!replace && (!this.image || staged.length !== this.image.length)) ||
          typeof publish !== "function") throw new Error("invalid staged card publication");
      const token = replace ? { epoch: this.epoch + 1, revision: 0 }
        : { epoch: this.epoch, revision: this.revision + 1 };
      if (!this.protectedRecord) await this.persist(token, staged);
      if (replace) this.image = staged;
      else this.image.set(staged);
      this.epoch = token.epoch;
      this.revision = token.revision;
      this.completed = this.protectedRecord ? null : token;
      this.failure = null;
      this.failures = 0;
      try { publish(this.image); }
      catch (error) {
        // Bytes and completed token already changed; this is not a refusal
        // or a rollback. Keep later writers bound to the published image.
        const failure = new Error(error?.message ?? String(error), { cause: error });
        failure.published = true;
        throw failure;
      } finally { this.notify(); }
      return !this.protectedRecord;
    });
  }
}
