// File d'attente de traduction : une requête à la fois, la plus récente gagne.
// Les jobs finaux ne sont jamais abandonnés ; les provisoires obsolètes le sont.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Scheduler {
  constructor({ translate, onResult, onError = () => {}, minGapMs = 150 }) {
    this.translate = translate;
    this.onResult = onResult;
    this.onError = onError;
    this.minGapMs = minGapMs;
    this.queue = [];
    this.busy = false;
    this.lastStart = 0;
    this.cache = { src: null, out: '' };
    this.lastFinalText = '';
  }

  // job : { id, text, final, t0? }
  push(job) {
    if (!job.final && this.queue.some((j) => j.id === job.id && j.final)) return;
    this.queue = this.queue.filter((j) => j.id !== job.id);
    this.queue.push({ ...job, t0: job.t0 ?? Date.now() });
    this.#pump();
  }

  #pick() {
    const i = this.queue.findIndex((j) => j.final);
    if (i >= 0) return this.queue.splice(i, 1)[0];
    const newest = this.queue.pop();
    this.queue.length = 0;
    return newest;
  }

  async #pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const wait = this.minGapMs - (Date.now() - this.lastStart);
        if (wait > 0 && !this.queue.some((j) => j.final)) await sleep(wait);
        const job = this.#pick();
        if (!job) break;
        this.lastStart = Date.now();
        try {
          let out;
          if (job.text === this.cache.src) {
            out = this.cache.out;
          } else {
            out = await this.translate(job.text, { final: job.final, context: this.lastFinalText });
            this.cache = { src: job.text, out };
          }
          if (job.final) this.lastFinalText = job.text;
          this.onResult({ id: job.id, text: out, final: job.final, ms: Date.now() - job.t0 });
        } catch (e) {
          this.onError(e, job);
        }
      }
    } finally {
      this.busy = false;
    }
  }
}
