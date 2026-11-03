// Document offscreen : capture audio de l'onglet -> Deepgram (streaming) -> traduction.
import { Stabilizer } from './lib/stabilizer.js';
import { Scheduler } from './lib/scheduler.js';
import { makeTranslator } from './lib/translate.js';

const VOICE_RMS = 0.003; // seuil de la porte de silence (économise le coût du streaming)
const HANGOVER_MS = 1500; // audio envoyé encore 1,5 s après la dernière voix
const PRE_ROLL = 3; // 3 blocs de 50 ms rejoués au début d'une parole

const send = (m) => chrome.runtime.sendMessage({ target: 'background', ...m }).catch(() => {});
let s = null; // session courante

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'start') start(msg).catch((e) => fail(msg.tabId, e));
  else if (msg.type === 'stop') stop(true);
});

function fail(tabId, e) {
  send({ type: 'status', tabId, state: 'error', message: e?.message || String(e) });
  stop(false);
}

async function start({ tabId, streamId, config }) {
  stop(false);
  const media = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: false,
  });
  const sess = (s = { tabId, media, cfg: config, lastVoice: 0, lastKeep: 0, pre: [], opened: false, retries: 0, closing: false });
  media.getAudioTracks()[0].onended = () => {
    send({ type: 'status', tabId, state: 'stopped' });
    stop(false);
  };

  // La capture coupe le son local de l'onglet : on le renvoie vers les haut-parleurs
  // sur un contexte dédié (sans rééchantillonnage) pour limiter le décalage image/son.
  sess.playCtx = new AudioContext({ latencyHint: 'interactive' });
  sess.playCtx.createMediaStreamSource(media).connect(sess.playCtx.destination);

  sess.ctx = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
  await sess.ctx.audioWorklet.addModule('pcm-worklet.js');
  await Promise.all([sess.playCtx.resume(), sess.ctx.resume()]);
  sess.node = new AudioWorkletNode(sess.ctx, 'pcm-capture');
  const mute = sess.ctx.createGain();
  mute.gain.value = 0;
  sess.ctx.createMediaStreamSource(media).connect(sess.node);
  sess.node.connect(mute).connect(sess.ctx.destination);
  sess.node.port.onmessage = ({ data }) => onAudio(sess, data);

  sess.stab = new Stabilizer({ waitK: Number(config.waitK) });
  sess.sched = new Scheduler({
    translate: makeTranslator(config),
    onResult: (r) => send({ type: 'subtitle', tabId, ...r }),
    onError: (e) => send({ type: 'status', tabId, state: 'warn', message: e.message }),
  });

  send({ type: 'status', tabId, state: 'connecting' });
  connect(sess);
}

function connect(sess) {
  const p = new URLSearchParams({
    model: 'nova-3',
    language: sess.cfg.sourceLang || 'en',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    interim_results: 'true',
    punctuate: 'true',
    smart_format: 'true',
    endpointing: '250',
    utterance_end_ms: '1000',
  });
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${p}`, ['token', sess.cfg.deepgramKey]);
  ws.binaryType = 'arraybuffer';
  sess.ws = ws;
  ws.onopen = () => {
    sess.opened = true;
    sess.retries = 0;
    send({ type: 'status', tabId: sess.tabId, state: 'live' });
  };
  ws.onmessage = (ev) => onResults(sess, ev.data);
  ws.onclose = (ev) => {
    if (s !== sess || sess.closing) return;
    if (!sess.opened || sess.retries >= 3) {
      fail(sess.tabId, new Error(`Connexion Deepgram impossible (clé invalide ou réseau), code ${ev.code}`));
      return;
    }
    sess.retries += 1;
    sess.opened = false;
    setTimeout(() => s === sess && connect(sess), 1000);
  };
}

function onAudio(sess, { pcm, rms }) {
  const ws = sess.ws;
  if (s !== sess || !ws || ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (rms > VOICE_RMS) sess.lastVoice = now;
  if (now - sess.lastVoice < HANGOVER_MS) {
    while (sess.pre.length) ws.send(sess.pre.shift());
    ws.send(pcm);
  } else {
    sess.pre.push(pcm);
    if (sess.pre.length > PRE_ROLL) sess.pre.shift();
    if (now - sess.lastKeep > 4000) {
      ws.send(JSON.stringify({ type: 'KeepAlive' }));
      sess.lastKeep = now;
    }
  }
}

function onResults(sess, raw) {
  if (s !== sess || typeof raw !== 'string') return;
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  let job = null;
  if (m.type === 'UtteranceEnd') {
    job = sess.stab.flush();
  } else if (m.type === 'Results') {
    const text = m.channel?.alternatives?.[0]?.transcript ?? '';
    job = m.is_final ? sess.stab.commit(text, !!m.speech_final) : sess.stab.interim(text);
  }
  if (job) sess.sched.push({ ...job, t0: Date.now() });
}

function stop(notify) {
  const sess = s;
  if (!sess) return;
  s = null;
  sess.closing = true;
  try { sess.ws?.close(); } catch { /* déjà fermé */ }
  try { sess.node?.disconnect(); } catch { /* déjà déconnecté */ }
  sess.media?.getTracks().forEach((t) => {
    t.onended = null;
    t.stop();
  });
  sess.ctx?.close().catch(() => {});
  sess.playCtx?.close().catch(() => {});
  if (notify) send({ type: 'status', tabId: sess.tabId, state: 'stopped' });
}
