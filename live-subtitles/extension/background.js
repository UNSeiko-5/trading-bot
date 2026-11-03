// Service worker : bouton d'activation, capture d'onglet, routage des sous-titres.
const DEFAULTS = {
  deepgramKey: '',
  translator: 'deepl', // 'deepl' | 'google' | 'none'
  translatorKey: '',
  sourceLang: 'en',
  waitK: 2,
  fontScale: 1,
};

const frames = new Map(); // tabId -> Map(frameId -> aire de la vidéo en lecture)
let lastNotice = { text: '', at: 0 };

const getActive = async () => (await chrome.storage.session.get({ activeTab: null })).activeTab;
const setActive = (activeTab) => chrome.storage.session.set({ activeTab });

function badge(tabId, text, color) {
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  if (color) chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
}

// Le cadre (iframe) qui contient la vidéo en lecture la plus grande ; sinon le cadre principal.
function pickFrame(tabId) {
  let best = 0;
  let bestArea = 0;
  for (const [frameId, area] of frames.get(tabId) ?? []) {
    if (area > bestArea) {
      best = frameId;
      bestArea = area;
    }
  }
  return best;
}

function forward(tabId, payload) {
  chrome.tabs.sendMessage(tabId, payload, { frameId: pickFrame(tabId) }).catch(() => {});
}

function notice(tabId, text) {
  const now = Date.now();
  if (text === lastNotice.text && now - lastNotice.at < 5000) return;
  lastNotice = { text, at: now };
  forward(tabId, { type: 'notice', text });
}

async function ensureOffscreen() {
  const ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (ctxs.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: "Traitement de l'audio de l'onglet capturé pour les sous-titres en direct",
  });
}

async function start(tabId) {
  const cfg = await chrome.storage.local.get(DEFAULTS);
  if (!cfg.deepgramKey || (cfg.translator !== 'none' && !cfg.translatorKey)) {
    chrome.runtime.openOptionsPage();
    return;
  }
  const prev = await getActive();
  if (prev !== null) await stop(prev);
  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await setActive(tabId);
  badge(tabId, '…', '#b26a00');
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'start', tabId, streamId, config: cfg });
}

async function stop(tabId) {
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => {});
  await setActive(null);
  badge(tabId, '', null);
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if ((await getActive()) === tab.id) await stop(tab.id);
    else await start(tab.id);
  } catch (e) {
    badge(tab.id, 'ERR', '#b3261e');
    notice(tab.id, e.message);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  frames.delete(tabId);
  if ((await getActive()) === tabId) await stop(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'video-state' && sender.tab) {
    const map = frames.get(sender.tab.id) ?? new Map();
    map.set(sender.frameId, msg.area);
    frames.set(sender.tab.id, map);
  } else if (msg.target === 'background') {
    handleOffscreen(msg);
  }
});

async function handleOffscreen(msg) {
  const { tabId } = msg;
  if (msg.type === 'subtitle') {
    forward(tabId, { type: 'subtitle', id: msg.id, text: msg.text, final: msg.final });
    return;
  }
  if (msg.type !== 'status') return;
  const isActive = (await getActive()) === tabId;
  if (msg.state === 'live') badge(tabId, 'ON', '#1a7f37');
  else if (msg.state === 'connecting') badge(tabId, '…', '#b26a00');
  else if (msg.state === 'warn') notice(tabId, msg.message);
  else if (msg.state === 'stopped' && isActive) {
    await setActive(null);
    badge(tabId, '', null);
  } else if (msg.state === 'error') {
    if (isActive) await setActive(null);
    badge(tabId, 'ERR', '#b3261e');
    notice(tabId, msg.message);
  }
}
