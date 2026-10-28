// Palette de commandes (Ctrl/Cmd+K ou « / ») : pages, actions et recherche de films.
import { filmHref } from './film-ui.js';
import { state } from './state.js';
import { fold, h } from './util.js';

let open = false;

export function openPalette({ pages, actions }) {
  if (open) return;
  open = true;
  const prev = document.activeElement;
  const input = h('input', { type: 'text', placeholder: 'Aller à une page, chercher un film, un réalisateur…', 'aria-label': 'Rechercher', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', 'aria-autocomplete': 'list', autocomplete: 'off', spellcheck: 'false' });
  const ul = h('ul', { id: 'pal-list', role: 'listbox', 'aria-label': 'Résultats', tabindex: '-1' });
  const back = h('div', { class: 'pal-back', onclick: (e) => e.target === back && close() }, h('div', { class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Recherche' }, input, ul));
  let items = [];
  let sel = 0;

  const close = () => {
    open = false;
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    if (prev && prev.isConnected) prev.focus();
  };

  const compute = () => {
    const q = fold(input.value.trim());
    const tokens = q.split(/\s+/).filter(Boolean);
    const match = (s) => {
      const f = fold(s);
      return tokens.every((t) => f.includes(t));
    };
    const out = [];
    const pg = pages.filter((p) => match(p.label));
    if (pg.length) out.push({ group: 'Pages' }, ...pg.map((p) => ({ label: p.label, hint: 'Page', run: () => (location.hash = p.hash) })));
    const ac = actions.filter((a) => match(a.label));
    if (ac.length && q) out.push({ group: 'Actions' }, ...ac.map((a) => ({ label: a.label, hint: 'Action', run: a.run })));
    if (q) {
      const fs = state.films.filter((f) => match(`${f.title} ${f.year || ''} ${((state.meta.get(f.key) || {}).directors || []).join(' ')}`)).slice(0, 8);
      if (fs.length) out.push({ group: 'Films' }, ...fs.map((f) => ({ label: f.title, hint: `${f.year || ''}${f.rating ? ` · ${f.rating} ★` : ''}`, run: () => (location.hash = filmHref(f.key)) })));
    } else if (state.films.length) {
      out.push({ group: 'Derniers films' }, ...state.films.slice(0, 5).map((f) => ({ label: f.title, hint: `${f.year || ''}${f.rating ? ` · ${f.rating} ★` : ''}`, run: () => (location.hash = filmHref(f.key)) })));
    }
    items = out;
    sel = Math.max(0, out.findIndex((x) => !x.group));
    draw();
  };

  const draw = () => {
    ul.replaceChildren(...items.map((it, i) =>
      it.group
        ? h('li', { class: 'grp', role: 'presentation' }, it.group)
        : h('li', { id: `pal-opt-${i}`, role: 'option', 'aria-selected': String(i === sel), onmousemove: () => { if (sel !== i) { sel = i; draw(); } }, onclick: () => run(it) }, it.label, h('small', null, it.hint))
    ));
    const cur = ul.querySelector('[aria-selected="true"]');
    if (cur) input.setAttribute('aria-activedescendant', cur.id);
    cur?.scrollIntoView({ block: 'nearest' });
  };
  const run = (it) => {
    close();
    it.run();
  };
  const move = (dir) => {
    let i = sel;
    do i = (i + dir + items.length) % items.length;
    while (items[i] && items[i].group);
    sel = i;
    draw();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[sel] && !items[sel].group) run(items[sel]); }
    else if (e.key === 'Tab') e.preventDefault();
  };
  document.addEventListener('keydown', onKey, true);
  input.addEventListener('input', compute);
  document.body.append(back);
  input.focus();
  compute();
}
