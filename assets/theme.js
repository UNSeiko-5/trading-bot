try {
  var t = JSON.parse(localStorage.getItem('clap.settings') || '{}').theme;
  if (t && t !== 'auto') document.documentElement.dataset.theme = t;
} catch (e) {}
