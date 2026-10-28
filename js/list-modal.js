// Fenêtre de détail : la liste des films derrière une statistique (un genre, un réalisateur, un pays…).
import { tile } from './film-ui.js';
import { h, icon } from './util.js';

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,[tabindex]:not([tabindex="-1"])';
let open = false;

export function listModal({ title, sub, films, limit = 120 }) {
  if (open) return;
  open = true;
  const prev = document.activeElement;
  const list = [...films].sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.last - a.last);
  const close = () => {
    open = false;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', close);
    document.body.style.overflow = '';
    back.remove();
    if (prev && prev.isConnected) prev.focus({ preventScroll: true });
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') {
      const els = [...modal.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === modal)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lm-title', tabindex: '-1' },
    h('div', { class: 'modal-bar' }, h('div'), h('button', { class: 'btn sm close', type: 'button', onclick: close, 'aria-label': 'Fermer', html: icon('close', 16) })),
    h('h2', { id: 'lm-title', style: 'font-size:24px;letter-spacing:-.04em' }, title),
    sub && h('p', { class: 'muted', style: 'margin:2px 0 14px' }, sub),
    h('div', { class: 'tiles' }, list.slice(0, limit).map((f) => tile(f))),
    list.length > limit && h('p', { class: 'muted', style: 'margin-top:12px;font-size:13px' }, `${list.length - limit} autres films non affichés.`));
  const back = h('div', { class: 'modal-back', onclick: (e) => e.target === back && close() }, modal);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close);
  document.body.style.overflow = 'hidden';
  document.body.append(back);
  modal.focus({ preventScroll: true });
}
