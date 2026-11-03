// Choisit le préfixe du texte source assez stable pour être traduit.
//
// waitK : nombre de mots de queue retenus tant que l'énoncé n'est pas finalisé.
//   0 = latence minimale mais traduction qui se corrige souvent,
//   2-3 = bon compromis, 6 = très stable mais plus lent.
// Les mots déjà finalisés par la reconnaissance vocale sont toujours stables.
// maxWindow : borne le nombre de mots envoyés à la traduction (coût et latence).

const split = (t) => (t || '').trim().split(/\s+/).filter(Boolean);

export class Stabilizer {
  constructor({ waitK = 2, minStep = 1, maxWindow = 24 } = {}) {
    this.waitK = waitK;
    this.minStep = minStep;
    this.maxWindow = maxWindow;
    this.id = 0;
    this.#reset();
  }

  #reset() {
    this.committed = [];
    this.lastN = 0;
    this.lastText = '';
  }

  #emit(words, n, final) {
    if (n <= 0) return null;
    const text = words.slice(Math.max(0, n - this.maxWindow), n).join(' ');
    if (!final) {
      if (text === this.lastText) return null;
      if (n > this.lastN && n - this.lastN < this.minStep) return null;
    }
    this.lastN = n;
    this.lastText = text;
    return { id: this.id, text, final };
  }

  // Segment provisoire (non finalisé) du moteur de reconnaissance.
  interim(text) {
    const words = [...this.committed, ...split(text)];
    const n = Math.max(this.committed.length, words.length - this.waitK);
    return this.#emit(words, n, false);
  }

  // Segment finalisé. endOfUtterance = fin de phrase détectée (silence).
  commit(text, endOfUtterance = false) {
    this.committed.push(...split(text));
    const words = this.committed;
    if (!endOfUtterance) return this.#emit(words, words.length, false);
    const job = this.#emit(words, words.length, true);
    this.id += 1;
    this.#reset();
    return job;
  }

  // Force la fin de l'énoncé courant (ex. événement UtteranceEnd).
  flush() {
    return this.committed.length ? this.commit('', true) : null;
  }
}
