/** Vue MINUTEUR : noir total, décompte, dépassement négatif, points clignotants au repos. */
import { store } from '../core/store.js';
import { remainingMs, fmt } from '../core/timer.js';
export { remainingMs, fmt } from '../core/timer.js';

await store.init({ role: 'output', id: 'minuteur' });

const timeEl = document.getElementById('time');
const dotsEl = document.getElementById('dots');
const labelEl = document.getElementById('label');
const nextEl = document.getElementById('next');
let lastText = '', lastLabel = '', lastNext = '';

function paint() {
  const s = store.state, m = s.minuteur || {};
  const item = m.items?.[m.index];
  const idle = !m.visible || m.index < 0 || !item;
  dotsEl.style.display = idle ? '' : 'none';
  timeEl.style.display = idle ? 'none' : '';
  labelEl.style.display = idle ? 'none' : '';
  nextEl.style.display = idle ? 'none' : '';
  if (idle) return;

  const rem = remainingMs(s);
  const txt = fmt(rem);
  if (txt !== lastText) {
    lastText = txt; timeEl.textContent = txt;
    timeEl.classList.toggle('over', rem < 0);
    document.body.classList.toggle('overtime', rem < 0);
  }
  if (item.title !== lastLabel) { lastLabel = item.title; labelEl.textContent = item.title; }
  const nx = m.items?.[m.index + 1];
  const nextTxt = nx ? `Suivant : ${nx.title}` : 'Dernier temps';
  if (nextTxt !== lastNext) { lastNext = nextTxt; nextEl.textContent = nextTxt; }
}
store.on(paint); paint(); setInterval(paint, 200);
