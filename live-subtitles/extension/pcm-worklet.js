// Découpe l'audio (contexte à 16 kHz) en blocs PCM 16 bits de 50 ms avec leur niveau RMS.
const CHUNK = 800; // 50 ms à 16 kHz

class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(CHUNK);
    this.n = 0;
    this.sumSq = 0;
  }

  process(inputs) {
    const chans = inputs[0];
    if (!chans || !chans[0]) return true;
    const a = chans[0];
    const b = chans[1] || a;
    for (let i = 0; i < a.length; i++) {
      const s = Math.max(-1, Math.min(1, (a[i] + b[i]) / 2));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      this.sumSq += s * s;
      if (this.n === CHUNK) {
        const rms = Math.sqrt(this.sumSq / CHUNK);
        this.port.postMessage({ pcm: this.buf.buffer, rms }, [this.buf.buffer]);
        this.buf = new Int16Array(CHUNK);
        this.n = 0;
        this.sumSq = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
